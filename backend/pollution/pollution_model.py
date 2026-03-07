"""
PollutionModel v2

Pollution exposure per edge:
  exposure = traffic_volume * intersection_factor * signal_bonus
             * time_multiplier * length_km

AQI is fetched once for the city centre and used only as a light
global scalar (0.85-1.2) on the final route summary score.
It does not influence per-edge pathfinding weights.
"""

import math
import os
import datetime
from backend.data.aqi_store import AQIStore

TRAFFIC_VOLUME = {
    "motorway":       0.7,
    "motorway_link":  0.6,
    "trunk":          0.9,
    "trunk_link":     0.8,
    "primary":        1.8,
    "primary_link":   1.5,
    "secondary":      1.5,
    "secondary_link": 1.3,
    "tertiary":       1.1,
    "tertiary_link":  1.0,
    "residential":    0.6,
    "living_street":  0.4,
    "service":        0.4,
    "unclassified":   0.8,
}
DEFAULT_TRAFFIC_VOLUME = 0.9


def _gaussian(x, mu, sigma):
    return math.exp(-0.5 * ((x - mu) / sigma) ** 2)


def time_multiplier(hour=None):
    if hour is None:
        now  = datetime.datetime.now()
        hour = now.hour + now.minute / 60.0

    baseline     = 0.55
    morning_peak = 2.0 * _gaussian(hour, mu=8.5,  sigma=1.2)
    evening_peak = 2.0 * _gaussian(hour, mu=17.5, sigma=1.3)
    midday_bump  = 0.5 * _gaussian(hour, mu=13.0, sigma=0.8)

    raw = baseline + morning_peak + evening_peak + midday_bump
    return max(0.5, min(2.5, raw))


def _node_degree(G, node):
    return G.in_degree(node) + G.out_degree(node)


def _intersection_factor(G, u, v):
    deg = (_node_degree(G, u) + _node_degree(G, v)) / 2.0
    factor = 0.8 + (deg - 2.0) * (1.2 / 6.0)
    return max(0.8, min(2.0, factor))


class PollutionModel:

    def __init__(self, graph, api_key=None):
        self.G         = graph
        self.aqi_store = AQIStore(api_key=api_key)
        self._max_delay = 1.0   # set during attach, used for score display

    def _fetch_city_aqi(self):
        result = self.aqi_store.get_aqi()
        print(f"[PollutionModel] AQI={result['aqi']} "
              f"source={result['source']} samples={result['samples']}")
        return result["aqi"]

    def _aqi_scalar(self):
        mapping = {1: 0.85, 2: 0.92, 3: 1.00, 4: 1.10, 5: 1.20}
        return mapping.get(self._fetch_city_aqi(), 1.00)

    def _edge_exposure(self, u, v, data, t_mult):
        road_type = data.get("highway", "")
        if isinstance(road_type, list):
            road_type = road_type[0]

        # Prefer traffic_factor written by TomTom (already accounts for live
        # congestion + road type volume). Fall back to static table when
        # TomTom hasn't enriched this edge yet — no extra API calls needed.
        if "traffic_factor" in data and data["traffic_factor"] != 1.0:
            volume = data["traffic_factor"]
        else:
            volume = TRAFFIC_VOLUME.get(road_type, DEFAULT_TRAFFIC_VOLUME)

        i_factor  = _intersection_factor(self.G, u, v)
        sig_bonus = 1.5 if data.get("signal_presence", 0) else 1.0
        length_km = data.get("length", 0) / 1000.0

        return volume * i_factor * sig_bonus * t_mult * length_km

    def attach_pollution_weights(self, hour=None):
        """
        Compute and attach 'pollution_exposure' and 'pollution_delay'
        to every graph edge.

        DELAY_SCALE = 10.0
        Previous value was 2.0. At 2.0, total pollution cost across a
        14km route was ~0.5 min vs ~8 min time cost — too weak to steer
        the router to a different path. At 10.0, pollution contributes
        ~2.5 min, enough to meaningfully compete with time at w_pollution=3.0
        while still being beatable by w_time=0.4 when routes are comparable.
        """
        t_mult = time_multiplier(hour)
        h      = hour if hour is not None else datetime.datetime.now().hour
        print(f"[PollutionModel] Time multiplier: {t_mult:.2f} (hour={h})")

        exposures = []

        for u, v, k, data in self.G.edges(keys=True, data=True):
            exp = self._edge_exposure(u, v, data, t_mult)
            data["pollution_exposure"] = round(exp, 6)
            exposures.append(exp)

        max_exp     = max(exposures) if exposures else 1.0
        DELAY_SCALE = 10.0   # was 2.0 — see docstring above

        delays = []
        for u, v, k, data in self.G.edges(keys=True, data=True):
            norm  = data["pollution_exposure"] / max_exp
            delay = round(norm * DELAY_SCALE, 4)
            data["pollution_delay"] = delay
            delays.append(delay)

        # Store max for use in score normalisation in analyze_route()
        import statistics
        self._max_delay  = max(delays)
        self._mean_delay = statistics.mean(delays)


        print(f"[PollutionModel] Weights attached. "
              f"Max exposure: {max_exp:.4f}  Max delay: {self._max_delay:.4f}")

    def analyze_route(self, route):
        total_delay     = 0.0
        total_exposure  = 0.0
        total_length_km = 0.0

        for i in range(len(route) - 1):
            u, v = route[i], route[i + 1]
            edge = list(self.G[u][v].values())[0]
            total_delay     += edge.get("pollution_delay",    0)
            total_exposure  += edge.get("pollution_exposure", 0)
            total_length_km += edge.get("length", 0) / 1000.0

        # pollution_score: total delay along this route normalised to 0-100.
        # Uses the same pollution_delay values the router optimised against,
        # so "Cleanest Air" will always have the lowest score here.
        # Previous formula (exp_per_km * 20) used raw exposure density which
        # is not what the router minimised — caused score/route mismatch.
        # In analyze_route(), replace the pollution_score calculation with:
        avg_delay_per_edge = total_delay / max(len(route) - 1, 1)
        print(f"[Debug] total_delay={total_delay:.4f} route_len={len(route)} avg={avg_delay_per_edge:.6f} max_delay={self._max_delay:.4f}")
        pollution_score = min(100, round((avg_delay_per_edge / self._mean_delay) * 50, 1))

        aqi_index  = self._fetch_city_aqi()
        aqi_scalar = {1: 0.85, 2: 0.92, 3: 1.00, 4: 1.10, 5: 1.20}.get(aqi_index, 1.00)
        aqi_label  = {1: "Good", 2: "Fair", 3: "Moderate",
                      4: "Poor", 5: "Very Poor"}.get(aqi_index, "Unknown")

        adjusted_exposure = total_exposure * aqi_scalar

        return {
            "pollution_score":  pollution_score,
            "total_exposure":   round(adjusted_exposure, 3),
            "aqi_index":        aqi_index,
            "aqi_label":        aqi_label,
            "time_multiplier":  round(time_multiplier(), 2),
        }
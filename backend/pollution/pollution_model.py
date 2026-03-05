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

# -------------------------------------------------------
# Road-type -> base traffic volume index
# Reflects vehicle density & emission intensity together.
# Bypass/motorway: fast-moving -> lower stop-start exposure.
# City primary/secondary: slow, dense -> highest exposure.
# -------------------------------------------------------
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


# -------------------------------------------------------
# Smooth time-of-day multiplier
# Two Gaussians: morning peak (8:30) + evening peak (17:30)
# Baseline 0.55 at night, peaks ~2.5x at rush hours.
# -------------------------------------------------------

def _gaussian(x, mu, sigma):
    return math.exp(-0.5 * ((x - mu) / sigma) ** 2)


def time_multiplier(hour=None):
    """
    Return a traffic-density multiplier for the given hour (0-24).
    If hour is None, uses current local time.

    Shape:
      - Baseline 0.55 (late night)
      - Morning peak ~2.5x at 8:30am  (sigma=1.2h)
      - Evening peak ~2.5x at 5:30pm  (sigma=1.3h)
      - Slight lunch bump at 1:00pm   (sigma=0.8h)
    """
    if hour is None:
        now  = datetime.datetime.now()
        hour = now.hour + now.minute / 60.0

    baseline     = 0.55
    morning_peak = 2.0 * _gaussian(hour, mu=8.5,  sigma=1.2)
    evening_peak = 2.0 * _gaussian(hour, mu=17.5, sigma=1.3)
    midday_bump  = 0.5 * _gaussian(hour, mu=13.0, sigma=0.8)

    raw = baseline + morning_peak + evening_peak + midday_bump
    return max(0.5, min(2.5, raw))


# -------------------------------------------------------
# Intersection density factor
# -------------------------------------------------------

def _node_degree(G, node):
    """Return undirected-equivalent degree of a node."""
    return G.in_degree(node) + G.out_degree(node)


def _intersection_factor(G, u, v):
    """
    Average node degree of edge endpoints, mapped to [0.8, 2.0].
      Degree 2 (simple through-road)  -> ~0.8
      Degree 6+ (busy junction)       -> ~2.0
    """
    deg = (_node_degree(G, u) + _node_degree(G, v)) / 2.0
    factor = 0.8 + (deg - 2.0) * (1.2 / 6.0)
    return max(0.8, min(2.0, factor))


# -------------------------------------------------------
# PollutionModel
# -------------------------------------------------------

class PollutionModel:

    def __init__(self, graph, api_key=None):
        self.G         = graph
        self.aqi_store = AQIStore(api_key=api_key)

    # ---------------------------------------------------
    # City-centre AQI  (light global scalar only)
    # ---------------------------------------------------

    def _fetch_city_aqi(self):
        """
        Get AQI via AQIStore -- uses historical avg if available,
        live API only as last resort. Returns int 1-5.
        """
        result = self.aqi_store.get_aqi()
        print(f"[PollutionModel] AQI={result['aqi']} "
              f"source={result['source']} samples={result['samples']}")
        return result["aqi"]

    def _aqi_scalar(self):
        """
        AQI 1-5 -> light scalar 0.85-1.20.
        Only nudges final route comparison, does not dominate.
        """
        mapping = {1: 0.85, 2: 0.92, 3: 1.00, 4: 1.10, 5: 1.20}
        return mapping.get(self._fetch_city_aqi(), 1.00)

    # ---------------------------------------------------
    # Per-edge pollution exposure
    # ---------------------------------------------------

    def _edge_exposure(self, u, v, data, t_mult):
        """
        Compute pollution exposure for a single edge.
        Returns an arbitrary exposure index (higher = more polluted).
        """
        road_type = data.get("highway", "")
        if isinstance(road_type, list):
            road_type = road_type[0]

        volume    = TRAFFIC_VOLUME.get(road_type, DEFAULT_TRAFFIC_VOLUME)
        i_factor  = _intersection_factor(self.G, u, v)
        sig_bonus = 1.5 if data.get("signal_presence", 0) else 1.0
        length_km = data.get("length", 0) / 1000.0

        return volume * i_factor * sig_bonus * t_mult * length_km

    # ---------------------------------------------------
    # Attach weights to graph  (called once at startup)
    # ---------------------------------------------------

    def attach_pollution_weights(self, hour=None):
        """
        Compute and attach 'pollution_exposure' and 'pollution_delay'
        to every graph edge.

        pollution_delay (minutes) feeds into the pathfinding cost function.
        Scaled so a heavily polluted edge adds ~0-2 min equivalent cost.
        """
        t_mult = time_multiplier(hour)
        h      = hour if hour is not None else datetime.datetime.now().hour
        print(f"[PollutionModel] Time multiplier: {t_mult:.2f} (hour={h})")

        exposures = []

        for u, v, k, data in self.G.edges(keys=True, data=True):
            exp = self._edge_exposure(u, v, data, t_mult)
            data["pollution_exposure"] = round(exp, 6)
            exposures.append(exp)

        # Normalise across all edges -> scale to delay minutes
        max_exp     = max(exposures) if exposures else 1.0
        DELAY_SCALE = 2.0

        for u, v, k, data in self.G.edges(keys=True, data=True):
            norm = data["pollution_exposure"] / max_exp
            data["pollution_delay"] = round(norm * DELAY_SCALE, 4)

        print(f"[PollutionModel] Weights attached. Max exposure: {max_exp:.4f}")

    # ---------------------------------------------------
    # Route summary  (called after a route is found)
    # ---------------------------------------------------

    def analyze_route(self, route):
        total_exposure  = 0.0
        total_length_km = 0.0

        for i in range(len(route) - 1):
            u, v = route[i], route[i + 1]
            edge = list(self.G[u][v].values())[0]
            total_exposure  += edge.get("pollution_exposure", 0)
            total_length_km += edge.get("length", 0) / 1000.0

        exp_per_km = (total_exposure / total_length_km) if total_length_km else 0

        # Fetch AQI once, derive both scalar and label from it
        aqi_index  = self._fetch_city_aqi()
        aqi_scalar = {1: 0.85, 2: 0.92, 3: 1.00, 4: 1.10, 5: 1.20}.get(aqi_index, 1.00)
        aqi_label  = {1: "Good", 2: "Fair", 3: "Moderate", 4: "Poor", 5: "Very Poor"}.get(aqi_index, "Unknown")

        adjusted_exposure = total_exposure * aqi_scalar
        pollution_score   = min(100, round(exp_per_km * 20, 1))

        return {
            "pollution_score":  pollution_score,
            "total_exposure":   round(adjusted_exposure, 3),
            "aqi_index":        aqi_index,
            "aqi_label":        aqi_label,
            "time_multiplier":  round(time_multiplier(), 2),
        }
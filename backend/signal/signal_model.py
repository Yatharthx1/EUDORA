import json
import os
import math
import logging
import osmnx as ox

logger = logging.getLogger(__name__)


# ── Fast approximate distance (metres) between two lat/lon points ─────────────
# Uses equirectangular approximation — accurate to <1% within 200m,
# which is more than enough for our 80m cluster radius.
# ~10× faster than great_circle since it avoids trig entirely.
_LAT_TO_M  = 111_320.0          # metres per degree of latitude
_DEG_TO_RAD = math.pi / 180.0

def _fast_dist_m(lat1, lon1, lat2, lon2):
    dlat = (lat2 - lat1) * _LAT_TO_M
    dlon = (lon2 - lon1) * _LAT_TO_M * math.cos(lat1 * _DEG_TO_RAD)
    return math.sqrt(dlat * dlat + dlon * dlon)


class SignalModel:
    def __init__(
        self,
        graph,
        registry_file="data/signals_registry.json",
        cluster_radius=90,
        detection_radius=150,
        avg_wait_per_signal=75,
        stop_probability=0.85,
    ):
        self.G                = graph
        self.registry_file    = registry_file
        self.cluster_radius   = cluster_radius
        self.detection_radius = detection_radius
        self.avg_wait         = avg_wait_per_signal
        self.stop_prob        = stop_probability
        self.junctions        = []

        self._load_and_cluster_signals()

    # ── Load + Snap + Cluster ─────────────────────────────────────────────────

    def _load_and_cluster_signals(self):
        logger.info("[SignalModel] Loading signal registry...")

        if not os.path.exists(self.registry_file):
            logger.warning("[SignalModel] Registry file not found.")
            return

        with open(self.registry_file, "r") as f:
            data = json.load(f)

        raw_signals = data.get("signals", {})
        if not raw_signals:
            logger.warning("[SignalModel] No signals found in registry.")
            return

        # ── Use raw coordinates directly — no graph snapping ─────────────────
        # Snapping to graph nodes is unreliable because OSM nodes don't always
        # align with where signals are placed. Instead we cluster the raw
        # signal lat/lngs directly and detect by proximity at runtime.
        raw_points = [
            {"lat": sig["lat"], "lng": sig["lng"]}
            for sig in raw_signals.values()
        ]

        # ── Cluster nearby signals into single junctions ──────────────────────
        visited  = set()
        clusters = []

        for i, pt in enumerate(raw_points):
            if i in visited:
                continue
            cluster = [pt]
            visited.add(i)
            for j, other in enumerate(raw_points):
                if j in visited:
                    continue
                if abs(other["lat"] - pt["lat"]) * _LAT_TO_M > self.cluster_radius:
                    continue
                if _fast_dist_m(pt["lat"], pt["lng"], other["lat"], other["lng"]) <= self.cluster_radius:
                    cluster.append(other)
                    visited.add(j)
            clusters.append(cluster)

        # ── Build junction list from cluster centroids ────────────────────────
        for cluster in clusters:
            self.junctions.append({
                "lat": sum(p["lat"] for p in cluster) / len(cluster),
                "lng": sum(p["lng"] for p in cluster) / len(cluster),
            })

        logger.info(f"[SignalModel] Junctions formed: {len(self.junctions)}")



    # ── Route Analysis ────────────────────────────────────────────────────────

    @staticmethod
    def _point_to_segment_dist(plat, plng, alat, alng, blat, blng):
        """Perpendicular distance from point P to segment A→B in metres."""
        ax = (alng - plng) * _LAT_TO_M * math.cos(plat * math.pi / 180)
        ay = (alat - plat) * _LAT_TO_M
        bx = (blng - plng) * _LAT_TO_M * math.cos(plat * math.pi / 180)
        by = (blat - plat) * _LAT_TO_M

        ab_sq = ax*ax + ay*ay + bx*bx + by*by  # rough check
        dx, dy = bx - ax, by - ay
        seg_len_sq = dx*dx + dy*dy

        if seg_len_sq == 0:
            return math.sqrt(ax*ax + ay*ay)

        t = max(0.0, min(1.0, ((-ax)*dx + (-ay)*dy) / seg_len_sq))
        cx = ax + t*dx
        cy = ay + t*dy
        return math.sqrt(cx*cx + cy*cy)

    def analyze_route(self, route):
        signal_count = 0

        # Pre-extract route node coordinates once
        route_coords = [
            (self.G.nodes[node]["y"], self.G.nodes[node]["x"])
            for node in route
        ]

        for junction in self.junctions:
            j_lat = junction["lat"]
            j_lng = junction["lng"]
            detected = False

            # Check each edge segment of the route, not just nodes
            # Fixes sparse-node highways where no single node is within radius
            for i in range(len(route_coords) - 1):
                alat, alng = route_coords[i]
                blat, blng = route_coords[i + 1]

                # Quick bbox reject
                if (min(alat, blat) - j_lat) * _LAT_TO_M > self.detection_radius:
                    continue
                if (j_lat - max(alat, blat)) * _LAT_TO_M > self.detection_radius:
                    continue

                dist = self._point_to_segment_dist(j_lat, j_lng, alat, alng, blat, blng)
                if dist <= self.detection_radius:
                    signal_count += 1
                    detected = True
                    break

        expected_stops = signal_count * self.stop_prob
        expected_delay = expected_stops * self.avg_wait

        return {
            "signal_count":              signal_count,
            "expected_stops":            round(expected_stops, 2),
            "expected_signal_delay_min": round(expected_delay / 60, 2),
        }

    # ── Attach Signal Weights to Graph ────────────────────────────────────────

    def attach_signal_weights(self):
        # Mark ALL nodes within detection_radius of each junction centroid.
        # A single dot in the registry may represent a 4-way junction —
        # all roads passing through that junction must carry the signal weight,
        # not just the one road the dot happens to snap to.
        node_to_junction = {}
        all_node_coords = [
            (n, self.G.nodes[n]["y"], self.G.nodes[n]["x"])
            for n in self.G.nodes
        ]

        for jid, junction in enumerate(self.junctions):
            jlat, jlng = junction["lat"], junction["lng"]
            for node, nlat, nlng in all_node_coords:
                if abs(nlat - jlat) * _LAT_TO_M > self.detection_radius:
                    continue
                if _fast_dist_m(jlat, jlng, nlat, nlng) <= self.detection_radius:
                    # If node already tagged by a closer junction, keep that one
                    if node not in node_to_junction:
                        node_to_junction[node] = jid

        logger.info(f"[SignalModel] Nodes tagged with signal: {len(node_to_junction)}")

        expected_delay_min = self.stop_prob * (self.avg_wait / 60.0)

        for u, v, k, data in self.G.edges(keys=True, data=True):
            if v in node_to_junction:
                data["signal_presence"] = 1
                data["junction_id"]     = node_to_junction[v]
                data["signal_delay"]    = expected_delay_min
            else:
                data["signal_presence"] = 0
                data["junction_id"]     = None
                data["signal_delay"]    = 0.0

            data["time_with_signal"] = data["base_time"] + data["signal_delay"]

        logger.info("[SignalModel] Signal weights attached to graph.")
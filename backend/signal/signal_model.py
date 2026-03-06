import json
import os
import osmnx as ox


class SignalModel:
    def __init__(
        self,
        graph,
        registry_file="data/signals_registry.json",
        cluster_radius=80,       # meters
        detection_radius=50,     # meters
        avg_wait_per_signal=45,
        stop_probability=0.6
    ):

        self.G = graph
        self.registry_file = registry_file
        self.cluster_radius = cluster_radius
        self.detection_radius = detection_radius
        self.avg_wait = avg_wait_per_signal
        self.stop_prob = stop_probability

        self.junctions = []

        self._load_and_cluster_signals()

    # ---------------------------------------------------
    # Load + Snap + Cluster Signals
    # ---------------------------------------------------

    def _load_and_cluster_signals(self):

        print("Loading signal registry...")

        if not os.path.exists(self.registry_file):
            print("Signal registry file not found.")
            return

        with open(self.registry_file, "r") as f:
            data = json.load(f)

        raw_signals = data.get("signals", {})

        snapped_nodes = []

        for _, sig in raw_signals.items():

            lat = sig["lat"]
            lng = sig["lng"]

            node = ox.distance.nearest_nodes(self.G, lng, lat)

            snapped_nodes.append(node)

        snapped_nodes = list(set(snapped_nodes))

        clusters = []
        visited = set()

        for node in snapped_nodes:

            if node in visited:
                continue

            cluster = [node]
            visited.add(node)

            lat1 = self.G.nodes[node]["y"]
            lon1 = self.G.nodes[node]["x"]

            for other in snapped_nodes:

                if other in visited:
                    continue

                lat2 = self.G.nodes[other]["y"]
                lon2 = self.G.nodes[other]["x"]

                dist = ox.distance.great_circle(lat1, lon1, lat2, lon2)

                if dist <= self.cluster_radius:
                    cluster.append(other)
                    visited.add(other)

            clusters.append(cluster)

        for cluster in clusters:

            lats = [self.G.nodes[n]["y"] for n in cluster]
            lngs = [self.G.nodes[n]["x"] for n in cluster]

            center_lat = sum(lats) / len(lats)
            center_lng = sum(lngs) / len(lngs)

            self.junctions.append({
                "nodes": cluster,
                "lat":   center_lat,
                "lng":   center_lng
            })

        print(f"Logical junctions formed: {len(self.junctions)}")

    # ---------------------------------------------------
    # Route Analysis
    # ---------------------------------------------------

    def analyze_route(self, route):

        signal_count = 0

        for junction in self.junctions:

            j_lat = junction["lat"]
            j_lng = junction["lng"]

            for node in route:

                node_lat = self.G.nodes[node]["y"]
                node_lng = self.G.nodes[node]["x"]

                dist = ox.distance.great_circle(
                    node_lat,
                    node_lng,
                    j_lat,
                    j_lng
                )

                if dist <= self.detection_radius:
                    signal_count += 1
                    break

        expected_stops = signal_count * self.stop_prob
        expected_delay = expected_stops * self.avg_wait

        return {
            "signal_count":              signal_count,
            "expected_stops":            round(expected_stops, 2),
            "expected_signal_delay_min": round(expected_delay / 60, 2)
        }

    # ---------------------------------------------------
    # Attach signal weights to graph
    # ---------------------------------------------------

    def attach_signal_weights(self):

        # Build node -> junction_id mapping.
        # Each entry in self.junctions is one physical intersection regardless
        # of whether it came from a single manual entry or multiple OSM nodes
        # that were clustered together. Storing this id on every edge lets the
        # routing engine deduplicate signal counts by junction rather than by
        # edge, which prevents over-counting multi-node OSM intersections.
        node_to_junction = {}
        for jid, junction in enumerate(self.junctions):
            for node in junction["nodes"]:
                node_to_junction[node] = jid

        for u, v, k, data in self.G.edges(keys=True, data=True):

            if v in node_to_junction:

                data["signal_presence"] = 1
                data["junction_id"]     = node_to_junction[v]

                expected_delay_min = (
                    self.stop_prob *
                    (self.avg_wait / 60.0)
                )

            else:

                data["signal_presence"] = 0
                data["junction_id"]     = None
                expected_delay_min      = 0.0

            data["signal_delay"]     = expected_delay_min
            data["time_with_signal"] = data["base_time"] + expected_delay_min

        print("Signal weights attached to graph.")  
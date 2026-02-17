import osmnx as ox

def _distance_m(lat1, lon1, lat2, lon2):
        return ox.distance.great_circle(lat1, lon1, lat2, lon2)

class SignalModel:
    def __init__(self, graph, place_name="Indore, India",
                 avg_wait_per_signal=45,
                 stop_probability=0.6):

        self.G = graph
        self.place_name = place_name
        self.avg_wait = avg_wait_per_signal
        self.stop_prob = stop_probability

        self.signal_nodes = set()
    
    # -------------------------------------
    # Step 1: Extract + Attach Signals
    # -------------------------------------
    
    def attach_signals(self):

        print("Extracting traffic signals from OSM...")
        tags = {"highway": "traffic_signals"}
        signals = ox.features_from_place(self.place_name, tags)

        raw_signal_nodes = []

        for idx, row in signals.iterrows():
            if row.geometry.geom_type != "Point":
                continue

            lat = row.geometry.y
            lng = row.geometry.x

            node = ox.nearest_nodes(self.G, lng, lat)
            raw_signal_nodes.append(node)

        print("Raw snapped signal nodes:", len(raw_signal_nodes))

        # ---- CLUSTERING STEP ----
        clustered_nodes = []
        used = set()

        threshold = 13.5  # meters

        for node in raw_signal_nodes:
            if node in used:
                continue

            lat1 = self.G.nodes[node]["y"]
            lon1 = self.G.nodes[node]["x"]

            cluster = [node]
            used.add(node)

            for other in raw_signal_nodes:
                if other in used:
                    continue

                lat2 = self.G.nodes[other]["y"]
                lon2 = self.G.nodes[other]["x"]

                if _distance_m(lat1, lon1, lat2, lon2) < threshold:
                    cluster.append(other)
                    used.add(other)

            # choose first node as representative
            clustered_nodes.append(cluster[0])

        self.signal_nodes = set(clustered_nodes)

        # Reset all nodes
        for n in self.G.nodes:
            self.G.nodes[n]["has_signal"] = False

        for n in self.signal_nodes:
            self.G.nodes[n]["has_signal"] = True

        print("Clustered signal intersections:", len(self.signal_nodes))

    # -------------------------------------
    # Step 2: Analyze Route
    # -------------------------------------
    def analyze_route(self, route):
        signal_count = 0

        for node in route:
            if self.G.nodes[node].get("has_signal", False):
                signal_count += 1

        expected_stops = signal_count * self.stop_prob
        expected_delay = expected_stops * self.avg_wait


        return {
            "signal_count": signal_count,
            "expected_stops": round(expected_stops, 2),
            "expected_signal_delay_sec": round(expected_delay, 2),
            "expected_signal_delay_min": round(expected_delay / 60, 2)
        }

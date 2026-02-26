import json
import osmnx as ox


class SignalModel:
    def __init__(self,
                 graph,
                 registry_file="data/signals_registry.json",
                 threshold=35,
                 detection_radius=50,
                 avg_wait_per_signal=45,
                 stop_probability=0.6):

        self.G = graph
        self.registry_file = registry_file
        self.threshold = threshold
        self.detection_radius = detection_radius
        self.avg_wait = avg_wait_per_signal
        self.stop_prob = stop_probability

        self.junctions = []  # list of {lat, lng, timing}

        self._load_runtime_signals()

    # ---------------------------------------------------
    # Runtime Loader with Proper Transitive Clustering
    # ---------------------------------------------------
    def _load_runtime_signals(self):

        print("Loading signal registry...")

        with open(self.registry_file, "r") as f:
            data = json.load(f)

        raw_signals = data["signals"]

        snapped = []

        # Step 1: Snap all signals to graph
        for key, sig in raw_signals.items():
            lat = sig["lat"]
            lng = sig["lng"]

            node = ox.nearest_nodes(self.G, lng, lat)

            snapped.append({
                "node": node,
                "lat": lat,
                "lng": lng,
                "timing": sig,
                "source": sig.get("source", "unknown")
            })

        # Step 2: Flood-fill clustering
        visited = set()
        clusters = []

        for i in range(len(snapped)):
            if i in visited:
                continue

            stack = [i]
            cluster_indices = []

            while stack:
                idx = stack.pop()

                if idx in visited:
                    continue

                visited.add(idx)
                cluster_indices.append(idx)

                lat1 = self.G.nodes[snapped[idx]["node"]]["y"]
                lon1 = self.G.nodes[snapped[idx]["node"]]["x"]

                for j in range(len(snapped)):
                    if j in visited:
                        continue

                    lat2 = self.G.nodes[snapped[j]["node"]]["y"]
                    lon2 = self.G.nodes[snapped[j]["node"]]["x"]

                    dist = ox.distance.great_circle(lat1, lon1, lat2, lon2)

                    if dist < self.threshold:
                        stack.append(j)

            clusters.append([snapped[k] for k in cluster_indices])

        # Step 3: Build logical junctions
        for cluster in clusters:

            # Manual entry overrides OSM
            manual_entry = next((s for s in cluster if s["source"] == "manual"), None)

            if manual_entry:
                center_lat = manual_entry["lat"]
                center_lng = manual_entry["lng"]
                timing = manual_entry["timing"]
            else:
                # compute geometric center
                latitudes = [self.G.nodes[s["node"]]["y"] for s in cluster]
                longitudes = [self.G.nodes[s["node"]]["x"] for s in cluster]

                center_lat = sum(latitudes) / len(latitudes)
                center_lng = sum(longitudes) / len(longitudes)

                timing = cluster[0]["timing"]

            self.junctions.append({
                "lat": center_lat,
                "lng": center_lng,
                "timing": timing
            })

        print(f"Runtime junctions formed: {len(self.junctions)}")

    # ---------------------------------------------------
    # Route Analysis (One Per Junction)
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
                    node_lat, node_lng,
                    j_lat, j_lng
                )

                if dist < self.detection_radius:
                    signal_count += 1
                    break

        expected_stops = signal_count * self.stop_prob
        expected_delay = expected_stops * self.avg_wait

        return {
            "signal_count": signal_count,
            "expected_stops": round(expected_stops, 2),
            "expected_signal_delay_min": round(expected_delay / 60, 2)
        }

    # ---------------------------------------------------
    # Visualization
    # ---------------------------------------------------
    def visualize_runtime_junctions(self, output_file="runtime_junctions.html"):

        import folium

        if not self.junctions:
            print("No junctions loaded.")
            return

        first = self.junctions[0]

        m = folium.Map(location=[first["lat"], first["lng"]], zoom_start=13)

        for junction in self.junctions:

            source = junction["timing"].get("source", "unknown")
            color = "red" if source == "manual" else "blue"

            folium.CircleMarker(
                location=[junction["lat"], junction["lng"]],
                radius=6,
                color=color,
                fill=True,
                fill_opacity=0.9
            ).add_to(m)

        m.save(output_file)
        print(f"Runtime junction map saved -> {output_file}")

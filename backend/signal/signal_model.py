import json
import osmnx as ox


class SignalModel:
    def __init__(self, graph,
                 registry_file="data/signals_registry.json",
                 threshold=25,
                 avg_wait_per_signal=45,
                 stop_probability=0.6):

        self.G = graph
        self.registry_file = registry_file
        self.threshold = threshold
        self.avg_wait = avg_wait_per_signal
        self.stop_prob = stop_probability

        self.junction_map = {}     # node_id -> junction_id
        self.junction_data = {}    # junction_id -> timing

        self._load_runtime_signals()

    # ---------------------------------------------------
    # Runtime Loader (OSM + Manual merged automatically)
    # ---------------------------------------------------
    def _load_runtime_signals(self):

        print("Loading signal registry...")

        with open(self.registry_file, "r") as f:
            data = json.load(f)

        raw_signals = data["signals"]

        snapped = []

        # Step 1: Snap lat/lng to graph nodes
        for key, sig in raw_signals.items():
            lat = sig["lat"]
            lng = sig["lng"]

            node = ox.nearest_nodes(self.G, lng, lat)

            snapped.append({
                "node": node,
                "timing": sig,
                "source": sig.get("source", "unknown")
            })

        # Step 2: Spatial clustering into junctions
        visited = set()
        junctions = []

        for i, s1 in enumerate(snapped):
            if i in visited:
                continue

            cluster = [s1]
            visited.add(i)

            lat1 = self.G.nodes[s1["node"]]["y"]
            lon1 = self.G.nodes[s1["node"]]["x"]

            for j, s2 in enumerate(snapped):
                if j in visited:
                    continue

                lat2 = self.G.nodes[s2["node"]]["y"]
                lon2 = self.G.nodes[s2["node"]]["x"]

                dist = ox.distance.great_circle(lat1, lon1, lat2, lon2)

                if dist < self.threshold:
                    cluster.append(s2)
                    visited.add(j)

            junctions.append(cluster)

        # Step 3: Build junction maps
        for jid, cluster in enumerate(junctions):

            # Manual overrides OSM
            manual_entry = next((s for s in cluster if s["source"] == "manual"), None)

            if manual_entry:
                timing = manual_entry["timing"]
            else:
                timing = cluster[0]["timing"]

            self.junction_data[jid] = timing

            for s in cluster:
                self.junction_map[s["node"]] = jid

        print(f"Runtime junctions formed: {len(self.junction_data)}")

    # ---------------------------------------------------
    # Route Analysis (One Per Junction)
    # ---------------------------------------------------
    def analyze_route(self, route):

        junctions_encountered = set()

        for node in route:
            if node in self.junction_map:
                junctions_encountered.add(self.junction_map[node])

        signal_count = len(junctions_encountered)

        expected_stops = signal_count * self.stop_prob
        expected_delay = expected_stops * self.avg_wait

        return {
            "signal_count": signal_count,
            "expected_stops": round(expected_stops, 2),
            "expected_signal_delay_min": round(expected_delay / 60, 2)
        }
import folium

def visualize_runtime_junctions(self, output_file="runtime_junctions.html"):

    if not self.junction_data:
        print("No junctions loaded.")
        return

    # Get center from first junction
    first_junction = next(iter(self.junction_data.values()))
    center_lat = first_junction["lat"]
    center_lng = first_junction["lng"]

    m = folium.Map(location=[center_lat, center_lng], zoom_start=13)

    for jid, timing in self.junction_data.items():

        lat = timing["lat"]
        lng = timing["lng"]
        source = timing.get("source", "unknown")

        if source == "manual":
            color = "red"
        else:
            color = "blue"

        folium.CircleMarker(
            location=[lat, lng],
            radius=6,
            color=color,
            fill=True,
            fill_opacity=0.9,
            popup=f"Junction {jid} ({source})"
        ).add_to(m)

    m.save(output_file)
    print(f"Runtime junction map saved -> {output_file}")

from backend.routing.graph_builder import build_graph
from backend.routing.routing_engine import compute_route
from backend.signal.signal_model import SignalModel

import folium
import osmnx as ox


def visualize_route(G, route, signal_model, filename="route_visual_debug.html"):

    mid_node = route[len(route) // 2]
    mid_lat = G.nodes[mid_node]["y"]
    mid_lng = G.nodes[mid_node]["x"]

    m = folium.Map(location=[mid_lat, mid_lng], zoom_start=14)

    # Draw route
    route_coords = [(G.nodes[n]["y"], G.nodes[n]["x"]) for n in route]
    folium.PolyLine(route_coords, color="blue", weight=5).add_to(m)

    # Draw all junctions (gray)
    for junction in signal_model.junctions:
        folium.CircleMarker(
            location=[junction["lat"], junction["lng"]],
            radius=4,
            color="gray",
            fill=True,
            fill_opacity=0.6
        ).add_to(m)

    # Highlight encountered junctions (red)
    for junction in signal_model.junctions:

        for node in route:

            node_lat = G.nodes[node]["y"]
            node_lng = G.nodes[node]["x"]

            dist = ox.distance.great_circle(
                node_lat, node_lng,
                junction["lat"], junction["lng"]
            )

            if dist < signal_model.detection_radius:
                folium.CircleMarker(
                    location=[junction["lat"], junction["lng"]],
                    radius=7,
                    color="red",
                    fill=True,
                    fill_opacity=1
                ).add_to(m)
                break

    m.save(filename)
    print(f"Route visualization saved -> {filename}")


def run_test():

    print("Building graph...")
    G = build_graph()

    print("Initializing signal model...")
    signal_model = SignalModel(G)

    origin_lat, origin_lon = 22.70549, 75.84272
    dest_lat, dest_lon = 22.755297, 75.8966

    print("Computing route...")
    result = compute_route(G, origin_lat, origin_lon, dest_lat, dest_lon)
    route = result["route"]

    print("\nRoute Stats:")
    print("Distance (km):", result["distance_km"])
    print("Time (min):", result["time_min"])

    stats = signal_model.analyze_route(route)

    print("\nSignal Analysis:")
    print("Signal Count:", stats["signal_count"])
    print("Expected Stops:", stats["expected_stops"])
    print("Expected Delay (min):", stats["expected_signal_delay_min"])

    visualize_route(G, route, signal_model)


if __name__ == "__main__":
    run_test()
    
from backend.routing.graph_builder import build_graph
from backend.routing.routing_engine import compute_route
from backend.signal.signal_model import SignalModel

import folium


def visualize_route(G, route, signal_model, filename="route_visual_debug.html"):
    """Visualize route + runtime junctions"""

    mid_node = route[len(route) // 2]
    mid_lat = G.nodes[mid_node]["y"]
    mid_lng = G.nodes[mid_node]["x"]

    m = folium.Map(location=[mid_lat, mid_lng], zoom_start=14)

    # Draw route
    route_coords = [(G.nodes[n]["y"], G.nodes[n]["x"]) for n in route]
    folium.PolyLine(route_coords, color="blue", weight=5, opacity=0.8).add_to(m)

    # Mark all runtime junctions (gray)
    for jid, data in signal_model.junction_data.items():

        lat = data["lat"]
        lng = data["lng"]

        folium.CircleMarker(
            location=[lat, lng],
            radius=4,
            color="gray",
            fill=True,
            fill_opacity=0.6
        ).add_to(m)

    # Highlight junctions encountered on this route (red)
    encountered = set()

    for node in route:
        if node in signal_model.junction_map:
            jid = signal_model.junction_map[node]
            if jid not in encountered:
                encountered.add(jid)

                lat = signal_model.junction_data[jid]["lat"]
                lng = signal_model.junction_data[jid]["lng"]

                folium.CircleMarker(
                    location=[lat, lng],
                    radius=7,
                    color="red",
                    fill=True,
                    fill_opacity=1
                ).add_to(m)

    m.save(filename)
    print(f"Route visualization saved -> {filename}")


def run_test():
    print("Building / Loading graph...")
    G = build_graph()

    print("Initializing signal model...")
    signal_model = SignalModel(G)

    origin_lat, origin_lon = 22.753243581674887, 75.90394084049616
    dest_lat, dest_lon = 22.72402097377865, 75.88678568825465

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

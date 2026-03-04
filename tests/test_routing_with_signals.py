from backend.routing.graph_builder import build_graph
from backend.routing.routing_engine import weighted_directional_route
from backend.signal.signal_model import SignalModel
import osmnx as ox

import folium


def visualize_routes(G, fastest, least, realistic, signal_model,
                     filename="route_visual_debug.html"):

    m = folium.Map(
        location=[G.nodes[realistic[0]]["y"],
                  G.nodes[realistic[0]]["x"]],
        zoom_start=14
    )

    def coords(route):
        return [(G.nodes[n]["y"], G.nodes[n]["x"]) for n in route]

    folium.PolyLine(coords(fastest), color="blue", weight=5).add_to(m)
    folium.PolyLine(coords(least), color="green", weight=5).add_to(m)
    folium.PolyLine(coords(realistic), color="red", weight=5).add_to(m)

    # Highlight signals encountered in REALISTIC route
    encountered = []

    for junction in signal_model.junctions:
        for node in realistic:
            lat = G.nodes[node]["y"]
            lng = G.nodes[node]["x"]

            dist = ox.distance.great_circle(
                lat, lng,
                junction["lat"], junction["lng"]
            )

            if dist <= signal_model.detection_radius:
                encountered.append(junction)
                break

    # Draw all junctions
    for junction in signal_model.junctions:
        folium.CircleMarker(
            location=[junction["lat"], junction["lng"]],
            radius=4,
            color="gray",
            fill=True,
            fill_opacity=0.5
        ).add_to(m)

    # Draw counted ones bigger
    for junction in encountered:
        folium.CircleMarker(
            location=[junction["lat"], junction["lng"]],
            radius=8,
            color="red",
            fill=True,
            fill_opacity=1
        ).add_to(m)

    m.save(filename)
    print("Visualization saved with counted signals highlighted.")


def run_test():

    print("Building graph...")
    G = build_graph()

    print("Initializing signal model...")
    signal_model = SignalModel(G)
    signal_model.attach_signal_weights()

    origin_lat, origin_lon = 22.723872405550065, 75.88668716276355
    dest_lat, dest_lon = 22.77965146106933, 75.952075772599

    # ---- Fastest Route ----
    print("\nComputing FASTEST route...")
    fastest = weighted_directional_route(
    G, origin_lat, origin_lon, dest_lat, dest_lon,
    w_time=40.0,
    w_signal=10.0,
    w_turn=15.0,
    w_hierarchy=35.0
)

    # ---- Least Signal Route ----
    print("\nComputing LEAST SIGNAL route...")
    least_signal = weighted_directional_route(
    G, origin_lat, origin_lon, dest_lat, dest_lon,
    w_time=15.0,
    w_signal= 45.0,
    w_turn=30.0,
    w_hierarchy=10.0
)

    # ---- Practical Urban Route ----
    print("\nComputing REALISTIC route...")
    realistic =weighted_directional_route(
    G, origin_lat, origin_lon, dest_lat, dest_lon,
    w_time=2.0,
    w_signal=2.0,
    w_turn=0.4,
    w_hierarchy=1.0
)

    print("\nFASTEST:")
    print(fastest)

    print("\nLEAST SIGNAL:")
    print(least_signal)

    print("\nREALISTIC:")
    print(realistic)
    print("FASTEST:", fastest["time_min"], fastest["signals"])
    print("PRACTICAL:", realistic["time_min"], realistic["signals"])
    print("LEAST:", least_signal["time_min"], least_signal["signals"])
    visualize_routes(
    G,
    fastest["route"],
    least_signal["route"],
    realistic["route"],
    signal_model
)


if __name__ == "__main__":
    run_test()
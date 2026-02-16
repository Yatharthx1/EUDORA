from backend.routing.graph_builder import build_graph 

from backend.routing.routing_engine import compute_route
from backend.signal.signal_model import SignalModel

if __name__ == "__main__":

    print("Building graph...")
    G = build_graph()

    print("Initializing signal model...")
    signal_model = SignalModel(G)

    signal_model.attach_signals()

    origin_lat, origin_lon = 22.753243581674887, 75.90394084049616
    dest_lat, dest_lon =22.72402097377865, 75.88678568825465

    result = compute_route(G, origin_lat, origin_lon, dest_lat, dest_lon)

    route = result["route"]

    print("Distance (km):", result["distance_km"])
    print("Time (min):", result["time_min"])

    stats = signal_model.analyze_route(route)

    print("Signal Count:", stats["signal_count"])
    print("Expected Stops:", stats["expected_stops"])
    print("Expected Delay (min):", stats["expected_signal_delay_min"])


import folium

# Create map centered roughly at midpoint of route
mid_node = route[len(route)//2]
mid_lat = G.nodes[mid_node]["y"]
mid_lng = G.nodes[mid_node]["x"]

m = folium.Map(location=[mid_lat, mid_lng], zoom_start=14)

# Draw full route
route_coords = [(G.nodes[n]["y"], G.nodes[n]["x"]) for n in route]

folium.PolyLine(
    route_coords,
    color="blue",
    weight=5,
    opacity=0.8
).add_to(m)

# Mark ALL clustered signal intersections (city-wide)
for node in signal_model.signal_nodes:
    lat = G.nodes[node]["y"]
    lng = G.nodes[node]["x"]

    folium.CircleMarker(
        location=[lat, lng],
        radius=4,
        color="gray",
        fill=True,
        fill_opacity=0.5
    ).add_to(m)

# Highlight signals ON THIS ROUTE
for node in route:
    if G.nodes[node].get("has_signal", False):
        lat = G.nodes[node]["y"]
        lng = G.nodes[node]["x"]

        folium.CircleMarker(
            location=[lat, lng],
            radius=6,
            color="red",
            fill=True,
            fill_opacity=1
        ).add_to(m)

m.save("route_visual_debug.html")
print("Route visualization saved.")


for i in range(len(route) - 1):
    u = route[i]
    v = route[i+1]

    edge_data = G.get_edge_data(u, v)
    first_edge = list(edge_data.values())[0]

    road_name = first_edge.get("name", "Unnamed")
    print(road_name)

import osmnx as ox
from backend.routing.graph_builder import build_graph

if __name__ == "__main__":
    print("Step 1: Building graph...")
    G = build_graph()

    print("Step 2: Defining coordinates...")

    origin_name = "Vijay Nagar, Indore , India"
    destination_name = "Bengali Square , Indore , India"
    # Vijay Nagar
    #origin_lat, origin_lon = ox.geocode(origin_name)
    origin_lat, origin_lon = 22.77972, 75.95210
    

    # Bengali Square
    # dest_lat , dest_lon = ox.geocode(destination_name)
    dest_lat , dest_lon = 22.65597, 75.82316
     

    print("Step 3: Finding nearest nodes...")

    origin_node = ox.distance.nearest_nodes(G, origin_lon, origin_lat)
    dest_node = ox.distance.nearest_nodes(G, dest_lon, dest_lat)

    print("Origin node:", origin_node)
    print("Destination node:", dest_node)
    print("Origin Lat , lon:",origin_lat,origin_lon)
    print("Dest Lat , lon:",dest_lat,dest_lon)
    print("Step 4: Computing shortest path...")

    route = ox.shortest_path(G, origin_node, dest_node, weight="base_time")

    print("Route found.")
    print("Number of nodes in route:", len(route))
total_time = 0
total_distance = 0

for i in range(len(route) - 1):
    u = route[i]
    v = route[i + 1]

    edge_data = G.get_edge_data(u, v)
    # Since this is MultiDiGraph, take first edge
    first_edge = list(edge_data.values())[0]

    total_time += first_edge["base_time"]
    total_distance += first_edge["length"]

print(f"Total distance (km): {total_distance / 1000:.2f}")
print(f"Estimated travel time (min): {total_time:.2f}")

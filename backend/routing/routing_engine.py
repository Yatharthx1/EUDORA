import heapq
import math
import osmnx as ox


def turn_penalty(G, A, B, C):

    lat1, lon1 = G.nodes[A]["y"], G.nodes[A]["x"]
    lat2, lon2 = G.nodes[B]["y"], G.nodes[B]["x"]
    lat3, lon3 = G.nodes[C]["y"], G.nodes[C]["x"]

    v1 = (lat2 - lat1, lon2 - lon1)
    v2 = (lat3 - lat2, lon3 - lon2)

    dot = v1[0]*v2[0] + v1[1]*v2[1]
    mag1 = math.sqrt(v1[0]**2 + v1[1]**2)
    mag2 = math.sqrt(v2[0]**2 + v2[1]**2)

    if mag1 == 0 or mag2 == 0:
        return 0

    angle = math.degrees(math.acos(max(-1, min(1, dot/(mag1*mag2)))))

    if angle < 15:
        return 0

    if angle < 60:
        penalty = 1
    else:
        penalty = 3

    cross = v1[0]*v2[1] - v1[1]*v2[0]

    # right turn heavier
    if cross < 0:
        penalty *= 1.5

    return penalty
def summarize_route(G, route):

    total_time = 0
    total_distance = 0
    total_signals = 0

    for i in range(len(route) - 1):
        u = route[i]
        v = route[i + 1]

        edge = list(G[u][v].values())[0]

        total_time += edge["base_time"]
        total_distance += edge["length"]
        total_signals += edge.get("signal_presence", 0)

    return {
        "route": route,
        "distance_km": round(total_distance / 1000, 2),
        "time_min": round(total_time, 2),
        "signals": total_signals
    }

def weighted_directional_route(
        G,
        origin_lat,
        origin_lon,
        dest_lat,
        dest_lon,
        w_time=1.0,
        w_signal=1.0,
        w_turn=1.0,
        w_hierarchy=1.0):

    origin = ox.distance.nearest_nodes(G, origin_lon, origin_lat)
    dest = ox.distance.nearest_nodes(G, dest_lon, dest_lat)

    pq = []
    visited = {}

    for neighbor in G.successors(origin):
        edge = list(G[origin][neighbor].values())[0]

        cost = (
            w_time * edge["base_time"] +
            w_signal * edge.get("signal_delay", 0) +
            w_hierarchy * edge.get("road_penalty", 0)
        )

        heapq.heappush(pq, (cost, origin, neighbor, [origin, neighbor]))

    while pq:
        cost, prev, current, path = heapq.heappop(pq)

        state = (prev, current)

        if state in visited and visited[state] <= cost:
            continue

        visited[state] = cost

        if current == dest:
            return summarize_route(G, path)

        for next_node in G.successors(current):

            edge = list(G[current][next_node].values())[0]

            t_pen = turn_penalty(G, prev, current, next_node)

            new_cost = (
                cost
                + w_time * edge["base_time"]
                + w_signal * edge.get("signal_delay", 0)
                + w_hierarchy * edge.get("road_penalty", 0)
                + w_turn * t_pen
            )

            heapq.heappush(
                pq,
                (new_cost, current, next_node, path + [next_node])
            )

    return None
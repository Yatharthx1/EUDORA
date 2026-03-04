from backend.routing.graph_builder import build_graph
from backend.routing.routing_engine import weighted_directional_route
from backend.signal.signal_model import SignalModel


def run_test():

    print("Building graph...")
    G = build_graph()

    print("Initializing signal model...")
    signal_model = SignalModel(G)

    signal_model.attach_signal_weights()

    origin_lat = 22.70549
    origin_lon = 75.84272

    dest_lat = 22.755297
    dest_lon = 75.8966

    print("Computing route...")

    result = weighted_directional_route(
        G,
        origin_lat,
        origin_lon,
        dest_lat,
        dest_lon
    )

    route = result["route"]

    print("\nRoute Stats")
    print("Distance:", result["distance_km"])
    print("Time:", result["time_min"])

    stats = signal_model.analyze_route(route)

    print("\nSignal Analysis")
    print("Signal Count:", stats["signal_count"])
    print("Expected Stops:", stats["expected_stops"])
    print("Expected Delay (min):", stats["expected_signal_delay_min"])


if __name__ == "__main__":
    run_test()
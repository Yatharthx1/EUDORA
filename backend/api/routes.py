from fastapi import APIRouter, HTTPException, Request
from backend.routing.routing_engine import weighted_directional_route

router = APIRouter()


def route_to_geojson(G, route):
    coordinates = [
        [G.nodes[node]["x"], G.nodes[node]["y"]]
        for node in route
    ]
    return {
        "type": "Feature",
        "geometry": {
            "type": "LineString",
            "coordinates": coordinates
        },
        "properties": {}
    }


def extract_signal_coords(G, route):
    coords       = []
    seen_junctions = set()

    for i in range(len(route) - 1):
        u, v = route[i], route[i + 1]
        edge = list(G[u][v].values())[0]

        # Only emit one marker per physical junction, matching the fixed
        # signal count returned by summarize_route().
        jid = edge.get("junction_id")
        if jid is not None and jid not in seen_junctions:
            seen_junctions.add(jid)
            coords.append({
                "lat": G.nodes[v]["y"],
                "lng": G.nodes[v]["x"],
            })

    return coords


def build_response(G, result, pollution_model):
    if result is None:
        return None
    pollution = pollution_model.analyze_route(result["route"])
    return {
        "route":           route_to_geojson(G, result["route"]),
        "time_min":        result["time_min"],
        "distance_km":     result["distance_km"],
        "signals":         result["signals"],
        "signal_coords":   extract_signal_coords(G, result["route"]),
        "pollution_score": pollution["pollution_score"],
        "aqi_index":       pollution["aqi_index"],
        "aqi_label":       pollution["aqi_label"],
        "time_multiplier": pollution["time_multiplier"],
    }


@router.get("/get-routes")
def get_routes(
    request: Request,
    start_lat: float,
    start_lng: float,
    end_lat: float,
    end_lng: float
):
    G               = request.app.state.G
    pollution_model = request.app.state.pollution_model

    try:
        fastest = weighted_directional_route(
            G, start_lat, start_lng, end_lat, end_lng,
            w_time=1.0, w_signal=0.1, w_turn=0.2,
            w_hierarchy=0.3, w_pollution=0.05
        )

        least_signal = weighted_directional_route(
            G, start_lat, start_lng, end_lat, end_lng,
            w_time=0.4, w_signal=3.0, w_turn=0.8,
            w_hierarchy=1.2, w_pollution=0.2
        )

        least_pollution = weighted_directional_route(
            G, start_lat, start_lng, end_lat, end_lng,
            w_time=0.4, w_signal=0.2, w_turn=0.8,
            w_hierarchy=1.5, w_pollution=3.0
        )

        overall_best = weighted_directional_route(
            G, start_lat, start_lng, end_lat, end_lng,
            w_time=1.0, w_signal=1.2, w_turn=0.6,
            w_hierarchy=1.0, w_pollution=1.2
        )

        if not all([fastest, least_signal, least_pollution, overall_best]):
            raise HTTPException(status_code=404, detail="One or more routes could not be computed.")

        return {
            "fastest":         build_response(G, fastest,         pollution_model),
            "least_signal":    build_response(G, least_signal,    pollution_model),
            "least_pollution": build_response(G, least_pollution, pollution_model),
            "overall_best":    build_response(G, overall_best,    pollution_model),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/get-signals")
def get_signals(request: Request):
    signal_model = request.app.state.signal_model
    return {
        "signals": [
            {"lat": j["lat"], "lng": j["lng"]}
            for j in signal_model.junctions
        ]
    }
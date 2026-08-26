import pytest
import math
import networkx as nx
import shapely.geometry
from shapely import wkt
from fastapi.testclient import TestClient

from backend.routing.geometry import (
    extract_edge_geometry,
    reconstruct_route_geometry,
    route_to_geojson,
)
from backend.routing.graph_builder import build_graph
from backend.routing.routing_engine import weighted_directional_route, greenest_directional_route
from main import app


@pytest.fixture(scope="module")
def graph():
    return build_graph()


def test_empty_and_single_node_route():
    G = nx.MultiDiGraph()
    G.add_node(1, x=75.8, y=22.7)
    
    assert reconstruct_route_geometry(G, []) == []
    assert reconstruct_route_geometry(G, [1]) == [[75.8, 22.7]]
    
    geojson_empty = route_to_geojson(G, [])
    assert geojson_empty["type"] == "Feature"
    assert geojson_empty["geometry"]["type"] == "LineString"
    assert geojson_empty["geometry"]["coordinates"] == []

    geojson_single = route_to_geojson(G, [1])
    assert geojson_single["geometry"]["coordinates"] == [[75.8, 22.7]]


def test_straight_edge_geometry_extraction():
    G = nx.MultiDiGraph()
    G.add_node(1, x=75.80, y=22.70)
    G.add_node(2, x=75.82, y=22.72)
    G.add_edge(1, 2, 0, length=100.0)

    geom = extract_edge_geometry(G, 1, 2)
    assert geom == [[75.80, 22.70], [75.82, 22.72]]


def test_curved_edge_geometry_extraction():
    G = nx.MultiDiGraph()
    G.add_node(1, x=75.80, y=22.70)
    G.add_node(2, x=75.84, y=22.70)
    
    # A curve bending northward at (75.82, 22.72)
    curve = shapely.geometry.LineString([
        (75.80, 22.70),
        (75.82, 22.72),
        (75.84, 22.70),
    ])
    G.add_edge(1, 2, 0, geometry=curve, length=150.0)

    geom = extract_edge_geometry(G, 1, 2)
    assert len(geom) == 3
    assert geom[0] == [75.80, 22.70]
    assert geom[1] == [75.82, 22.72]
    assert geom[2] == [75.84, 22.70]


def test_reversed_edge_geometry_orientation():
    G = nx.MultiDiGraph()
    G.add_node(1, x=75.80, y=22.70)
    G.add_node(2, x=75.84, y=22.70)
    
    # Geometry points stored in 2 -> 1 order
    curve = shapely.geometry.LineString([
        (75.84, 22.70),
        (75.82, 22.72),
        (75.80, 22.70),
    ])
    G.add_edge(1, 2, 0, geometry=curve, length=150.0)

    geom = extract_edge_geometry(G, 1, 2)
    # Should automatically reverse to match 1 -> 2
    assert geom[0] == [75.80, 22.70]
    assert geom[1] == [75.82, 22.72]
    assert geom[2] == [75.84, 22.70]


def test_multilinestring_geometry_extraction():
    G = nx.MultiDiGraph()
    G.add_node(1, x=75.80, y=22.70)
    G.add_node(2, x=75.86, y=22.70)
    
    line1 = shapely.geometry.LineString([(75.80, 22.70), (75.83, 22.71)])
    line2 = shapely.geometry.LineString([(75.83, 22.71), (75.86, 22.70)])
    multi = shapely.geometry.MultiLineString([line1, line2])
    G.add_edge(1, 2, 0, geometry=multi, length=200.0)

    geom = extract_edge_geometry(G, 1, 2)
    assert len(geom) >= 3
    assert geom[0] == [75.80, 22.70]
    assert geom[-1] == [75.86, 22.70]


def test_deduplication_at_edge_boundaries():
    G = nx.MultiDiGraph()
    G.add_node(1, x=75.80, y=22.70)
    G.add_node(2, x=75.82, y=22.72)
    G.add_node(3, x=75.85, y=22.73)
    
    curve1 = shapely.geometry.LineString([(75.80, 22.70), (75.81, 22.71), (75.82, 22.72)])
    curve2 = shapely.geometry.LineString([(75.82, 22.72), (75.83, 22.725), (75.85, 22.73)])
    G.add_edge(1, 2, 0, geometry=curve1)
    G.add_edge(2, 3, 0, geometry=curve2)

    reconstructed = reconstruct_route_geometry(G, [1, 2, 3])
    # 3 points on edge 1 + 3 points on edge 2 - 1 shared point at node 2 = 5 points
    assert len(reconstructed) == 5
    assert reconstructed == [
        [75.80, 22.70],
        [75.81, 22.71],
        [75.82, 22.72],
        [75.83, 22.725],
        [75.85, 22.73],
    ]


def test_real_indore_routes(graph):
    G = graph
    test_cases = [
        ("Palasia to Vijay Nagar (Curved Arterial)", 22.7238, 75.8866, 22.7533, 75.8937),
        ("Rajwada to Airport (Complex Urban Grid)", 22.7196, 75.8577, 22.7218, 75.8011),
        ("Rau to Manglia (Long Cross-City Highway)", 22.6280, 75.8080, 22.8100, 75.9500),
    ]

    for name, slat, slng, elat, elng in test_cases:
        res = weighted_directional_route(G, slat, slng, elat, elng)
        assert res is not None, f"Route calculation failed for {name}"
        route = res["route"]
        assert len(route) >= 2

        geojson = route_to_geojson(G, route)
        assert geojson["type"] == "Feature"
        assert geojson["geometry"]["type"] == "LineString"
        coords = geojson["geometry"]["coordinates"]

        # 1. Total coordinates must be >= node count (intermediate curve points preserved)
        assert len(coords) >= len(route), f"Expected coords >= nodes for {name}"

        # 2. Coordinate format must be [longitude, latitude]
        for pt in coords:
            lng, lat = pt[0], pt[1]
            assert 75.0 <= lng <= 77.0, f"Longitude out of bounds in {name}: {lng}"
            assert 22.0 <= lat <= 23.5, f"Latitude out of bounds in {name}: {lat}"

        # 3. No consecutive duplicate points
        for i in range(len(coords) - 1):
            p1, p2 = coords[i], coords[i + 1]
            assert not (math.isclose(p1[0], p2[0], abs_tol=1e-7) and math.isclose(p1[1], p2[1], abs_tol=1e-7)), (
                f"Found consecutive duplicate point at index {i} in {name}: {p1}"
            )

        # 4. First and last coordinate match origin and dest nodes
        u0 = route[0]
        uk = route[-1]
        assert math.isclose(coords[0][0], G.nodes[u0]["x"], abs_tol=1e-6)
        assert math.isclose(coords[0][1], G.nodes[u0]["y"], abs_tol=1e-6)
        assert math.isclose(coords[-1][0], G.nodes[uk]["x"], abs_tol=1e-6)
        assert math.isclose(coords[-1][1], G.nodes[uk]["y"], abs_tol=1e-6)


def test_api_get_routes():
    with TestClient(app) as client:
        # Test request inside Indore bounding box
        response = client.get(
            "/api/get-routes",
            params={
                "start_lat": 22.7238,
                "start_lng": 75.8866,
                "end_lat": 22.7533,
                "end_lng": 75.8937,
            },
        )
        assert response.status_code == 200
        data = response.json()
        
        for route_key in ["fastest", "least_signal", "least_pollution", "overall_best", "greenest"]:
            assert route_key in data
            route_obj = data[route_key]
            assert "route" in route_obj
            assert route_obj["route"]["type"] == "Feature"
            assert route_obj["route"]["geometry"]["type"] == "LineString"
            coords = route_obj["route"]["geometry"]["coordinates"]
            assert len(coords) > 10
            # Coordinate format [lng, lat]
            for c in coords:
                assert len(c) == 2
                assert 75.0 <= c[0] <= 77.0  # lng
                assert 22.0 <= c[1] <= 24.0  # lat

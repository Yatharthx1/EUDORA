from typing import Any, List, Sequence, Optional
import math
import shapely.geometry
from shapely import wkt


def extract_edge_geometry(
    G: Any,
    u: int,
    v: int,
    edge_data: Optional[dict] = None
) -> List[List[float]]:
    """
    Extract the sequence of [longitude, latitude] points representing the
    detailed geometry of the directed edge u → v in graph G.

    Handles:
      - None / missing geometry (returns [[ux, uy], [vx, vy]])
      - shapely.geometry.LineString
      - shapely.geometry.MultiLineString
      - WKT string geometries
      - Edge orientation (reverses coords if edge is stored in opposite direction)
      - Snaps exact endpoints to node u and node v coordinates.
    """
    ux, uy = float(G.nodes[u]["x"]), float(G.nodes[u]["y"])
    vx, vy = float(G.nodes[v]["x"]), float(G.nodes[v]["y"])

    if edge_data is None:
        if G.has_edge(u, v):
            edges = G[u][v]
            if len(edges) == 1:
                edge_data = next(iter(edges.values()))
            else:
                # In multigraphs, pick edge with shortest length
                edge_data = min(edges.values(), key=lambda e: e.get("length", 0))
        else:
            return [[ux, uy], [vx, vy]]

    geom = edge_data.get("geometry")
    if geom is None:
        return [[ux, uy], [vx, vy]]

    # Parse WKT strings if loaded from raw graphml or serialised text
    if isinstance(geom, str):
        try:
            geom = wkt.loads(geom)
        except Exception:
            return [[ux, uy], [vx, vy]]

    coords: List[List[float]] = []

    if isinstance(geom, shapely.geometry.LineString):
        coords = [[float(c[0]), float(c[1])] for c in geom.coords]
    elif isinstance(geom, shapely.geometry.MultiLineString):
        for line in geom.geoms:
            coords.extend([[float(c[0]), float(c[1])] for c in line.coords])
    elif hasattr(geom, "coords"):
        coords = [[float(c[0]), float(c[1])] for c in geom.coords]
    elif isinstance(geom, (list, tuple)):
        coords = [[float(c[0]), float(c[1])] for c in geom if len(c) >= 2]
    else:
        return [[ux, uy], [vx, vy]]

    if len(coords) < 2:
        return [[ux, uy], [vx, vy]]

    # Check orientation: coordinates must flow from u to v
    start_d2_u = (coords[0][0] - ux) ** 2 + (coords[0][1] - uy) ** 2
    start_d2_v = (coords[0][0] - vx) ** 2 + (coords[0][1] - vy) ** 2
    end_d2_u = (coords[-1][0] - ux) ** 2 + (coords[-1][1] - uy) ** 2
    end_d2_v = (coords[-1][0] - vx) ** 2 + (coords[-1][1] - vy) ** 2

    # If start is closer to v and end is closer to u, reverse the sequence
    if (start_d2_v + end_d2_u) < (start_d2_u + end_d2_v):
        coords.reverse()

    # Lock endpoints to exact node positions to ensure topological continuity
    coords[0] = [ux, uy]
    coords[-1] = [vx, vy]

    return coords


def reconstruct_route_geometry(
    G: Any,
    route: Sequence[int]
) -> List[List[float]]:
    """
    Reconstruct the full detailed polyline coordinates [[lon, lat], ...]
    for an ordered sequence of graph node IDs.

    Concatenates road segment geometries in route order, preserving all
    intermediate curved road points while eliminating duplicate junction points.
    """
    if not route:
        return []

    if len(route) == 1:
        node = route[0]
        return [[float(G.nodes[node]["x"]), float(G.nodes[node]["y"])]]

    full_coords: List[List[float]] = []

    for i in range(len(route) - 1):
        u, v = route[i], route[i + 1]
        edge_data = None
        if G.has_edge(u, v):
            edges = G[u][v]
            if len(edges) == 1:
                edge_data = next(iter(edges.values()))
            else:
                edge_data = min(edges.values(), key=lambda e: e.get("length", 0))

        segment = extract_edge_geometry(G, u, v, edge_data)

        if not full_coords:
            full_coords.extend(segment)
        else:
            first_pt = segment[0]
            last_pt = full_coords[-1]
            # Avoid duplicate vertex at the junction boundary
            if math.isclose(first_pt[0], last_pt[0], abs_tol=1e-7) and math.isclose(first_pt[1], last_pt[1], abs_tol=1e-7):
                full_coords.extend(segment[1:])
            else:
                full_coords.extend(segment)

    # Extra safety pass: deduplicate any consecutive duplicate points
    deduped: List[List[float]] = []
    for pt in full_coords:
        if not deduped or not (
            math.isclose(pt[0], deduped[-1][0], abs_tol=1e-7)
            and math.isclose(pt[1], deduped[-1][1], abs_tol=1e-7)
        ):
            deduped.append(pt)

    return deduped


def route_to_geojson(G: Any, route: Sequence[int]) -> dict:
    """
    Converts a node-sequence route into a standard GeoJSON Feature LineString
    containing the detailed, continuous road geometry.
    """
    coordinates = reconstruct_route_geometry(G, route)
    return {
        "type": "Feature",
        "geometry": {
            "type": "LineString",
            "coordinates": coordinates,
        },
        "properties": {},
    }

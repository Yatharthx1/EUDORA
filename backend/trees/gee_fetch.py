"""Google Earth Engine helpers for route-corridor NDVI extraction.

This module authenticates with Google Earth Engine using the standard
OAuth flow, buffers a road route into a narrow corridor, fetches
Sentinel-2 imagery for that corridor, computes NDVI, and returns the
clipped result as a NumPy array.
"""

from __future__ import annotations

import os
from collections.abc import Mapping, Sequence
from typing import Any

import ee
import numpy as np


DEFAULT_START_DATE = "2024-01-01"
DEFAULT_END_DATE = "2024-12-31"
DEFAULT_BUFFER_METERS = 25
DEFAULT_MAX_CLOUD_PCT = 20
DEFAULT_MASK_FILL_VALUE = -9999.0


CoordinateLike = Sequence[float] | Mapping[str, float]


def initialize_earth_engine(
) -> None:
    """Initialize Earth Engine with the standard OAuth flow."""

    project_id = os.getenv("GEE_PROJECT_ID")
    if not project_id:
        raise ValueError(
            "Missing Google Earth Engine project ID. "
            "Set the GEE_PROJECT_ID environment variable."
        )

    # Never call ee.Authenticate() on a server — it launches an interactive
    # browser OAuth flow that will crash on headless environments.
    # Use ee.Initialize() only, which relies on service account credentials
    # or Application Default Credentials.
    ee.Initialize(project=project_id)


def _normalize_point(coord: CoordinateLike) -> list[float]:
    """Convert a route point to ``[lng, lat]`` for Earth Engine."""

    if isinstance(coord, Mapping):
        if "lat" not in coord or "lng" not in coord:
            raise ValueError("Coordinate mappings must contain 'lat' and 'lng'.")
        lat = float(coord["lat"])
        lng = float(coord["lng"])
        return [lng, lat]

    if len(coord) != 2:
        raise ValueError("Each coordinate pair must contain exactly two values.")

    lat = float(coord[0])
    lng = float(coord[1])
    return [lng, lat]


def route_to_corridor(
    route_coords: Sequence[CoordinateLike],
    buffer_meters: float = DEFAULT_BUFFER_METERS,
) -> ee.Geometry:
    """Build a buffered route corridor from ``(lat, lng)`` pairs."""

    if len(route_coords) < 2:
        raise ValueError("At least two route coordinates are required.")

    line = ee.Geometry.LineString([_normalize_point(coord) for coord in route_coords])
    return line.buffer(buffer_meters)


def fetch_route_ndvi_image(
    route_coords: Sequence[CoordinateLike],
    *,
    start_date: str = DEFAULT_START_DATE,
    end_date: str = DEFAULT_END_DATE,
    buffer_meters: float = DEFAULT_BUFFER_METERS,
    max_cloud_pct: float = DEFAULT_MAX_CLOUD_PCT,
) -> ee.Image:
    """Fetch Sentinel-2 imagery and compute corridor-clipped NDVI."""

    corridor = route_to_corridor(route_coords, buffer_meters=buffer_meters)

    collection = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(corridor)
        .filterDate(start_date, end_date)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", max_cloud_pct))
    )

    image = collection.median()
    band_names = image.bandNames().getInfo()
    if "B4" not in band_names or "B8" not in band_names:
        raise ValueError(
            "No Sentinel-2 imagery with B4/B8 bands was found for the "
            "requested route corridor and date range."
        )

    return image.normalizedDifference(["B8", "B4"]).rename("ndvi").clip(corridor)


def fetch_route_ndvi_array(
    route_coords: Sequence[CoordinateLike],
    *,
    start_date: str = DEFAULT_START_DATE,
    end_date: str = DEFAULT_END_DATE,
    buffer_meters: float = DEFAULT_BUFFER_METERS,
    max_cloud_pct: float = DEFAULT_MAX_CLOUD_PCT,
    fill_value: float = DEFAULT_MASK_FILL_VALUE,
) -> np.ndarray:
    """Return corridor-clipped NDVI as a NumPy array.

    Parameters
    ----------
    route_coords:
        Route polyline represented as ``(lat, lng)`` pairs or
        ``{"lat": ..., "lng": ...}`` mappings.
    fill_value:
        Temporary value used for masked pixels outside the route corridor.
        These cells are converted to ``np.nan`` in the final array.
    """

    initialize_earth_engine()

    corridor = route_to_corridor(route_coords, buffer_meters=buffer_meters)
    ndvi_image = fetch_route_ndvi_image(
        route_coords,
        start_date=start_date,
        end_date=end_date,
        buffer_meters=buffer_meters,
        max_cloud_pct=max_cloud_pct,
    )

    sampled = (
    ndvi_image.unmask(fill_value)
    .reproject(crs="EPSG:4326", scale=10)
    .sampleRectangle(region=corridor.bounds(1), defaultValue=fill_value)
    .getInfo()
    )

    ndvi_pixels = sampled.get("properties", {}).get("ndvi")
    if ndvi_pixels is None:
        raise ValueError("Earth Engine did not return NDVI pixels for this route.")

    ndvi_array = np.array(ndvi_pixels, dtype=np.float32)
    ndvi_array[ndvi_array == fill_value] = np.nan
    return ndvi_array


__all__ = [
    "fetch_route_ndvi_array",
    "fetch_route_ndvi_image",
    "initialize_earth_engine",
    "route_to_corridor",
]

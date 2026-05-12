"""Async wrapper functions for the local EUDORA navigation backend API."""

import os

import httpx


EUDORA_BASE_URL = os.getenv("EUDORA_BASE_URL", "http://127.0.0.1:8080")


async def get_routes(origin_lat, origin_lon, dest_lat, dest_lon):
    """Fetch all EUDORA route variants between an origin and destination."""
    params = {
        "start_lat": origin_lat,
        "start_lng": origin_lon,
        "end_lat": dest_lat,
        "end_lng": dest_lon,
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        response = await client.get(f"{EUDORA_BASE_URL}/api/get-routes", params=params)
        response.raise_for_status()
        return response.json()


async def geocode(query: str):
    """Geocode a text query using EUDORA's backend geocoding proxy."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            f"{EUDORA_BASE_URL}/api/geocode",
            params={"q": query},
        )
        response.raise_for_status()
        return response.json()


async def reverse_geocode(lat, lon):
    """Reverse geocode coordinates using EUDORA's backend reverse geocoding proxy."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            f"{EUDORA_BASE_URL}/api/reverse",
            params={"lat": lat, "lon": lon},
        )
        response.raise_for_status()
        return response.json()


async def get_signals():
    """Fetch known traffic signal locations from the EUDORA backend."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(f"{EUDORA_BASE_URL}/api/get-signals")
        response.raise_for_status()
        return response.json()


async def health_check():
    """Fetch the EUDORA backend health and service status."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(f"{EUDORA_BASE_URL}/health")
        response.raise_for_status()
        return response.json()


async def get_nearby_places(
    lat: float,
    lon: float,
    types: str = "restaurant",
    radius: int = 5000,
):
    """Fetch nearby Ola Maps places by category/type."""
    params = {
        "location": f"{lat},{lon}",
        "types": types,
        "radius": radius,
        "api_key": os.getenv("OLA_MAPS_KEY"),
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            "https://api.olamaps.io/places/v1/nearbysearch/advanced",
            params=params,
        )
        response.raise_for_status()
        return response.json()


async def get_weather(lat: float = 22.7196, lon: float = 75.8577):
    """Fetch current weather from OpenWeatherMap."""
    params = {
        "lat": lat,
        "lon": lon,
        "appid": os.getenv("OWM_API_KEY"),
        "units": "metric",
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            "http://api.openweathermap.org/data/2.5/weather",
            params=params,
        )
        response.raise_for_status()
        return response.json()


async def get_air_quality(lat: float = 22.7196, lon: float = 75.8577):
    """Fetch air quality from OpenWeatherMap."""
    params = {
        "lat": lat,
        "lon": lon,
        "appid": os.getenv("OWM_API_KEY"),
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            "http://api.openweathermap.org/data/2.5/air_pollution",
            params=params,
        )
        response.raise_for_status()
        return response.json()


def calculate_fuel_cost(
    distance_km: float,
    fuel_price_per_litre: float = 106.0,
    mileage_kmpl: float = 15.0,
) -> dict:
    """Calculate estimated fuel consumption and cost for a trip."""
    fuel_litres = distance_km / mileage_kmpl
    return {
        "distance_km": distance_km,
        "fuel_litres": round(fuel_litres, 2),
        "fuel_cost_inr": round(fuel_litres * fuel_price_per_litre, 2),
        "fuel_price_per_litre": fuel_price_per_litre,
        "mileage_kmpl": mileage_kmpl,
    }

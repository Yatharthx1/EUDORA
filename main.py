from contextlib import asynccontextmanager
import os
import logging
import asyncio

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from backend.api.routes import router
from backend.routing.graph_builder import build_graph
from backend.signal.signal_model import SignalModel
from backend.pollution.pollution_model import PollutionModel
from backend.routing.traffic_enricher import TrafficEnricher

load_dotenv()
logging.basicConfig(level=logging.INFO)

# ── Rate limiter ──────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_remote_address)

# ── Allowed frontend origins — edit for your domain ──────────────────────────
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5500,http://127.0.0.1:5500").split(",")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ───────────────────────────────────────────────────────────────
    logging.info("[Startup] Building graph...")
    G = build_graph()

    logging.info("[Startup] Attaching signal weights...")
    signal_model = SignalModel(G)
    signal_model.attach_signal_weights()

    logging.info("[Startup] Attaching pollution weights...")
    pollution_model = PollutionModel(G)
    pollution_model.attach_pollution_weights()

    app.state.G               = G
    app.state.signal_model    = signal_model
    app.state.pollution_model = pollution_model
    app.state.limiter         = limiter

    enricher = TrafficEnricher(G, pollution_model, os.environ["TOMTOM_API_KEY"])
    await enricher.enrich()
    asyncio.create_task(enricher.run_scheduler())
    logging.info("[Startup] Ready.")

    yield

    # ── Shutdown ──────────────────────────────────────────────────────────────
    logging.info("[Shutdown] Cleaning up...")
    app.state.G               = None
    app.state.signal_model    = None
    app.state.pollution_model = None


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(lifespan=lifespan)

# Rate limit error handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — only allow your frontend origin, not wildcard *
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")


# ── Geocode proxy — LocationIQ (forward search) ───────────────────────────────
@app.get("/api/geocode")
@limiter.limit("30/minute")
async def geocode_proxy(
    request: Request,
    q: str = Query(..., min_length=2, max_length=200),
):
    """
    Proxies autocomplete queries to LocationIQ.
    The API key never reaches the frontend.
    """
    token = os.environ.get("LOCATIONIQ_TOKEN")
    if not token:
        return JSONResponse(status_code=503, content={"error": "Geocoding not configured."})

    params = {
        "key": token,
        "q": q,
        "limit": 6,
        "dedupe": 1,
        "accept-language": "en",
        "countrycodes": "in",
        "lat": 22.7196,   # Indore centre bias
        "lon": 75.8577,
    }

    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            res = await client.get("https://api.locationiq.com/v1/autocomplete", params=params)
        if res.status_code == 200:
            return res.json()
        return JSONResponse(status_code=res.status_code, content={"error": "Geocoding error."})
    except httpx.TimeoutException:
        return JSONResponse(status_code=504, content={"error": "Geocoding timed out."})
    except Exception as e:
        logging.error(f"[Geocode proxy] {e}")
        return JSONResponse(status_code=500, content={"error": "Internal error."})


# ── Reverse geocode proxy — LocationIQ ───────────────────────────────────────
@app.get("/api/reverse")
@limiter.limit("30/minute")
async def reverse_proxy(
    request: Request,
    lat: float = Query(...),
    lon: float = Query(...),
):
    """
    Proxies reverse geocode queries to LocationIQ.
    """
    token = os.environ.get("LOCATIONIQ_TOKEN")
    if not token:
        return JSONResponse(status_code=503, content={"error": "Geocoding not configured."})

    params = {"key": token, "lat": lat, "lon": lon, "format": "json"}

    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            res = await client.get("https://us1.locationiq.com/v1/reverse", params=params)
        if res.status_code == 200:
            return res.json()
        return JSONResponse(status_code=res.status_code, content={"error": "Reverse geocoding error."})
    except Exception as e:
        logging.error(f"[Reverse proxy] {e}")
        return JSONResponse(status_code=500, content={"error": "Internal error."})


# ── Tile proxy — MapTiler ─────────────────────────────────────────────────────
@app.get("/api/tiles/{style}/{z}/{x}/{y}.png")
@limiter.limit("120/minute")
async def tile_proxy(
    request: Request,
    style: str,
    z: int,
    x: int,
    y: int,
):
    """
    Proxies map tile requests to MapTiler.
    The API key never reaches the frontend.
    """
    allowed_styles = {"dataviz-dark", "dataviz"}
    if style not in allowed_styles:
        return JSONResponse(status_code=400, content={"error": "Invalid style."})

    maptiler_key = os.environ.get("MAPTILER_KEY")
    if not maptiler_key:
        return JSONResponse(status_code=503, content={"error": "Tiles not configured."})

    url = f"https://api.maptiler.com/maps/{style}/{z}/{x}/{y}.png?key={maptiler_key}"

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            res = await client.get(url)
        from fastapi.responses import Response
        return Response(
            content=res.content,
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=86400"},
        )
    except Exception as e:
        logging.error(f"[Tile proxy] {e}")
        return JSONResponse(status_code=500, content={"error": "Tile fetch failed."})
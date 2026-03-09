from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Query
from fastapi.responses import JSONResponse, Response
from backend.api.routes import router
from backend.routing.graph_builder import build_graph
from backend.signal.signal_model import SignalModel
from backend.pollution.pollution_model import PollutionModel
from fastapi.middleware.cors import CORSMiddleware
from backend.routing.traffic_enricher import TrafficEnricher
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import asyncio
import os
import httpx
import logging
from dotenv import load_dotenv
logging.basicConfig(level=logging.INFO)
load_dotenv()

limiter = Limiter(key_func=get_remote_address)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ---- startup ----
    print("[Startup] Building graph...")
    G = build_graph()

    print("[Startup] Attaching signal weights...")
    signal_model = SignalModel(G)
    signal_model.attach_signal_weights()

    print("[Startup] Attaching pollution weights...")
    pollution_model = PollutionModel(G)
    pollution_model.attach_pollution_weights()
    

    # Store on app.state so all routes can access them via request.app.state
    app.state.G               = G
    app.state.signal_model    = signal_model
    app.state.pollution_model = pollution_model
    
    enricher = TrafficEnricher(G, pollution_model, os.environ["TOMTOM_API_KEY"])
    await enricher.enrich()                        # runs immediately on startup
    asyncio.create_task(enricher.run_scheduler())  # then every 3 hours in background
    print("[Startup] Ready.")

    yield

    # ---- shutdown ----
    print("[Shutdown] Cleaning up...")
    app.state.G               = None
    app.state.signal_model    = None
    app.state.pollution_model = None


app = FastAPI(lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.include_router(router, prefix="/api")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/geocode")
@limiter.limit("30/minute")
async def geocode_proxy(request: Request, q: str = Query(..., min_length=2, max_length=200)):
    token = os.environ.get("LOCATIONIQ_TOKEN")
    if not token:
        return JSONResponse(status_code=503, content={"error": "Geocoding not configured."})
    params = {
        "key": token, "q": q, "limit": 6, "dedupe": 1,
        "accept-language": "en", "countrycodes": "in",
        "lat": 22.7196, "lon": 75.8577,
    }
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            res = await client.get("https://api.locationiq.com/v1/autocomplete", params=params)
        return res.json() if res.status_code == 200 else JSONResponse(status_code=res.status_code, content={"error": "Geocoding error."})
    except httpx.TimeoutException:
        return JSONResponse(status_code=504, content={"error": "Geocoding timed out."})
    except Exception as e:
        logging.error(f"[Geocode] {e}")
        return JSONResponse(status_code=500, content={"error": "Internal error."})


@app.get("/api/reverse")
@limiter.limit("30/minute")
async def reverse_proxy(request: Request, lat: float = Query(...), lon: float = Query(...)):
    token = os.environ.get("LOCATIONIQ_TOKEN")
    if not token:
        return JSONResponse(status_code=503, content={"error": "Geocoding not configured."})
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            res = await client.get("https://us1.locationiq.com/v1/reverse",
                params={"key": token, "lat": lat, "lon": lon, "format": "json"})
        return res.json() if res.status_code == 200 else JSONResponse(status_code=res.status_code, content={"error": "Reverse geocoding error."})
    except Exception as e:
        logging.error(f"[Reverse] {e}")
        return JSONResponse(status_code=500, content={"error": "Internal error."})


@app.get("/api/tiles/{style}/{z}/{x}/{y}.png")
@limiter.limit("120/minute")
async def tile_proxy(request: Request, style: str, z: int, x: int, y: int):
    if style not in {"dataviz-dark", "dataviz"}:
        return JSONResponse(status_code=400, content={"error": "Invalid style."})
    key = os.environ.get("MAPTILER_KEY")
    if not key:
        return JSONResponse(status_code=503, content={"error": "Tiles not configured."})
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            res = await client.get(f"https://api.maptiler.com/maps/{style}/{z}/{x}/{y}.png?key={key}")
        return Response(content=res.content, media_type="image/png",
            headers={"Cache-Control": "public, max-age=86400"})
    except Exception as e:
        logging.error(f"[Tiles] {e}")
        return JSONResponse(status_code=500, content={"error": "Tile fetch failed."})
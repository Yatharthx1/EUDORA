from dotenv import load_dotenv

load_dotenv()

from contextlib import asynccontextmanager
import os
import logging
import asyncio
import time
from pathlib import Path

import httpx
from fastapi import FastAPI, Request, Query, Response, Path as FastAPIPath
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

from backend.api.routes import router
from backend.routing.graph_builder import build_graph
from backend.signal.signal_model import SignalModel
from backend.pollution.pollution_model import PollutionModel
from backend.routing.traffic_enricher import TrafficEnricher
from backend.trees.tree_cost import get_store
from backend.trees.tree_store import load_tree_store

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(level=getattr(logging, LOG_LEVEL, logging.INFO))
logger = logging.getLogger(__name__)

LOCAL_DEV = os.getenv("EUDORA_LOCAL_DEV", "1").lower() not in {"0", "false", "no"}

PROJECT_ROOT = Path(__file__).resolve().parent
GRAPHML_GRAPH_PATH = PROJECT_ROOT / "indore.graphml"
CANOPY_STORE_PATH = PROJECT_ROOT / "data" / "canopy_scores.json"

def get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ── Rate limiter ──────────────────────────────────────────────────────────────
limiter = Limiter(key_func=get_client_ip, enabled=not LOCAL_DEV)

# ── Allowed frontend origins ─────────────────────────────────────────────────
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:5173,http://localhost:5500,http://127.0.0.1:5500,http://localhost:8000",
).split(",")
ALLOWED_ORIGINS = [origin.strip() for origin in ALLOWED_ORIGINS if origin.strip()]

# ── Startup timestamp ────────────────────────────────────────────────────────
_BOOT_TIME: float = 0.0


# ── Security headers middleware ───────────────────────────────────────────────
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(self), microphone=(self), camera=()"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        return response


# ── Request size limiting middleware ──────────────────────────────────────────
MAX_REQUEST_BODY_BYTES = int(os.getenv("MAX_REQUEST_BODY_BYTES", str(10 * 1024 * 1024)))

class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > MAX_REQUEST_BODY_BYTES:
            return JSONResponse(
                status_code=413,
                content={"error": "Request body too large."},
            )
        return await call_next(request)


# ── Env var validation ────────────────────────────────────────────────────────
def _validate_env_vars() -> dict[str, bool]:
    """Check required env vars at startup and log warnings for missing ones."""
    required = {
        "TOMTOM_API_KEY":   "TomTom traffic data — live speeds will be unavailable",
        "LOCATIONIQ_TOKEN": "LocationIQ geocoding — geocode proxy will return 503",
        "MAPTILER_KEY":     "MapTiler tiles — tile proxy will return 503",
        "OWM_API_KEY":      "OpenWeatherMap AQI — will use historical/fallback AQI",
    }
    optional = {
        "OLA_MAPS_KEY":     "Ola Maps geocoding fallback",
        "GEE_PROJECT_ID":   "Google Earth Engine (precomputation only)",
    }
    status = {}
    for var, desc in required.items():
        present = bool(os.environ.get(var))
        status[var] = present
        if not present:
            logger.warning("[Startup] Missing env var %s — %s", var, desc)
    for var, desc in optional.items():
        present = bool(os.environ.get(var))
        status[var] = present
        if not present:
            logger.info("[Startup] Optional env var %s not set — %s", var, desc)
    return status


# ── GEE initialization ───────────────────────────────────────────────────────
def _initialize_earth_engine() -> bool:
    """Attempt ee.Initialize() — never ee.Authenticate() on a server."""
    try:
        import ee
        project_id = os.getenv("GEE_PROJECT_ID")
        if project_id:
            ee.Initialize(project=project_id)
        else:
            ee.Initialize()
        logger.info("[Startup] Google Earth Engine initialized.")
        return True
    except Exception as exc:
        logger.warning(
            "[Startup] GEE initialization failed (non-fatal, precomputation only): %s",
            exc,
        )
        return False


def _load_canopy_store() -> tuple[dict[str, float], bool]:
    if not CANOPY_STORE_PATH.exists():
        logger.warning(
            "[Startup] Canopy store not found at %s; using an empty canopy store.",
            CANOPY_STORE_PATH,
        )
        return {}, False

    store = load_tree_store(str(CANOPY_STORE_PATH))
    logger.info("[Startup] Loaded canopy store from %s.", CANOPY_STORE_PATH)
    return store, True


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _BOOT_TIME
    _BOOT_TIME = time.time()

    # ── Validate environment ──────────────────────────────────────────────────
    env_status = _validate_env_vars()

    # ── GEE (non-fatal) ──────────────────────────────────────────────────────
    gee_ok = _initialize_earth_engine()

    # ── Graph ─────────────────────────────────────────────────────────────────
    logger.info("[Startup] Building graph...")
    G = build_graph(filepath=str(GRAPHML_GRAPH_PATH))

    canopy_store, canopy_loaded = _load_canopy_store()
    app.state.canopy_store = canopy_store
    get_store()

    # ── Signal model ──────────────────────────────────────────────────────────
    logger.info("[Startup] Attaching signal weights...")
    signal_model = SignalModel(G)
    signal_model.attach_signal_weights()

    # ── Pollution model ───────────────────────────────────────────────────────
    logger.info("[Startup] Attaching pollution weights...")
    pollution_model = PollutionModel(G)
    pollution_model.attach_pollution_weights()

    app.state.G               = G
    app.state.signal_model    = signal_model
    app.state.pollution_model = pollution_model
    app.state.limiter         = limiter

    # ── Traffic enrichment (graceful if TOMTOM key missing) ───────────────────
    tomtom_key = os.environ.get("TOMTOM_API_KEY")
    enricher = None
    if tomtom_key:
        enricher = TrafficEnricher(G, pollution_model, tomtom_key)
        await enricher.enrich()
        asyncio.create_task(enricher.run_scheduler())
    else:
        logger.warning("[Startup] TOMTOM_API_KEY missing — traffic enrichment disabled.")

    app.state.enricher = enricher

    startup_summary = (
        "[Startup] Summary: "
        f"graph nodes={len(G.nodes)} "
        f"edges={len(G.edges)} "
        f"canopy_loaded={canopy_loaded} "
        f"canopy_segments={len(canopy_store)} "
        f"gee={gee_ok} "
        f"traffic={'enabled' if enricher else 'disabled'}"
    )
    logger.info(startup_summary)
    logger.info("[Startup] Ready.")

    yield

    # ── Shutdown ──────────────────────────────────────────────────────────────
    logger.info("[Shutdown] Cleaning up...")
    app.state.G               = None
    app.state.signal_model    = None
    app.state.pollution_model = None
    app.state.canopy_store    = None


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    lifespan=lifespan,
    title="EUDORA API",
    docs_url="/docs" if LOCAL_DEV else None,
    redoc_url="/redoc" if LOCAL_DEV else None,
    openapi_url="/openapi.json" if LOCAL_DEV else None,
)

# Rate limit error handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Security middlewares (order matters — outermost runs first)
if not LOCAL_DEV:
    app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestSizeLimitMiddleware)

# CORS is permissive in local dev so local frontends/orchestrators can call main.py.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if LOCAL_DEV else ALLOWED_ORIGINS,
    allow_methods=["*"] if LOCAL_DEV else ["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")


# ── Health endpoint ───────────────────────────────────────────────────────────
@app.get("/health")
async def health_check(request: Request):
    """System status check — no rate limit, no auth."""
    G = getattr(request.app.state, "G", None)
    enricher = getattr(request.app.state, "enricher", None)
    return {
        "status": "ok",
        "uptime_seconds": round(time.time() - _BOOT_TIME, 1) if _BOOT_TIME else 0,
        "graph": {
            "nodes": len(G.nodes) if G else 0,
            "edges": len(G.edges) if G else 0,
        },
        "services": {
            "geocoding":   bool(os.environ.get("LOCATIONIQ_TOKEN")),
            "tiles":       bool(os.environ.get("MAPTILER_KEY")),
            "traffic":     enricher is not None,
            "aqi":         bool(os.environ.get("OWM_API_KEY")),
        },
    }


# ── Geocoding helpers ─────────────────────────────────────────────────────────

async def _ola_geocode(q: str) -> list | None:
    """Ola Maps text search → normalized LocationIQ-style list."""
    key = os.environ.get("OLA_MAPS_KEY")
    if not key:
        return None
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            res = await client.get(
                "https://api.olamaps.io/places/v1/autocomplete",
                params={
                    "input": q,
                    "api_key": key,
                    "location": "22.7196,75.8577",
                    "radius": 50000,
                },
                headers={"X-Request-Id": "eudora-geocode"},
            )
        if res.status_code != 200:
            return None
        data = res.json()
        results = data.get("predictions") or []
        normalized = []
        for r in results[:6]:
            loc = r.get("geometry", {}).get("location", {})
            lat = loc.get("lat") or loc.get("latitude")
            lon = loc.get("lng") or loc.get("longitude")
            if not lat:
                loc2 = r.get("place_details", {}).get("geometry", {}).get("location", {})
                lat = loc2.get("lat")
                lon = loc2.get("lng")
            if not lat or not lon:
                continue
            normalized.append({
                "display_name": r.get("description") or r.get("formatted_address") or r.get("name", ""),
                "lat": str(lat),
                "lon": str(lon),
                "place_id": r.get("place_id", ""),
            })
        return normalized if normalized else None
    except Exception as e:
        logger.warning("[Geocode/Ola] %s", e)
        return None

async def _locationiq_geocode(q: str) -> list | None:
    """LocationIQ autocomplete fallback."""
    token = os.environ.get("LOCATIONIQ_TOKEN")
    if not token:
        return None
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            res = await client.get(
                "https://api.locationiq.com/v1/autocomplete",
                params={"key": token, "q": q, "limit": 6, "dedupe": 1,
                        "accept-language": "en", "countrycodes": "in",
                        "lat": 22.7196, "lon": 75.8577},
            )
        return res.json() if res.status_code == 200 else None
    except Exception as e:
        logger.warning("[Geocode/LocationIQ] %s", e)
        return None

async def _ola_reverse(lat: float, lon: float) -> dict | None:
    """Ola Maps reverse geocode → normalized LocationIQ-style dict."""
    key = os.environ.get("OLA_MAPS_KEY")
    if not key:
        return None
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            res = await client.get(
                "https://api.olamaps.io/places/v1/reverse-geocode",
                params={"latlng": f"{lat},{lon}", "api_key": key},
                headers={"X-Request-Id": "eudora-reverse"},
            )
        if res.status_code != 200:
            return None
        data = res.json()
        results = data.get("results") or []
        if not results:
            return None
        top = results[0]
        return {
            "display_name": top.get("formatted_address", ""),
            "lat": str(lat),
            "lon": str(lon),
            "address": top.get("address_components", {}),
        }
    except Exception as e:
        logger.warning("[Reverse/Ola] %s", e)
        return None

async def _locationiq_reverse(lat: float, lon: float) -> dict | None:
    """LocationIQ reverse geocode fallback."""
    token = os.environ.get("LOCATIONIQ_TOKEN")
    if not token:
        return None
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            res = await client.get(
                "https://us1.locationiq.com/v1/reverse",
                params={"key": token, "lat": lat, "lon": lon, "format": "json"},
            )
        return res.json() if res.status_code == 200 else None
    except Exception as e:
        logger.warning("[Reverse/LocationIQ] %s", e)
        return None

# ── Proxy endpoints ───────────────────────────────────────────────────────────

@app.get("/api/geocode")
@limiter.limit("30/minute")
async def geocode_proxy(request: Request, q: str = Query(..., min_length=2, max_length=200)):
    result = await _ola_geocode(q)
    if result is None:
        logger.info(f"[Geocode] Ola Maps failed or not configured for '{q}' — falling back to LocationIQ")
        result = await _locationiq_geocode(q)
        if result is not None:
            logger.info(f"[Geocode] Successfully used LocationIQ for '{q}'")
    else:
        logger.info(f"[Geocode] Successfully used Ola Maps for '{q}'")
        
    if result is None:
        return JSONResponse(status_code=503, content={"error": "Geocoding unavailable."})
    return result

@app.get("/api/reverse")
@limiter.limit("30/minute")
async def reverse_proxy(
    request: Request,
    lat: float = Query(..., ge=-90.0, le=90.0),
    lon: float = Query(..., ge=-180.0, le=180.0),
):
    result = await _ola_reverse(lat, lon)
    if result is None:
        logger.info(f"[Reverse] Ola Maps failed or not configured for {lat},{lon} — falling back to LocationIQ")
        result = await _locationiq_reverse(lat, lon)
        if result is not None:
            logger.info(f"[Reverse] Successfully used LocationIQ for {lat},{lon}")
    else:
        logger.info(f"[Reverse] Successfully used Ola Maps for {lat},{lon}")
        
    if result is None:
        return JSONResponse(status_code=503, content={"error": "Reverse geocoding unavailable."})
    return result


# ── Tile proxy — MapTiler ─────────────────────────────────────────────────────
@app.get("/api/tiles/{style}/{z}/{x}/{y}.png")
@limiter.limit("120/minute")
async def tile_proxy(
    request: Request,
    style: str,
    z: int = FastAPIPath(..., ge=0, le=22),
    x: int = FastAPIPath(..., ge=0),
    y: int = FastAPIPath(..., ge=0),
):
    """
    Proxies map tile requests to MapTiler.
    The API key never reaches the frontend.
    """
    allowed_styles = {"dataviz-dark", "dataviz"}
    if style not in allowed_styles:
        return JSONResponse(status_code=400, content={"error": "Invalid style."})

    # Validate x/y within tile grid bounds for zoom level
    max_tile = (1 << z) - 1  # 2^z - 1
    if x > max_tile or y > max_tile:
        return JSONResponse(status_code=400, content={"error": "Tile coordinates out of range."})

    maptiler_key = os.environ.get("MAPTILER_KEY")
    if not maptiler_key:
        return JSONResponse(status_code=503, content={"error": "Tiles not configured."})

    url = f"https://api.maptiler.com/maps/{style}/{z}/{x}/{y}.png?key={maptiler_key}"

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            res = await client.get(url)
        return Response(
            content=res.content,
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=86400"},
        )
    except Exception as e:
        logger.error(f"[Tile proxy] Exception: {str(e)}", exc_info=True)
        return JSONResponse(status_code=500, content={"error": f"Tile fetch failed: {str(e)}"})

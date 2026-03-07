"""
TrafficEnricher

Queries TomTom Traffic Flow API every 3 hours for ~150 sample points
on Indore's major roads and updates traffic_factor on every graph edge
via inverse-distance weighting.

pollution_model.attach_pollution_weights() is called automatically
after each update so pollution_delay reflects current congestion.

Budget: 150 points × 8 refreshes/day = 1,200 req/day (of 2,500 free)

Flow
----
1. At startup: _select_sample_nodes() picks ~150 nodes on major roads,
   spread across the city grid.

2. Every 3 hours: enrich() queries TomTom for each sample node,
   builds a congestion map, then calls _update_graph_traffic_factors()
   which uses IDW to assign congestion to every edge.

3. After update: calls pollution_model.attach_pollution_weights()
   so pollution_delay is immediately recalculated with new traffic data.

Integration (in main.py)
------------------------
    from backend.traffic_enricher import TrafficEnricher
    import asyncio

    @app.on_event("startup")
    async def startup():
        app.state.G               = build_graph()
        app.state.signal_model    = SignalModel(app.state.G)
        app.state.signal_model.attach_signal_weights()
        app.state.pollution_model = PollutionModel(app.state.G)
        app.state.pollution_model.attach_pollution_weights()

        app.state.enricher = TrafficEnricher(
            graph           = app.state.G,
            pollution_model = app.state.pollution_model,
            api_key         = os.environ["TOMTOM_API_KEY"],
        )
        # Run first enrichment immediately, then every 3 hours
        await app.state.enricher.enrich()
        asyncio.create_task(app.state.enricher.run_scheduler())
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import time
from pathlib import Path
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

TOMTOM_FLOW_URL = (
    "https://api.tomtom.com/traffic/services/4"
    "/flowSegmentData/absolute/10/json"
)

# Road types to sample — major roads only to stay within API budget
SAMPLE_ROAD_TYPES = {
    "motorway", "motorway_link",
    "trunk", "trunk_link",
    "primary", "primary_link",
    "secondary", "secondary_link",
}

# How many sample nodes to pick (keep × 8 refreshes/day < 2500)
MAX_SAMPLE_NODES = 150

# Refresh interval in seconds (3 hours)
REFRESH_INTERVAL = 3 * 60 * 60

# Disk cache — avoids hitting TomTom on every server restart during development
CACHE_FILE = Path("cache/traffic_cache.json")

# IDW power parameter — higher = sample points influence smaller area
IDW_POWER = 2.0

# Minimum congestion ratio floor (avoids division explosion)
MIN_CONGESTION_RATIO = 0.15

# Emission factor exponent — tuned so:
#   free flow  (ratio=1.0) → factor=1.0
#   moderate   (ratio=0.6) → factor=1.5
#   heavy      (ratio=0.3) → factor=2.7
EMISSION_EXPONENT = 0.7

# Max radius (metres) within which a sample point influences an edge
IDW_RADIUS_M = 800.0


# ── Helpers ───────────────────────────────────────────────────────────────────

def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine distance in metres."""
    R  = 6_371_000.0
    φ1 = math.radians(lat1)
    φ2 = math.radians(lat2)
    dφ = math.radians(lat2 - lat1)
    dλ = math.radians(lon2 - lon1)
    a  = math.sin(dφ / 2) ** 2 + math.cos(φ1) * math.cos(φ2) * math.sin(dλ / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _emission_factor(congestion_ratio: float) -> float:
    """
    Convert congestion ratio to an emission multiplier.
    Stop-start low-speed driving emits exponentially more than free flow.

    congestion_ratio = current_speed / free_flow_speed
      1.0 → 1.00×  (free flow)
      0.6 → 1.50×  (moderate congestion)
      0.3 → 2.70×  (heavy congestion)
    """
    ratio = max(congestion_ratio, MIN_CONGESTION_RATIO)
    return 1.0 / (ratio ** EMISSION_EXPONENT)


# ── TrafficEnricher ───────────────────────────────────────────────────────────

class TrafficEnricher:

    def __init__(
        self,
        graph,
        pollution_model,
        api_key: str,
        refresh_interval: int = REFRESH_INTERVAL,
    ) -> None:
        self.G                = graph
        self.pollution_model  = pollution_model
        self.api_key          = api_key
        self.refresh_interval = refresh_interval

        # Pre-computed at init — doesn't change unless graph changes
        self._sample_nodes: list[dict] = []
        self._edge_base_volumes: dict  = {}

        self._last_enriched: Optional[float] = None
        self._enrichment_count: int = 0

        self._select_sample_nodes()
        self._cache_edge_base_volumes()

    # ── Setup ─────────────────────────────────────────────────────────────────

    def _select_sample_nodes(self) -> None:
        """
        Place sample points every CORRIDOR_SPACING_M metres along each
        named major corridor in Indore, then fill remaining budget with
        the highest-junction nodes on unnamed major roads.

        Corridors are matched by edge 'name' or 'ref' tags — using the
        actual strings present in the Indore OSMnx graph rather than a
        generic road-type filter.
        """
        # ── Corridor definitions ──────────────────────────────────────────
        # Tuples of (name_fragments, refs) — both matched as substrings.
        # Priority order: high-traffic corridors first.
        CORRIDORS = [
            # AB Road — two name variants + NH52 ref
            (["A. B. Road", "Old A. B. Road"], ["NH52"]),
            # Ring roads
            (["Ring Road", "MR10"], []),
            # Bypasses
            (["Indore Bypass", "Mhow Bypass"], []),
            # Major entry/exit corridors
            (["Nemawar Road"], ["NH47"]),
            (["Rau-Indore road"], ["SH38", "SH38A"]),
            (["Ujjain Road"], ["SH27"]),
            (["Kanadia Road"], []),
            (["Airport Road"], []),
            # Inner city lifelines
            (["Mahatma Gandhi Marg", "M.G.ROAD"], []),
            (["60 Feet Road"], []),
            (["Annapurna Road"], []),
            (["Jawahar Marg"], []),
            (["Indore - Depalpur - Ingoriya Road"], []),
            (["Ahmedabad - Indore Road"], []),
            (["Sanwer - Kshipra Road"], []),
            (["Shaheed Tantiya Bhil Road"], []),
        ]

        # Spacing between sample points along a corridor (metres)
        CORRIDOR_SPACING_M = 400.0

        def _matches_corridor(data: dict, names: list, refs: list) -> bool:
            edge_name = data.get("name", "") or ""
            edge_ref  = data.get("ref",  "") or ""
            if isinstance(edge_name, list): edge_name = " ".join(edge_name)
            if isinstance(edge_ref,  list): edge_ref  = " ".join(edge_ref)
            for n in names:
                if n.lower() in edge_name.lower():
                    return True
            for r in refs:
                if r.lower() in edge_ref.lower():
                    return True
            return False

        # ── Collect nodes per corridor ────────────────────────────────────
        corridor_nodes: list[dict] = []
        seen_nodes: set = set()

        for names, refs in CORRIDORS:
            # Gather all nodes on this corridor's edges
            c_nodes: list[dict] = []
            for u, v, data in self.G.edges(data=True):
                if not _matches_corridor(data, names, refs):
                    continue
                for node in (u, v):
                    if node in seen_nodes:
                        continue
                    nd = self.G.nodes[node]
                    c_nodes.append({
                        "node": node,
                        "lat":  nd["y"],
                        "lon":  nd["x"],
                        "sc":   nd.get("street_count", 2),
                    })
                    seen_nodes.add(node)

            if not c_nodes:
                continue

            # Sort by longitude to walk along the corridor
            c_nodes.sort(key=lambda n: n["lon"])

            # Pick nodes spaced at least CORRIDOR_SPACING_M apart
            selected = [c_nodes[0]]
            for node in c_nodes[1:]:
                last = selected[-1]
                dist = _haversine_m(last["lat"], last["lon"],
                                    node["lat"], node["lon"])
                if dist >= CORRIDOR_SPACING_M:
                    selected.append(node)

            corridor_nodes.extend(selected)
            logger.debug(
                "[TrafficEnricher] Corridor %s → %d sample points",
                names[0], len(selected),
            )

        # ── Fill remaining budget with high-junction major road nodes ─────
        remaining = MAX_SAMPLE_NODES - len(corridor_nodes)
        if remaining > 0:
            fallback_candidates = []
            for u, v, data in self.G.edges(data=True):
                road_type = data.get("highway", "")
                if isinstance(road_type, list): road_type = road_type[0]
                if road_type not in SAMPLE_ROAD_TYPES:
                    continue
                for node in (u, v):
                    if node in seen_nodes:
                        continue
                    nd = self.G.nodes[node]
                    fallback_candidates.append({
                        "node": node,
                        "lat":  nd["y"],
                        "lon":  nd["x"],
                        "sc":   nd.get("street_count", 2),
                    })
                    seen_nodes.add(node)

            # Pick highest street_count nodes first (busiest junctions)
            fallback_candidates.sort(key=lambda n: -n["sc"])
            corridor_nodes.extend(fallback_candidates[:remaining])

        self._sample_nodes = corridor_nodes[:MAX_SAMPLE_NODES]
        logger.info(
            "[TrafficEnricher] Selected %d sample nodes across %d corridors",
            len(self._sample_nodes), len(CORRIDORS),
        )

    def _cache_edge_base_volumes(self) -> None:
        """
        Cache base traffic volume per edge from the road type table.
        Defined inline to avoid any cross-module import at startup.
        """
        ROAD_TRAFFIC_VOLUME = {
            "motorway":       0.7,
            "motorway_link":  0.6,
            "trunk":          0.9,
            "trunk_link":     0.8,
            "primary":        1.8,
            "primary_link":   1.5,
            "secondary":      1.5,
            "secondary_link": 1.3,
            "tertiary":       1.1,
            "tertiary_link":  1.0,
            "residential":    0.6,
            "living_street":  0.4,
            "service":        0.4,
            "unclassified":   0.8,
        }
        DEFAULT_TRAFFIC_VOLUME = 0.9

        for u, v, k, data in self.G.edges(keys=True, data=True):
            road_type = data.get("highway", "")
            if isinstance(road_type, list):
                road_type = road_type[0]
            self._edge_base_volumes[(u, v, k)] = ROAD_TRAFFIC_VOLUME.get(
                road_type, DEFAULT_TRAFFIC_VOLUME
            )

    # ── TomTom API ────────────────────────────────────────────────────────────

    async def _fetch_flow(
        self,
        client: httpx.AsyncClient,
        lat: float,
        lon: float,
    ) -> Optional[dict]:
        """
        Query TomTom Flow API for one point.
        Returns dict with current_speed, free_flow_speed, confidence,
        or None on error.
        """
        try:
            resp = await client.get(
                TOMTOM_FLOW_URL,
                params={
                    "point": f"{lat},{lon}",
                    "key":   self.api_key,
                    "unit":  "KMPH",
                },
                timeout=8.0,
            )
            resp.raise_for_status()
            seg = resp.json().get("flowSegmentData", {})

            current   = float(seg.get("currentSpeed",  0))
            free_flow = float(seg.get("freeFlowSpeed", 1))
            confidence = float(seg.get("confidence",   1))

            if free_flow <= 0:
                return None

            return {
                "lat":            lat,
                "lon":            lon,
                "current_speed":  current,
                "free_flow_speed": free_flow,
                "congestion_ratio": min(1.0, current / free_flow),
                "confidence":     confidence,
            }

        except Exception as exc:
            logger.debug("[TrafficEnricher] Flow fetch failed (%s,%s): %s",
                         lat, lon, exc)
            return None

    async def _fetch_all_samples(self) -> list[dict]:
        """
        Query all sample nodes concurrently with a semaphore to avoid
        hammering the API (max 20 concurrent requests).
        """
        semaphore = asyncio.Semaphore(20)

        async def _limited(client, node):
            async with semaphore:
                result = await self._fetch_flow(client, node["lat"], node["lon"])
                await asyncio.sleep(0.05)   # gentle rate limiting
                return result

        async with httpx.AsyncClient() as client:
            tasks   = [_limited(client, node) for node in self._sample_nodes]
            results = await asyncio.gather(*tasks)

        valid = [r for r in results if r is not None]
        logger.info(
            "[TrafficEnricher] Fetched %d/%d sample points successfully",
            len(valid), len(self._sample_nodes),
        )
        return valid

    # ── Graph update ──────────────────────────────────────────────────────────

    def _update_graph_traffic_factors(self, flow_data: list[dict]) -> None:
        """
        For each edge, compute a congestion factor via IDW from nearby
        sample points, then set:

            traffic_factor = base_volume × emission_factor(congestion)

        Edges with no sample points within IDW_RADIUS_M fall back to
        their Gaussian time_multiplier-based traffic_factor (unchanged).
        """
        if not flow_data:
            logger.warning("[TrafficEnricher] No flow data — skipping update.")
            return

        updated = 0

        for u, v, k, data in self.G.edges(keys=True, data=True):
            # Edge midpoint coordinates
            node_u = self.G.nodes[u]
            node_v = self.G.nodes[v]
            mid_lat = (node_u["y"] + node_v["y"]) / 2.0
            mid_lon = (node_u["x"] + node_v["x"]) / 2.0

            # Find sample points within IDW_RADIUS_M
            weights  = []
            c_values = []

            for sample in flow_data:
                dist = _haversine_m(mid_lat, mid_lon,
                                    sample["lat"], sample["lon"])
                if dist <= IDW_RADIUS_M:
                    if dist < 1.0:
                        dist = 1.0   # avoid division by zero
                    w = (1.0 / dist) ** IDW_POWER
                    weights.append(w)
                    c_values.append(sample["congestion_ratio"])

            if not weights:
                # No nearby TomTom sample — keep existing traffic_factor
                # but ensure live_time is always present (fall back to base_time)
                if "live_time" not in data:
                    data["live_time"] = data.get("base_time", 0)
                continue

            # IDW interpolated congestion ratio
            congestion = sum(w * c for w, c in zip(weights, c_values)) / sum(weights)
            base_vol   = self._edge_base_volumes.get((u, v, k), 0.9)
            emit_f     = _emission_factor(congestion)

            data["traffic_factor"]   = round(base_vol * emit_f, 4)
            data["congestion_ratio"]  = round(congestion, 4)

            # Stretch base_time by congestion so routing engine sees real delays.
            # congestion=0.4 (heavy jam) → live_time = 2.5× base_time.
            # congestion=1.0 (free flow) → live_time = base_time.
            # Uses only data already fetched from TomTom — zero extra API calls.
            base_time = data.get("base_time", 0)
            data["live_time"] = round(base_time / max(congestion, MIN_CONGESTION_RATIO), 4)
            updated += 1

        logger.info(
            "[TrafficEnricher] Updated traffic_factor on %d edges", updated
        )

    # ── Public API ────────────────────────────────────────────────────────────

    async def enrich(self) -> None:
        """
        Fetch live traffic, update graph, recompute pollution weights.

        On startup: if a cache file exists and is younger than refresh_interval,
        load from disk instead of calling TomTom. This means server restarts
        during development cost zero API calls.

        The scheduler always does a live fetch (bypasses cache) so the data
        stays fresh every 3 hours regardless.
        """
        # ── Check disk cache ──────────────────────────────────────────────
        if CACHE_FILE.exists():
            age = time.time() - CACHE_FILE.stat().st_mtime
            if age < self.refresh_interval:
                logger.info(
                    "[TrafficEnricher] Cache is %.0f min old — loading from disk (no API call)",
                    age / 60,
                )
                flow_data = json.loads(CACHE_FILE.read_text())
                self._update_graph_traffic_factors(flow_data)
                self.pollution_model.attach_pollution_weights()
                self._enrichment_count += 1
                self._last_enriched = time.time()
                return

        # ── Cache stale or missing — fetch from TomTom ────────────────────
        logger.info("[TrafficEnricher] Starting enrichment cycle...")
        t0 = time.monotonic()

        flow_data = await self._fetch_all_samples()

        if flow_data:
            self._update_graph_traffic_factors(flow_data)
            self.pollution_model.attach_pollution_weights()
            self._enrichment_count += 1
            self._last_enriched = time.time()

            # Save to disk cache for next restart
            CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
            CACHE_FILE.write_text(json.dumps(flow_data))
            logger.info("[TrafficEnricher] Cache saved to %s", CACHE_FILE)

        elapsed = time.monotonic() - t0
        logger.info(
            "[TrafficEnricher] Enrichment #%d complete in %.1fs",
            self._enrichment_count, elapsed,
        )

    async def _enrich_live(self) -> None:
        """
        Force a live TomTom fetch, bypassing the disk cache.
        Used by the scheduler so data stays fresh every 3 hours.
        """
        logger.info("[TrafficEnricher] Starting scheduled live enrichment...")
        t0 = time.monotonic()

        flow_data = await self._fetch_all_samples()

        if flow_data:
            self._update_graph_traffic_factors(flow_data)
            self.pollution_model.attach_pollution_weights()
            self._enrichment_count += 1
            self._last_enriched = time.time()

            CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
            CACHE_FILE.write_text(json.dumps(flow_data))
            logger.info("[TrafficEnricher] Cache updated at %s", CACHE_FILE)

        elapsed = time.monotonic() - t0
        logger.info(
            "[TrafficEnricher] Enrichment #%d complete in %.1fs",
            self._enrichment_count, elapsed,
        )

    async def run_scheduler(self) -> None:
        """
        Background loop — runs a live fetch every refresh_interval seconds.
        Start this with asyncio.create_task() in your FastAPI startup.
        """
        while True:
            await asyncio.sleep(self.refresh_interval)
            try:
                await self._enrich_live()
            except Exception as exc:
                logger.error("[TrafficEnricher] Enrichment failed: %s", exc)

    @property
    def status(self) -> dict:
        """Quick health check — expose via a /status endpoint if needed."""
        return {
            "sample_nodes":      len(self._sample_nodes),
            "enrichment_count":  self._enrichment_count,
            "last_enriched":     self._last_enriched,
            "refresh_interval_h": self.refresh_interval / 3600,
        }
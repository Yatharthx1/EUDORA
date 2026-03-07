"""
TrafficEnricher

Queries TomTom Traffic Flow API every 3 hours for ~150 sample points
on Indore's major roads and updates every graph edge via IDW.

What TomTom drives
------------------
For each enriched edge (within 800m of a sample point):

  base_time   ← length / IDW(freeFlowSpeed)   — no-congestion travel time
  live_time   ← length / IDW(currentSpeed)    — actual travel time right now
  traffic_factor ← base_volume × emission_factor(congestion)  — for pollution

For unenriched edges (deep residential, service roads):
  base_time   ← from graph_builder fallback speed table (unchanged)
  live_time   ← not set (routing_engine falls back to base_time)

Routing engine uses:
  w_time × (live_time or base_time)

So TomTom data directly affects both route selection and displayed time.

Budget: 150 points × 8 refreshes/day = 1,200 req/day (of 2,500 free)
Disk cache: restarts cost 0 API calls if cache < 3 hours old.
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

SAMPLE_ROAD_TYPES = {
    "motorway", "motorway_link",
    "trunk", "trunk_link",
    "primary", "primary_link",
    "secondary", "secondary_link",
}

MAX_SAMPLE_NODES  = 150
REFRESH_INTERVAL  = 3 * 60 * 60        # 3 hours
CACHE_FILE        = Path("cache/traffic_cache.json")
IDW_POWER         = 2.0
IDW_RADIUS_M      = 800.0
MIN_SPEED_KMPH    = 2.0                 # floor to avoid division by zero
MIN_CONGESTION    = 0.15
EMISSION_EXPONENT = 0.7

# Road traffic volume for pollution model
ROAD_TRAFFIC_VOLUME = {
    "motorway":       0.7,  "motorway_link":  0.6,
    "trunk":          0.9,  "trunk_link":     0.8,
    "primary":        1.8,  "primary_link":   1.5,
    "secondary":      1.5,  "secondary_link": 1.3,
    "tertiary":       1.1,  "tertiary_link":  1.0,
    "residential":    0.6,  "living_street":  0.4,
    "service":        0.4,  "unclassified":   0.8,
}
DEFAULT_TRAFFIC_VOLUME = 0.9


# ── Helpers ───────────────────────────────────────────────────────────────────

def _haversine_m(lat1, lon1, lat2, lon2) -> float:
    R  = 6_371_000.0
    φ1 = math.radians(lat1); φ2 = math.radians(lat2)
    dφ = math.radians(lat2 - lat1)
    dλ = math.radians(lon2 - lon1)
    a  = math.sin(dφ/2)**2 + math.cos(φ1)*math.cos(φ2)*math.sin(dλ/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


def _emission_factor(congestion_ratio: float) -> float:
    ratio = max(congestion_ratio, MIN_CONGESTION)
    return 1.0 / (ratio ** EMISSION_EXPONENT)


# ── TrafficEnricher ───────────────────────────────────────────────────────────

class TrafficEnricher:

    def __init__(self, graph, pollution_model, api_key: str,
                 refresh_interval: int = REFRESH_INTERVAL) -> None:
        self.G                = graph
        self.pollution_model  = pollution_model
        self.api_key          = api_key
        self.refresh_interval = refresh_interval

        self._sample_nodes:      list[dict]       = []
        self._edge_base_volumes: dict             = {}
        self._last_enriched:     Optional[float]  = None
        self._enrichment_count:  int              = 0

        self._select_sample_nodes()
        self._cache_edge_base_volumes()

    # ── Node selection ────────────────────────────────────────────────────────

    def _select_sample_nodes(self) -> None:
        """
        Place sample points every 400m along each named Indore corridor,
        then fill remaining budget with highest-junction major road nodes.
        """
        CORRIDORS = [
            (["A. B. Road", "Old A. B. Road"], ["NH52"]),
            (["Ring Road", "MR10"],            []),
            (["Indore Bypass", "Mhow Bypass"], []),
            (["Nemawar Road"],                 ["NH47"]),
            (["Rau-Indore road"],              ["SH38", "SH38A"]),
            (["Ujjain Road"],                  ["SH27"]),
            (["Kanadia Road"],                 []),
            (["Airport Road"],                 []),
            (["Mahatma Gandhi Marg", "M.G.ROAD"], []),
            (["60 Feet Road"],                 []),
            (["Annapurna Road"],               []),
            (["Jawahar Marg"],                 []),
            (["Indore - Depalpur - Ingoriya Road"], []),
            (["Ahmedabad - Indore Road"],      []),
            (["Sanwer - Kshipra Road"],        []),
            (["Shaheed Tantiya Bhil Road"],    []),
        ]
        CORRIDOR_SPACING_M = 400.0

        def _matches(data, names, refs):
            name = data.get("name", "") or ""
            ref  = data.get("ref",  "") or ""
            if isinstance(name, list): name = " ".join(name)
            if isinstance(ref,  list): ref  = " ".join(ref)
            return (any(n.lower() in name.lower() for n in names) or
                    any(r.lower() in ref.lower()  for r in refs))

        corridor_nodes: list[dict] = []
        seen: set = set()

        for names, refs in CORRIDORS:
            c_nodes = []
            for u, v, data in self.G.edges(data=True):
                if not _matches(data, names, refs):
                    continue
                for node in (u, v):
                    if node in seen: continue
                    nd = self.G.nodes[node]
                    c_nodes.append({"node": node, "lat": nd["y"],
                                    "lon": nd["x"], "sc": nd.get("street_count", 2)})
                    seen.add(node)

            if not c_nodes:
                continue

            c_nodes.sort(key=lambda n: n["lon"])
            selected = [c_nodes[0]]
            for node in c_nodes[1:]:
                last = selected[-1]
                if _haversine_m(last["lat"], last["lon"],
                                node["lat"], node["lon"]) >= CORRIDOR_SPACING_M:
                    selected.append(node)

            corridor_nodes.extend(selected)
            logger.debug("[TrafficEnricher] Corridor %s → %d points",
                         names[0], len(selected))

        remaining = MAX_SAMPLE_NODES - len(corridor_nodes)
        if remaining > 0:
            fallback = []
            for u, v, data in self.G.edges(data=True):
                rt = data.get("highway", "")
                if isinstance(rt, list): rt = rt[0]
                if rt not in SAMPLE_ROAD_TYPES: continue
                for node in (u, v):
                    if node in seen: continue
                    nd = self.G.nodes[node]
                    fallback.append({"node": node, "lat": nd["y"],
                                     "lon": nd["x"], "sc": nd.get("street_count", 2)})
                    seen.add(node)
            fallback.sort(key=lambda n: -n["sc"])
            corridor_nodes.extend(fallback[:remaining])

        self._sample_nodes = corridor_nodes[:MAX_SAMPLE_NODES]
        logger.info("[TrafficEnricher] Selected %d sample nodes across %d corridors",
                    len(self._sample_nodes), len(CORRIDORS))

    def _cache_edge_base_volumes(self) -> None:
        for u, v, k, data in self.G.edges(keys=True, data=True):
            rt = data.get("highway", "")
            if isinstance(rt, list): rt = rt[0]
            self._edge_base_volumes[(u, v, k)] = ROAD_TRAFFIC_VOLUME.get(
                rt, DEFAULT_TRAFFIC_VOLUME)

    # ── TomTom API ────────────────────────────────────────────────────────────

    async def _fetch_flow(self, client: httpx.AsyncClient,
                          lat: float, lon: float) -> Optional[dict]:
        try:
            resp = await client.get(
                TOMTOM_FLOW_URL,
                params={"point": f"{lat},{lon}", "key": self.api_key, "unit": "KMPH"},
                timeout=8.0,
            )
            resp.raise_for_status()
            seg = resp.json().get("flowSegmentData", {})

            current   = float(seg.get("currentSpeed",   0))
            free_flow = float(seg.get("freeFlowSpeed",  1))
            confidence = float(seg.get("confidence",    1))

            if free_flow <= 0:
                return None

            return {
                "lat":              lat,
                "lon":              lon,
                "current_speed":    max(current,   MIN_SPEED_KMPH),
                "free_flow_speed":  max(free_flow, MIN_SPEED_KMPH),
                "congestion_ratio": min(1.0, current / free_flow),
                "confidence":       confidence,
            }
        except Exception as exc:
            logger.debug("[TrafficEnricher] Fetch failed (%s,%s): %s", lat, lon, exc)
            return None

    async def _fetch_all_samples(self) -> list[dict]:
        semaphore = asyncio.Semaphore(20)

        async def _limited(client, node):
            async with semaphore:
                result = await self._fetch_flow(client, node["lat"], node["lon"])
                await asyncio.sleep(0.05)
                return result

        async with httpx.AsyncClient() as client:
            results = await asyncio.gather(
                *[_limited(client, n) for n in self._sample_nodes])

        valid = [r for r in results if r is not None]
        logger.info("[TrafficEnricher] Fetched %d/%d sample points successfully",
                    len(valid), len(self._sample_nodes))
        return valid

    # ── Graph update ──────────────────────────────────────────────────────────

    def _update_graph_traffic_factors(self, flow_data: list[dict]) -> None:
        """
        For each edge, IDW-interpolate TomTom speeds from nearby sample points:

          base_time  = length / IDW(freeFlowSpeed)   ← true free-flow time
          live_time  = length / IDW(currentSpeed)    ← real time right now
          traffic_factor = base_volume × emission_factor(congestion)

        Edges outside IDW_RADIUS_M of all samples are left unchanged
        (graph_builder fallback speeds remain in place).
        """
        if not flow_data:
            logger.warning("[TrafficEnricher] No flow data — skipping update.")
            return

        updated = 0

        for u, v, k, data in self.G.edges(keys=True, data=True):
            node_u  = self.G.nodes[u]
            node_v  = self.G.nodes[v]
            mid_lat = (node_u["y"] + node_v["y"]) / 2.0
            mid_lon = (node_u["x"] + node_v["x"]) / 2.0

            weights     = []
            curr_speeds = []
            free_speeds = []
            c_values    = []

            for sample in flow_data:
                dist = _haversine_m(mid_lat, mid_lon,
                                    sample["lat"], sample["lon"])
                if dist <= IDW_RADIUS_M:
                    dist = max(dist, 1.0)
                    w = (1.0 / dist) ** IDW_POWER
                    weights.append(w)
                    curr_speeds.append(sample["current_speed"])
                    free_speeds.append(sample["free_flow_speed"])
                    c_values.append(sample["congestion_ratio"])

            if not weights:
                # No nearby TomTom sample — keep fallback base_time,
                # ensure live_time is at least set to base_time
                if "live_time" not in data:
                    data["live_time"] = data.get("base_time", 0)
                continue

            total_w    = sum(weights)
            curr_spd   = sum(w * s for w, s in zip(weights, curr_speeds)) / total_w
            free_spd   = sum(w * s for w, s in zip(weights, free_speeds)) / total_w
            congestion = sum(w * c for w, c in zip(weights, c_values))   / total_w

            length_km = data.get("length", 0) / 1000.0

            # ── Core: TomTom speeds → travel times ────────────────────────
            data["base_time"] = round(
                (length_km / max(free_spd, MIN_SPEED_KMPH)) * 60.0, 6)
            data["live_time"] = round(
                (length_km / max(curr_spd, MIN_SPEED_KMPH)) * 60.0, 6)

            # ── Pollution ─────────────────────────────────────────────────
            base_vol = self._edge_base_volumes.get((u, v, k), DEFAULT_TRAFFIC_VOLUME)
            data["traffic_factor"]  = round(base_vol * _emission_factor(congestion), 4)
            data["congestion_ratio"] = round(congestion, 4)

            updated += 1

        logger.info("[TrafficEnricher] Updated %d edges with TomTom speeds", updated)

    # ── Public API ────────────────────────────────────────────────────────────

    async def enrich(self) -> None:
        """
        Startup enrichment — loads from disk cache if fresh, else hits TomTom.

        Cache TTL = 8 hours (the longest gap between scheduled refresh times:
        8 PM → 1 AM → 9 AM). If the server restarts within that window,
        the existing cache is still valid — no API calls needed.
        """
        CACHE_TTL = 8 * 60 * 60  # 8 hours

        if CACHE_FILE.exists():
            age = time.time() - CACHE_FILE.stat().st_mtime
            if age < CACHE_TTL:
                logger.info(
                    "[TrafficEnricher] Cache is %.0f min old — loading from disk (0 API calls)",
                    age / 60)
                flow_data = json.loads(CACHE_FILE.read_text())
                self._update_graph_traffic_factors(flow_data)
                self.pollution_model.attach_pollution_weights()
                self._enrichment_count += 1
                self._last_enriched = time.time()
                return

        await self._enrich_live()

    async def _enrich_live(self) -> None:
        """Live TomTom fetch — used by scheduler and on stale/missing cache."""
        logger.info("[TrafficEnricher] Starting live enrichment cycle...")
        t0 = time.monotonic()

        flow_data = await self._fetch_all_samples()

        if flow_data:
            self._update_graph_traffic_factors(flow_data)
            self.pollution_model.attach_pollution_weights()
            self._enrichment_count += 1
            self._last_enriched = time.time()

            CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
            CACHE_FILE.write_text(json.dumps(flow_data))
            logger.info("[TrafficEnricher] Cache saved → %s", CACHE_FILE)

        logger.info("[TrafficEnricher] Enrichment #%d complete in %.1fs",
                    self._enrichment_count, time.monotonic() - t0)

    async def run_scheduler(self) -> None:
        """
        Background loop — fires a live TomTom fetch at each scheduled
        time of day (Indore local time), corresponding to major traffic
        pattern shifts:

            1:00 AM  — post-night baseline
            9:00 AM  — morning rush settling
            2:00 PM  — midday lull
            5:00 PM  — evening rush starting
            8:00 PM  — post-rush, night traffic

        5 refreshes/day × 150 points = 750 API calls/day (of 2,500 free).
        """
        import datetime
        import zoneinfo

        REFRESH_HOURS = [1, 9, 14, 17, 20]
        TZ = zoneinfo.ZoneInfo("Asia/Kolkata")

        while True:
            now   = datetime.datetime.now(TZ)
            today = now.date()

            # Find the next scheduled slot after now
            next_run = None
            for hour in sorted(REFRESH_HOURS):
                candidate = datetime.datetime.combine(
                    today, datetime.time(hour, 0), tzinfo=TZ)
                if candidate > now:
                    next_run = candidate
                    break

            # All today's slots passed — use first slot tomorrow
            if next_run is None:
                tomorrow = today + datetime.timedelta(days=1)
                next_run = datetime.datetime.combine(
                    tomorrow, datetime.time(REFRESH_HOURS[0], 0), tzinfo=TZ)

            sleep_secs = (next_run - now).total_seconds()
            logger.info(
                "[TrafficEnricher] Next refresh at %s IST (in %.0f min)",
                next_run.strftime("%H:%M"), sleep_secs / 60,
            )

            await asyncio.sleep(sleep_secs)

            try:
                await self._enrich_live()
            except Exception as exc:
                logger.error("[TrafficEnricher] Enrichment failed: %s", exc)

    @property
    def status(self) -> dict:
        return {
            "sample_nodes":       len(self._sample_nodes),
            "enrichment_count":   self._enrichment_count,
            "last_enriched":      self._last_enriched,
            "next_refresh_hours": [1, 9, 14, 17, 20],
        }
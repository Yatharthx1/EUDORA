"""
AQIStore
========
Manages historical AQI data in SQLite.

Fetch priority:
  1. If a historical average exists for (day_of_week, hour_slot) → use it
  2. Else if live reading is fresh (< 2 hours old) → use cached live
  3. Else → hit OWM API, store result, update historical average
  4. If API fails → fall back to Indore seasonal default

This means after a few days of running, the app makes near-zero
live API calls — ideal for conserving free tier quota before a demo.
"""

import sqlite3
import os
import time
import datetime
import requests
from dotenv import load_dotenv
load_dotenv()

OWM_API_KEY  = os.getenv("OWM_API_KEY")
OWM_URL      = "http://api.openweathermap.org/data/2.5/air_pollution"
DB_PATH      = os.getenv("AQI_DB_PATH", "data/aqi_history.db")

# Indore city centre
CITY_LAT = 22.7196
CITY_LNG = 75.8577

# Fallback AQI if everything fails — Indore is typically Moderate
DEFAULT_AQI  = 3

# Only make a live call if historical average has fewer than this many samples
MIN_SAMPLES_TO_TRUST = 3

# Don't re-fetch live if last fetch was within this many seconds
LIVE_CACHE_TTL = 7200   # 2 hours


class AQIStore:

    def __init__(self, db_path=DB_PATH, api_key=None):
        self.db_path  = db_path
        self.api_key  = api_key or OWM_API_KEY

        # In-memory live cache: avoids repeated DB + API hits in same session
        self._live_cache       = None   # (aqi, timestamp)

        os.makedirs(os.path.dirname(db_path) if os.path.dirname(db_path) else ".", exist_ok=True)
        self._init_db()

    # ---------------------------------------------------
    # DB setup
    # ---------------------------------------------------

    def _get_conn(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._get_conn() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS aqi_readings (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp   INTEGER NOT NULL,   -- unix epoch
                    day_of_week INTEGER NOT NULL,   -- 0=Mon, 6=Sun
                    hour_slot   INTEGER NOT NULL,   -- 0-23
                    aqi         INTEGER NOT NULL
                );

                CREATE TABLE IF NOT EXISTS aqi_hourly_avg (
                    day_of_week INTEGER NOT NULL,
                    hour_slot   INTEGER NOT NULL,
                    aqi_sum     REAL    NOT NULL DEFAULT 0,
                    count       INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (day_of_week, hour_slot)
                );

                CREATE INDEX IF NOT EXISTS idx_readings_slot
                    ON aqi_readings (day_of_week, hour_slot);
            """)

    # ---------------------------------------------------
    # Store a reading + update rolling average
    # ---------------------------------------------------

    def _store_reading(self, aqi: int):
        now  = datetime.datetime.now()
        ts   = int(time.time())
        dow  = now.weekday()
        hour = now.hour

        with self._get_conn() as conn:
            # Raw reading
            conn.execute(
                "INSERT INTO aqi_readings (timestamp, day_of_week, hour_slot, aqi) VALUES (?,?,?,?)",
                (ts, dow, hour, aqi)
            )

            # Update rolling average (upsert)
            conn.execute("""
                INSERT INTO aqi_hourly_avg (day_of_week, hour_slot, aqi_sum, count)
                VALUES (?, ?, ?, 1)
                ON CONFLICT(day_of_week, hour_slot) DO UPDATE SET
                    aqi_sum = aqi_sum + excluded.aqi_sum,
                    count   = count   + 1
            """, (dow, hour, float(aqi)))

    # ---------------------------------------------------
    # Query historical average
    # ---------------------------------------------------

    def get_historical_avg(self, day_of_week: int, hour_slot: int):
        """
        Returns (avg_aqi, sample_count) for the given slot.
        Returns (None, 0) if no data exists.
        """
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT aqi_sum, count FROM aqi_hourly_avg WHERE day_of_week=? AND hour_slot=?",
                (day_of_week, hour_slot)
            ).fetchone()

        if row and row["count"] > 0:
            return round(row["aqi_sum"] / row["count"]), row["count"]
        return None, 0

    # ---------------------------------------------------
    # Live API fetch
    # ---------------------------------------------------

    def _fetch_live_aqi(self) -> int | None:
        """Hit OWM API. Returns int AQI or None on failure."""
        try:
            resp = requests.get(
                OWM_URL,
                params={"lat": CITY_LAT, "lon": CITY_LNG, "appid": self.api_key},
                timeout=5
            )
            resp.raise_for_status()
            return resp.json()["list"][0]["main"]["aqi"]
        except Exception as e:
            print(f"[AQIStore] Live fetch failed: {e}")
            return None

    # ---------------------------------------------------
    # Main public method
    # ---------------------------------------------------

    def get_aqi(self) -> dict:
        """
        Return current AQI using the smartest available source.

        Returns:
            {
                "aqi":    int (1-5),
                "source": "historical" | "live" | "fallback",
                "samples": int   (how many historical readings backed this)
            }
        """
        now  = datetime.datetime.now()
        dow  = now.weekday()
        hour = now.hour

        # 1. Try historical average first
        hist_aqi, count = self.get_historical_avg(dow, hour)

        if hist_aqi is not None and count >= MIN_SAMPLES_TO_TRUST:
            print(f"[AQIStore] Using historical avg AQI={hist_aqi} "
                  f"(day={dow}, hour={hour}, n={count})")
            return {"aqi": hist_aqi, "source": "historical", "samples": count}

        # 2. Check in-memory live cache
        if self._live_cache:
            cached_aqi, cached_ts = self._live_cache
            if (time.time() - cached_ts) < LIVE_CACHE_TTL:
                print(f"[AQIStore] Using live cache AQI={cached_aqi}")
                return {"aqi": cached_aqi, "source": "live", "samples": 0}

        # 3. Fetch live from OWM
        print(f"[AQIStore] Fetching live AQI from OWM...")
        live_aqi = self._fetch_live_aqi()

        if live_aqi is not None:
            self._live_cache = (live_aqi, time.time())
            self._store_reading(live_aqi)
            print(f"[AQIStore] Live AQI={live_aqi} stored.")
            return {"aqi": live_aqi, "source": "live", "samples": 0}

        # 4. Full fallback — use whatever historical we have even if sparse
        if hist_aqi is not None:
            print(f"[AQIStore] API failed, using sparse historical AQI={hist_aqi}")
            return {"aqi": hist_aqi, "source": "historical", "samples": count}

        # 5. Last resort default
        print(f"[AQIStore] All sources failed, using default AQI={DEFAULT_AQI}")
        return {"aqi": DEFAULT_AQI, "source": "fallback", "samples": 0}

    # ---------------------------------------------------
    # Stats (useful for debugging / admin)
    # ---------------------------------------------------

    def stats(self) -> dict:
        with self._get_conn() as conn:
            total = conn.execute("SELECT COUNT(*) as n FROM aqi_readings").fetchone()["n"]
            slots = conn.execute("SELECT COUNT(*) as n FROM aqi_hourly_avg WHERE count >= ?",
                                 (MIN_SAMPLES_TO_TRUST,)).fetchone()["n"]
        return {
            "total_readings":    total,
            "trusted_slots":     slots,
            "total_slots":       168,   # 7 days × 24 hours
            "coverage_pct":      round(slots / 168 * 100, 1),
        }

"""
seed_aqi.py
===========
Pre-populates the AQI history DB with realistic Indore averages
so the app never cold-starts and works well from day one.

Based on:
- Indore's typical AQI patterns (winter mornings worst, night best)
- Rush hour peaks (8-10am, 5-8pm)
- Weekend vs weekday differences

Run once before launch:
    python -m backend.data.seed_aqi
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.data.aqi_store import AQIStore
import sqlite3
import time
import datetime

# ---------------------------------------------------
# Indore AQI profile (1-5 scale)
# Base hourly pattern — weekday
# ---------------------------------------------------

WEEKDAY_HOURLY = [
    # hour: 0   1   2   3   4   5   6   7   8   9  10  11
             2,  2,  1,  1,  1,  2,  2,  3,  4,  4,  4,  3,
    # hour: 12  13  14  15  16  17  18  19  20  21  22  23
             3,  3,  3,  3,  3,  4,  4,  4,  3,  3,  2,  2,
]

WEEKEND_HOURLY = [
    # hour: 0   1   2   3   4   5   6   7   8   9  10  11
             2,  1,  1,  1,  1,  1,  2,  2,  3,  3,  3,  3,
    # hour: 12  13  14  15  16  17  18  19  20  21  22  23
             3,  3,  3,  3,  3,  3,  3,  3,  3,  2,  2,  2,
]

# Winter months (Nov-Feb) shift everything up by 1
WINTER_MONTHS = {11, 12, 1, 2}


def aqi_for_slot(day_of_week: int, hour: int) -> int:
    current_month = datetime.datetime.now().month
    is_winter     = current_month in WINTER_MONTHS
    is_weekend    = day_of_week >= 5   # Sat=5, Sun=6

    base = WEEKEND_HOURLY[hour] if is_weekend else WEEKDAY_HOURLY[hour]

    if is_winter:
        base = min(5, base + 1)

    return base


def seed(db_path="data/aqi_history.db", samples_per_slot=5):
    """
    Insert `samples_per_slot` readings for every (day, hour) combination.
    This gives the store enough data to trust historical averages immediately.
    """
    store = AQIStore(db_path=db_path)

    print(f"Seeding AQI history → {db_path}")
    print(f"Inserting {samples_per_slot} samples × 168 slots = "
          f"{samples_per_slot * 168} readings\n")

    inserted = 0
    base_ts  = int(time.time()) - (7 * 24 * 3600)   # start 7 days ago

    with store._get_conn() as conn:
        for day in range(7):           # 0=Mon … 6=Sun
            for hour in range(24):
                aqi = aqi_for_slot(day, hour)

                for sample in range(samples_per_slot):
                    # Spread samples ~1 week apart for this slot
                    fake_ts = base_ts + (day * 86400) + (hour * 3600) + (sample * 600)

                    conn.execute(
                        "INSERT INTO aqi_readings (timestamp, day_of_week, hour_slot, aqi) "
                        "VALUES (?,?,?,?)",
                        (fake_ts, day, hour, aqi)
                    )
                    inserted += 1

                # Update rolling average directly
                conn.execute("""
                    INSERT INTO aqi_hourly_avg (day_of_week, hour_slot, aqi_sum, count)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(day_of_week, hour_slot) DO UPDATE SET
                        aqi_sum = aqi_sum + excluded.aqi_sum,
                        count   = count   + excluded.count
                """, (day, hour, float(aqi * samples_per_slot), samples_per_slot))

    stats = store.stats()
    print(f"Done. {inserted} readings inserted.")
    print(f"Trusted slots: {stats['trusted_slots']}/168 "
          f"({stats['coverage_pct']}% coverage)")
    print("\nSample averages:")

    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    for hour in [0, 8, 9, 13, 17, 18, 22]:
        for day in [0, 5]:
            aqi, count = store.get_historical_avg(day, hour)
            print(f"  {days[day]} {hour:02d}:00 → AQI {aqi} (n={count})")


if __name__ == "__main__":
    seed()

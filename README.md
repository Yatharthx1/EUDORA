---
title: EUDORA
sdk: docker
app_port: 7860
---

# EUDORA
### Smart Multi-Factor Navigation for Indore, India

> Route smarter. Not just faster.

EUDORA is an open-source navigation system built specifically for Indore, India. Unlike conventional GPS apps that optimize only for time, EUDORA computes five distinct route variants simultaneously- weighing traffic signals, air quality, urban tree canopy, and road hierarchy alongside travel time.

**Landing:** [project-code-lb-9deh.vercel.app](https://project-code-lb-9deh.vercel.app)
---

## Why EUDORA?

Standard navigation ignores what actually affects your commute in an Indian city:

- **Signal density**- Indore's inner city has junctions every 200–400m. A "fastest" route can still mean 12 red lights.
- **Air quality**- AQI varies significantly across neighborhoods. A slightly longer route can mean dramatically less pollution exposure.
- **Urban heat**- Roads with tree canopy are cooler, shadier, and healthier to walk or cycle.
- **Road hierarchy**- Narrow lanes and service roads inflate travel time in ways raw distance doesn't capture.

EUDORA models all of these. Every route request returns five options, each optimized for a different priority.

---

## Route Types

| Route | Optimizes For |
|---|---|
| ⚡ Fastest | Minimum travel time using live traffic |
| 🚦 Least Signals | Fewest traffic signal stops |
| 🛡️ Cleanest Air | Lowest AQI/pollution exposure |
| 🌳 Greenest | Highest urban tree canopy coverage |
| ⭐ Best Overall | Balanced across all factors |

---

## Architecture

```
Frontend (Vercel)
  Vanilla JS + Leaflet.js
  5 animated route polylines
  GPS navigation mode
  Live signal markers
        ↕
FastAPI Backend (HuggingFace Spaces)
  Weighted Dijkstra routing
  OSMnx road graph (Indore)
  Signal penalty model
  Pollution exposure model
  Live traffic enrichment (TomTom)
  Canopy scoring (GEE + Sentinel-2)
  Geocoding proxy (LocationIQ)
  Tile proxy (MapTiler → CartoDB fallback)
```

---

## How Each Factor Works

### 🚦 Signal Modeling
Traffic signals are clustered into junctions using DBSCAN. Each junction adds a configurable delay penalty to edges entering it. Direction-aware- **free left turns** (India drives on the left) are detected via cross-product geometry and exempt from signal delay, matching real driving behavior.

### 🛡️ Pollution Scoring
Live AQI data from OpenWeatherMap is sampled at grid points across Indore and stored in SQLite. Pollution exposure per edge is computed from AQI values weighted by edge length. Routes through cleaner air corridors receive lower cost in Dijkstra.

### 🌳 Canopy Scoring
Sentinel-2 satellite imagery (10m resolution) is fetched from Google Earth Engine for all of Indore in a single export. NDVI is computed per pixel. Each road segment's canopy score is the fraction of corridor pixels with NDVI > 0.4. All 173,307 road segments are precomputed offline and stored in `canopy_scores.json`- zero runtime cost.

### ⚡ Traffic Enrichment
TomTom Flow API samples are fetched at startup and refreshed periodically. Live speed data updates `live_time` on each edge. Falls back to OSM `maxspeed` estimates when live data is unavailable.

### 🧭 Routing Engine
Predecessor-map Dijkstra- O(E log E) memory behavior. Stores only parent edge state per node, not the growing path list. Results in 40–60% faster computation on cross-city routes vs naive path-list implementations. Turn penalties computed from edge vector cross-products with right-turn surcharge for Indian left-hand traffic.

---

## Stack

| Layer | Technology |
|---|---|
| Backend | Python, FastAPI, OSMnx, NetworkX |
| Routing | Custom weighted Dijkstra |
| Satellite data | Google Earth Engine, Sentinel-2 |
| Traffic | TomTom Flow API |
| AQI | OpenWeatherMap |
| Geocoding | LocationIQ |
| Map tiles | MapTiler (CartoDB fallback) |
| Frontend | Vanilla JS, Leaflet.js |
| Deployment | HuggingFace Spaces (backend), Vercel (frontend + landing) |

---

## Local Setup

### Prerequisites
- Python 3.10+
- A Google Earth Engine non-commercial account
- API keys for TomTom, LocationIQ, MapTiler, OpenWeatherMap

### Install

```bash
git clone https://github.com/Yatharthx1/Project-Code-LB.git
cd Project-Code-LB
python -m venv .venv
.venv\Scripts\activate      # Windows
pip install -r requirements.txt
```

### Configure

```bash
cp .env.example .env
# Fill in your API keys
```

### Run

```bash
uvicorn main:app --reload --port 8000
```

Open `frontend/index.html` in your browser.

### Canopy Precompute (one-time)

```bash
# Authenticate GEE once
python -c "import ee; ee.Authenticate()"

# Run the Colab notebook for full precompute
# notebooks/indore_canopy_precompute.ipynb
# Downloads canopy_scores.json → drop in data/

# Generate blob visualization data
python generate_canopy_blobs.py
```

---

## Environment Variables

See `.env.example` for the full list. Required keys:

```
TOMTOM_API_KEY
LOCATIONIQ_TOKEN
MAPTILER_KEY
OWM_API_KEY
GEE_PROJECT_ID
ALLOWED_ORIGINS
```

---

## Project Structure

```
├── main.py                    # FastAPI entrypoint
├── backend/
│   ├── api/routes.py          # API endpoints
│   ├── routing/
│   │   ├── graph_builder.py   # OSMnx graph loading
│   │   ├── routing_engine.py  # Dijkstra implementation
│   │   └── traffic_enricher.py
│   ├── signal/signal_model.py # Junction clustering + penalties
│   ├── pollution/pollution_model.py
│   └── trees/                 # Canopy scoring module
│       ├── gee_fetch.py
│       ├── canopy.py
│       ├── tree_store.py
│       ├── tree_cost.py
│       └── precompute.py
├── frontend/
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── data/
│   ├── canopy_scores.json     # Precomputed (gitignored)
│   └── aqi_store.db           # Runtime AQI cache (gitignored)
├── eudora-landing/            # Next.js landing page
└── indore.pkl                 # Road graph (gitignored)
```

---

## Pollution Reduction Claim

Based on graph analysis of Indore's road network: routes optimized for pollution exposure avoid the highest-AQI corridors (primarily along NH-52 and inner Ring Road industrial segments). In tested cross-city routes, the Cleanest Air variant reduces estimated pollution exposure by **~25–26%** compared to the Fastest route, at a time cost of 8–12%.

---

## Built By

Yatharth- BTech CSE (AI/ML), IPS Academy Indore  
Built independently alongside coursework as a real deployed system, not a toy project.

---

## License

MIT

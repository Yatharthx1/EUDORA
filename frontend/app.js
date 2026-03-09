/* ============================================================
   EUDORA — app.js
   LocationIQ geocoding · Leaflet · Glowing animated routes
   ============================================================ */

const API_BASE = 'http://localhost:8000';

// ── LocationIQ ────────────────────────────────────────────────
// Replace with your LocationIQ token from https://locationiq.com
const LOCATIONIQ_TOKEN = 'API HERE';
const LOCATIONIQ_URL = 'https://api.locationiq.com/v1/autocomplete';

// Bias search toward Indore bbox
const INDORE_LAT = 22.7196;
const INDORE_LON = 75.8577;

// ── Route config ──────────────────────────────────────────────
const ROUTE_CFG = {
  fastest: {
    label: 'Fastest',
    desc: 'Minimum travel time',
    color: '#f0a500',
    weight: 4,
    icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
             <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
           </svg>`,
  },
  least_signal: {
    label: 'Least Signals',
    desc: 'Fewer traffic lights',
    color: '#e05555',
    weight: 4,
    icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
             <rect x="9" y="2" width="6" height="20" rx="3"/>
             <circle cx="12" cy="7" r="1.5" fill="currentColor"/>
             <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
             <circle cx="12" cy="17" r="1.5" fill="currentColor"/>
           </svg>`,
  },
  least_pollution: {
    label: 'Cleanest Air',
    desc: 'Lowest pollution exposure',
    color: '#22c55e',
    weight: 4,
    icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
             <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
           </svg>`,
  },
  overall_best: {
    label: 'Best Overall',
    desc: 'Balanced across all factors',
    color: '#7c6aff',
    weight: 5,
    icon: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
             <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
           </svg>`,
  },
};

const AQI_MAP = {
  'Good': 'aqi-1', 'Fair': 'aqi-2', 'Moderate': 'aqi-3',
  'Poor': 'aqi-4', 'Very Poor': 'aqi-5',
};

// ── State ─────────────────────────────────────────────────────
let map = null;
let tileLayer = null;
let polylines = {};
let signalLayer = null;
let markers = { origin: null, dest: null };
let routeData = {};
let activeKey = null;
let originCoords = null;
let destCoords = null;
let sugTimers = {};
let isDark = true;

// ============================================================
// THEME + TILES
// ============================================================

const MAPTILER_KEY = 'API HERE';
const MAPTILER_STYLE = {
  dark: 'dataviz-dark',
  light: 'dataviz',
};

const CARTO_TILES = {
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
};

function buildTileLayer(dark, onError) {
  const style = dark ? MAPTILER_STYLE.dark : MAPTILER_STYLE.light;
  const url = `https://api.maptiler.com/maps/${style}/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`;
  const attr = '&copy; <a href="https://www.maptiler.com/">MapTiler</a> &copy; <a href="https://osm.org/copyright">OSM</a>';

  const layer = L.tileLayer(url, {
    attribution: attr,
    tileSize: 512,
    zoomOffset: -1,
    maxZoom: 20,
    crossOrigin: true,
  });

  let fell = false;
  layer.on('tileerror', () => {
    if (fell) return;
    fell = true;
    console.warn('[EUDORA] MapTiler unavailable — falling back to CartoDB');
    onError(dark);
  });

  return layer;
}

function applyTheme(dark) {
  isDark = dark;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  if (tileLayer && map) map.removeLayer(tileLayer);

  if (!MAPTILER_KEY || MAPTILER_KEY === 'YOUR_MAPTILER_KEY') {
    _applyCartoFallback(dark);
    return;
  }

  tileLayer = buildTileLayer(dark, _applyCartoFallback);
  tileLayer.addTo(map);
}

function _applyCartoFallback(dark) {
  if (tileLayer && map) map.removeLayer(tileLayer);
  const attr = '&copy; <a href="https://osm.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';
  tileLayer = L.tileLayer(dark ? CARTO_TILES.dark : CARTO_TILES.light, {
    attribution: attr,
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);
}

// ============================================================
// MAP
// ============================================================

function initMap() {
  map = L.map('map', {
    center: [INDORE_LAT, INDORE_LON],
    zoom: 13,
    zoomControl: false,
  });
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  applyTheme(true);
}

// ============================================================
// GLOWING POLYLINES
// ============================================================

function injectGlowFilter(key, color) {
  const id = `ef-${key}`;
  const svg = document.querySelector('.leaflet-overlay-pane svg');
  if (!svg || document.getElementById(id)) return;

  let defs = svg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }

  const f = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
  f.setAttribute('id', id);
  f.setAttribute('x', '-60%'); f.setAttribute('y', '-60%');
  f.setAttribute('width', '220%'); f.setAttribute('height', '220%');
  f.innerHTML = `
    <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b"/>
    <feColorMatrix in="b" type="matrix"
      values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -7" result="g"/>
    <feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge>
  `;
  defs.appendChild(f);
}

function animateDraw(poly) {
  const el = poly.getElement();
  if (!el) return;
  const len = el.getTotalLength ? el.getTotalLength() : 4000;
  el.style.transition = 'none';
  el.style.strokeDasharray = len;
  el.style.strokeDashoffset = len;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.style.transition = 'stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1)';
    el.style.strokeDashoffset = '0';
  }));
}

function clearPolylines() {
  Object.values(polylines).forEach(({ glow, line }) => {
    if (glow) glow.remove();
    if (line) line.remove();
  });
  polylines = {};
}

function drawRoutes(data) {
  clearPolylines();
  const order = ['fastest', 'least_signal', 'least_pollution', 'overall_best'];
  const bounds = L.latLngBounds();

  // Draw inactive routes first (below active)
  order.forEach(key => {
    const route = data[key];
    const cfg = ROUTE_CFG[key];
    if (!route) return;

    const coords = route.route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    coords.forEach(c => bounds.extend(c));

    // White border underline for depth
    const borderPoly = L.polyline(coords, {
      color: '#ffffff',
      weight: cfg.weight + 4,
      opacity: 0.15,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    // Main line
    const linePoly = L.polyline(coords, {
      color: cfg.color,
      weight: cfg.weight + 1,
      opacity: 0.45,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    linePoly.on('click', () => selectRoute(key));
    borderPoly.on('click', () => selectRoute(key));

    polylines[key] = { glow: borderPoly, line: linePoly };
  });

  map.fitBounds(bounds, { padding: [64, 64] });
}

function activatePolyline(key) {
  Object.entries(polylines).forEach(([k, { glow, line }]) => {
    const cfg = ROUTE_CFG[k];
    const isActive = k === key;

    if (isActive) {
      // Active: thick white border + vivid color on top
      glow.setStyle({ opacity: 0.3, weight: cfg.weight + 6 });
      line.setStyle({ opacity: 1, weight: cfg.weight + 2 });
      glow.bringToFront();
      line.bringToFront();
      animateDraw(line);
    } else {
      // Inactive: thin, muted but visible
      glow.setStyle({ opacity: 0.08, weight: cfg.weight + 4 });
      line.setStyle({ opacity: 0.3, weight: cfg.weight });
    }
  });
}

// ============================================================
// SIGNAL MARKERS
// ============================================================

function signalIcon() {
  const color = '#e05555';
  return L.divIcon({
    className: '',
    html: `<div style="
      width:9px;height:9px;
      background:${color};
      border-radius:50%;
      border:1.5px solid ${color}55;
      box-shadow:0 0 10px ${color}cc,0 0 4px ${color},0 0 16px ${color}88;
    "></div>`,
    iconSize: [9, 9],
    iconAnchor: [4.5, 4.5],
  });
}

function renderSignals(coords) {
  if (signalLayer) { signalLayer.remove(); signalLayer = null; }
  if (!coords?.length) return;
  signalLayer = L.layerGroup();
  coords.forEach(s => {
    L.marker([s.lat, s.lng], { icon: signalIcon() })
      .bindTooltip('Traffic Signal', {
        direction: 'top', offset: [0, -8], className: 'signal-tip',
      })
      .addTo(signalLayer);
  });
  signalLayer.addTo(map);
}

// ============================================================
// PIN MARKERS
// ============================================================

function pinIcon(color, letter) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:30px;height:30px;
      background:${color};
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      border:2px solid rgba(255,255,255,0.85);
      box-shadow:0 0 14px ${color}99,0 3px 12px rgba(0,0,0,0.4);
      display:flex;align-items:center;justify-content:center;
    "><span style="
      transform:rotate(45deg);
      font-family:'Archivo Black',sans-serif;
      font-size:10px;color:#fff;
      display:block;line-height:30px;text-align:center;
    ">${letter}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  });
}

function placeMarkers() {
  if (markers.origin) markers.origin.remove();
  if (markers.dest) markers.dest.remove();
  if (originCoords)
    markers.origin = L.marker([originCoords.lat, originCoords.lon],
      { icon: pinIcon('#7c6aff', 'A') }).addTo(map);
  if (destCoords)
    markers.dest = L.marker([destCoords.lat, destCoords.lon],
      { icon: pinIcon('#f0a500', 'B') }).addTo(map);
}

// ============================================================
// GPS — USE DEVICE LOCATION
// ============================================================

function useMyLocation() {
  const btn = document.getElementById('gps-btn');

  if (!navigator.geolocation) {
    toast('Geolocation is not supported by your browser.');
    return;
  }

  // Show loading state on button
  btn.style.opacity = '0.4';
  btn.style.pointerEvents = 'none';

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: lat, longitude: lon } = pos.coords;

      // Reverse geocode to get human-readable address
      try {
        const res = await fetch(
          `https://us1.locationiq.com/v1/reverse?key=${LOCATIONIQ_TOKEN}&lat=${lat}&lon=${lon}&format=json`
        );
        const data = await res.json();
        const parts = (data.display_name || '').split(',');
        const label = parts.slice(0, 2).join(', ').trim() || 'My Location';
        document.getElementById('input-origin').value = label;
      } catch {
        document.getElementById('input-origin').value = 'My Location';
      }

      originCoords = { lat, lon };
      placeMarkers();
      map.setView([lat, lon], 15);
      toast('📍 Location detected.');

      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
    },
    (err) => {
      const messages = {
        1: 'Location access denied. Please allow location in browser settings.',
        2: 'Location unavailable. Try again.',
        3: 'Location request timed out. Try again.',
      };
      toast(messages[err.code] || 'Could not get your location.');
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
  );
}

// ============================================================
// CARDS
// ============================================================

function fmtTime(m) {
  if (m < 60) return `${Math.round(m)}m`;
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  return r ? `${h}h ${r}m` : `${h}h`;
}

function renderCards(data) {
  const container = document.getElementById('cards');
  container.innerHTML = '';

  ['fastest', 'least_signal', 'least_pollution', 'overall_best'].forEach(key => {
    const route = data[key];
    const cfg = ROUTE_CFG[key];
    if (!route) return;

    const card = document.createElement('div');
    card.className = 'rcard';
    card.dataset.key = key;
    card.style.setProperty('--accent', cfg.color);

    card.innerHTML = `
      <div class="card-head">
        <div class="card-identity">
          <div class="card-ico">${cfg.icon}</div>
          <div>
            <div class="card-name">${cfg.label}</div>
            <div class="card-desc">${cfg.desc}</div>
          </div>
        </div>
        <div class="card-time">
          <div class="card-time-val">${fmtTime(route.time_min)}</div>
          <div class="card-time-unit">est. time</div>
        </div>
      </div>
      <div class="card-stats">
        <div class="stat-chip">
          <div class="stat-val">${route.distance_km}</div>
          <div class="stat-lbl">km</div>
        </div>
        <div class="stat-chip">
          <div class="stat-val">${route.signals}</div>
          <div class="stat-lbl">signals</div>
        </div>
        <div class="stat-chip">
          <div class="stat-val">${route.pollution_score}</div>
          <div class="stat-lbl">pollution</div>
        </div>
      </div>
      <span class="aqi-pill ${AQI_MAP[route.aqi_label] || 'aqi-3'}">
        <svg width="5" height="5" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="currentColor"/></svg>
        AQI ${route.aqi_index} — ${route.aqi_label}
      </span>
    `;

    card.addEventListener('click', () => selectRoute(key));
    container.appendChild(card);
  });
}

function selectRoute(key) {
  activeKey = key;

  document.querySelectorAll('.rcard').forEach(c =>
    c.classList.toggle('active', c.dataset.key === key)
  );

  activatePolyline(key);
  renderSignals((routeData[key] || {}).signal_coords || []);

  const route = routeData[key];
  const cfg = ROUTE_CFG[key];
  if (!route || !cfg) return;

  const pill = document.getElementById('active-pill');
  pill.style.display = 'flex';

  document.getElementById('pill-color').style.background = cfg.color;
  document.getElementById('pill-name').textContent = cfg.label;

  document.getElementById('pill-stats').innerHTML = `
    <div class="pill-stat">
      <div class="pill-dot" style="background:${cfg.color};box-shadow:0 0 5px ${cfg.color}"></div>
      ${fmtTime(route.time_min)}
    </div>
    <div class="pill-stat">${route.distance_km} km</div>
    <div class="pill-stat">${route.signals} signals</div>
    <div class="pill-stat">AQI ${route.aqi_index}</div>
  `;
}

// ============================================================
// LOCATIONIQ SEARCH
// ============================================================

async function searchLocationIQ(q) {
  if (!q || q.length < 3) return [];
  try {
    const params = new URLSearchParams({
      key: LOCATIONIQ_TOKEN,
      q: q,
      limit: 6,
      dedupe: 1,
      'accept-language': 'en',
      countrycodes: 'in',
      lat: INDORE_LAT,
      lon: INDORE_LON,
    });
    const res = await fetch(`${LOCATIONIQ_URL}?${params}`);
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

function setupSearch(inputId, sugId, onSelect, clearBtnId) {
  const input = document.getElementById(inputId);
  const sug = document.getElementById(sugId);
  const clearBtn = document.getElementById(clearBtnId);

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      input.value = '';
      onSelect(null);
      closeSug(sug);
      input.focus();
    });
  }

  input.addEventListener('input', () => {
    clearTimeout(sugTimers[inputId]);
    const q = input.value.trim();
    if (q.length < 3) { closeSug(sug); return; }

    sugTimers[inputId] = setTimeout(async () => {
      const results = await searchLocationIQ(q);
      if (!results?.length) { closeSug(sug); return; }

      sug.innerHTML = '';
      results.forEach(item => {
        const addr = item.address || {};
        const main = item.display_place || item.display_name.split(',')[0];
        const subParts = [addr.suburb, addr.city_district, addr.city].filter(Boolean).slice(0, 2);
        const sub = subParts.join(', ');

        const div = document.createElement('div');
        div.className = 'sug-item';
        div.innerHTML = `
          <svg class="sug-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
          </svg>
          <div>
            <div class="sug-main">${main}</div>
            ${sub ? `<div class="sug-sub">${sub}</div>` : ''}
          </div>
        `;
        div.addEventListener('mousedown', e => {
          e.preventDefault();
          input.value = main + (sub ? `, ${sub}` : '');
          onSelect({ lat: parseFloat(item.lat), lon: parseFloat(item.lon) });
          closeSug(sug);
        });
        sug.appendChild(div);
      });

      sug.classList.add('open');
    }, 250);
  });

  input.addEventListener('blur', () => setTimeout(() => closeSug(sug), 160));
}

function closeSug(el) {
  el.classList.remove('open');
  el.innerHTML = '';
}

// ============================================================
// SEARCH HANDLER
// ============================================================

async function handleSearch() {
  if (!originCoords || !destCoords) {
    toast('Select both locations from the suggestions dropdown.');
    return;
  }

  setState('loading');

  try {
    const url = `${API_BASE}/api/get-routes` +
      `?start_lat=${originCoords.lat}&start_lng=${originCoords.lon}` +
      `&end_lat=${destCoords.lat}&end_lng=${destCoords.lon}`;

    const res = await fetch(url);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.detail || `HTTP ${res.status}`);
    }

    const data = await res.json();
    routeData = data;

    setState('results');
    renderCards(data);
    drawRoutes(data);
    placeMarkers();

    setTimeout(() => selectRoute('overall_best'), 130);

  } catch (err) {
    setState('empty');
    toast(`Error: ${err.message}`);
  }
}

// ============================================================
// STATE
// ============================================================

function setState(s) {
  document.getElementById('empty-state').style.display = s === 'empty' ? 'flex' : 'none';
  document.getElementById('loading-state').style.display = s === 'loading' ? 'flex' : 'none';
  if (s === 'loading') document.getElementById('cards').innerHTML = '';
  document.getElementById('go-btn').disabled = s === 'loading';
  if (s !== 'results') document.getElementById('active-pill').style.display = 'none';
}

// ============================================================
// TOAST
// ============================================================

function toast(msg) {
  const old = document.getElementById('_toast');
  if (old) old.remove();
  const t = document.createElement('div');
  t.id = '_toast';
  Object.assign(t.style, {
    position: 'fixed',
    bottom: '28px',
    right: '22px',
    zIndex: '9999',
    background: 'var(--bg-card)',
    border: '1px solid var(--border-2)',
    color: 'var(--text-1)',
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: '11px',
    letterSpacing: '0.3px',
    padding: '11px 16px',
    borderRadius: '8px',
    boxShadow: 'var(--shadow-card)',
    maxWidth: '280px',
    lineHeight: '1.6',
  });
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t?.remove(), 4000);
}

// ============================================================
// CLOCK
// ============================================================

function startClock() {
  const el = document.getElementById('footer-clock');
  if (!el) return;
  const tick = () => {
    const now = new Date();
    el.textContent = now.toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
  };
  tick();
  setInterval(tick, 1000);
}

// ============================================================
// BOOT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  startClock();

  setupSearch('input-origin', 'sug-origin', c => { originCoords = c; }, 'clear-origin');
  setupSearch('input-dest', 'sug-dest', c => { destCoords = c; }, 'clear-dest');

  document.getElementById('go-btn').addEventListener('click', handleSearch);
  document.getElementById('theme-toggle').addEventListener('click', () => applyTheme(!isDark));
  document.getElementById('gps-btn').addEventListener('click', useMyLocation);

  document.getElementById('swap-btn').addEventListener('click', () => {
    const oi = document.getElementById('input-origin');
    const di = document.getElementById('input-dest');
    [oi.value, di.value] = [di.value, oi.value];
    [originCoords, destCoords] = [destCoords, originCoords];
  });

  ['input-origin', 'input-dest'].forEach(id =>
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') handleSearch();
    })
  );
});
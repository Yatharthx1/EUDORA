/* ============================================================
   EUDORA — app.js
   LocationIQ geocoding · Leaflet · Glowing animated routes
   ============================================================ */

const API_BASE = 'https://theyath-eudora.hf.space';

// ── LocationIQ ────────────────────────────────────────────────
// Replace with your LocationIQ token from https://locationiq.com
// Geocoding is proxied through the backend — no keys in frontend

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
let allSignalLayer = null;
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

// Map tiles: MapTiler (proxied) → Ola Maps → CartoDB
const MAPTILER_STYLE = {
  dark: 'dataviz-dark',
  light: 'dataviz',
};

// Ola Maps raster tiles (no key needed for basic OSM style)
const OLA_TILES = {
  dark:  'https://api.olamaps.io/tiles/vector/v1/styles/default-dark-standard/style.json',
  light: 'https://api.olamaps.io/tiles/vector/v1/styles/default-light-standard/style.json',
};

// Ola Maps raster fallback (standard raster endpoint)
const OLA_RASTER = {
  dark:  'https://api.olamaps.io/tiles/v1/styles/default-dark-standard/{z}/{x}/{y}.png',
  light: 'https://api.olamaps.io/tiles/v1/styles/default-light-standard/{z}/{x}/{y}.png',
};

const CARTO_TILES = {
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
};

function buildTileLayer(dark, onError) {
  const style = dark ? MAPTILER_STYLE.dark : MAPTILER_STYLE.light;
  const url = `${API_BASE}/api/tiles/${style}/{z}/{x}/{y}.png`;
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
    console.warn('[EUDORA] MapTiler unavailable — falling back to Ola Maps');
    onError(dark);
  });

  return layer;
}

function applyTheme(dark) {
  isDark = dark;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  if (tileLayer && map) map.removeLayer(tileLayer);

  // Chain: MapTiler → CartoDB
  tileLayer = buildTileLayer(dark, _applyCartoFallback);
  tileLayer.addTo(map);
}

function _applyCartoFallback(dark) {
  if (tileLayer && map) map.removeLayer(tileLayer);
  console.warn('[EUDORA] Using CartoDB tiles (final fallback)');
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

async function fetchAllSignals() {
  try {
    const res = await fetch(`${API_BASE}/api/get-signals`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const coords = data.signals || [];
    // Render into a dedicated layer that route selection never clears
    if (allSignalLayer) { allSignalLayer.remove(); allSignalLayer = null; }
    allSignalLayer = L.layerGroup();
    coords.forEach(s => {
      L.marker([s.lat, s.lng], { icon: signalIcon() })
        .bindTooltip('Traffic Signal', {
          direction: 'top', offset: [0, -8], className: 'signal-tip',
        })
        .addTo(allSignalLayer);
    });
    allSignalLayer.addTo(map);
    console.log(`[EUDORA] Loaded ${coords.length} signals`);
  } catch (e) {
    console.warn('[EUDORA] Could not load signals:', e.message);
  }
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
      smoothFactor: 0,   // disable point simplification — prevents segments snapping apart on zoom
      noClip: true,      // don't clip at viewport edge — prevents breaks at tile boundaries on zoom
    }).addTo(map);

    // Main line
    const linePoly = L.polyline(coords, {
      color: cfg.color,
      weight: cfg.weight + 1,
      opacity: 0.45,
      lineCap: 'round',
      lineJoin: 'round',
      smoothFactor: 0,   // disable point simplification — prevents segments snapping apart on zoom
      noClip: true,      // don't clip at viewport edge — prevents breaks at tile boundaries on zoom
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
          `${API_BASE}/api/reverse?lat=${lat}&lon=${lon}`
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

  // Show start button
  let startBtn = document.getElementById('start-nav-btn');
  if (!startBtn) {
    startBtn = document.createElement('button');
    startBtn.id = 'start-nav-btn';
    startBtn.className = 'start-nav-btn';
    startBtn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      START NAVIGATION
    `;
    startBtn.addEventListener('click', startNavigation);
    document.getElementById('cards').appendChild(startBtn);
  }
  startBtn.style.setProperty('--accent', cfg.color);
}

// ============================================================
// LOCATIONIQ SEARCH
// ============================================================

async function searchGeocode(q) {
  if (!q || q.length < 3) return [];
  try {
    const params = new URLSearchParams({ q });
    const res = await fetch(`${API_BASE}/api/geocode?${params}`);
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
      const results = await searchGeocode(q);
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
    }, 350);
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
    ProgressBar.finish();
    renderCards(data);
    drawRoutes(data);
    placeMarkers();

    setTimeout(() => selectRoute('overall_best'), 130);

  } catch (err) {
    setState('empty');
    ProgressBar.fail();
    toast(`Error: ${err.message}`);
  }
}


// ============================================================
// PROGRESS BAR
// ============================================================

const ProgressBar = (() => {
  let el = null;
  let timer = null;
  let current = 0;

  function _getEl() {
    if (!el) {
      el = document.createElement('div');
      el.id = '_progress';
      Object.assign(el.style, {
        position: 'fixed',
        top: '0', left: '0',
        height: '2px',
        width: '0%',
        background: 'var(--gold)',
        zIndex: '99999',
        transition: 'width 0.3s ease, opacity 0.4s ease',
        boxShadow: '0 0 8px var(--gold)',
        borderRadius: '0 2px 2px 0',
        opacity: '1',
        pointerEvents: 'none',
      });
      document.body.appendChild(el);
    }
    return el;
  }

  function start() {
    clearInterval(timer);
    current = 0;
    const bar = _getEl();
    bar.style.opacity = '1';
    bar.style.transition = 'width 0.3s ease, opacity 0.4s ease';
    bar.style.width = '0%';

    // Slowly crawl to 85% — never completes on its own
    timer = setInterval(() => {
      if (current < 85) {
        // Slows down as it approaches 85
        const step = (85 - current) * 0.06;
        current = Math.min(current + step, 85);
        bar.style.width = current + '%';
      }
    }, 120);
  }

  function finish() {
    clearInterval(timer);
    const bar = _getEl();
    bar.style.width = '100%';
    setTimeout(() => {
      bar.style.opacity = '0';
      setTimeout(() => { bar.style.width = '0%'; }, 400);
    }, 250);
  }

  function fail() {
    clearInterval(timer);
    const bar = _getEl();
    bar.style.background = '#e05555';
    bar.style.boxShadow = '0 0 8px #e05555';
    bar.style.width = '100%';
    setTimeout(() => {
      bar.style.opacity = '0';
      setTimeout(() => {
        bar.style.width = '0%';
        bar.style.background = 'var(--gold)';
        bar.style.boxShadow = '0 0 8px var(--gold)';
      }, 400);
    }, 400);
  }

  return { start, finish, fail };
})();

// ============================================================
// STATE
// ============================================================

function setState(s) {
  document.getElementById('empty-state').style.display = s === 'empty' ? 'flex' : 'none';
  document.getElementById('loading-state').style.display = s === 'loading' ? 'flex' : 'none';
  if (s === 'loading') {
    document.getElementById('cards').innerHTML = '';
    ProgressBar.start();
  }
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

  // ── Mobile bottom sheet drag ──────────────────────────────────
  initDragPanel();
});

function initDragPanel() {
  if (window.innerWidth > 680) return;

  const panel = document.querySelector('.panel');
  if (!panel) return;

  // Inject drag handle div
  const handle = document.createElement('div');
  handle.className = 'drag-handle';
  panel.insertBefore(handle, panel.firstChild);

  const minH = 120;          // collapsed: just enough to see inputs
  const maxH = window.innerHeight * 0.85;
  const defaultH = window.innerHeight * 0.50;

  panel.style.maxHeight = defaultH + 'px';
  panel.style.height = defaultH + 'px';
  panel.style.transition = 'height 0.2s ease';

  let startY = 0, startH = 0;

  function onStart(e) {
    startY = e.touches ? e.touches[0].clientY : e.clientY;
    startH = panel.offsetHeight;
    panel.classList.add('is-dragging');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  }

  function onMove(e) {
    if (e.cancelable) e.preventDefault();
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    const delta = startY - y;
    const newH = Math.min(maxH, Math.max(minH, startH + delta));
    panel.style.height = newH + 'px';
    panel.style.maxHeight = newH + 'px';
  }

  function onEnd() {
    panel.classList.remove('is-dragging');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);

    // Snap: if below 30% screen, collapse; above 70%, expand
    const h = panel.offsetHeight;
    panel.style.transition = 'height 0.25s ease, max-height 0.25s ease';
    if (h < window.innerHeight * 0.25) {
      panel.style.height = minH + 'px';
      panel.style.maxHeight = minH + 'px';
    } else if (h > window.innerHeight * 0.65) {
      panel.style.height = maxH + 'px';
      panel.style.maxHeight = maxH + 'px';
    }
    setTimeout(() => panel.style.transition = 'height 0.2s ease', 300);
  }

  handle.addEventListener('mousedown', onStart);
  handle.addEventListener('touchstart', onStart, { passive: true });
}

// ============================================================
// NAVIGATION MODE
// ============================================================

let navState = {
  active: false,
  watchId: null,
  userMarker: null,
  routeCoords: [],   // [[lat,lng], ...]
  totalDist: 0,      // km
  totalTime: 0,      // min
  offRouteCount: 0,
  lastHeading: 0,
};

// ── Haversine distance (km) between two [lat,lng] points ──────
function haversine([lat1, lon1], [lat2, lon2]) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
            Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Nearest point index on route ─────────────────────────────
function nearestPointIndex(pos, coords) {
  let minDist = Infinity, idx = 0;
  coords.forEach(([lat, lng], i) => {
    const d = haversine(pos, [lat, lng]);
    if (d < minDist) { minDist = d; idx = i; }
  });
  return { idx, dist: minDist };
}

// ── Remaining distance from index to end ─────────────────────
function remainingDistance(coords, fromIdx) {
  let d = 0;
  for (let i = fromIdx; i < coords.length - 1; i++) {
    d += haversine(coords[i], coords[i+1]);
  }
  return d;
}

// ── User position marker (directional arrow) ─────────────────
function userArrowIcon(heading) {
  const h = heading || 0;
  return L.divIcon({
    className: '',
    html: `<div style="
      width:44px; height:44px;
      display:flex; align-items:center; justify-content:center;
      transform: rotate(${h}deg);
      filter: drop-shadow(0 2px 8px rgba(59,130,246,0.6));
    ">
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
        <!-- Outer pulse ring -->
        <circle cx="22" cy="22" r="20" fill="rgba(59,130,246,0.15)" stroke="rgba(59,130,246,0.3)" stroke-width="1"/>
        <!-- Arrow body -->
        <polygon points="22,6 30,32 22,27 14,32" fill="#3b82f6"/>
        <polygon points="22,6 30,32 22,27 14,32" fill="url(#arrowGrad)"/>
        <!-- White center dot -->
        <circle cx="22" cy="22" r="3.5" fill="white"/>
        <defs>
          <linearGradient id="arrowGrad" x1="22" y1="6" x2="22" y2="32" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#60a5fa"/>
            <stop offset="100%" stop-color="#2563eb"/>
          </linearGradient>
        </defs>
      </svg>
    </div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

// ── Start navigation ──────────────────────────────────────────
function startNavigation() {
  if (!activeKey || !routeData[activeKey]) {
    toast('Select a route first.');
    return;
  }

  const route = routeData[activeKey];
  navState.routeCoords = route.route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  navState.totalDist = parseFloat(route.distance_km);
  navState.totalTime = route.time_min;
  navState.active = true;
  navState.offRouteCount = 0;

  // Switch panel to nav HUD
  showNavHUD();

  if (!navigator.geolocation) {
    toast('Geolocation not supported.');
    stopNavigation();
    return;
  }

  toast('Navigation started. Stay on route.');

  // Zoom in to street level for navigation
  if (originCoords) {
    map.flyTo([originCoords.lat, originCoords.lon], 17, {
      animate: true,
      duration: 1.2,
    });
  }

  navState.watchId = navigator.geolocation.watchPosition(
    onNavPosition,
    (err) => toast('GPS error: ' + err.message),
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
  );
}

// ── Handle each GPS update ────────────────────────────────────
function onNavPosition(pos) {
  const { latitude: lat, longitude: lng, heading } = pos.coords;
  const userPos = [lat, lng];
  const h = heading != null && !isNaN(heading) ? heading : (navState.lastHeading || 0);
  navState.lastHeading = h;

  // Find nearest point on route first so we can snap to road
  const { idx, dist } = nearestPointIndex(userPos, navState.routeCoords);

  // Snap marker to the route line; only use raw GPS if badly off-route (>80m)
  const snappedPos = dist < 0.08 ? navState.routeCoords[idx] : userPos;

  // Move or create arrow marker at snapped (on-road) position
  if (!navState.userMarker) {
    navState.userMarker = L.marker(snappedPos, {
      icon: userArrowIcon(h),
      zIndexOffset: 1000,
    }).addTo(map);
  } else {
    navState.userMarker.setLatLng(snappedPos);
    navState.userMarker.setIcon(userArrowIcon(h));
  }

  // Pan map to follow snapped position
  map.panTo(snappedPos, { animate: true, duration: 0.6 });

  // Off-route detection (>80m away)
  if (dist > 0.08) {
    navState.offRouteCount++;
    if (navState.offRouteCount >= 3) {
      navState.offRouteCount = 0;
      toast('📍 Off route — recalculating…');
      rerouteFromPosition(lat, lng);
      return;
    }
  } else {
    navState.offRouteCount = 0;
  }

  // Update ETA
  const remDist = remainingDistance(navState.routeCoords, idx);
  const avgSpeed = navState.totalDist > 0
    ? navState.totalDist / navState.totalTime
    : 0.5; // km/min fallback
  const remTime = remDist / avgSpeed;

  updateNavHUD(remDist);

  // Arrived?
  if (remDist < 0.05) {
    toast('✅ You have arrived!');
    stopNavigation();
  }
}

// ── Reroute from current position ────────────────────────────
async function rerouteFromPosition(lat, lng) {
  if (!destCoords) return;
  try {
    const url = `${API_BASE}/api/get-routes` +
      `?start_lat=${lat}&start_lng=${lng}` +
      `&end_lat=${destCoords.lat}&end_lng=${destCoords.lon}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Reroute failed');
    const data = await res.json();
    routeData = data;
    drawRoutes(data);
    selectRoute(activeKey in data ? activeKey : 'overall_best');
    const route = routeData[activeKey];
    navState.routeCoords = route.route.geometry.coordinates.map(([lng2, lat2]) => [lat2, lng2]);
    navState.totalDist = parseFloat(route.distance_km);
    navState.totalTime = route.time_min;
    toast('✅ Route updated.');
  } catch {
    toast('Could not reroute. Check connection.');
  }
}

// ── Stop navigation ───────────────────────────────────────────
function stopNavigation() {
  if (navState.watchId !== null) {
    navigator.geolocation.clearWatch(navState.watchId);
    navState.watchId = null;
  }
  if (navState.userMarker) {
    navState.userMarker.remove();
    navState.userMarker = null;
  }
  navState.active = false;
  hideNavHUD();
}

// ── Nav HUD DOM ───────────────────────────────────────────────
function showNavHUD() {
  // Hide normal results, show nav hud
  document.getElementById('results-section').style.display = 'none';
  document.getElementById('search-block').style.display = 'none';

  let hud = document.getElementById('nav-hud');
  if (!hud) {
    hud = document.createElement('div');
    hud.id = 'nav-hud';
    hud.innerHTML = `
      <div class="nav-hud-inner">
        <div class="nav-hud-header">
          <div class="nav-hud-label">NAVIGATING</div>
          <div class="nav-hud-route" id="nav-route-name"></div>
        </div>
        <div class="nav-hud-stats">
          <div class="nav-stat">
            <div class="nav-stat-val" id="nav-dist">—</div>
            <div class="nav-stat-lbl">remaining</div>
          </div>
        </div>
        <button class="nav-stop-btn" id="nav-stop-btn">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
          STOP
        </button>
      </div>
    `;
    document.querySelector('.panel').appendChild(hud);
    document.getElementById('nav-stop-btn').addEventListener('click', stopNavigation);
  }

  const cfg = ROUTE_CFG[activeKey];
  document.getElementById('nav-route-name').textContent = cfg.label;
  document.getElementById('nav-route-name').style.color = cfg.color;
  hud.style.display = 'flex';

  // Initial values
  const route = routeData[activeKey];
  updateNavHUD(parseFloat(route.distance_km));
}

function updateNavHUD(remDistKm) {
  const distEl = document.getElementById('nav-dist');
  if (!distEl) return;
  distEl.textContent = remDistKm < 1
    ? `${Math.round(remDistKm * 1000)}m`
    : `${remDistKm.toFixed(1)}km`;
}

function hideNavHUD() {
  const hud = document.getElementById('nav-hud');
  if (hud) hud.style.display = 'none';
  document.getElementById('results-section').style.display = '';
  document.getElementById('search-block').style.display = '';
}
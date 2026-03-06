/* ============================================================
   EUDORA — app.js
   Theme toggle + Leaflet + Nominatim + glowing animated routes
   ============================================================ */

const API_BASE  = 'http://localhost:8000';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const VIEWBOX   = '75.7,22.5,76.1,22.9';

const ROUTE_CFG = {
  fastest: {
    label: 'Fastest',
    desc:  'Minimum travel time',
    color: '#f5a623',
    weight: 4,
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
             <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
           </svg>`,
  },
  least_signal: {
    label: 'Least Signals',
    desc:  'Fewer traffic lights',
    color: '#0bbfb0',
    weight: 4,
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
             <rect x="9" y="2" width="6" height="20" rx="3"/>
             <circle cx="12" cy="7" r="1.5" fill="currentColor"/>
             <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
             <circle cx="12" cy="17" r="1.5" fill="currentColor"/>
           </svg>`,
  },
  least_pollution: {
    label: 'Cleanest Air',
    desc:  'Lowest pollution exposure',
    color: '#22c55e',
    weight: 4,
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
             <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
           </svg>`,
  },
  overall_best: {
    label: 'Best Overall',
    desc:  'Balanced across all factors',
    color: '#6366f1',
    weight: 5,
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
             <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
           </svg>`,
  },
};

const AQI_MAP = {
  'Good': 'aqi-1', 'Fair': 'aqi-2', 'Moderate': 'aqi-3',
  'Poor': 'aqi-4', 'Very Poor': 'aqi-5',
};

// ---- State ----
let map          = null;
let tileLayer    = null;
let polylines    = {};
let signalLayer  = null;
let markers      = { origin: null, dest: null };
let routeData    = {};
let activeKey    = null;
let originCoords = null;
let destCoords   = null;
let sugTimers    = {};
let isDark       = true;

// ============================================================
// THEME
// ============================================================

const TILES = {
  dark:  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
};

const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

function applyTheme(dark) {
  isDark = dark;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');

  if (tileLayer && map) {
    map.removeLayer(tileLayer);
  }

  tileLayer = L.tileLayer(dark ? TILES.dark : TILES.light, {
    attribution: TILE_ATTR,
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);
}

function toggleTheme() {
  applyTheme(!isDark);
}

// ============================================================
// MAP
// ============================================================

function initMap() {
  map = L.map('map', {
    center: [22.7196, 75.8577],
    zoom: 13,
    zoomControl: true,
  });

  applyTheme(true);
}

// ============================================================
// GLOWING POLYLINES
// Double layer: thick blurred glow + sharp line on top
// ============================================================

function injectGlowFilter(key, color) {
  const id  = `ef-${key}`;
  const svg = document.querySelector('.leaflet-overlay-pane svg');
  if (!svg) return;

  if (document.getElementById(id)) return;

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
    <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b"/>
    <feColorMatrix in="b" type="matrix"
      values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -6" result="g"/>
    <feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge>
  `;
  defs.appendChild(f);
}

function animateDraw(poly) {
  const el = poly.getElement();
  if (!el) return;
  const len = el.getTotalLength ? el.getTotalLength() : 4000;
  el.style.transition = 'none';
  el.style.strokeDasharray  = len;
  el.style.strokeDashoffset = len;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.style.transition = 'stroke-dashoffset 0.85s cubic-bezier(0.4,0,0.2,1)';
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
  const order  = ['fastest', 'least_signal', 'least_pollution', 'overall_best'];
  const bounds = L.latLngBounds();

  order.forEach(key => {
    const route = data[key];
    const cfg   = ROUTE_CFG[key];
    if (!route) return;

    const coords = route.route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    coords.forEach(c => bounds.extend(c));

    const glowPoly = L.polyline(coords, {
      color: cfg.color, weight: cfg.weight + 12,
      opacity: 0, lineCap: 'round', lineJoin: 'round',
    }).addTo(map);

    const linePoly = L.polyline(coords, {
      color: cfg.color, weight: cfg.weight,
      opacity: 0.15, lineCap: 'round', lineJoin: 'round',
    }).addTo(map);

    linePoly.on('click', () => selectRoute(key));
    glowPoly.on('click', () => selectRoute(key));

    polylines[key] = { glow: glowPoly, line: linePoly };
  });

  map.fitBounds(bounds, { padding: [60, 60] });

  // Inject SVG glow filters after DOM is ready
  requestAnimationFrame(() => {
    order.forEach(key => {
      const cfg = ROUTE_CFG[key];
      injectGlowFilter(key, cfg.color);
    });
  });
}

function activatePolyline(key) {
  Object.entries(polylines).forEach(([k, { glow, line }]) => {
    const cfg      = ROUTE_CFG[k];
    const isActive = k === key;

    if (isActive) {
      glow.setStyle({ opacity: 0.25, weight: cfg.weight + 16 });
      const ge = glow.getElement();
      if (ge) ge.style.filter = `url(#ef-${k})`;

      line.setStyle({ opacity: 1, weight: cfg.weight + 1.5 });
      glow.bringToFront();
      line.bringToFront();
      animateDraw(line);
    } else {
      glow.setStyle({ opacity: 0 });
      line.setStyle({ opacity: 0.1, weight: cfg.weight });
      const ge = glow.getElement();
      if (ge) ge.style.filter = '';
    }
  });
}

// ============================================================
// SIGNAL MARKERS
// ============================================================

function signalIcon() {
  const color = isDark ? '#f5a623' : '#d97706';
  return L.divIcon({
    className: '',
    html: `<div style="
      width:10px;height:10px;
      background:${color};
      border-radius:50%;
      border:2px solid ${color}44;
      box-shadow:0 0 8px ${color}cc, 0 0 3px ${color};
    "></div>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });
}

function renderSignals(coords) {
  if (signalLayer) { signalLayer.remove(); signalLayer = null; }
  if (!coords || !coords.length) return;
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
// MARKERS
// ============================================================

function pinIcon(color, letter) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:30px;height:30px;
      background:${color};
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      border:2.5px solid rgba(255,255,255,0.9);
      box-shadow:0 0 12px ${color}99,0 3px 10px rgba(0,0,0,0.35);
      display:flex;align-items:center;justify-content:center;
    "><span style="
      transform:rotate(45deg);font-family:'Syne',sans-serif;
      font-weight:800;font-size:11px;color:#fff;
      display:block;line-height:30px;text-align:center;
    ">${letter}</span></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
  });
}

function placeMarkers() {
  if (markers.origin) markers.origin.remove();
  if (markers.dest)   markers.dest.remove();
  if (originCoords)
    markers.origin = L.marker([originCoords.lat, originCoords.lon],
      { icon: pinIcon('#6366f1', 'A') }).addTo(map);
  if (destCoords)
    markers.dest = L.marker([destCoords.lat, destCoords.lon],
      { icon: pinIcon('#f5a623', 'B') }).addTo(map);
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
    const cfg   = ROUTE_CFG[key];
    if (!route) return;

    const card = document.createElement('div');
    card.className  = 'rcard';
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
        <svg width="6" height="6" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="currentColor"/></svg>
        AQI ${route.aqi_index} &mdash; ${route.aqi_label}
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
  const cfg   = ROUTE_CFG[key];
  if (!route || !cfg) return;

  const pill = document.getElementById('active-pill');
  pill.style.display = 'flex';
  document.getElementById('pill-name').textContent = cfg.label + ' Route';
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
// NOMINATIM
// ============================================================

async function searchNominatim(q) {
  if (!q || q.length < 3) return [];
  try {
    const url = `${NOMINATIM}?q=${encodeURIComponent(q)}&format=json&limit=5&viewbox=${VIEWBOX}&bounded=0&addressdetails=1&countrycodes=in`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    return await res.json();
  } catch { return []; }
}

function setupSearch(inputId, sugId, onSelect) {
  const input = document.getElementById(inputId);
  const sug   = document.getElementById(sugId);

  input.addEventListener('input', () => {
    clearTimeout(sugTimers[inputId]);
    const q = input.value.trim();
    if (q.length < 3) { closeSug(sug); return; }

    sugTimers[inputId] = setTimeout(async () => {
      const results = await searchNominatim(q);
      if (!results.length) { closeSug(sug); return; }

      sug.innerHTML = '';
      results.forEach(item => {
        const addr = item.address || {};
        const main = item.name || addr.road || item.display_name.split(',')[0];
        const sub  = [addr.suburb, addr.city_district, addr.city].filter(Boolean).slice(0,2).join(', ');
        const div  = document.createElement('div');
        div.className = 'sug-item';
        div.innerHTML = `<strong>${main}</strong>${sub ? `<br><span style="font-size:10.5px;opacity:0.65">${sub}</span>` : ''}`;
        div.addEventListener('mousedown', e => {
          e.preventDefault();
          input.value = main + (sub ? `, ${sub}` : '');
          onSelect({ lat: parseFloat(item.lat), lon: parseFloat(item.lon) });
          closeSug(sug);
        });
        sug.appendChild(div);
      });
      sug.classList.add('open');
    }, 280);
  });

  input.addEventListener('blur', () => setTimeout(() => closeSug(sug), 150));
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
    toast('Select both locations from the dropdown suggestions.');
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

    setTimeout(() => selectRoute('overall_best'), 120);

  } catch (err) {
    setState('empty');
    toast(`Error: ${err.message}`);
  }
}

// ============================================================
// HELPERS
// ============================================================

function setState(s) {
  document.getElementById('empty-state').style.display   = s === 'empty'   ? 'flex'  : 'none';
  document.getElementById('loading-state').style.display = s === 'loading' ? 'flex'  : 'none';
  if (s === 'loading') document.getElementById('cards').innerHTML = '';
  document.getElementById('go-btn').disabled = s === 'loading';
  if (s !== 'results') document.getElementById('active-pill').style.display = 'none';
}

function toast(msg) {
  const old = document.getElementById('_toast');
  if (old) old.remove();
  const t = document.createElement('div');
  t.id = '_toast';
  Object.assign(t.style, {
    position: 'fixed', bottom: '28px', right: '22px', zIndex: '9999',
    background: 'var(--bg-card)', border: '1px solid var(--border-2)',
    color: 'var(--text-1)', fontFamily: "'DM Sans',sans-serif",
    fontSize: '12.5px', padding: '11px 16px', borderRadius: '10px',
    boxShadow: 'var(--shadow-card)', maxWidth: '280px', lineHeight: '1.5',
  });
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// ============================================================
// BOOT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initMap();

  setupSearch('input-origin', 'sug-origin', c => { originCoords = c; });
  setupSearch('input-dest',   'sug-dest',   c => { destCoords   = c; });

  document.getElementById('go-btn').addEventListener('click', handleSearch);
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  document.getElementById('swap-btn').addEventListener('click', () => {
    const oi = document.getElementById('input-origin');
    const di = document.getElementById('input-dest');
    [oi.value, di.value]       = [di.value, oi.value];
    [originCoords, destCoords] = [destCoords, originCoords];
  });

  ['input-origin', 'input-dest'].forEach(id =>
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') handleSearch();
    })
  );
});
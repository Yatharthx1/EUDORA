/* ================================================
   Eudora- app.js
   Leaflet map + Nominatim geocoding + route display
   No API keys required
   ================================================ */

const API_BASE = 'http://localhost:8000';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

// Indore bounding box for Nominatim bias
const INDORE_VIEWBOX = '75.7,22.5,76.1,22.9';

const ROUTES = {
  fastest: {
    label:   'Fastest',
    desc:    'Minimum travel time',
    color:   '#f0a500',
    cssVar:  '--fastest',
    weight:  5,
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
             <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
           </svg>`,
  },
  least_signal: {
    label:   'Least Signals',
    desc:    'Fewer traffic lights',
    color:   '#00c2cc',
    cssVar:  '--signal',
    weight:  5,
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
             <rect x="9" y="2" width="6" height="20" rx="3"/>
             <circle cx="12" cy="7" r="1.5" fill="currentColor"/>
             <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
             <circle cx="12" cy="17" r="1.5" fill="currentColor"/>
           </svg>`,
  },
  least_pollution: {
    label:   'Cleanest Air',
    desc:    'Lowest pollution exposure',
    color:   '#00c97a',
    cssVar:  '--pollution',
    weight:  5,
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
             <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
           </svg>`,
  },
  overall_best: {
    label:   'Best Overall',
    desc:    'Balanced across all factors',
    color:   '#8b7cf8',
    cssVar:  '--best',
    weight:  6,
    icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
             <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
           </svg>`,
  },
};

const AQI_CLASS = {
  'Good': 'aqi-1', 'Fair': 'aqi-2', 'Moderate': 'aqi-3',
  'Poor': 'aqi-4', 'Very Poor': 'aqi-5',
};

// ------------------------------------------------
// State
// ------------------------------------------------

let map = null;
let polylines = {};
let markers = { origin: null, dest: null };
let activeKey = null;
let routeData = {};
let originCoords = null;
let destCoords = null;
let suggestTimers = {};

// ------------------------------------------------
// Map init
// ------------------------------------------------

function initMap() {
  map = L.map('map', {
    center: [22.7196, 75.8577],
    zoom: 13,
    zoomControl: true,
  });

  // CartoDB dark tiles - free, no key
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);
}

// ------------------------------------------------
// Nominatim geocoding
// ------------------------------------------------

async function searchNominatim(query) {
  if (!query || query.length < 3) return [];
  try {
    const url = `${NOMINATIM}?q=${encodeURIComponent(query)}&format=json&limit=5&viewbox=${INDORE_VIEWBOX}&bounded=0&addressdetails=1&countrycodes=in`;
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en' }
    });
    return await res.json();
  } catch (e) {
    console.error('Nominatim error:', e);
    return [];
  }
}

function formatSugLabel(item) {
  const addr = item.address || {};
  const main = item.name || addr.road || addr.suburb || item.display_name.split(',')[0];
  const sub  = [addr.suburb, addr.city_district, addr.city]
    .filter(Boolean).slice(0, 2).join(', ');
  return { main, sub };
}

function setupSearch(inputId, sugId, onSelect) {
  const input = document.getElementById(inputId);
  const sug   = document.getElementById(sugId);

  input.addEventListener('input', () => {
    clearTimeout(suggestTimers[inputId]);
    const q = input.value.trim();
    if (q.length < 3) { closeSug(sug); return; }

    suggestTimers[inputId] = setTimeout(async () => {
      const results = await searchNominatim(q);
      if (!results.length) { closeSug(sug); return; }

      sug.innerHTML = '';
      results.forEach(item => {
        const { main, sub } = formatSugLabel(item);
        const div = document.createElement('div');
        div.className = 'sug-item';
        div.innerHTML = `<strong>${main}</strong>${sub ? '<br><span style="font-size:10.5px;opacity:0.7">' + sub + '</span>' : ''}`;
        div.addEventListener('mousedown', e => {
          e.preventDefault();
          input.value = main + (sub ? ', ' + sub : '');
          onSelect({ lat: parseFloat(item.lat), lon: parseFloat(item.lon), label: input.value });
          closeSug(sug);
        });
        sug.appendChild(div);
      });
      sug.classList.add('open');
    }, 280);
  });

  input.addEventListener('blur', () => {
    setTimeout(() => closeSug(sug), 150);
  });
}

function closeSug(el) {
  el.classList.remove('open');
  el.innerHTML = '';
}

// ------------------------------------------------
// Markers
// ------------------------------------------------

function makeIcon(color, letter) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:28px;height:28px;
      background:${color};
      border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      border:2px solid rgba(255,255,255,0.9);
      box-shadow:0 3px 12px rgba(0,0,0,0.5);
      display:flex;align-items:center;justify-content:center;
    "><span style="
      transform:rotate(45deg);
      font-family:Syne,sans-serif;
      font-weight:800;font-size:11px;
      color:#fff;display:block;
      line-height:28px;text-align:center;
    ">${letter}</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
}

function placeMarkers() {
  if (markers.origin) markers.origin.remove();
  if (markers.dest)   markers.dest.remove();
  if (originCoords) {
    markers.origin = L.marker([originCoords.lat, originCoords.lon], { icon: makeIcon('#8b7cf8', 'A') }).addTo(map);
  }
  if (destCoords) {
    markers.dest = L.marker([destCoords.lat, destCoords.lon], { icon: makeIcon('#f0a500', 'B') }).addTo(map);
  }
}

// ------------------------------------------------
// Polylines
// ------------------------------------------------

function clearPolylines() {
  Object.values(polylines).forEach(p => p.remove());
  polylines = {};
}

function drawRoutes(data) {
  clearPolylines();
  const order = ['fastest', 'least_signal', 'least_pollution', 'overall_best'];
  const bounds = L.latLngBounds();

  order.forEach(key => {
    const route = data[key];
    if (!route) return;
    const cfg = ROUTES[key];
    const coords = route.route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    coords.forEach(c => bounds.extend(c));

    const poly = L.polyline(coords, {
      color:   cfg.color,
      weight:  cfg.weight,
      opacity: 0.2,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    poly.on('click', () => selectRoute(key));
    polylines[key] = poly;
  });

  map.fitBounds(bounds, { padding: [50, 50] });
}

function activatePolyline(key) {
  Object.entries(polylines).forEach(([k, poly]) => {
    const cfg = ROUTES[k];
    const isActive = k === key;
    poly.setStyle({
      opacity: isActive ? 0.95 : 0.15,
      weight:  isActive ? (cfg.weight + 2) : cfg.weight,
    });
    if (isActive) poly.bringToFront();
  });
}

// ------------------------------------------------
// Route cards
// ------------------------------------------------

function formatTime(mins) {
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60), m = Math.round(mins % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

function renderCards(data) {
  const container = document.getElementById('cards');
  container.innerHTML = '';

  const order = ['fastest', 'least_signal', 'least_pollution', 'overall_best'];

  order.forEach(key => {
    const route = data[key];
    const cfg   = ROUTES[key];
    if (!route) return;

    const aqiCls = AQI_CLASS[route.aqi_label] || 'aqi-3';

    const card = document.createElement('div');
    card.className = 'rcard';
    card.dataset.key = key;
    card.style.setProperty('--c', cfg.color);

    card.innerHTML = `
      <div class="card-top">
        <div class="card-meta">
          <div class="card-ico">${cfg.icon}</div>
          <div>
            <div class="card-name">${cfg.label}</div>
            <div class="card-desc">${cfg.desc}</div>
          </div>
        </div>
        <div class="card-time">
          <div class="card-time-val">${formatTime(route.time_min)}</div>
          <div class="card-time-unit">est. time</div>
        </div>
      </div>
      <div class="card-chips">
        <div class="chip">
          <div class="chip-val">${route.distance_km}</div>
          <div class="chip-lbl">km</div>
        </div>
        <div class="chip">
          <div class="chip-val">${route.signals}</div>
          <div class="chip-lbl">signals</div>
        </div>
        <div class="chip">
          <div class="chip-val">${route.pollution_score}</div>
          <div class="chip-lbl">pollution</div>
        </div>
      </div>
      <div>
        <span class="aqi-tag ${aqiCls}">
          <svg width="6" height="6" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4" fill="currentColor"/></svg>
          AQI ${route.aqi_index} &mdash; ${route.aqi_label}
        </span>
      </div>
    `;

    card.addEventListener('click', () => selectRoute(key));
    container.appendChild(card);
  });
}

function selectRoute(key) {
  activeKey = key;

  // Update card active states
  document.querySelectorAll('.rcard').forEach(c => {
    c.classList.toggle('active', c.dataset.key === key);
  });

  activatePolyline(key);

  // Update pill
  const route = routeData[key];
  const cfg   = ROUTES[key];
  if (!route || !cfg) return;

  const pill = document.getElementById('route-pill');
  pill.style.display = 'flex';
  pill.style.setProperty('--c', cfg.color);
  document.getElementById('pill-name').textContent = cfg.label + ' Route';
  document.getElementById('pill-stats').innerHTML = `
    <div class="pill-stat">
      <div class="pill-dot" style="background:${cfg.color}"></div>
      ${formatTime(route.time_min)}
    </div>
    <div class="pill-stat">${route.distance_km} km</div>
    <div class="pill-stat">${route.signals} signals</div>
  `;
}

// ------------------------------------------------
// Search handler
// ------------------------------------------------

async function handleSearch() {
  if (!originCoords || !destCoords) {
    showToast('Please select both locations from the dropdown.');
    return;
  }

  setLoading(true);

  try {
    const url = `${API_BASE}/api/get-routes` +
      `?start_lat=${originCoords.lat}&start_lng=${originCoords.lon}` +
      `&end_lat=${destCoords.lat}&end_lng=${destCoords.lon}`;

    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }

    const data = await res.json();
    routeData = data;

    setLoading(false);
    renderCards(data);
    drawRoutes(data);
    placeMarkers();
    selectRoute('overall_best');

  } catch (err) {
    setLoading(false);
    showEmpty();
    showToast(`Error: ${err.message}`);
  }
}

// ------------------------------------------------
// UI state helpers
// ------------------------------------------------

function setLoading(on) {
  document.getElementById('placeholder').style.display = on ? 'none' : 'none';
  document.getElementById('loading').style.display     = on ? 'flex' : 'none';
  document.getElementById('cards').innerHTML            = on ? '' : document.getElementById('cards').innerHTML;
  document.getElementById('go-btn').disabled            = on;
  if (on) document.getElementById('route-pill').style.display = 'none';
}

function showEmpty() {
  document.getElementById('loading').style.display   = 'none';
  document.getElementById('placeholder').style.display = 'flex';
}

function showToast(msg) {
  const old = document.getElementById('_toast');
  if (old) old.remove();
  const t = document.createElement('div');
  t.id = '_toast';
  t.style.cssText = `
    position:fixed;bottom:28px;right:22px;z-index:9999;
    background:#161e2c;border:1px solid rgba(255,255,255,0.12);
    color:#e8edf5;font-family:'DM Sans',sans-serif;font-size:12.5px;
    padding:11px 16px;border-radius:9px;
    box-shadow:0 8px 32px rgba(0,0,0,0.5);
    max-width:280px;line-height:1.5;
    animation:cardIn 0.25s ease;
  `;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

// ------------------------------------------------
// Swap button
// ------------------------------------------------

function handleSwap() {
  const oi = document.getElementById('input-origin');
  const di = document.getElementById('input-dest');
  [oi.value, di.value] = [di.value, oi.value];
  [originCoords, destCoords] = [destCoords, originCoords];
}

// ------------------------------------------------
// Boot
// ------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  initMap();

  setupSearch('input-origin', 'sug-origin', coords => { originCoords = coords; });
  setupSearch('input-dest',   'sug-dest',   coords => { destCoords   = coords; });

  document.getElementById('go-btn').addEventListener('click', handleSearch);
  document.getElementById('swap-btn').addEventListener('click', handleSwap);

  ['input-origin', 'input-dest'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') handleSearch();
    });
  });
});
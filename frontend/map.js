/* ==============================================
   EUDORA — map.js
   Google Maps init, polylines, autocomplete
   ============================================== */

// Dark map style — premium look
const DARK_MAP_STYLE = [
  { elementType: "geometry",        stylers: [{ color: "#0d1117" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#4a5568" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0d1117" }] },

  { featureType: "administrative.locality",
    elementType: "labels.text.fill", stylers: [{ color: "#8b9ab5" }] },

  { featureType: "poi",             stylers: [{ visibility: "off" }] },
  { featureType: "poi.park",
    elementType: "geometry",        stylers: [{ color: "#0f1a14" }] },

  { featureType: "road",
    elementType: "geometry",        stylers: [{ color: "#1c2a3a" }] },
  { featureType: "road",
    elementType: "geometry.stroke", stylers: [{ color: "#0d1117" }] },
  { featureType: "road.highway",
    elementType: "geometry",        stylers: [{ color: "#1e3a50" }] },
  { featureType: "road.highway",
    elementType: "geometry.stroke", stylers: [{ color: "#0d1117" }] },
  { featureType: "road.highway",
    elementType: "labels.text.fill", stylers: [{ color: "#5a7a99" }] },

  { featureType: "transit",         stylers: [{ visibility: "off" }] },
  { featureType: "water",
    elementType: "geometry",        stylers: [{ color: "#060c13" }] },
  { featureType: "water",
    elementType: "labels.text.fill", stylers: [{ color: "#1a2a3a" }] },
];

// Polyline styles per route
const POLYLINE_STYLES = {
  fastest:         { color: "#f59e0b", weight: 5, activeWeight: 7, opacity: 0.9 },
  least_signal:    { color: "#22d3ee", weight: 5, activeWeight: 7, opacity: 0.9 },
  least_pollution: { color: "#34d399", weight: 5, activeWeight: 7, opacity: 0.9 },
  overall_best:    { color: "#a78bfa", weight: 6, activeWeight: 8, opacity: 1.0 },
};

let mapInstance  = null;
let polylines    = {};
let markers      = { origin: null, dest: null };
let activeKey    = null;

// -------------------------------------------------------
// Map Initialization (called by Google Maps callback)
// -------------------------------------------------------

function initMap() {
  mapInstance = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 22.7196, lng: 75.8577 },  // Indore
    zoom: 13,
    styles: DARK_MAP_STYLE,
    disableDefaultUI: true,
    zoomControl: false,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    gestureHandling: "greedy",
  });

  window.mapInstance = mapInstance;

  // Setup autocomplete for both inputs
  setupAutocomplete("origin-input", place => { window._originPlace = place; });
  setupAutocomplete("dest-input",   place => { window._destPlace   = place; });
}

// -------------------------------------------------------
// Autocomplete
// -------------------------------------------------------

function setupAutocomplete(inputId, onPlaceSelected) {
  const input = document.getElementById(inputId);

  const ac = new google.maps.places.Autocomplete(input, {
    componentRestrictions: { country: "IN" },
    fields: ["geometry", "formatted_address", "name"],
  });

  ac.addListener("place_changed", () => {
    const place = ac.getPlace();
    if (!place.geometry) {
      showToast("Could not find that location. Please pick from the dropdown.");
      return;
    }
    onPlaceSelected(place);
  });
}

// -------------------------------------------------------
// Render routes on map
// -------------------------------------------------------

function renderRoutesOnMap(data) {
  // Clear old polylines + markers
  Object.values(polylines).forEach(p => p.setMap(null));
  polylines = {};
  if (markers.origin) markers.origin.setMap(null);
  if (markers.dest)   markers.dest.setMap(null);

  const order = ["fastest", "least_signal", "least_pollution", "overall_best"];
  const bounds = new google.maps.LatLngBounds();

  order.forEach(key => {
    const route = data[key];
    if (!route) return;

    const style = POLYLINE_STYLES[key];
    const coords = route.route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));

    coords.forEach(c => bounds.extend(c));

    const poly = new google.maps.Polyline({
      path:          coords,
      geodesic:      true,
      strokeColor:   style.color,
      strokeOpacity: 0.25,          // start dimmed
      strokeWeight:  style.weight,
      map:           mapInstance,
      zIndex:        1,
    });

    // Click on polyline to select route
    poly.addListener("click", () => selectRoute(key));

    polylines[key] = poly;
  });

  // Fit map to routes
  mapInstance.fitBounds(bounds, { padding: 60 });

  // Place origin / dest markers
  const originPlace = window._originPlace;
  const destPlace   = window._destPlace;

  if (originPlace) {
    markers.origin = createMarker(
      originPlace.geometry.location,
      "#a78bfa",
      "A"
    );
  }

  if (destPlace) {
    markers.dest = createMarker(
      destPlace.geometry.location,
      "#f59e0b",
      "B"
    );
  }
}

// -------------------------------------------------------
// Update active polyline
// -------------------------------------------------------

function updateActivePolyline(key) {
  activeKey = key;

  Object.entries(polylines).forEach(([k, poly]) => {
    const style   = POLYLINE_STYLES[k];
    const isActive = k === key;

    poly.setOptions({
      strokeOpacity: isActive ? style.opacity : 0.15,
      strokeWeight:  isActive ? style.activeWeight : style.weight,
      zIndex:        isActive ? 10 : 1,
    });
  });
}

// -------------------------------------------------------
// Custom marker
// -------------------------------------------------------

function createMarker(position, color, label) {
  return new google.maps.Marker({
    position,
    map:   mapInstance,
    label: {
      text:      label,
      color:     "#fff",
      fontSize:  "11px",
      fontWeight: "700",
      fontFamily: "Outfit, sans-serif",
    },
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 14,
      fillColor: color,
      fillOpacity: 1,
      strokeColor: "#fff",
      strokeWeight: 2,
    },
  });
}

// Expose to app.js
window.updateActivePolyline = updateActivePolyline;
window.renderRoutesOnMap    = renderRoutesOnMap;

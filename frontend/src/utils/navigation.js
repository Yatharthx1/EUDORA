// navigation.js

// Haversine formula to calculate distance between two coordinates in meters
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Calculate initial bearing from point 1 to point 2 in degrees (0-360)
export function calculateBearing(lat1, lon1, lat2, lon2) {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const λ1 = (lon1 * Math.PI) / 180;
  const λ2 = (lon2 * Math.PI) / 180;

  const y = Math.sin(λ2 - λ1) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(λ2 - λ1);
  const θ = Math.atan2(y, x);

  return ((θ * 180) / Math.PI + 360) % 360; // in degrees
}

// Generate turn-by-turn instructions from GeoJSON LineString coordinates [[lng, lat], ...]
export function generateInstructions(coordinates) {
  if (!coordinates || coordinates.length < 2) return [];

  const instructions = [];
  let currentSegmentDistance = 0;
  let lastBearing = null;
  let startPoint = coordinates[0];

  for (let i = 0; i < coordinates.length - 1; i++) {
    const [lon1, lat1] = coordinates[i];
    const [lon2, lat2] = coordinates[i + 1];

    const dist = calculateDistance(lat1, lon1, lat2, lon2);
    const bearing = calculateBearing(lat1, lon1, lat2, lon2);

    currentSegmentDistance += dist;

    // Ignore very short segments for bearing calculation to reduce noise
    if (dist < 10 && i > 0 && i < coordinates.length - 2) {
      continue;
    }

    if (lastBearing !== null) {
      let turnAngle = bearing - lastBearing;
      // Normalize between -180 and 180
      turnAngle = ((turnAngle + 540) % 360) - 180;

      if (Math.abs(turnAngle) > 30) {
        // We have a turn
        const direction = turnAngle > 0 ? "right" : "left";
        const severity = Math.abs(turnAngle) > 120 ? "sharp " : Math.abs(turnAngle) < 60 ? "slight " : "";
        
        instructions.push({
          id: i,
          instruction: `Turn ${severity}${direction}`,
          type: `turn_${direction}`,
          distance: Math.round(currentSegmentDistance),
          coordinate: [lat1, lon1],
          bearing: bearing
        });

        currentSegmentDistance = 0;
      }
    } else {
      // First instruction
      instructions.push({
        id: 'start',
        instruction: "Head straight",
        type: "straight",
        distance: 0,
        coordinate: [lat1, lon1],
        bearing: bearing
      });
    }

    lastBearing = bearing;
  }

  // Add destination
  const dest = coordinates[coordinates.length - 1];
  instructions.push({
    id: 'end',
    instruction: "You have arrived at your destination",
    type: "destination",
    distance: Math.round(currentSegmentDistance),
    coordinate: [dest[1], dest[0]],
    bearing: lastBearing
  });

  return instructions.filter(i => i.distance > 0 || i.type === "destination");
}

// Format distance nicely
export function formatDistance(meters) {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

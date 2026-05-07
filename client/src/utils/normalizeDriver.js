const statusMap = {
  'Out for Delivery': 'out_for_delivery',
  'Out For Delivery': 'out_for_delivery',
  'Traveling to Pickup': 'traveling_to_pickup',
  'Picking Up': 'picking_up',
  'Returning': 'returning',
  'Idle': 'idle',
  'Delayed': 'delayed',
  'Offline': 'offline',
  'Active': 'active'
};

export function normalizeStatus(status) {
  if (!status) return 'unknown';
  return statusMap[status] || String(status).trim().toLowerCase().replace(/\s+/g, '_');
}

export function normalizeDriver(rawDriver) {
  if (!rawDriver || typeof rawDriver !== 'object') return null;

  const coordinates = rawDriver.coordinates || {};
  const lat = Number(coordinates.lat);
  const lng = Number(coordinates.lng);

  return {
    id: rawDriver.driverId || rawDriver.id || null,
    driverId: rawDriver.driverId || rawDriver.id || null,
    name: rawDriver.name || 'Unknown Driver',
    vehicleNumber: rawDriver.vehicleNumber || '--',
    coordinates: {
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null
    },
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    status: rawDriver.status ? String(rawDriver.status).toLowerCase().replace(/\s+/g, '_') : 'offline',
    statusNormalized: normalizeStatus(rawDriver.status),
    speed: Number.isFinite(Number(rawDriver.speed)) ? Number(rawDriver.speed) : 0,
    eta: rawDriver.eta || null,
    progress: Number.isFinite(Number(rawDriver.progress)) ? Number(rawDriver.progress) : 0,
    assignedOrder: rawDriver.assignedOrder || null,
    origin: rawDriver.origin || null,
    destination: rawDriver.destination || null,
    routeColor: rawDriver.routeColor || 'blue',
    routeCoords: Array.isArray(rawDriver.routeCoords) ? rawDriver.routeCoords : [],
    routeCoordinates: Array.isArray(rawDriver.routeCoordinates) ? rawDriver.routeCoordinates : (Array.isArray(rawDriver.routeCoords) ? rawDriver.routeCoords : []),
    lastUpdated: rawDriver.lastUpdated || null
  };
}

export function normalizeDriverCollection(payload) {
  const rawList = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.drivers)
        ? payload.drivers
        : [];

  return rawList
    .map(normalizeDriver)
    .filter((driver) => driver && driver.driverId);
}

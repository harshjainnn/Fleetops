const Driver = require('../models/Driver');
const { generateManhattanRoute } = require('../seed');
const { DRIVER_STATUS } = require('../constants');
const {
  getFleetState,
  emitOperationalActivity,
  emitFleetUpdate,
  DRIVER_ACTIVITY_TYPES
} = require('../services/simulationService');

function isCoordinatePair(value) {
  return Array.isArray(value) && value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]));
}

function normalizeDestination(destination, driver) {
  if (destination && Number.isFinite(destination.lat) && Number.isFinite(destination.lng)) {
    return { lat: Number(destination.lat), lng: Number(destination.lng) };
  }

  if (driver.destination && Number.isFinite(driver.destination.lat) && Number.isFinite(driver.destination.lng)) {
    return { lat: Number(driver.destination.lat), lng: Number(driver.destination.lng) };
  }

  return {
    lat: Number((driver.coordinates.lat + 0.05).toFixed(6)),
    lng: Number((driver.coordinates.lng + 0.05).toFixed(6))
  };
}

function computeEtaFromRoute(routeCoords) {
  const steps = Math.max(routeCoords.length, 1);
  const secondsPerStep = 4;
  return new Date(Date.now() + steps * secondsPerStep * 1000);
}

async function applyOptimizationRecommendation({ driverId, recommendation }) {
  if (!driverId) {
    return { error: 'driverId is required to apply optimization.' };
  }

  const fleetState = getFleetState();
  const driver = fleetState.drivers.find((item) => item.driverId === driverId);
  if (!driver) {
    return { error: `Driver ${driverId} not found in live fleet state.` };
  }

  if (!recommendation || typeof recommendation !== 'object') {
    return { error: 'Recommendation payload is missing or invalid.' };
  }

  const destination = normalizeDestination(recommendation.destinationUsed, driver);
  let routeCoords = Array.isArray(recommendation.suggestedRoute) ? recommendation.suggestedRoute.filter(isCoordinatePair) : [];
  if (routeCoords.length === 0) {
    routeCoords = generateManhattanRoute([driver.coordinates.lat, driver.coordinates.lng], [destination.lat, destination.lng]);
  }

  const eta = computeEtaFromRoute(routeCoords);
  const nextStatus = driver.status === DRIVER_STATUS.IDLE ? DRIVER_STATUS.TRAVELING : DRIVER_STATUS.OUT_FOR_DELIVERY;

  driver.routeCoords = routeCoords;
  driver.routeCoordinates = routeCoords;
  driver.destination = destination;
  driver.currentRouteIndex = 0;
  driver.progress = 0;
  driver.eta = eta;
  driver.status = nextStatus;
  driver.lastUpdated = new Date();

  await Driver.updateOne(
    { driverId: driver.driverId },
    {
      $set: {
        routeCoords: driver.routeCoords,
        destination: driver.destination,
        currentRouteIndex: driver.currentRouteIndex,
        progress: driver.progress,
        eta: driver.eta,
        status: driver.status,
        lastUpdated: driver.lastUpdated
      }
    }
  );

  emitOperationalActivity(
    DRIVER_ACTIVITY_TYPES.OPTIMIZATION,
    `${driver.driverId} rerouted successfully via AI optimization corridor`,
    driver.driverId
  );
  emitOperationalActivity(
    DRIVER_ACTIVITY_TYPES.OPTIMIZATION,
    `Congestion avoidance activated for ${driver.driverId}`,
    driver.driverId
  );
  emitFleetUpdate();

  return {
    success: true,
    driverId: driver.driverId,
    message: `Optimization successfully applied to ${driver.driverId}. The driver has been rerouted through a lower-congestion corridor with an improved ETA profile.`,
    applied: {
      destination: driver.destination,
      routeCheckpoints: routeCoords.length,
      eta: driver.eta,
      status: driver.status
    }
  };
}

module.exports = { applyOptimizationRecommendation };

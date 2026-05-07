const { generateManhattanRoute } = require('../seed');
const { DRIVER_STATUS } = require('../constants');

function randomInRange(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function estimateBaseEta(driver, isVirtualScenario, routeLength) {
  if (driver.eta && !isVirtualScenario) {
    const diff = Math.floor((new Date(driver.eta) - new Date()) / 60000);
    return clamp(diff, 6, 90);
  }

  if (isVirtualScenario) {
    return Math.floor(randomInRange(16, 32));
  }

  const currentRouteIndex = Number.isFinite(driver.currentRouteIndex) ? driver.currentRouteIndex : 0;
  const stepsRemaining = Math.max(routeLength - currentRouteIndex, 0);
  const derivedFromSteps = Math.floor(stepsRemaining / 10);
  return clamp(derivedFromSteps || Math.floor(randomInRange(12, 24)), 8, 75);
}

function buildTrafficModel(driver, isVirtualScenario, routeLength) {
  const delayedMultiplier = driver.status === DRIVER_STATUS.DELAYED ? randomInRange(1.18, 1.35) : randomInRange(1.0, 1.12);
  const trafficDensityWeight = isVirtualScenario
    ? randomInRange(0.28, 0.62)
    : randomInRange(0.18, 0.74);
  const congestionPenaltyMins = Math.round(trafficDensityWeight * routeLength * randomInRange(0.16, 0.34));
  const routeEfficiencyScore = clamp(
    isVirtualScenario ? randomInRange(0.63, 0.86) : randomInRange(0.7, 0.95),
    0.55,
    0.97
  );

  return {
    delayedMultiplier,
    trafficDensityWeight,
    congestionPenaltyMins,
    routeEfficiencyScore
  };
}

function buildVirtualScenario(driver) {
  const currentLocation = [driver.coordinates.lat, driver.coordinates.lng];
  const virtualDestination = {
    lat: Number((driver.coordinates.lat + randomInRange(0.04, 0.08)).toFixed(6)),
    lng: Number((driver.coordinates.lng + randomInRange(0.03, 0.07)).toFixed(6))
  };

  const congestionZone = {
    lat: Number((driver.coordinates.lat + randomInRange(0.01, 0.03)).toFixed(6)),
    lng: Number((driver.coordinates.lng + randomInRange(0.01, 0.03)).toFixed(6)),
    severity: Math.random() > 0.5 ? 'moderate' : 'heavy'
  };

  const suggestedRoute = generateManhattanRoute(currentLocation, [virtualDestination.lat, virtualDestination.lng]);
  return { virtualDestination, congestionZone, suggestedRoute };
}

function formatOpsReason(driver, isVirtualScenario, congestionZone) {
  if (isVirtualScenario) {
    return `Driver ${driver.driverId} is currently positioned near the service grid without an active assignment. Repositioning toward a higher-demand delivery corridor is recommended while avoiding a ${congestionZone.severity} congestion pocket to improve readiness for the next dispatch.`;
  }

  const isDelayed = driver.status === DRIVER_STATUS.DELAYED;
  return isDelayed
    ? 'Heavy congestion detected on the current trajectory. Rerouting through an alternate arterial corridor reduces downstream delay risk.'
    : 'Traffic buildup is forming ahead. A corridor adjustment through lower-density connectors improves delivery reliability.';
}

function suggestBetterRoute(driver) {
  if (!driver.coordinates || typeof driver.coordinates.lat !== 'number' || typeof driver.coordinates.lng !== 'number') {
    return {
      driverId: driver.driverId,
      message: `Driver ${driver.driverId} is active in dispatch records, but live GPS coordinates are unavailable. Hold current assignment and trigger a location refresh before route optimization.`
    };
  }

  const hasRoute = Array.isArray(driver.routeCoords) && driver.routeCoords.length > 0;
  const hasDestination = !!driver.destination;
  const isIdle = driver.status === DRIVER_STATUS.IDLE;
  const isVirtualScenario = !hasRoute || !hasDestination || isIdle;
  const currentLocation = [driver.coordinates.lat, driver.coordinates.lng];
  const routeLength = hasRoute ? driver.routeCoords.length : 0;

  const baseEtaMins = estimateBaseEta(driver, isVirtualScenario, routeLength || Math.floor(randomInRange(35, 90)));

  let scenarioDestination;
  let congestionZone = null;
  let suggestedRoute = [];

  if (isVirtualScenario) {
    const virtualScenario = buildVirtualScenario(driver);
    scenarioDestination = virtualScenario.virtualDestination;
    congestionZone = virtualScenario.congestionZone;
    suggestedRoute = virtualScenario.suggestedRoute;
  } else {
    scenarioDestination = driver.destination;
    const destLocation = [driver.destination.lat, driver.destination.lng];
    suggestedRoute = generateManhattanRoute(currentLocation, destLocation);
  }

  const isDelayed = driver.status === DRIVER_STATUS.DELAYED;
  const modeledRouteLength = suggestedRoute.length || routeLength || Math.floor(randomInRange(40, 100));
  const trafficModel = buildTrafficModel(driver, isVirtualScenario, modeledRouteLength);

  const currentEtaMins = clamp(
    Math.round((baseEtaMins + trafficModel.congestionPenaltyMins) * trafficModel.delayedMultiplier),
    6,
    120
  );

  const improvementPotential = clamp(
    (1 - trafficModel.routeEfficiencyScore) * 0.9 + trafficModel.trafficDensityWeight * 0.25,
    0,
    0.45
  );
  const rawSavings = Math.round(currentEtaMins * improvementPotential);
  const timeSaved = clamp(rawSavings, 0, Math.max(currentEtaMins - 1, 0));
  const optimizedEtaMins = currentEtaMins - timeSaved;
  const reason = formatOpsReason(driver, isVirtualScenario, congestionZone);
  const nearOptimal = timeSaved === 0;
  const operationalRecommendation = nearOptimal
    ? `${driver.driverId} is already operating on a near-optimal corridor. Only marginal improvements are currently possible due to balanced traffic conditions.`
    : isVirtualScenario
      ? `Keep ${driver.driverId} pre-positioned on this standby corridor and prioritize assignment handoff into the lower-density lane.`
      : `Proceed with the optimized corridor for ${driver.driverId} to reduce delay exposure across the next delivery segment.`;

  return {
    driverId: driver.driverId,
    scenario: isVirtualScenario ? 'temporary_optimization' : 'active_route_optimization',
    currentLocation: { lat: driver.coordinates.lat, lng: driver.coordinates.lng },
    destinationUsed: scenarioDestination,
    congestionZone: congestionZone || undefined,
    currentETA: `${currentEtaMins} mins`,
    optimizedETA: `${optimizedEtaMins} mins`,
    timeSaved: `${timeSaved} mins`,
    reason,
    trafficDensityWeight: Number(trafficModel.trafficDensityWeight.toFixed(2)),
    routeEfficiencyScore: Number(trafficModel.routeEfficiencyScore.toFixed(2)),
    congestionPenaltyMins: trafficModel.congestionPenaltyMins,
    delayedMultiplier: Number(trafficModel.delayedMultiplier.toFixed(2)),
    operationalRecommendation,
    suggestedRoute,
    note: isVirtualScenario
      ? 'Optimization was computed using a temporary scenario and did not modify the live fleet state.'
      : undefined
  };
}

module.exports = { suggestBetterRoute };

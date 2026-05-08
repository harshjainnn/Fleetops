const Driver = require('../models/Driver');
const Order = require('../models/Order');
const { generateManhattanRoute } = require('../seed');
const { DRIVER_STATUS, ORDER_STATUS } = require('../constants');

const fleetState = {
  drivers: [],
  orders: [],
  activities: []
};
let simulationIo = null;

const MIN_DELAY_PERSISTENCE_MS = 60 * 1000;
const delayedStateTracker = new Map();

function getFleetState() {
  return fleetState;
}

const DRIVER_ACTIVITY_TYPES = {
  ASSIGNED: 'assignment',
  DELAY: 'delay',
  RECOVERY: 'recovery',
  DELIVERED: 'delivery',
  OPTIMIZATION: 'optimization'
};

function emitActivity(io, type, message, driverId) {
  const activity = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    message,
    driverId,
    timestamp: new Date().toISOString()
  };
  fleetState.activities.unshift(activity);
  if (fleetState.activities.length > 50) {
    fleetState.activities.pop();
  }
}

function emitOperationalActivity(type, message, driverId) {
  emitActivity(simulationIo, type, message, driverId);
}

function emitFleetUpdate() {
  if (simulationIo) {
    simulationIo.emit('fleet:update', fleetState);
  }
}

function getVelocityProfile(driverStatus) {
  if (driverStatus === DRIVER_STATUS.IDLE) return { min: 0, max: 4, pauseChance: 0.7, stepJump: 1 };
  if (driverStatus === DRIVER_STATUS.DELAYED) return { min: 4, max: 12, pauseChance: 0.4, stepJump: 1 };
  if (driverStatus === DRIVER_STATUS.TRAVELING) return { min: 20, max: 35, pauseChance: 0.08, stepJump: 2 };
  return { min: 14, max: 28, pauseChance: 0.12, stepJump: 1 };
}

function computeRandomSpeed(profile) {
  const span = profile.max - profile.min + 1;
  return Math.floor(Math.random() * span) + profile.min;
}

async function assignNextOrder(driver, io) {
  let nextOrder = fleetState.orders.find(o => o.status === ORDER_STATUS.PENDING);
  
  if (!nextOrder) {
    nextOrder = await Order.findOne({ status: ORDER_STATUS.PENDING }).lean();
    if (nextOrder) {
      if (!fleetState.orders.find(o => o.orderId === nextOrder.orderId)) {
        fleetState.orders.push(nextOrder);
      }
    }
  }

  if (!nextOrder) {
    driver.status = DRIVER_STATUS.IDLE;
    driver.speed = 0;
    driver.progress = 100;
    driver.assignedOrder = null;
    await Driver.updateOne({ driverId: driver.driverId }, { $set: { status: driver.status, speed: driver.speed, progress: driver.progress, assignedOrder: null } });
    return;
  }

  nextOrder.status = ORDER_STATUS.OUT_FOR_DELIVERY;
  nextOrder.assignedDriver = driver.driverId;
  await Order.updateOne({ orderId: nextOrder.orderId }, { $set: { status: nextOrder.status, assignedDriver: driver.driverId } });

  const newOrigin = { ...driver.coordinates };
  const newDestination = nextOrder.coordinates;
  const newRoute = generateManhattanRoute(
    [newOrigin.lat, newOrigin.lng],
    [newDestination.lat, newDestination.lng]
  );

  driver.assignedOrder = nextOrder.orderId;
  driver.origin = newOrigin;
  driver.destination = newDestination;
  driver.routeCoords = newRoute;
  driver.currentRouteIndex = 0;
  driver.status = DRIVER_STATUS.OUT_FOR_DELIVERY;
  driver.progress = 0;
  driver.lastUpdated = new Date();
  
  await Driver.updateOne({ driverId: driver.driverId }, { $set: driver });

  emitActivity(
    io,
    DRIVER_ACTIVITY_TYPES.ASSIGNED,
    `${driver.driverId} assigned ${nextOrder.orderId} for delivery`,
    driver.driverId
  );
}

function updateOrderFromDriverState(driver) {
  if (driver.assignedOrder) {
    const order = fleetState.orders.find(o => o.orderId === driver.assignedOrder);
    if (order) {
      let newOrderStatus = order.status;
      if (driver.status === DRIVER_STATUS.DELAYED) {
        newOrderStatus = ORDER_STATUS.DELAYED;
      } else if (driver.status === DRIVER_STATUS.OUT_FOR_DELIVERY || driver.status === DRIVER_STATUS.TRAVELING) {
        newOrderStatus = ORDER_STATUS.OUT_FOR_DELIVERY;
      }
      
      if (order.status !== newOrderStatus) {
        order.status = newOrderStatus;
        Order.updateOne({ orderId: order.orderId }, { $set: { status: newOrderStatus } }).catch(e => console.error(e));
      }
    }
  }
}

function markDelayStart(driver) {
  delayedStateTracker.set(driver.driverId, Date.now());
}

function clearDelayTracking(driverId) {
  delayedStateTracker.delete(driverId);
}

function canRecoverFromDelay(driverId) {
  const delayedAt = delayedStateTracker.get(driverId);
  if (!delayedAt) return true;
  return (Date.now() - delayedAt) >= MIN_DELAY_PERSISTENCE_MS;
}

async function initializeFleetState() {
  const drivers = await Driver.find({ status: { $ne: DRIVER_STATUS.OFFLINE } }).lean();
  const orders = await Order.find().sort({ createdAt: -1 }).limit(200).lean();
  fleetState.drivers = drivers;
  fleetState.orders = orders;

  for (const driver of fleetState.drivers) {
    if (driver.status === DRIVER_STATUS.DELAYED) {
      markDelayStart(driver);
    }
  }
}

async function regenerateOrdersIfNeeded() {
  const pendingOrders = fleetState.orders.filter(
    o => o.status !== ORDER_STATUS.DELIVERED
  );

  if (pendingOrders.length === 0) {
    console.log('All orders delivered. Creating new orders...');

    const newOrders = [];

    for (let i = 1; i <= 5; i++) {
      const orderId = `ORD${Date.now()}${i}`;

      newOrders.push({
        orderId,
        customerName: `Customer ${i}`,
        destination: `Sector ${Math.floor(Math.random() * 50)}, New Delhi`,
        status: ORDER_STATUS.PENDING,
        coordinates: {
          lat: 28.50 + Math.random() * 0.3,
          lng: 77.10 + Math.random() * 0.3
        }
      });
    }

    const insertedOrders = await Order.insertMany(newOrders);

    fleetState.orders.unshift(...insertedOrders);

    // Assign idle drivers again
    const idleDrivers = fleetState.drivers.filter(
      d => d.status === DRIVER_STATUS.IDLE
    );

    for (const driver of idleDrivers) {
      await assignNextOrder(driver, simulationIo);
    }

    console.log('New live orders generated');
  }
}
function startSimulation(io) {
  simulationIo = io;
  initializeFleetState().then(() => {
    setInterval(async () => {
      try {
        const activeDrivers = fleetState.drivers.filter(d => 
          [DRIVER_STATUS.TRAVELING, DRIVER_STATUS.OUT_FOR_DELIVERY, DRIVER_STATUS.DELAYED].includes(d.status)
        );

        for (let driver of activeDrivers) {
          if (!(driver.routeCoords && driver.routeCoords.length > 0)) {
            continue;
          }

          const shouldTriggerDelay = driver.status !== DRIVER_STATUS.DELAYED && Math.random() < 0.06;
          if (shouldTriggerDelay) {
            driver.status = DRIVER_STATUS.DELAYED;
            markDelayStart(driver);
            updateOrderFromDriverState(driver);
            emitActivity(
              io,
              DRIVER_ACTIVITY_TYPES.DELAY,
              `${driver.driverId} delayed due to traffic congestion`,
              driver.driverId
            );
          } else if (
            driver.status === DRIVER_STATUS.DELAYED &&
            canRecoverFromDelay(driver.driverId) &&
            Math.random() < 0.2
          ) {
            driver.status = DRIVER_STATUS.OUT_FOR_DELIVERY;
            clearDelayTracking(driver.driverId);
            updateOrderFromDriverState(driver);
            emitActivity(
              io,
              DRIVER_ACTIVITY_TYPES.RECOVERY,
              `${driver.driverId} resumed movement after traffic delay`,
              driver.driverId
            );
          }

          const velocity = getVelocityProfile(driver.status);
          const shouldPause = Math.random() < velocity.pauseChance;

          if (shouldPause) {
            driver.speed = 0;
            driver.lastUpdated = new Date();
            await Driver.updateOne({ driverId: driver.driverId }, { $set: { speed: 0, lastUpdated: driver.lastUpdated } });
            continue;
          }

          const nextIndex = Math.min(
            driver.currentRouteIndex + velocity.stepJump,
            driver.routeCoords.length - 1
          );

          if (nextIndex < driver.routeCoords.length) {
            driver.currentRouteIndex = nextIndex;
            const nextCoord = driver.routeCoords[driver.currentRouteIndex];

            driver.coordinates.lat = nextCoord[0];
            driver.coordinates.lng = nextCoord[1];
            driver.lastUpdated = new Date();
            driver.progress = Math.round(
              (driver.currentRouteIndex / Math.max(driver.routeCoords.length - 1, 1)) * 100
            );

            const stepsRemaining = Math.max(driver.routeCoords.length - driver.currentRouteIndex, 0);
            driver.eta = new Date(Date.now() + stepsRemaining * 1000);
            driver.speed = computeRandomSpeed(velocity);
            
            await Driver.updateOne({ driverId: driver.driverId }, { $set: { 
              currentRouteIndex: driver.currentRouteIndex,
              coordinates: driver.coordinates,
              lastUpdated: driver.lastUpdated,
              progress: driver.progress,
              eta: driver.eta,
              speed: driver.speed
            } });
          }

          if (driver.currentRouteIndex >= driver.routeCoords.length - 1) {
            if (driver.assignedOrder) {
              const order = fleetState.orders.find(o => o.orderId === driver.assignedOrder);
              if (order) {
                order.status = ORDER_STATUS.DELIVERED;
                await Order.updateOne({ orderId: order.orderId }, { $set: { status: order.status } });
                emitActivity(
                  io,
                  DRIVER_ACTIVITY_TYPES.DELIVERED,
                  `${driver.driverId} delivered ${order.orderId}`,
                  driver.driverId
                );
              }
            }

            driver.status = DRIVER_STATUS.IDLE;
            clearDelayTracking(driver.driverId);
            driver.speed = 0;
            driver.progress = 100;
            driver.assignedOrder = null;
            await Driver.updateOne({ driverId: driver.driverId }, { $set: { status: driver.status, speed: driver.speed, progress: driver.progress, assignedOrder: null } });
            await assignNextOrder(driver, io);
          }
        }
        await regenerateOrdersIfNeeded();
        io.emit('fleet:update', fleetState);

      } catch (error) {
        console.error('Simulation error:', error);
      }
    }, 1000);
  });
}

module.exports = {
  startSimulation,
  getFleetState,
  emitOperationalActivity,
  emitFleetUpdate,
  DRIVER_ACTIVITY_TYPES
};

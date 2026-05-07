const Driver = require('../models/Driver');
const Order = require('../models/Order');
const { DRIVER_STATUS, ORDER_STATUS } = require('../constants');

function startSimulation(io) {
  // Update every 2 seconds for smooth movement
  setInterval(async () => {
    try {
      // 1. Update Drivers
      const driversToMove = await Driver.find({ status: { $ne: DRIVER_STATUS.OFFLINE } });
      
      for (let driver of driversToMove) {
        if (driver.routeCoords && driver.routeCoords.length > 0) {
          // Move to next coordinate
          driver.currentRouteIndex = (driver.currentRouteIndex + 1) % driver.routeCoords.length;
          const nextCoord = driver.routeCoords[driver.currentRouteIndex];
          
          driver.coordinates.lat = nextCoord[0];
          driver.coordinates.lng = nextCoord[1];
          driver.lastUpdated = new Date();
          
          if (driver.status !== DRIVER_STATUS.IDLE) {
            driver.speed = Math.floor(Math.random() * 20) + 15; // 15-35 km/h realistic city speed
          } else {
            driver.speed = 0;
          }
          
          await driver.save();
          
          // Emit location update event
          io.emit('driver:location:update', {
            driverId: driver.driverId,
            coordinates: driver.coordinates,
            speed: driver.speed,
            status: driver.status,
            routeColor: driver.routeColor,
            routeCoords: driver.routeCoords,
            lastUpdated: driver.lastUpdated
          });
        }
      }

      // 2. Broadcast Live Analytics
      const totalOrders = await Order.countDocuments();
      const pendingOrders = await Order.countDocuments({ status: ORDER_STATUS.PENDING });
      const deliveredOrders = await Order.countDocuments({ status: ORDER_STATUS.DELIVERED });
      const delayedOrders = await Order.countDocuments({ status: ORDER_STATUS.DELAYED });
      const activeDrivers = await Driver.countDocuments({ status: { $in: [DRIVER_STATUS.TRAVELING, DRIVER_STATUS.OUT_FOR_DELIVERY] } });

      io.emit('analytics:update', {
        totalOrders,
        pendingOrders,
        deliveredOrders,
        delayedOrders,
        activeDrivers
      });

    } catch (error) {
      console.error('Simulation error:', error);
    }
  }, 2000); // 2 seconds
}

module.exports = { startSimulation };

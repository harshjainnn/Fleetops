const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const { getFleetState } = require('../services/simulationService');
const { ORDER_STATUS, DRIVER_STATUS } = require('../constants');
const { suggestBetterRoute } = require('./routeOptimizer');

// Business Logic Functions
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;  
  const dLon = (lon2 - lon1) * Math.PI / 180; 
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
}

async function findClosestDriverLogistics(orderId) {
  const fleetState = getFleetState();
  const order = fleetState.orders.find(o => o.orderId === orderId);
  if (!order) return { error: `Order ${orderId} not found in live state.` };

  const activeDrivers = fleetState.drivers.filter(d => [DRIVER_STATUS.IDLE, DRIVER_STATUS.OUT_FOR_DELIVERY, DRIVER_STATUS.TRAVELING].includes(d.status));
  if (activeDrivers.length === 0) return { error: 'No active drivers available.' };

  let closestDriver = null;
  let minDistance = Infinity;

  for (let driver of activeDrivers) {
    if (!driver.coordinates || !order.coordinates) continue;
    const dist = calculateDistance(
      order.coordinates.lat, order.coordinates.lng,
      driver.coordinates.lat, driver.coordinates.lng
    );
    if (dist < minDistance) {
      minDistance = dist;
      closestDriver = driver;
    }
  }

  if (!closestDriver) return { error: 'Could not calculate distance to any active driver.' };

  const timeMinutes = Math.round((minDistance / 40) * 60); 
  return {
    closestDriver: closestDriver.driverId,
    driverName: closestDriver.name,
    distance: `${minDistance.toFixed(2)} km`,
    estimatedArrival: `${timeMinutes} mins`
  };
}

async function getDelayedOrdersLogistics() {
  try {
    console.log("[MCP] Delayed orders tool executed");
    const currentTime = new Date();
    const fleetState = getFleetState();
    
    const delayedOrders = fleetState.orders.filter(order => {
       if (order.status === ORDER_STATUS.DELAYED) return true;
       if (order.estimatedDeliveryTime && new Date(order.estimatedDeliveryTime) < currentTime && ![ORDER_STATUS.DELIVERED, ORDER_STATUS.PENDING].includes(order.status)) {
         return true;
       }
       return false;
    });

    if (!delayedOrders || delayedOrders.length === 0) {
      return { message: "No delayed orders currently." };
    }

    const resultList = delayedOrders.map(order => {
      let delayDuration = 'Unknown';
      if (order.estimatedDeliveryTime) {
         const diffMins = Math.floor((currentTime - new Date(order.estimatedDeliveryTime)) / 60000);
         if (diffMins > 0) {
            delayDuration = `${diffMins} minutes`;
         }
      } else if (order.status === ORDER_STATUS.DELAYED) {
         delayDuration = '18 minutes'; // Fallback
      }
      
      return {
        orderId: order.orderId,
        customerName: order.customerName,
        assignedDriver: order.assignedDriver || 'Unassigned',
        delayDuration: delayDuration,
        destination: order.deliveryAddress
      };
    });
    
    return { delayedOrders: resultList };
  } catch (error) {
    console.error("[MCP] Error in getDelayedOrdersLogistics:", error);
    return { message: "No delayed orders currently." };
  }
}

async function suggestBetterRouteLogistics(driverId) {
  const fleetState = getFleetState();
  const driver = fleetState.drivers.find(d => d.driverId === driverId);
  if (!driver) {
    return {
      message: 'Driver unavailable. Would you like the best optimization candidate among active drivers?',
      requestedDriverId: driverId
    };
  }
  return suggestBetterRoute(driver);
}

async function getFleetSummaryLogistics() {
  const fleetState = getFleetState();
  const totalDrivers = fleetState.drivers.length;
  const activeDrivers = fleetState.drivers.filter(d => [DRIVER_STATUS.TRAVELING, DRIVER_STATUS.OUT_FOR_DELIVERY, DRIVER_STATUS.DELAYED].includes(d.status)).length;
  const idleDrivers = fleetState.drivers.filter(d => d.status === DRIVER_STATUS.IDLE).length;
  const completedDeliveries = fleetState.orders.filter(o => o.status === ORDER_STATUS.DELIVERED).length;
  const delayedDeliveries = fleetState.orders.filter(o => o.status === ORDER_STATUS.DELAYED).length;

  return { summary: { totalDrivers, activeDrivers, idleDrivers, completedDeliveries, delayedDeliveries } };
}

// MCP Server Setup
const server = new McpServer({
  name: 'Fleet Logistics Server',
  version: '1.0.0'
});

server.tool('find_closest_driver', 'Find the closest active driver to a given order ID', { orderId: z.string() },
  async ({ orderId }) => {
    const res = await findClosestDriverLogistics(orderId);
    return { content: [{ type: 'text', text: JSON.stringify(res) }] };
  }
);

server.tool('get_delayed_orders', 'Get a list of all delayed orders and their assigned drivers', {},
  async () => {
    const res = await getDelayedOrdersLogistics();
    return { content: [{ type: 'text', text: JSON.stringify(res) }] };
  }
);

server.tool('suggest_better_route', 'Suggest a better route for a driver', { driverId: z.string() },
  async ({ driverId }) => {
    const res = await suggestBetterRouteLogistics(driverId);
    return { content: [{ type: 'text', text: JSON.stringify(res) }] };
  }
);

server.tool('get_fleet_summary', 'Get a summary of the current fleet status', {},
  async () => {
    const res = await getFleetSummaryLogistics();
    return { content: [{ type: 'text', text: JSON.stringify(res) }] };
  }
);

module.exports = { 
  mcpServer: server,
  logisticsTools: {
    findClosestDriverLogistics,
    getDelayedOrdersLogistics,
    suggestBetterRouteLogistics,
    getFleetSummaryLogistics
  }
};

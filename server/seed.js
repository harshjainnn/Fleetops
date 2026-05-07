const mongoose = require('mongoose');
const Driver = require('./models/Driver');
const Order = require('./models/Order');
const { DRIVER_STATUS, ORDER_STATUS } = require('./constants');

// NCR-wide zones for realistic city-scale coverage
const zones = {
  NorthDelhi: [28.7041, 77.1025],
  SouthDelhi: [28.5355, 77.3910],
  Gurgaon: [28.4595, 77.0266],
  Noida: [28.5700, 77.3200],
  EastDelhi: [28.6280, 77.2789],
  CentralHub: [28.6139, 77.2090]
};

const zoneKeys = Object.keys(zones);

function jitterPoint(basePoint, spread = 0.02) {
  return [
    basePoint[0] + (Math.random() - 0.5) * spread,
    basePoint[1] + (Math.random() - 0.5) * spread
  ];
}

// City route generation with spread + 20-50 interpolation points
function generateManhattanRoute(start, end) {
  const waypoints = [start];

  const dLat = end[0] - start[0];
  const dLng = end[1] - start[1];

  // Number of route turns with random offsets to avoid overlap
  const zigs = Math.floor(Math.random() * 3) + 4;
  for (let i = 1; i <= zigs; i++) {
    const ratio = i / (zigs + 1);
    const offsetLat = (Math.random() - 0.5) * 0.018;
    const offsetLng = (Math.random() - 0.5) * 0.018;
    waypoints.push([
      start[0] + dLat * ratio + offsetLat,
      start[1] + dLng * ratio + offsetLng
    ]);
  }
  waypoints.push(end);

  const minPoints = 20;
  const maxPoints = 50;
  const targetPoints = Math.floor(Math.random() * (maxPoints - minPoints + 1)) + minPoints;

  const route = [];
  for (let i = 0; i < targetPoints; i++) {
    const t = i / Math.max(targetPoints - 1, 1);
    const scaled = t * (waypoints.length - 1);
    const fromIdx = Math.floor(scaled);
    const toIdx = Math.min(fromIdx + 1, waypoints.length - 1);
    const segmentT = scaled - fromIdx;

    const from = waypoints[fromIdx];
    const to = waypoints[toIdx];
    const lat = from[0] + (to[0] - from[0]) * segmentT;
    const lng = from[1] + (to[1] - from[1]) * segmentT;
    route.push([lat, lng]);
  }

  route[0] = start;
  route[route.length - 1] = end;
  return route;
}

const driverNames = ["Rahul Sharma", "Anita Desai", "Arun Kumar", "Vikram Singh", "Priya Patel", "Rohan Gupta", "Neha Singh", "Sanjay Dutt"];

async function seedDatabase() {
  try {
    console.log('[Seeder] Checking database for existing data...');
    
    const driverCount = await Driver.countDocuments();
    const orderCount = await Order.countDocuments();
    
    if (driverCount > 0 || orderCount > 0) {
      console.log(`[Seeder] Clearing old data for clean map architecture...`);
      await Driver.deleteMany({});
      await Order.deleteMany({});
    }
    
    console.log('[Seeder] Seeding Delivery Lifecycle data (8 Drivers, 40 Orders)...');
    
    const hub = zones.CentralHub;

    // Create 40 Orders across all NCR zones
    const orders = [];
    for (let i = 0; i < 40; i++) {
      const dest = zones[zoneKeys[Math.floor(Math.random() * zoneKeys.length)]];
      const [destLat, destLng] = jitterPoint(dest, 0.055);
      orders.push({
        orderId: `ORD${String(i+1).padStart(3, '0')}`,
        customerName: `Customer ${i+1}`,
        deliveryAddress: `Sector ${Math.floor(Math.random()*50)}, New Delhi`,
        coordinates: { lat: destLat, lng: destLng },
        status: ORDER_STATUS.PENDING,
        estimatedDeliveryTime: new Date(Date.now() + 3600000)
      });
    }
    const createdOrders = await Order.insertMany(orders);
    
    // Create 8 drivers distributed by operational profile
    const drivers = [];
    for (let i = 0; i < 8; i++) {
      const driverId = `DRV${String(i+1).padStart(3, '0')}`;
      let status = DRIVER_STATUS.OUT_FOR_DELIVERY;
      let routeColor = 'green';
      let assignedOrder = null;
      let origin = null;
      let destination = null;
      let routeCoords = [];
      let speed = Math.floor(Math.random() * 14) + 16;
      let progress = 0;
      let eta = null;

      // idle drivers near central hub
      if (i < 2) {
        const [lat, lng] = jitterPoint(hub, 0.01);
        origin = { lat, lng };
        destination = { lat, lng };
        status = DRIVER_STATUS.IDLE;
        routeColor = 'grey';
        speed = 0;
        progress = 100;
      } else if (i === 2) {
        // delayed driver in congestion corridor
        const [startLat, startLng] = jitterPoint(zones.EastDelhi, 0.02);
        const [endLat, endLng] = jitterPoint(zones.Noida, 0.03);
        origin = { lat: startLat, lng: startLng };
        destination = { lat: endLat, lng: endLng };
        status = DRIVER_STATUS.DELAYED;
        routeColor = 'red';
        routeCoords = generateManhattanRoute([origin.lat, origin.lng], [destination.lat, destination.lng]);
        progress = Math.floor(Math.random() * 40) + 10;
        speed = Math.floor(Math.random() * 8) + 5;
        eta = new Date(Date.now() + (routeCoords.length - Math.floor((progress / 100) * routeCoords.length)) * 1000);
      } else if (i === 3) {
        // returning driver between destination and hub
        const [startLat, startLng] = jitterPoint(zones.Gurgaon, 0.02);
        const [endLat, endLng] = jitterPoint(hub, 0.018);
        origin = { lat: startLat, lng: startLng };
        destination = { lat: endLat, lng: endLng };
        status = DRIVER_STATUS.TRAVELING;
        routeColor = 'blue';
        routeCoords = generateManhattanRoute([origin.lat, origin.lng], [destination.lat, destination.lng]);
        progress = Math.floor(Math.random() * 35) + 15;
        speed = Math.floor(Math.random() * 10) + 14;
        eta = new Date(Date.now() + (routeCoords.length - Math.floor((progress / 100) * routeCoords.length)) * 1000);
      } else {
        // active deliveries spread across city
        const zoneKey = zoneKeys[i % zoneKeys.length];
        const [startLat, startLng] = jitterPoint(zones[zoneKey], 0.03);
        origin = { lat: startLat, lng: startLng };

        const order = createdOrders[i];
        assignedOrder = order.orderId;
        destination = order.coordinates;
        await Order.findByIdAndUpdate(order._id, { status: ORDER_STATUS.OUT_FOR_DELIVERY, assignedDriver: driverId });

        routeCoords = generateManhattanRoute([origin.lat, origin.lng], [destination.lat, destination.lng]);
        eta = new Date(Date.now() + routeCoords.length * 1000);
      }

      drivers.push({
        driverId,
        name: driverNames[i],
        vehicleNumber: `DL${String(i+1).padStart(2,'0')}AB${Math.floor(1000+Math.random()*9000)}`,
        status,
        assignedOrder,
        origin,
        destination,
        coordinates: origin,
        progress,
        eta,
        speed,
        routeCoords,
        currentRouteIndex: Math.max(0, Math.floor((progress / 100) * Math.max(routeCoords.length - 1, 0))),
        routeColor
      });
    }
    
    await Driver.insertMany(drivers);
    console.log(`[Seeder] Successfully initialized true dispatch simulation.`);
  } catch (error) {
    console.error('[Seeder] Error seeding database:', error);
  }
}

module.exports = { seedDatabase, generateManhattanRoute, zones, zoneKeys };

const mongoose = require('mongoose');
const Driver = require('./models/Driver');
const Order = require('./models/Order');
const { DRIVER_STATUS, ORDER_STATUS } = require('./constants');

const drivers = [
  {
    driverId: 'DRV001',
    name: 'Rahul Sharma',
    vehicleNumber: 'DL01AB1234',
    coordinates: { lat: 28.6139, lng: 77.2090 }, // New Delhi
    speed: 40,
    status: DRIVER_STATUS.OUT_FOR_DELIVERY
  },
  {
    driverId: 'DRV002',
    name: 'Anita Desai',
    vehicleNumber: 'MH02CD5678',
    coordinates: { lat: 19.0760, lng: 72.8777 }, // Mumbai
    speed: 35,
    status: DRIVER_STATUS.TRAVELING
  },
  {
    driverId: 'DRV003',
    name: 'Arun Kumar',
    vehicleNumber: 'KA03EF9012',
    coordinates: { lat: 12.9716, lng: 77.5946 }, // Bangalore
    speed: 0,
    status: DRIVER_STATUS.IDLE
  }
];

const orders = [
  {
    orderId: 'ORD001',
    customerName: 'Priya Singh',
    deliveryAddress: 'Connaught Place, New Delhi',
    coordinates: { lat: 28.6304, lng: 77.2177 },
    status: ORDER_STATUS.OUT_FOR_DELIVERY
  },
  {
    orderId: 'ORD002',
    customerName: 'Vikram Mehta',
    deliveryAddress: 'Bandra West, Mumbai',
    coordinates: { lat: 19.0596, lng: 72.8295 },
    status: ORDER_STATUS.PENDING
  },
  {
    orderId: 'ORD003',
    customerName: 'Sneha Patel',
    deliveryAddress: 'Koramangala, Bangalore',
    coordinates: { lat: 12.9352, lng: 77.6245 },
    status: ORDER_STATUS.DELAYED
  }
];

async function seedDatabase() {
    console.log('Seeding data to memory server...');
    
    await Driver.deleteMany({});
    await Order.deleteMany({});
    
    const createdDrivers = await Driver.insertMany(drivers);
    
    orders[0].assignedDriver = createdDrivers[0]._id;
    orders[2].assignedDriver = createdDrivers[2]._id;
    
    await Order.insertMany(orders);
    
    console.log('Data seeded successfully to memory DB!');
}

seedDatabase();

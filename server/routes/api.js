const express = require('express');
const router = express.Router();
const Driver = require('../models/Driver');
const Order = require('../models/Order');
const { DRIVER_STATUS, ORDER_STATUS } = require('../constants');

// Drivers
router.get('/drivers', async (req, res) => {
  try {
    const drivers = await Driver.find();
    res.json(drivers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/drivers/:id', async (req, res) => {
  try {
    const driver = await Driver.findOne({ driverId: req.params.id });
    if (!driver) return res.status(404).json({ error: 'Driver not found' });
    res.json(driver);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/drivers/update-location', async (req, res) => {
  try {
    const { driverId, lat, lng } = req.body;
    const driver = await Driver.findOneAndUpdate(
      { driverId },
      { 'coordinates.lat': lat, 'coordinates.lng': lng, lastUpdated: new Date() },
      { new: true }
    );
    res.json(driver);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Orders
router.get('/orders', async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    const assignedDriverIds = orders
      .map((order) => order.assignedDriver)
      .filter(Boolean);

    const drivers = await Driver.find({ driverId: { $in: assignedDriverIds } });
    const driverById = {};
    drivers.forEach((driver) => {
      driverById[driver.driverId] = {
        driverId: driver.driverId,
        name: driver.name,
        vehicleNumber: driver.vehicleNumber
      };
    });

    const hydratedOrders = orders.map((order) => {
      const data = order.toObject();
      if (data.assignedDriver && driverById[data.assignedDriver]) {
        data.assignedDriver = driverById[data.assignedDriver];
      }
      return data;
    });

    res.json(hydratedOrders);
  } catch (error) {
    console.error('GET /orders failed:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/orders', async (req, res) => {
  try {
    const order = new Order(req.body);
    await order.save();
    res.status(201).json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findOneAndUpdate(
      { orderId: req.params.id },
      { status },
      { new: true }
    );
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Analytics
router.get('/analytics/summary', async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ status: ORDER_STATUS.PENDING });
    const deliveredOrders = await Order.countDocuments({ status: ORDER_STATUS.DELIVERED });
    const delayedOrders = await Order.countDocuments({ status: ORDER_STATUS.DELAYED });
    
    const activeDrivers = await Driver.countDocuments({
      status: { $in: [DRIVER_STATUS.TRAVELING, DRIVER_STATUS.OUT_FOR_DELIVERY, DRIVER_STATUS.DELAYED] }
    });
    
    res.json({
      totalOrders,
      pendingOrders,
      deliveredOrders,
      delayedOrders,
      activeDrivers
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// AI Endpoint
const { handleAiQuery } = require('../ai/endpoint');
const { applyOptimizationRecommendation } = require('../ai/applyOptimization');
router.post('/ai/query', handleAiQuery);
router.post('/ai/apply-optimization', async (req, res) => {
  try {
    const result = await applyOptimizationRecommendation(req.body || {});
    if (result.error) {
      return res.status(400).json({ success: false, response: result.error });
    }
    return res.json({ success: true, response: result.message, applied: result.applied, driverId: result.driverId });
  } catch (error) {
    console.error('POST /ai/apply-optimization failed:', error);
    return res.status(500).json({ success: false, response: 'Failed to apply optimization recommendation.' });
  }
});

module.exports = router;

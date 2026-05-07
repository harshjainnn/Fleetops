const mongoose = require('mongoose');
const { ORDER_STATUS } = require('../constants');

const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  customerName: { type: String, required: true },
  deliveryAddress: { type: String, required: true },
  coordinates: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  assignedDriver: { type: String, ref: 'Driver' },
  estimatedDeliveryTime: { type: Date },
  status: { 
    type: String, 
    enum: Object.values(ORDER_STATUS),
    default: ORDER_STATUS.PENDING 
  },
  deliveryHistoryLogs: [{
    status: String,
    timestamp: { type: Date, default: Date.now },
    note: String
  }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Order', orderSchema);

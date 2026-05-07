const mongoose = require('mongoose');

const deliveryLogSchema = new mongoose.Schema({
  orderId: { type: String, required: true },
  driverId: { type: String, required: true },
  action: { type: String, required: true }, // e.g., 'Picked Up', 'Delivered', 'Delayed'
  timestamp: { type: Date, default: Date.now },
  location: {
    lat: Number,
    lng: Number
  },
  notes: String
});

module.exports = mongoose.model('DeliveryLog', deliveryLogSchema);

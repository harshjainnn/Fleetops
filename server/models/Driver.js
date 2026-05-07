const mongoose = require('mongoose');
const { DRIVER_STATUS } = require('../constants');

const driverSchema = new mongoose.Schema({
  driverId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  vehicleNumber: { type: String, required: true },
  coordinates: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  speed: { type: Number, default: 0 },
  status: { 
    type: String, 
    enum: Object.values(DRIVER_STATUS),
    default: DRIVER_STATUS.OFFLINE 
  },
  assignedOrder: { type: String, default: null }, // ID of the currently assigned Order
  origin: {
    lat: { type: Number },
    lng: { type: Number }
  },
  destination: {
    lat: { type: Number },
    lng: { type: Number }
  },
  progress: { type: Number, default: 0 }, // 0 to 100 percentage
  eta: { type: Date },
  routeCoords: { type: [[Number]], default: [] }, // Array of [lat, lng]
  currentRouteIndex: { type: Number, default: 0 },
  routeColor: { type: String, default: 'blue' },
  lastUpdated: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Driver', driverSchema);

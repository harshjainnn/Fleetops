const ORDER_STATUS = {
  PENDING: 'pending',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  DELAYED: 'delayed'
};

const DRIVER_STATUS = {
  IDLE: 'idle',
  TRAVELING: 'traveling',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELAYED: 'delayed',
  OFFLINE: 'offline'
};

module.exports = { ORDER_STATUS, DRIVER_STATUS };

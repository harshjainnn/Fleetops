export function normalizeOrder(rawOrder) {
  if (!rawOrder || typeof rawOrder !== 'object') return null;

  const assignedDriver = rawOrder.assignedDriver;
  const assignedDriverName =
    typeof assignedDriver === 'object'
      ? assignedDriver?.name || assignedDriver?.driverId || 'Unknown'
      : assignedDriver || null;

  return {
    id: rawOrder._id || rawOrder.orderId || null,
    orderId: rawOrder.orderId || rawOrder.id || '--',
    customerName: rawOrder.customerName || 'Unknown Customer',
    deliveryAddress: rawOrder.deliveryAddress || '--',
    status: rawOrder.status ? String(rawOrder.status).toLowerCase().replace(/\s+/g, '_') : 'pending',
    assignedDriver: assignedDriver || null,
    assignedDriverName,
    coordinates: rawOrder.coordinates || null,
    createdAt: rawOrder.createdAt || null
  };
}

export function normalizeOrderCollection(payload) {
  const rawList = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.orders)
        ? payload.orders
        : [];

  return rawList
    .map(normalizeOrder)
    .filter((order) => order && order.orderId);
}

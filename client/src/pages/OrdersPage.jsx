import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Clock, CheckCircle, AlertTriangle, Truck, X } from 'lucide-react';
import { useFleet } from '../contexts/FleetContext';
import { ORDER_STATUS } from '../utils/constants';

function toTitleCase(value) {
  if (!value) return 'Unknown';
  return String(value)
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function calculateDistanceKm(pointA, pointB) {
  if (!pointA || !pointB) return 0;
  const lat1 = Number(pointA[0]);
  const lon1 = Number(pointA[1]);
  const lat2 = Number(pointB[0]);
  const lon2 = Number(pointB[1]);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return 0;

  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function formatEta(eta) {
  if (!eta) return 'N/A';
  const etaDate = new Date(eta);
  if (Number.isNaN(etaDate.getTime())) return 'N/A';
  const mins = Math.max(Math.round((etaDate.getTime() - Date.now()) / 60000), 0);
  return `${mins} mins`;
}

export default function OrdersPage() {
  const [filter, setFilter] = useState('All');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const { orders, drivers, loading } = useFleet();
  const { searchQuery = '' } = useOutletContext() || {};

  const statusColors = {
    [ORDER_STATUS.PENDING]: 'bg-gray-800 text-gray-300 border-gray-600',
    [ORDER_STATUS.OUT_FOR_DELIVERY]: 'bg-purple-900/50 text-purple-300 border-purple-700',
    [ORDER_STATUS.DELIVERED]: 'bg-green-900/50 text-green-300 border-green-700',
    [ORDER_STATUS.DELAYED]: 'bg-red-900/50 text-red-300 border-red-700'
  };

  const statusIcons = {
    [ORDER_STATUS.PENDING]: <Clock className="w-4 h-4 mr-1.5" />,
    [ORDER_STATUS.OUT_FOR_DELIVERY]: <Truck className="w-4 h-4 mr-1.5" />,
    [ORDER_STATUS.DELIVERED]: <CheckCircle className="w-4 h-4 mr-1.5" />,
    [ORDER_STATUS.DELAYED]: <AlertTriangle className="w-4 h-4 mr-1.5" />
  };

  const filterOptions = [
    { label: 'All', value: 'All' },
    { label: 'Pending', value: ORDER_STATUS.PENDING },
    { label: 'Out For Delivery', value: ORDER_STATUS.OUT_FOR_DELIVERY },
    { label: 'Delivered', value: ORDER_STATUS.DELIVERED },
    { label: 'Delayed', value: ORDER_STATUS.DELAYED }
  ];

  const query = String(searchQuery || '').trim().toLowerCase();
  const statusFilteredOrders = filter === 'All' ? orders : orders.filter(o => o.status === filter);
  const filteredOrders = !query
    ? statusFilteredOrders
    : statusFilteredOrders.filter((order) => {
        const searchable = [
          order.orderId,
          order.customerName,
          order.assignedDriver,
          order.assignedDriverName,
          order.deliveryAddress,
          order.status
        ]
          .join(' ')
          .toLowerCase();
        return searchable.includes(query);
      });

  const selectedDriver = useMemo(() => {
    if (!selectedOrder) return null;
    return (
      drivers.find((driver) => driver.driverId === selectedOrder.assignedDriver) ||
      drivers.find((driver) => driver.name === selectedOrder.assignedDriverName) ||
      null
    );
  }, [drivers, selectedOrder]);

  const routeStats = useMemo(() => {
    if (!selectedDriver) return null;
    const routeCoords = Array.isArray(selectedDriver.routeCoordinates)
      ? selectedDriver.routeCoordinates
      : [];
    const totalCheckpoints = routeCoords.length;
    const currentIndex = Number.isFinite(selectedDriver.currentRouteIndex) ? selectedDriver.currentRouteIndex : 0;
    const remainingCoords = routeCoords.slice(Math.max(currentIndex, 0));
    let remainingDistanceKm = 0;
    for (let i = 0; i < remainingCoords.length - 1; i += 1) {
      remainingDistanceKm += calculateDistanceKm(remainingCoords[i], remainingCoords[i + 1]);
    }

    return {
      totalCheckpoints,
      remainingDistanceKm: Number(remainingDistanceKm.toFixed(2)),
      summary:
        totalCheckpoints > 0
          ? `${Math.max(totalCheckpoints - currentIndex, 0)} checkpoints remaining on active corridor`
          : 'Route checkpoints unavailable'
    };
  }, [selectedDriver]);

  const closeModal = () => setSelectedOrder(null);

  return (
    <div className="h-full flex flex-col">
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Orders Management</h1>
          <p className="text-gray-400 mt-1">Track and manage active deliveries</p>
        </div>
        
        <div className="flex bg-gray-800 rounded-lg p-1 border border-gray-700">
          {filterOptions.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                filter === f.value ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden flex-1 border border-gray-700 shadow-xl">
        <div className="overflow-x-auto overflow-y-auto max-h-[65vh] scroll-smooth">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-800/95 border-b border-gray-700 text-sm font-medium text-gray-400 backdrop-blur-sm">
                <th className="p-4 pl-6 sticky top-0 bg-gray-800/95 z-10">Order ID</th>
                <th className="p-4 sticky top-0 bg-gray-800/95 z-10">Customer</th>
                <th className="p-4 sticky top-0 bg-gray-800/95 z-10">Destination</th>
                <th className="p-4 sticky top-0 bg-gray-800/95 z-10">Assigned Driver</th>
                <th className="p-4 sticky top-0 bg-gray-800/95 z-10">Status</th>
                <th className="p-4 pr-6 text-right sticky top-0 bg-gray-800/95 z-10">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 text-sm">
              {loading ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-gray-500">Loading orders...</td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-gray-500">No orders found.</td>
                </tr>
              ) : (
                filteredOrders.map(order => (
                  <tr key={order._id || order.orderId} className="hover:bg-gray-800/30 transition-colors group">
                    <td className="p-4 pl-6 font-medium text-white">{order.orderId}</td>
                    <td className="p-4 text-gray-300">{order.customerName}</td>
                    <td className="p-4 text-gray-400 max-w-xs truncate">{order.deliveryAddress}</td>
                    <td className="p-4">
                      {order.assignedDriverName ? (
                        <div className="flex items-center">
                          <div className="w-6 h-6 rounded-full bg-blue-900 text-blue-300 flex items-center justify-center text-xs font-bold mr-2">
                            {order.assignedDriverName.charAt(0)}
                          </div>
                          <span className="text-gray-300">{order.assignedDriverName}</span>
                        </div>
                      ) : (
                        <span className="text-gray-500 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${statusColors[order.status] || 'bg-gray-800 text-gray-300 border-gray-600'}`}>
                        {statusIcons[order.status] || <Clock className="w-4 h-4 mr-1.5" />}
                        {order.status}
                      </span>
                    </td>
                    <td className="p-4 pr-6 text-right">
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="text-blue-400 hover:text-blue-300 font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selectedOrder && (
        <div
          onClick={closeModal}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-2xl glass-panel rounded-2xl border border-gray-700 shadow-2xl p-6 animate-in zoom-in-95 duration-200"
          >
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-xl font-semibold text-white">Operational Delivery Details</h2>
                <p className="text-sm text-gray-400 mt-1">{selectedOrder.orderId}</p>
              </div>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-white transition-colors"
                aria-label="Close details panel"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="bg-gray-900/40 rounded-xl p-4 border border-gray-800">
                <p className="text-gray-500 mb-1">Customer Name</p>
                <p className="text-gray-200">{selectedOrder.customerName}</p>
              </div>
              <div className="bg-gray-900/40 rounded-xl p-4 border border-gray-800">
                <p className="text-gray-500 mb-1">Assigned Driver</p>
                <p className="text-gray-200">{selectedOrder.assignedDriverName || selectedOrder.assignedDriver || 'Unassigned'}</p>
              </div>
              <div className="bg-gray-900/40 rounded-xl p-4 border border-gray-800">
                <p className="text-gray-500 mb-1">Order Status</p>
                <p className="text-gray-200">{toTitleCase(selectedOrder.status)}</p>
              </div>
              <div className="bg-gray-900/40 rounded-xl p-4 border border-gray-800">
                <p className="text-gray-500 mb-1">ETA</p>
                <p className="text-gray-200">{formatEta(selectedDriver?.eta)}</p>
              </div>
              <div className="bg-gray-900/40 rounded-xl p-4 border border-gray-800">
                <p className="text-gray-500 mb-1">Driver Status</p>
                <p className="text-gray-200">{toTitleCase(selectedDriver?.status || 'unknown')}</p>
              </div>
              <div className="bg-gray-900/40 rounded-xl p-4 border border-gray-800">
                <p className="text-gray-500 mb-1">Delivery Progress</p>
                <p className="text-gray-200">{Math.round(selectedDriver?.progress || 0)}%</p>
              </div>
            </div>

            <div className="mt-4 bg-gray-900/40 rounded-xl p-4 border border-gray-800">
              <p className="text-gray-500 mb-1">Destination</p>
              <p className="text-gray-200">{selectedOrder.deliveryAddress}</p>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="bg-gray-900/40 rounded-xl p-4 border border-gray-800">
                <p className="text-gray-500 mb-1">Route Summary</p>
                <p className="text-gray-200">{routeStats?.summary || 'Awaiting route telemetry'}</p>
              </div>
              <div className="bg-gray-900/40 rounded-xl p-4 border border-gray-800">
                <p className="text-gray-500 mb-1">Delay Information</p>
                <p className="text-gray-200">
                  {selectedOrder.status === ORDER_STATUS.DELAYED || selectedDriver?.status === 'delayed'
                    ? 'Delay active due to live traffic conditions'
                    : 'No active delay signal'}
                </p>
              </div>
            </div>

            {routeStats && routeStats.totalCheckpoints > 0 && (
              <div className="mt-4 bg-blue-950/30 rounded-xl p-4 border border-blue-800/50 text-sm">
                <p className="text-blue-300 font-medium mb-1">Route Technical Snapshot</p>
                <p className="text-blue-200">
                  Total checkpoints: {routeStats.totalCheckpoints} | Estimated remaining distance: {routeStats.remainingDistanceKm} km
                </p>
              </div>
            )}

            <p className="mt-4 text-xs text-gray-500">
              Last updated: {selectedDriver?.lastUpdated ? new Date(selectedDriver.lastUpdated).toLocaleString() : 'Awaiting live update'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

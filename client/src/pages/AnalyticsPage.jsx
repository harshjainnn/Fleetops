import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, Truck, CheckCircle, AlertTriangle } from 'lucide-react';
import { useFleet } from '../contexts/FleetContext';
import { ORDER_STATUS, DRIVER_STATUS } from '../utils/constants';

export default function AnalyticsPage() {
  const { drivers, orders, loading } = useFleet();
  const { searchQuery = '' } = useOutletContext() || {};
  const normalizedQuery = String(searchQuery || '').trim().toLowerCase();

  const summary = useMemo(() => {
    return {
      totalOrders: orders.length,
      pendingOrders: orders.filter(o => o.status === ORDER_STATUS.PENDING).length,
      deliveredOrders: orders.filter(o => o.status === ORDER_STATUS.DELIVERED).length,
      delayedOrders: orders.filter(o => o.status === ORDER_STATUS.DELAYED).length,
      activeDrivers: drivers.filter(d => d.status !== DRIVER_STATUS.OFFLINE && d.status !== DRIVER_STATUS.IDLE).length
    };
  }, [orders, drivers]);

  const filteredQuickMetrics = useMemo(() => {
    if (!normalizedQuery) return null;
    const matchedOrders = orders.filter((order) =>
      [order.orderId, order.customerName, order.deliveryAddress, order.status, order.assignedDriverName, order.assignedDriver]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    );
    const matchedDrivers = drivers.filter((driver) =>
      [driver.driverId, driver.name, driver.status, driver.vehicleNumber, driver.assignedOrder]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    );

    return {
      orders: matchedOrders.length,
      drivers: matchedDrivers.length,
      delayedOrders: matchedOrders.filter((order) => order.status === ORDER_STATUS.DELAYED).length
    };
  }, [normalizedQuery, orders, drivers]);

  if (loading && orders.length === 0) {
    return <div className="p-8 text-gray-400">Loading analytics...</div>;
  }

  const pieData = [
    { name: 'Delivered', value: summary.deliveredOrders, color: '#10b981' },
    { name: 'Pending', value: summary.pendingOrders, color: '#3b82f6' },
    { name: 'Delayed', value: summary.delayedOrders, color: '#ef4444' },
  ];

  const barData = [
    { name: 'Mon', deliveries: 12 },
    { name: 'Tue', deliveries: 19 },
    { name: 'Wed', deliveries: 15 },
    { name: 'Thu', deliveries: 22 },
    { name: 'Today', deliveries: summary.deliveredOrders },
  ];

  return (
    <div className="h-full flex flex-col space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Fleet Analytics</h1>
        <p className="text-gray-400 mt-1">Performance metrics and operational insights</p>
      </div>
      {filteredQuickMetrics && (
        <div className="glass-panel rounded-xl border border-blue-800/50 bg-blue-900/20 px-4 py-3 text-sm text-blue-200">
          Filtered view for "{searchQuery}": {filteredQuickMetrics.orders} orders, {filteredQuickMetrics.drivers} drivers, {filteredQuickMetrics.delayedOrders} delayed orders.
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="glass-panel p-6 rounded-2xl border border-gray-700">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-400 font-medium">Total Orders</p>
              <h3 className="text-3xl font-bold mt-1 text-white">{summary.totalOrders}</h3>
            </div>
            <div className="p-3 bg-blue-900/30 rounded-xl text-blue-500">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-4 text-xs text-green-400 flex items-center">
            <span className="font-bold">+12%</span> <span className="text-gray-500 ml-1">vs last week</span>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl border border-gray-700">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-400 font-medium">Active Drivers</p>
              <h3 className="text-3xl font-bold mt-1 text-white">{summary.activeDrivers}</h3>
            </div>
            <div className="p-3 bg-green-900/30 rounded-xl text-green-500">
              <Truck className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-4 text-xs text-green-400 flex items-center">
            <span className="font-bold">+2</span> <span className="text-gray-500 ml-1">drivers online</span>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl border border-gray-700">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-400 font-medium">Delivered Today</p>
              <h3 className="text-3xl font-bold mt-1 text-white">{summary.deliveredOrders}</h3>
            </div>
            <div className="p-3 bg-indigo-900/30 rounded-xl text-indigo-500">
              <CheckCircle className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-4 text-xs text-gray-500 flex items-center">
            On schedule
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl border border-gray-700">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm text-gray-400 font-medium">Delayed Orders</p>
              <h3 className="text-3xl font-bold mt-1 text-red-400">{summary.delayedOrders}</h3>
            </div>
            <div className="p-3 bg-red-900/30 rounded-xl text-red-500">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-4 text-xs text-red-400 flex items-center">
            Requires attention
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-[300px]">
        <div className="glass-panel p-6 rounded-2xl border border-gray-700 lg:col-span-2 flex flex-col">
          <h3 className="text-lg font-semibold mb-6 text-gray-200">Delivery Volume Trends</h3>
          <div className="flex-1 w-full min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                <XAxis dataKey="name" stroke="#9ca3af" axisLine={false} tickLine={false} />
                <YAxis stroke="#9ca3af" axisLine={false} tickLine={false} />
                <Tooltip 
                  cursor={{ fill: '#374151', opacity: 0.4 }}
                  contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff', borderRadius: '0.5rem' }}
                />
                <Bar dataKey="deliveries" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl border border-gray-700 flex flex-col">
          <h3 className="text-lg font-semibold mb-6 text-gray-200">Order Status Distribution</h3>
          <div className="flex-1 w-full flex items-center justify-center min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff', borderRadius: '0.5rem' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center space-x-4 mt-4">
            {pieData.map(item => (
              <div key={item.name} className="flex items-center text-xs text-gray-400">
                <span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: item.color }}></span>
                {item.name}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

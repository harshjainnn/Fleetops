import { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { Map, Package, BarChart2, Bot, Bell, Search, Truck } from 'lucide-react';
import { useFleet } from '../contexts/FleetContext';
import { DRIVER_STATUS, ORDER_STATUS } from '../utils/constants';

function normalizeText(value) {
  return String(value || '').toLowerCase();
}

function relativeTimeLabel(timestamp) {
  const delta = Math.max(Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000), 0);
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  return `${Math.floor(delta / 3600)}h ago`;
}

export default function DashboardLayout() {
  const { activities, drivers, orders } = useFleet();
  const [searchQuery, setSearchQuery] = useState('');
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const notificationKeysRef = useRef(new Set());
  const notificationPanelRef = useRef(null);
  const notificationBellRef = useRef(null);
  const [panelPosition, setPanelPosition] = useState({ top: 80, right: 24 });

  const navItems = [
    { name: 'Live Map', path: '/map', icon: Map },
    { name: 'Orders', path: '/orders', icon: Package },
    { name: 'Analytics', path: '/analytics', icon: BarChart2 },
    { name: 'AI Assistant', path: '/ai', icon: Bot },
  ];

  const searchStats = useMemo(() => {
    const q = normalizeText(searchQuery).trim();
    if (!q) return { total: 0, orders: 0, drivers: 0 };

    const orderMatches = orders.filter((order) => {
      const blob = normalizeText([
        order.orderId,
        order.customerName,
        order.deliveryAddress,
        order.assignedDriver,
        order.assignedDriverName,
        order.status
      ].join(' '));
      return blob.includes(q);
    });

    const driverMatches = drivers.filter((driver) => {
      const blob = normalizeText([
        driver.driverId,
        driver.name,
        driver.status,
        driver.vehicleNumber,
        driver.assignedOrder
      ].join(' '));
      return blob.includes(q);
    });

    return { total: orderMatches.length + driverMatches.length, orders: orderMatches.length, drivers: driverMatches.length };
  }, [searchQuery, orders, drivers]);

  useEffect(() => {
    if (!isNotificationOpen) return;
    setUnreadCount(0);
  }, [isNotificationOpen]);

  useEffect(() => {
    const onClickOutside = (event) => {
      const clickedInsidePanel = notificationPanelRef.current?.contains(event.target);
      const clickedBell = notificationBellRef.current?.contains(event.target);
      if (!clickedInsidePanel && !clickedBell) {
        setIsNotificationOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    const updatePanelPosition = () => {
      const bellRect = notificationBellRef.current?.getBoundingClientRect();
      if (!bellRect) return;
      setPanelPosition({
        top: Math.round(bellRect.bottom + 12),
        right: Math.max(Math.round(window.innerWidth - bellRect.right), 12)
      });
    };

    if (isNotificationOpen) {
      updatePanelPosition();
    }

    window.addEventListener('resize', updatePanelPosition);
    window.addEventListener('scroll', updatePanelPosition, true);
    return () => {
      window.removeEventListener('resize', updatePanelPosition);
      window.removeEventListener('scroll', updatePanelPosition, true);
    };
  }, [isNotificationOpen]);

  useEffect(() => {
    const incoming = [];
    const pushNotification = (item) => {
      if (!item?.id || notificationKeysRef.current.has(item.id)) return;
      notificationKeysRef.current.add(item.id);
      incoming.push({ ...item, createdAt: item.createdAt || new Date().toISOString(), read: false });
    };

    for (const activity of activities.slice(0, 20)) {
      const message = activity.message || '';
      const lower = normalizeText(message);
      let severity = 'operational';
      let title = 'Operations Update';
      if (activity.type === 'delay' || lower.includes('delayed')) {
        severity = 'critical';
        title = 'Order Delayed';
      } else if (activity.type === 'delivery' || lower.includes('delivered')) {
        severity = 'success';
        title = 'Order Delivered';
      } else if (activity.type === 'assignment' || lower.includes('assigned')) {
        severity = 'operational';
        title = 'Driver Assigned';
      } else if (activity.type === 'recovery' || lower.includes('resumed')) {
        severity = 'warning';
        title = 'Driver Recovered';
      }

      pushNotification({
        id: `activity-${activity.id}`,
        title,
        message,
        severity,
        createdAt: activity.timestamp
      });
    }

    const delayedDrivers = drivers.filter((driver) => driver.status === DRIVER_STATUS.DELAYED);
    if (delayedDrivers.length >= 2) {
      pushNotification({
        id: `congestion-${delayedDrivers.map((d) => d.driverId).join('-')}`,
        title: 'High Congestion Alert',
        message: `${delayedDrivers.length} drivers are currently delayed across active corridors.`,
        severity: 'critical'
      });
    }

    const idleThresholdMs = 3 * 60 * 1000;
    const now = Date.now();
    drivers
      .filter((driver) => driver.status === DRIVER_STATUS.IDLE && driver.lastUpdated)
      .forEach((driver) => {
        const updatedAt = new Date(driver.lastUpdated).getTime();
        if (Number.isFinite(updatedAt) && now - updatedAt >= idleThresholdMs) {
          pushNotification({
            id: `idle-${driver.driverId}-${Math.floor((now - updatedAt) / idleThresholdMs)}`,
            title: 'Driver Idle Too Long',
            message: `${driver.driverId} has remained idle beyond dispatch threshold.`,
            severity: 'warning',
            createdAt: driver.lastUpdated
          });
        }
      });

    if (delayedDrivers.length > 0) {
      const candidate = drivers.find((driver) => driver.status === DRIVER_STATUS.IDLE);
      if (candidate) {
        pushNotification({
          id: `route-rec-${candidate.driverId}-${delayedDrivers.length}`,
          title: 'Route Optimization Recommendation',
          message: `Reposition ${candidate.driverId} to support delayed demand pockets and reduce spillover risk.`,
          severity: 'operational'
        });
      }
    }

    if (incoming.length > 0) {
      setNotifications((prev) => [...incoming, ...prev].slice(0, 40));
      if (!isNotificationOpen) {
        setUnreadCount((count) => Math.min(count + incoming.length, 99));
      }
    }
  }, [activities, drivers, orders, isNotificationOpen]);

  const severityStyles = {
    critical: 'border-red-700/60 bg-red-900/20 text-red-300',
    warning: 'border-yellow-700/60 bg-yellow-900/20 text-yellow-300',
    operational: 'border-blue-700/60 bg-blue-900/20 text-blue-300',
    success: 'border-green-700/60 bg-green-900/20 text-green-300'
  };

  return (
    <div className="flex h-screen bg-[#111827] text-white overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-gray-800 bg-[#1f2937] flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-gray-800">
          <Truck className="h-8 w-8 text-blue-500 mr-3" />
          <span className="text-xl font-bold tracking-wider">FLEET<span className="text-blue-500">OPS</span></span>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.name}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center px-4 py-3 rounded-xl transition-all duration-200 ${
                    isActive 
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' 
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`
                }
              >
                <Icon className="h-5 w-5 mr-3" />
                <span className="font-medium">{item.name}</span>
              </NavLink>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-gray-800">
          <div className="flex items-center bg-gray-800 rounded-xl p-3">
            <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center font-bold">
              AD
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium">Admin User</p>
              <p className="text-xs text-gray-400">Control Center</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Top Navbar */}
        <header className="h-16 flex-shrink-0 flex items-center justify-between px-8 border-b border-gray-800 bg-[#111827]/80 backdrop-blur-md z-10">
          <div className="flex-1 flex items-center">
            <div className="relative w-96 hidden md:block">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                <Search className="h-5 w-5 text-gray-500" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="block w-full rounded-full bg-gray-800 border-none pl-10 pr-3 py-2 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                placeholder="Search orders, drivers, locations..."
              />
            </div>
            {searchQuery.trim() && (
              <div className="ml-4 text-xs text-gray-400 hidden lg:block">
                {searchStats.total} matches ({searchStats.orders} orders, {searchStats.drivers} drivers)
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-6">
            <div className="flex items-center text-sm font-medium">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500 mr-2 animate-pulse"></span>
              System Online
            </div>
            <div className="relative">
            <button
              ref={notificationBellRef}
              onClick={() => setIsNotificationOpen((open) => !open)}
              className="relative p-2 text-gray-400 hover:text-white transition-colors"
            >
              <Bell className="h-6 w-6" />
              {unreadCount > 0 ? (
                <span className="absolute -top-0.5 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[10px] leading-[18px] text-white border border-[#111827] text-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              ) : (
                <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-green-500 border-2 border-[#111827]"></span>
              )}
            </button>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-8 relative">
          {/* Subtle background glow effect */}
          <div className="absolute top-[-10%] right-[-5%] w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute bottom-[-10%] left-[-5%] w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none"></div>
          
          <div className="relative z-10 h-full">
            <Outlet context={{ searchQuery, setSearchQuery }} />
          </div>
        </div>
      </main>
      {isNotificationOpen && createPortal(
        <div
          ref={notificationPanelRef}
          style={{ top: `${panelPosition.top}px`, right: `${panelPosition.right}px` }}
          className="fixed w-96 max-w-[90vw] glass-panel border border-gray-700 rounded-2xl shadow-2xl overflow-hidden z-[9999] animate-in fade-in zoom-in-95 duration-200"
        >
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Live Notifications</h3>
            <button
              onClick={() => {
                setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
                setUnreadCount(0);
              }}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Mark all read
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-4 text-sm text-gray-500">No operational notifications yet.</p>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`px-4 py-3 border-b border-gray-800/70 last:border-b-0 ${notification.read ? 'opacity-70' : 'opacity-100'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-100">{notification.title}</p>
                      <p className="text-xs text-gray-400 mt-1">{notification.message}</p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${severityStyles[notification.severity] || severityStyles.operational}`}>
                      {notification.severity}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-2">{relativeTimeLabel(notification.createdAt)}</p>
                </div>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

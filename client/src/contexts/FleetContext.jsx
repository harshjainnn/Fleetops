import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { normalizeDriverCollection } from '../utils/normalizeDriver';
import { normalizeOrderCollection } from '../utils/normalizeOrder';

const FleetContext = createContext(null);
const API_URL = 'https://fleetops-u9qd.onrender.com/api';
const SOCKET_SERVER_URL = 'https://fleetops-u9qd.onrender.com';

export function FleetProvider({ children }) {
  const [drivers, setDrivers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef();

  useEffect(() => {
    // Initial fetch to paint UI fast
    Promise.all([
      axios.get(`${API_URL}/drivers`).catch(() => ({ data: [] })),
      axios.get(`${API_URL}/orders`).catch(() => ({ data: [] }))
    ])
    .then(([driversRes, ordersRes]) => {
      setDrivers(normalizeDriverCollection(driversRes.data));
      setOrders(normalizeOrderCollection(ordersRes.data));
      setLoading(false);
    });

    socketRef.current = io(SOCKET_SERVER_URL);

    socketRef.current.on('connect', () => {
      console.log('FLEET SOCKET CONNECTED');
    });

    socketRef.current.on('fleet:update', (fleetState) => {
      if (fleetState.drivers) setDrivers(normalizeDriverCollection(fleetState.drivers));
      if (fleetState.orders) setOrders(normalizeOrderCollection(fleetState.orders));
      if (fleetState.activities) setActivities(fleetState.activities);
      setLoading(false);
    });

    socketRef.current.on('disconnect', () => {
      console.log('FLEET SOCKET DISCONNECTED');
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.off('connect');
        socketRef.current.off('fleet:update');
        socketRef.current.off('disconnect');
        socketRef.current.disconnect();
      }
    };
  }, []);

  return (
    <FleetContext.Provider value={{ drivers, orders, activities, loading }}>
      {children}
    </FleetContext.Provider>
  );
}

export function useFleet() {
  const context = useContext(FleetContext);
  if (!context) {
    throw new Error('useFleet must be used within a FleetProvider');
  }
  return context;
}

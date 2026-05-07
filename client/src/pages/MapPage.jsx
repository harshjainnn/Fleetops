import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Circle, CircleMarker, MapContainer, Marker, Popup, Polyline, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useFleet } from '../contexts/FleetContext';
import { DRIVER_STATUS } from '../utils/constants';

const routeColors = {
  green: '#10b981',
  blue: '#3b82f6',
  red: '#ef4444',
  grey: '#9ca3af'
};

const markerIconsCache = {};
const etaIcon = L.divIcon({
  className: 'eta-chip-icon',
  html: '<div class="eta-chip">ETA</div>',
  iconSize: [56, 20],
  iconAnchor: [28, -2]
});

const getDriverIcon = (colorClass, isSelected) => {
  const key = `${colorClass}-${isSelected ? 'selected' : 'default'}`;
  if (!markerIconsCache[key]) {
    markerIconsCache[key] = L.divIcon({
      className: 'driver-icon-shell',
      html: `<div class="driver-hit-area">
        <div class="driver-core ${colorClass} ${isSelected ? 'driver-selected' : ''}"></div>
      </div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      popupAnchor: [0, -10]
    });
  }
  return markerIconsCache[key];
};

const deliveryZones = [
  { id: 'z1', name: 'North Delhi', center: [28.7041, 77.1025], radius: 3200, color: '#3b82f6' },
  { id: 'z2', name: 'South Delhi', center: [28.5355, 77.3910], radius: 3000, color: '#10b981' },
  { id: 'z3', name: 'Gurgaon', center: [28.4595, 77.0266], radius: 3500, color: '#f59e0b' },
  { id: 'z4', name: 'Noida', center: [28.5700, 77.3200], radius: 3200, color: '#8b5cf6' },
  { id: 'z5', name: 'East Delhi', center: [28.6280, 77.2789], radius: 2900, color: '#06b6d4' },
  { id: 'z6', name: 'Central Hub', center: [28.6139, 77.2090], radius: 1700, color: '#eab308' }
];

const trafficHotspots = [
  { id: 't1', center: [28.6271, 77.2201], radius: 1150, color: '#f97316', fillOpacity: 0.08 },
  { id: 't2', center: [28.5522, 77.2516], radius: 1400, color: '#ef4444', fillOpacity: 0.11 },
  { id: 't3', center: [28.5438, 77.3594], radius: 1000, color: '#f97316', fillOpacity: 0.08 }
];

const SOCKET_SERVER_URL = 'http://localhost:5000';
const API_URL = 'http://localhost:5000/api';
const LERP_FACTOR = 0.08;
const MAP_THEMES = {
  standardDark: {
    label: 'Standard Dark',
    tileUrl: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    overlayClass: 'blue-tint-overlay-minimal',
    containerClass: 'map-theme-standard'
  }
};

const DriverMarker = memo(function DriverMarker({ driver, isSelected, onSelect, showEta, etaAnchorYOffset }) {
  const markerRef = useRef(null);
  const etaMarkerRef = useRef(null);
  const targetPositionRef = useRef({
    lat: driver.coordinates.lat,
    lng: driver.coordinates.lng
  });
  const displayPositionRef = useRef({
    lat: driver.coordinates.lat,
    lng: driver.coordinates.lng
  });

  useEffect(() => {
    targetPositionRef.current = {
      lat: driver.coordinates.lat,
      lng: driver.coordinates.lng
    };
  }, [driver.coordinates.lat, driver.coordinates.lng]);

  useEffect(() => {
    let animationFrameId;
    const animate = () => {
      const current = displayPositionRef.current;
      const target = targetPositionRef.current;

      const nextLat = current.lat + (target.lat - current.lat) * LERP_FACTOR;
      const nextLng = current.lng + (target.lng - current.lng) * LERP_FACTOR;
      displayPositionRef.current = { lat: nextLat, lng: nextLng };

      if (markerRef.current) {
        markerRef.current.setLatLng([nextLat, nextLng]);
        markerRef.current.setZIndexOffset(
          isSelected ? 1200 : driver.status === DRIVER_STATUS.DELAYED ? 900 : 600
        );
      }

      if (etaMarkerRef.current) {
        etaMarkerRef.current.setLatLng([nextLat, nextLng]);
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isSelected, driver.status]);

  const positions = driver.routeCoords || [];
  const shouldShowActiveRoute = positions.length > 0 && driver.status !== DRIVER_STATUS.OFFLINE && driver.status !== DRIVER_STATUS.IDLE;
  const etaLabel = driver.eta
    ? `ETA ${new Date(driver.eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'ETA --';

  return (
    <>
      {shouldShowActiveRoute && (
        <Polyline
          positions={positions}
          pathOptions={{
            color: driver.status === DRIVER_STATUS.DELAYED ? '#ef4444' : '#38bdf8',
            weight: isSelected ? 4 : 2,
            opacity: isSelected ? 0.85 : 0.15,
            className: driver.status === DRIVER_STATUS.DELAYED ? 'delayed-route' : 'active-route'
          }}
        />
      )}

      {isSelected && driver.destination?.lat && driver.destination?.lng && (
        <CircleMarker
          center={[driver.destination.lat, driver.destination.lng]}
          radius={6}
          pathOptions={{ color: '#00f2fe', fillColor: '#00f2fe', fillOpacity: 0.8, weight: 2 }}
        />
      )}

      <Marker
        ref={markerRef}
        position={[driver.coordinates.lat, driver.coordinates.lng]}
        icon={getDriverIcon(`marker-${driver.routeColor}`, isSelected)}
        eventHandlers={{ click: () => onSelect(driver.driverId) }}
        zIndexOffset={isSelected ? 1200 : driver.status === DRIVER_STATUS.DELAYED ? 900 : 600}
      >
        <Popup className="custom-popup" onClose={() => onSelect(null)}>
          <div className="w-72">
            <div className="border-b border-gray-700 pb-3 mb-3 flex justify-between items-start">
              <div>
                <h3 className="font-bold text-lg text-white">{driver.name}</h3>
                <p className="text-xs text-gray-400 tracking-wide font-mono">{driver.driverId}</p>
              </div>
              <div className="text-right">
                <span className="font-bold text-xs flex items-center gap-1.5 justify-end" style={{ color: routeColors[driver.routeColor] || '#3b82f6' }}>
                  <span className="w-2 h-2 rounded-full bg-current shadow-[0_0_5px_currentColor]"></span>
                  {driver.status}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              {driver.assignedOrder ? (
                <div className="bg-gray-800/80 p-2.5 rounded-lg border border-gray-700">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-400 text-[10px] uppercase tracking-wider">Assigned Order</span>
                    <span className="font-mono text-xs text-white">{driver.assignedOrder}</span>
                  </div>
                  <div className="w-full bg-gray-900 rounded-full h-1.5 mb-1 overflow-hidden">
                    <div className="bg-blue-500 h-1.5 rounded-full transition-all duration-1000 ease-linear" style={{ width: `${driver.progress || 0}%` }}></div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-gray-500">{driver.progress || 0}%</span>
                    <span className="text-[10px] text-gray-400">{etaLabel}</span>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-800/80 p-2.5 rounded-lg border border-gray-700 text-center text-gray-500 text-xs italic">
                  No Active Assignment
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-gray-800/80 p-2.5 rounded-lg border border-gray-700">
                  <p className="text-gray-400 text-[10px] uppercase tracking-wider mb-1">Speed</p>
                  <p className="font-mono text-sm text-white">{driver.speed} <span className="text-xs text-gray-400">km/h</span></p>
                </div>
                <div className="bg-gray-800/80 p-2.5 rounded-lg border border-gray-700">
                  <p className="text-gray-400 text-[10px] uppercase tracking-wider mb-1">Vehicle</p>
                  <p className="font-mono text-sm text-white">{driver.vehicleNumber}</p>
                </div>
              </div>

              <div className="text-[10px] text-gray-500 text-right mt-1 font-mono">
                UPDATED: {driver.lastUpdated ? new Date(driver.lastUpdated).toLocaleTimeString() : '--'}
              </div>
            </div>
          </div>
        </Popup>
      </Marker>

      {driver.assignedOrder && showEta && (
        <Marker
          ref={etaMarkerRef}
          position={[driver.coordinates.lat, driver.coordinates.lng]}
          icon={L.divIcon({
            ...etaIcon.options,
            iconAnchor: [28, etaAnchorYOffset],
            html: `<div class="eta-chip">${etaLabel}</div>`
          })}
          interactive={false}
          zIndexOffset={500}
        />
      )}
    </>
  );
});

export default function MapPage() {
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const { drivers, activities, loading, orders } = useFleet();
  const { searchQuery = '' } = useOutletContext() || {};

  const center = [28.60, 77.20];
  const zoom = 11;
  const fallbackDrivers = useMemo(
    () => ([
      {
        driverId: 'SIM001',
        name: 'Fallback Driver 1',
        vehicleNumber: 'DL00SIM1001',
        coordinates: { lat: 28.6139, lng: 77.209 },
        speed: 0,
        status: 'Idle',
        routeColor: 'grey',
        routeCoords: [],
        progress: 0
      },
      {
        driverId: 'SIM002',
        name: 'Fallback Driver 2',
        vehicleNumber: 'DL00SIM1002',
        coordinates: { lat: 28.5355, lng: 77.391 },
        speed: 0,
        status: 'Idle',
        routeColor: 'grey',
        routeCoords: [],
        progress: 0
      }
    ]),
    []
  );
  
  const renderedDrivers = drivers.length > 0 ? drivers : fallbackDrivers;
  const normalizedQuery = String(searchQuery || '').trim().toLowerCase();
  const matchedDriverIds = useMemo(() => {
    if (!normalizedQuery) return new Set();
    const matchingOrderIds = new Set(
      (orders || [])
        .filter((order) => {
          const blob = [
            order.orderId,
            order.customerName,
            order.deliveryAddress,
            order.status,
            order.assignedDriver,
            order.assignedDriverName
          ]
            .join(' ')
            .toLowerCase();
          return blob.includes(normalizedQuery);
        })
        .map((order) => order.orderId)
    );

    return new Set(
      renderedDrivers
        .filter((driver) => {
          const blob = [
            driver.driverId,
            driver.name,
            driver.status,
            driver.vehicleNumber,
            driver.assignedOrder
          ]
            .join(' ')
            .toLowerCase();
          return blob.includes(normalizedQuery) || matchingOrderIds.has(driver.assignedOrder);
        })
        .map((driver) => driver.driverId)
    );
  }, [normalizedQuery, orders, renderedDrivers]);

  useEffect(() => {
    if (!normalizedQuery || matchedDriverIds.size === 0) return;
    if (!selectedDriverId || !matchedDriverIds.has(selectedDriverId)) {
      setSelectedDriverId(Array.from(matchedDriverIds)[0]);
    }
  }, [normalizedQuery, matchedDriverIds, selectedDriverId]);

  const activeTheme = MAP_THEMES.standardDark;
  const radar = useMemo(() => {
    const active = renderedDrivers.filter(d => d.status !== DRIVER_STATUS.OFFLINE).length;
    const moving = renderedDrivers.filter(d => (d.speed || 0) > 0).length;
    const delayed = renderedDrivers.filter(d => d.status === DRIVER_STATUS.DELAYED).length;
    const idle = renderedDrivers.filter(d => d.status === DRIVER_STATUS.IDLE).length;
    return { active, moving, idle, delayed };
  }, [renderedDrivers]);

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dispatch Operations</h1>
          <p className="text-gray-400 mt-1">Live active delivery tracking</p>
        </div>
        
        <div className="flex gap-4 bg-gray-800 p-3 rounded-lg border border-gray-700 shadow-md">
          <div className="flex items-center text-sm font-medium"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 mr-2 shadow-[0_0_8px_#3b82f6]"></span> Traveling</div>
          <div className="flex items-center text-sm font-medium"><span className="w-2.5 h-2.5 rounded-full bg-green-500 mr-2 shadow-[0_0_8px_#10b981]"></span> Out for Delivery</div>
          <div className="flex items-center text-sm font-medium"><span className="w-2.5 h-2.5 rounded-full bg-red-500 mr-2 shadow-[0_0_8px_#ef4444]"></span> Delayed</div>
          <div className="flex items-center text-sm font-medium"><span className="w-2.5 h-2.5 rounded-full bg-gray-400 mr-2 shadow-[0_0_5px_#9ca3af]"></span> Idle</div>
        </div>
      </div>

      <div className="flex-1 glass-panel rounded-2xl overflow-hidden relative shadow-[0_0_40px_rgba(0,0,0,0.5)] border border-gray-700">
        {activeTheme.overlayClass && (
          <div className={`absolute inset-0 pointer-events-none z-[350] ${activeTheme.overlayClass}`}></div>
        )}
        <div className="absolute top-4 right-4 z-[500] bg-gray-900/90 border border-gray-700 rounded-xl p-3 w-52 shadow-lg">
          <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-2">Driver Radar</h3>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Active Drivers</span><span className="font-semibold">{radar.active}</span></div>
            <div className="flex justify-between"><span>Moving</span><span className="font-semibold text-blue-400">{radar.moving}</span></div>
            <div className="flex justify-between"><span>Idle</span><span className="font-semibold text-gray-400">{radar.idle}</span></div>
            <div className="flex justify-between"><span>Delayed</span><span className="font-semibold text-red-400">{radar.delayed}</span></div>
          </div>
        </div>
        {normalizedQuery && (
          <div className="absolute top-20 right-4 z-[500] bg-blue-900/40 border border-blue-700 rounded-lg px-3 py-2 text-xs text-blue-200 shadow-lg">
            Matched drivers: {matchedDriverIds.size}
          </div>
        )}

        <div className="absolute left-4 bottom-4 z-[500] bg-gray-900/90 border border-gray-700 rounded-xl p-3 w-80 shadow-lg max-h-60 overflow-auto">
          <h3 className="text-xs uppercase tracking-widest text-gray-400 mb-2">Live Activity Feed</h3>
          {activities.length === 0 ? (
            <p className="text-xs text-gray-500">Awaiting simulation activity...</p>
          ) : (
            <div className="space-y-2">
              {activities.map((item) => (
                <div key={item.id} className="text-xs border border-gray-800 rounded-lg p-2 bg-gray-950/60">
                  <div className="flex justify-between items-center mb-1">
                    <span className="uppercase tracking-wide text-[10px] text-gray-400">{item.type}</span>
                    <span className="text-[10px] text-gray-500">{new Date(item.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-gray-200">{item.message}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <MapContainer 
          center={center} 
          zoom={zoom} 
          minZoom={10}
          style={{ height: '100%', width: '100%', background: '#111827' }}
          className={`z-0 ${activeTheme.containerClass}`}
        >
          <TileLayer
            url={activeTheme.tileUrl}
            attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
          />

          {deliveryZones.map(zone => (
            <Circle
              key={zone.id}
              center={zone.center}
              radius={zone.radius}
              pathOptions={{
                color: zone.color,
                fillColor: zone.color,
                fillOpacity: 0.02,
                weight: 1,
                opacity: 0.3
              }}
            >
              <Popup className="custom-popup">
                <div className="p-2 font-semibold text-center text-gray-300">{zone.name} Zone</div>
              </Popup>
            </Circle>
          ))}
          {trafficHotspots.map((hotspot) => (
            <Circle
              key={hotspot.id}
              center={hotspot.center}
              radius={hotspot.radius}
              pathOptions={{
                color: hotspot.color,
                fillColor: hotspot.color,
                fillOpacity: hotspot.fillOpacity,
                weight: 1.5,
                opacity: 0.45
              }}
            />
          ))}

          {renderedDrivers.map((driver, index) => {
            if (driver.coordinates?.lat == null || driver.coordinates?.lng == null) return null;
            console.log('MARKER POSITION', driver.coordinates.lat, driver.coordinates.lng);
            const isSelected = selectedDriverId === driver.driverId;
            const isMatched = !normalizedQuery || matchedDriverIds.has(driver.driverId);
            return (
              <DriverMarker
                key={driver.driverId}
                driver={driver}
                isSelected={isSelected || (normalizedQuery && isMatched)}
                onSelect={setSelectedDriverId}
                showEta={isSelected}
                etaAnchorYOffset={-4 - (index % 3) * 8}
              />
            );
          })}
          {drivers.length === 0 && <Marker position={[28.61, 77.2]} />}
        </MapContainer>
        {loading && (
          <div className="absolute top-4 left-4 z-[500] bg-gray-900/90 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300">
            Syncing live driver data...
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useMemo, useRef, useState } from 'react';
import { Bus, BusLocation, BusRoute, RouteStop, Student } from '../../types';
import { Navigation, Maximize2, Layers, Plus, Minus, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface InteractiveDemoMapProps {
  bus?: Bus;
  location?: BusLocation;
  route?: BusRoute;
  highlightStopId?: string;
  assignedStudent?: Student;
  className?: string;
  showControls?: boolean;
  isInteractive?: boolean;
}

const paletteColors: Record<string, { route: string; marker: string; light: string }> = {
  turquoise: { route: '#26788E', marker: '#E2480C', light: '#A4CCD4' },
  amber: { route: '#d97706', marker: '#f59e0b', light: '#fef3c7' },
  azure: { route: '#2563eb', marker: '#2563eb', light: '#dbeafe' },
  emerald: { route: '#059669', marker: '#059669', light: '#d1fae5' },
  coral: { route: '#e11d48', marker: '#e11d48', light: '#ffe4e6' },
};

const DEFAULT_STOPS: RouteStop[] = [
  {
    id: 'stop-1',
    routeId: 'route-1',
    name: 'Pine St & Webster Crossing',
    address: '2100 Pine Street, San Francisco, CA',
    latitude: 37.78,
    longitude: -122.425,
    sequenceOrder: 1,
    scheduledTime: '07:35 AM',
    assignedStudentIds: ['student-3', 'student-4'],
  },
  {
    id: 'stop-2',
    routeId: 'route-1',
    name: 'Grove Park & Polk Intersection',
    address: '450 Grove Street, San Francisco, CA',
    latitude: 37.7745,
    longitude: -122.418,
    sequenceOrder: 2,
    scheduledTime: '07:46 AM',
    assignedStudentIds: ['student-1', 'student-2'],
  },
  {
    id: 'stop-3',
    routeId: 'route-1',
    name: '14th St & Mission Plaza',
    address: '1800 Mission Street, San Francisco, CA',
    latitude: 37.768,
    longitude: -122.41,
    sequenceOrder: 3,
    scheduledTime: '07:55 AM',
    assignedStudentIds: ['student-5'],
  },
  {
    id: 'stop-4',
    routeId: 'route-1',
    name: 'Oakridge Academy Main Gate',
    address: '500 Oakridge Parkway, San Francisco, CA',
    latitude: 37.762,
    longitude: -122.402,
    sequenceOrder: 4,
    scheduledTime: '08:10 AM',
    assignedStudentIds: [],
  },
];

export const InteractiveDemoMap: React.FC<InteractiveDemoMapProps> = ({
  bus,
  location,
  route,
  highlightStopId,
  className = 'h-56 w-full',
  showControls = true,
  isInteractive = true,
}) => {
  const { colorPalette } = useApp();
  const currentColors = paletteColors[colorPalette] || paletteColors.turquoise;

  const [mapStyle, setMapStyle] = useState<'streets' | 'night'>('streets');
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [selectedStop, setSelectedStop] = useState<RouteStop | null>(null);
  const [busInfoOpen, setBusInfoOpen] = useState<boolean>(false);

  const dragRef = useRef<{ active: boolean; startX: number; startY: number; origX: number; origY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });

  const stops = route?.stops && route.stops.length > 0 ? route.stops : DEFAULT_STOPS;

  const waypoints: [number, number][] = useMemo(() => {
    if (route?.waypoints && route.waypoints.length > 1) return route.waypoints;
    return stops.map((s) => [s.latitude, s.longitude]);
  }, [route, stops]);

  const activeLoc = location || {
    busId: bus?.id || 'bus-1',
    tripId: 'trip-101',
    latitude: 37.7785,
    longitude: -122.423,
    speed: 28,
    heading: 142,
    accuracy: 5,
    timestamp: new Date().toISOString(),
  };

  // Geographic projection bounds around SF North Valley corridor
  const bounds = useMemo(() => {
    const lats = [...waypoints.map((p) => p[0]), ...stops.map((s) => s.latitude), activeLoc.latitude];
    const lngs = [...waypoints.map((p) => p[1]), ...stops.map((s) => s.longitude), activeLoc.longitude];
    const minLat = Math.min(...lats) - 0.0065;
    const maxLat = Math.max(...lats) + 0.0065;
    const minLng = Math.min(...lngs) - 0.011;
    const maxLng = Math.max(...lngs) + 0.011;
    return { minLat, maxLat, minLng, maxLng };
  }, [waypoints, stops, activeLoc.latitude, activeLoc.longitude]);

  const projectPoint = (lat: number, lng: number) => {
    const xPct = ((lng - bounds.minLng) / Math.max(0.0001, bounds.maxLng - bounds.minLng)) * 100;
    const yPct = (1 - (lat - bounds.minLat) / Math.max(0.0001, bounds.maxLat - bounds.minLat)) * 100;
    return { x: xPct, y: yPct };
  };

  const polylinePoints = useMemo(
    () =>
      waypoints
        .map(([lat, lng]) => {
          const { x, y } = projectPoint(lat, lng);
          return `${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(' '),
    [waypoints, bounds]
  );

  const busPt = projectPoint(activeLoc.latitude, activeLoc.longitude);
  const highlightedStop = stops.find((s) => s.id === highlightStopId);
  const highlightPt = highlightedStop ? projectPoint(highlightedStop.latitude, highlightedStop.longitude) : null;

  const isNight = mapStyle === 'night';

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isInteractive) return;
    if ((e.target as HTMLElement).closest('button, a, [data-map-popup="true"]')) return;
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: pan.x,
      origY: pan.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPan({
      x: Math.max(-160, Math.min(160, dragRef.current.origX + dx)),
      y: Math.max(-120, Math.min(120, dragRef.current.origY + dy)),
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current.active) {
      dragRef.current.active = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore release failure
      }
    }
  };

  const centerOnShuttle = () => {
    setZoom(1.22);
    setPan({
      x: Math.round((50 - busPt.x) * 3.5),
      y: Math.round((50 - busPt.y) * 2.5),
    });
  };

  const fitRoute = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div
      data-testid="live-bus-map"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={`relative rounded-2xl overflow-hidden border border-white/70 shadow-sm select-none ${
        isInteractive ? 'cursor-grab active:cursor-grabbing' : ''
      } ${className}`}
      style={{
        backgroundColor: isNight ? '#1b2b3a' : '#eaf1f5',
      }}
    >
      {/* Interactive Pan & Zoom Vector Map Canvas */}
      <div
        className="absolute inset-0 transition-transform duration-300 ease-out origin-center"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="w-full h-full block"
          aria-hidden="true"
        >
          {/* Base Map Urban Terrain */}
          <rect width="100" height="100" fill={isNight ? '#1a2a38' : '#eaf0f4'} />

          {/* Mission Bay & Waterfront on East Side */}
          <path
            d="M 80 0 L 100 0 L 100 100 L 82 100 C 86 80, 91 64, 87 46 C 84 31, 89 18, 80 0 Z"
            fill={isNight ? '#112233' : '#cde4f0'}
          />

          {/* Neighborhood Parks */}
          <rect
            x="10"
            y="14"
            width="14"
            height="11"
            rx="2"
            fill={isNight ? '#1d3b36' : '#d5eadb'}
          />
          <rect
            x="38"
            y="41"
            width="12"
            height="10"
            rx="2"
            fill={isNight ? '#1d3b36' : '#d5eadb'}
          />
          <rect
            x="64"
            y="72"
            width="16"
            height="14"
            rx="2.5"
            fill={isNight ? '#1d3b36' : '#d5eadb'}
          />
          <rect
            x="8"
            y="62"
            width="18"
            height="13"
            rx="2.5"
            fill={isNight ? '#1d3b36' : '#d5eadb'}
          />

          {/* Secondary City Street Grid */}
          <g
            stroke={isNight ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.85)'}
            strokeWidth="0.65"
            fill="none"
          >
            {[12, 22, 32, 42, 52, 62, 72, 82, 92].map((pos) => (
              <React.Fragment key={pos}>
                <line x1="0" y1={pos} x2="86" y2={pos} />
                <line x1={pos} y1="0" x2={pos} y2="100" />
              </React.Fragment>
            ))}
          </g>

          {/* Major Arterial Boulevards (Market St Diagonal, Van Ness, US-101, 280) */}
          <g
            stroke={isNight ? 'rgba(164,204,212,0.22)' : '#ffffff'}
            strokeWidth="1.7"
            strokeLinecap="round"
            fill="none"
          >
            <line x1="8" y1="84" x2="88" y2="10" />
            <line x1="42" y1="0" x2="42" y2="100" />
            <line x1="0" y1="32" x2="86" y2="32" />
            <path d="M 60 0 Q 65 48 63 100" />
            <path d="M 24 0 L 24 48 L 58 76 L 58 100" />
          </g>

          {/* Highway Accent Centerlines */}
          <g
            stroke={isNight ? 'rgba(245,158,11,0.38)' : 'rgba(245,190,110,0.65)'}
            strokeWidth="0.55"
            fill="none"
          >
            <path d="M 60 0 Q 65 48 63 100" />
            <line x1="8" y1="84" x2="88" y2="10" />
          </g>

          {/* Highlighted Pickup Zone Halo */}
          {highlightPt && (
            <circle
              cx={highlightPt.x}
              cy={highlightPt.y}
              r="11"
              fill={currentColors.light}
              fillOpacity={isNight ? 0.16 : 0.28}
              stroke={currentColors.route}
              strokeOpacity="0.45"
              strokeWidth="0.45"
            />
          )}

          {/* Route Corridor Polyline (White Outline + Brand Color) */}
          {waypoints.length > 1 && (
            <>
              <polyline
                points={polylinePoints}
                fill="none"
                stroke={isNight ? 'rgba(255,255,255,0.45)' : '#ffffff'}
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <polyline
                points={polylinePoints}
                fill="none"
                stroke={currentColors.route}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}
        </svg>

        {/* Subtle Geographic Neighborhood & Street Labels */}
        <div
          className={`pointer-events-none absolute inset-0 text-[9px] font-bold tracking-wider uppercase ${
            isNight ? 'text-slate-400/75' : 'text-slate-500/80'
          }`}
        >
          <span className="absolute top-[11%] left-[12%]">Pacific Heights</span>
          <span className="absolute top-[25%] left-[21%]">Japantown</span>
          <span className="absolute top-[37%] left-[48%]">Civic Center</span>
          <span className="absolute top-[67%] left-[32%]">Mission District</span>
          <span className="absolute top-[78%] left-[63%]">Potrero Hill</span>
          <span className="absolute top-[52%] right-[4%] text-[#26788E]/70">Mission Bay</span>
        </div>

        {/* Interactive Route Stop Markers */}
        {stops.map((stop, index) => {
          const pt = projectPoint(stop.latitude, stop.longitude);
          const isHighlighted = stop.id === highlightStopId;
          const isLastStop = index === stops.length - 1;

          return (
            <button
              key={stop.id}
              type="button"
              onClick={() => {
                setBusInfoOpen(false);
                setSelectedStop((prev) => (prev?.id === stop.id ? null : stop));
              }}
              aria-label={`Stop ${stop.sequenceOrder}: ${stop.name}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center group z-10 cursor-pointer"
              style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow-md border-2 border-white transition-transform group-hover:scale-110 ${
                  isHighlighted
                    ? 'text-white scale-110'
                    : isLastStop
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-white'
                }`}
                style={isHighlighted ? { backgroundColor: currentColors.marker } : undefined}
              >
                {isLastStop ? '🏫' : stop.sequenceOrder}
              </div>
              <span
                className={`mt-0.5 whitespace-nowrap px-1.5 py-0 rounded-full text-[9px] font-bold shadow-xs ${
                  isHighlighted
                    ? 'text-white'
                    : 'bg-white/95 text-slate-700 border border-slate-200/80'
                }`}
                style={isHighlighted ? { backgroundColor: currentColors.marker } : undefined}
              >
                {stop.name.split('&')[0].trim()}
              </span>
            </button>
          );
        })}

        {/* Active Corridor Shuttle Marker */}
        <button
          type="button"
          onClick={() => {
            setSelectedStop(null);
            setBusInfoOpen((v) => !v);
          }}
          aria-label={`${bus?.busNumber || 'Bus 14'} · ${route?.code || '14A'}`}
          className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-20 cursor-pointer group"
          style={{ left: `${busPt.x}%`, top: `${busPt.y}%` }}
        >
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shadow-lg border-2 border-white text-white transition-transform group-hover:scale-110"
            style={{ backgroundColor: currentColors.marker }}
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M8 6v6" />
              <path d="M15 6v6" />
              <path d="M2 12h19.6" />
              <path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5.3C20.1 6.6 19.2 6 18.2 6H5.8C4.8 6 3.9 6.6 3.6 7.5L2.2 12.8c-.1.4-.2.8-.2 1.2 0 .4.1.8.2 1.2.3 1.1.8 2.8.8 2.8h3" />
              <circle cx="7" cy="18" r="2" />
              <path d="M9 18h5" />
              <circle cx="16" cy="18" r="2" />
            </svg>
          </div>
          <div className="mt-0.5 bg-slate-900/90 text-white font-bold text-[9px] px-1.5 py-0.5 rounded-full whitespace-nowrap shadow-xs">
            {bus?.busNumber || 'Bus 14'} · {route?.code || '14A'}
          </div>
        </button>
      </div>

      {/* Selected Stop Popup Card */}
      {selectedStop && (
        <div
          data-map-popup="true"
          className="absolute bottom-3 left-3 right-3 sm:right-auto sm:w-64 z-30 liquid-glass-elevated rounded-2xl p-3 shadow-lg flex items-start justify-between gap-2 animate-in fade-in slide-in-from-bottom-2"
        >
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-[#304C64] truncate">{selectedStop.name}</p>
            <p className="text-[11px] text-slate-600 truncate">{selectedStop.address}</p>
            <p className="text-[11px] font-bold text-[#26788E] mt-1">
              Stop #{selectedStop.sequenceOrder} · {selectedStop.scheduledTime}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSelectedStop(null)}
            aria-label="Close stop info"
            className="w-6 h-6 rounded-full clear-glass-btn flex items-center justify-center shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Selected Bus Popup Card */}
      {busInfoOpen && (
        <div
          data-map-popup="true"
          className="absolute bottom-3 left-3 right-3 sm:right-auto sm:w-64 z-30 liquid-glass-elevated rounded-2xl p-3 shadow-lg flex items-start justify-between gap-2 animate-in fade-in slide-in-from-bottom-2"
        >
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-[#304C64] truncate">
              {bus?.busNumber || 'Bus 14'}
            </p>
            <p className="text-[11px] text-slate-600 truncate">
              {bus?.model || 'Blue Bird Vision High-Roof (2024)'}
            </p>
            <p className="text-[11px] font-bold text-[#26788E] mt-1">
              Morning Corridor Schedule
            </p>
          </div>
          <button
            type="button"
            onClick={() => setBusInfoOpen(false)}
            aria-label="Close bus info"
            className="w-6 h-6 rounded-full clear-glass-btn flex items-center justify-center shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Interactive Map Controls */}
      {showControls && (
        <div className="absolute top-2.5 right-2.5 z-20 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={centerOnShuttle}
            title="Center on Shuttle"
            aria-label="Center on Shuttle"
            className="w-7 h-7 rounded-full liquid-glass-elevated flex items-center justify-center text-[#304C64]"
          >
            <Navigation className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={fitRoute}
            title="Fit Entire Route"
            aria-label="Fit Entire Route"
            className="w-7 h-7 rounded-full liquid-glass-elevated flex items-center justify-center text-[#304C64]"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(1.6, Number((z + 0.2).toFixed(2))))}
            title="Zoom In"
            aria-label="Zoom In"
            className="w-7 h-7 rounded-full liquid-glass-elevated flex items-center justify-center text-[#304C64]"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.85, Number((z - 0.2).toFixed(2))))}
            title="Zoom Out"
            aria-label="Zoom Out"
            className="w-7 h-7 rounded-full liquid-glass-elevated flex items-center justify-center text-[#304C64]"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setMapStyle((prev) => (prev === 'streets' ? 'night' : 'streets'))}
            title="Switch Map Style"
            aria-label="Switch Map Style"
            className="w-7 h-7 rounded-full liquid-glass-elevated flex items-center justify-center text-[#304C64]"
          >
            <Layers className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Subtle District Map Label */}
      {!selectedStop && !busInfoOpen && (
        <div
          className={`pointer-events-none absolute bottom-2 left-2.5 z-10 text-[10px] font-semibold ${
            isNight ? 'text-slate-300/80' : 'text-slate-500/80'
          }`}
        >
          Oakridge Corridor Map
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import {
  Map as GoogleMap,
  AdvancedMarker,
  InfoWindow,
  useMap,
  useApiLoadingStatus,
  APILoadingStatus,
} from '@vis.gl/react-google-maps';
import { Bus, BusLocation, BusRoute, RouteStop, Student } from '../../types';
import { Navigation, Maximize2, Layers } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { InteractiveDemoMap } from './InteractiveDemoMap';

const MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';

interface LiveBusMapProps {
  bus?: Bus;
  location?: BusLocation;
  route?: BusRoute;
  highlightStopId?: string;
  assignedStudent?: Student;
  isStale?: boolean;
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

interface MapOverlaysProps {
  route?: BusRoute;
  location?: BusLocation;
  highlightStopId?: string;
  routeColor: string;
  lightColor: string;
  onMapReady: (map: google.maps.Map | null) => void;
}

const MapOverlays: React.FC<MapOverlaysProps> = ({
  route,
  location,
  highlightStopId,
  routeColor,
  lightColor,
  onMapReady,
}) => {
  const map = useMap();
  const routeOutlineRef = useRef<google.maps.Polyline | null>(null);
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);
  const highlightCircleRef = useRef<google.maps.Circle | null>(null);
  const lastFittedRouteIdRef = useRef<string | null>(null);

  useEffect(() => {
    onMapReady(map);
    return () => onMapReady(null);
  }, [map, onMapReady]);

  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps) return;

    routeOutlineRef.current?.setMap(null);
    routePolylineRef.current?.setMap(null);
    highlightCircleRef.current?.setMap(null);
    routeOutlineRef.current = null;
    routePolylineRef.current = null;
    highlightCircleRef.current = null;

    if (!route) return;

    const rawCoords =
      route.waypoints && route.waypoints.length > 0
        ? route.waypoints
        : route.stops.map((s) => [s.latitude, s.longitude] as [number, number]);

    const path = rawCoords.map(([lat, lng]) => ({ lat, lng }));

    if (path.length > 1) {
      routeOutlineRef.current = new google.maps.Polyline({
        path,
        strokeColor: '#ffffff',
        strokeOpacity: 0.82,
        strokeWeight: 7,
        zIndex: 1,
        map,
      });

      routePolylineRef.current = new google.maps.Polyline({
        path,
        strokeColor: routeColor,
        strokeOpacity: 0.94,
        strokeWeight: 4.5,
        zIndex: 2,
        map,
      });

      if (lastFittedRouteIdRef.current !== route.id) {
        const bounds = new google.maps.LatLngBounds();
        path.forEach((pt) => bounds.extend(pt));
        if (location) {
          bounds.extend({ lat: location.latitude, lng: location.longitude });
        }
        map.fitBounds(bounds, { top: 72, right: 36, bottom: 24, left: 24 });
        lastFittedRouteIdRef.current = route.id;
      }
    }

    const highlightedStop = route.stops.find((s) => s.id === highlightStopId);
    if (highlightedStop) {
      highlightCircleRef.current = new google.maps.Circle({
        center: { lat: highlightedStop.latitude, lng: highlightedStop.longitude },
        radius: 650,
        strokeColor: routeColor,
        strokeOpacity: 0.5,
        strokeWeight: 1.5,
        fillColor: lightColor,
        fillOpacity: 0.14,
        clickable: false,
        map,
      });
    }

    return () => {
      routeOutlineRef.current?.setMap(null);
      routePolylineRef.current?.setMap(null);
      highlightCircleRef.current?.setMap(null);
    };
  }, [map, route, highlightStopId, routeColor, lightColor, location]);

  return null;
};

const GoogleBusMapCanvas: React.FC<LiveBusMapProps> = ({
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
  const apiStatus = useApiLoadingStatus();

  const [activeTileLayer, setActiveTileLayer] = useState<'streets' | 'satellite'>('streets');
  const [selectedStop, setSelectedStop] = useState<RouteStop | null>(null);
  const [busInfoOpen, setBusInfoOpen] = useState<boolean>(false);
  const [mapsFailed, setMapsFailed] = useState<boolean>(false);
  const mapRef = useRef<google.maps.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (
      apiStatus === APILoadingStatus.AUTH_FAILURE ||
      apiStatus === APILoadingStatus.FAILED
    ) {
      setMapsFailed(true);
    }
  }, [apiStatus]);

  useEffect(() => {
    const win = window as any;
    const prevAuthFailure = win.gm_authFailure;
    win.gm_authFailure = () => {
      setMapsFailed(true);
      if (typeof prevAuthFailure === 'function') prevAuthFailure();
    };
    return () => {
      win.gm_authFailure = prevAuthFailure;
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapsFailed) return;
    const checkErr = () => {
      if (el.querySelector('.gm-err-container')) {
        setMapsFailed(true);
      }
    };
    checkErr();
    const observer = new MutationObserver(checkErr);
    observer.observe(el, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [mapsFailed]);

  const initialCenter = {
    lat: location?.latitude || route?.stops[0]?.latitude || 37.7749,
    lng: location?.longitude || route?.stops[0]?.longitude || -122.4194,
  };

  const recenterOnRoute = () => {
    if (!mapRef.current || !location) return;
    mapRef.current.panTo({ lat: location.latitude, lng: location.longitude });
    mapRef.current.setZoom(15);
  };

  const fitRouteBounds = () => {
    if (!mapRef.current || !route || typeof google === 'undefined') return;
    const bounds = new google.maps.LatLngBounds();
    route.stops.forEach((s) => bounds.extend({ lat: s.latitude, lng: s.longitude }));
    route.waypoints?.forEach(([lat, lng]) => bounds.extend({ lat, lng }));
    if (location) {
      bounds.extend({ lat: location.latitude, lng: location.longitude });
    }
    if (!bounds.isEmpty()) {
      mapRef.current.fitBounds(bounds, 32);
    }
  };

  if (
    mapsFailed ||
    apiStatus === APILoadingStatus.AUTH_FAILURE ||
    apiStatus === APILoadingStatus.FAILED
  ) {
    return (
      <InteractiveDemoMap
        bus={bus}
        location={location}
        route={route}
        highlightStopId={highlightStopId}
        className={className}
        showControls={showControls}
        isInteractive={isInteractive}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      data-testid="live-bus-map"
      className={`relative rounded-2xl overflow-hidden border border-white/70 shadow-sm ${className}`}
    >
      <GoogleMap
        mapId="DEMO_MAP_ID"
        defaultCenter={initialCenter}
        defaultZoom={14}
        mapTypeId={activeTileLayer === 'satellite' ? 'hybrid' : 'roadmap'}
        gestureHandling={isInteractive ? 'greedy' : 'none'}
        disableDefaultUI
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        className="w-full h-full"
      >
        <MapOverlays
          route={route}
          location={location}
          highlightStopId={highlightStopId}
          routeColor={currentColors.route}
          lightColor={currentColors.light}
          onMapReady={(m) => {
            mapRef.current = m;
          }}
        />

        {/* Route Stop Markers */}
        {route?.stops.map((stop, index) => {
          const isHighlighted = stop.id === highlightStopId;
          const isLastStop = index === route.stops.length - 1;
          return (
            <AdvancedMarker
              key={stop.id}
              position={{ lat: stop.latitude, lng: stop.longitude }}
              title={stop.name}
              onClick={() => {
                setBusInfoOpen(false);
                setSelectedStop(stop);
              }}
            >
              <div className="relative flex flex-col items-center">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow-md border-2 border-white ${
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
              </div>
            </AdvancedMarker>
          );
        })}

        {/* Selected Stop InfoWindow */}
        {selectedStop && (
          <InfoWindow
            position={{ lat: selectedStop.latitude, lng: selectedStop.longitude }}
            onCloseClick={() => setSelectedStop(null)}
          >
            <div className="text-slate-900 px-1 py-0.5 min-w-[140px]">
              <p className="text-xs font-extrabold">{selectedStop.name}</p>
              <p className="text-[11px] text-slate-600">{selectedStop.address}</p>
              <p className="text-[11px] font-bold text-[#26788E] mt-1">
                Stop #{selectedStop.sequenceOrder} · {selectedStop.scheduledTime}
              </p>
            </div>
          </InfoWindow>
        )}

        {/* Active Corridor Shuttle Marker */}
        {location && (
          <AdvancedMarker
            position={{ lat: location.latitude, lng: location.longitude }}
            zIndex={50}
            title={`${bus?.busNumber || 'Bus 14'} · ${route?.code || 'Route 14A'}`}
            onClick={() => {
              setSelectedStop(null);
              setBusInfoOpen((v) => !v);
            }}
          >
            <div className="relative flex flex-col items-center">
              <div className="mb-1 bg-slate-900/90 text-white font-bold text-[9px] px-1.5 py-0.5 rounded-full whitespace-nowrap shadow-xs">
                {bus?.busNumber || 'Bus 14'} · {route?.code || '14A'}
              </div>
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shadow-lg border-2 border-white text-white"
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
            </div>
          </AdvancedMarker>
        )}

        {busInfoOpen && location && (
          <InfoWindow
            position={{ lat: location.latitude, lng: location.longitude }}
            onCloseClick={() => setBusInfoOpen(false)}
          >
            <div className="text-slate-900 px-1 py-0.5 min-w-[140px]">
              <p className="text-xs font-extrabold">{bus?.busNumber || 'Bus 14'}</p>
              <p className="text-[11px] text-slate-600">{bus?.model || route?.name}</p>
              <p className="text-[11px] font-bold text-[#26788E] mt-1">
                Morning Corridor Schedule
              </p>
            </div>
          </InfoWindow>
        )}
      </GoogleMap>

      {showControls && (
        <div className="absolute top-2.5 right-2.5 z-10 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={recenterOnRoute}
            title="Center on Shuttle"
            aria-label="Center on Shuttle"
            className="w-7 h-7 rounded-full clear-glass-btn flex items-center justify-center text-[#304C64]"
          >
            <Navigation className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={fitRouteBounds}
            title="Fit Entire Route"
            aria-label="Fit Entire Route"
            className="w-7 h-7 rounded-full clear-glass-btn flex items-center justify-center text-[#304C64]"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() =>
              setActiveTileLayer((prev) => (prev === 'streets' ? 'satellite' : 'streets'))
            }
            title="Switch Map Style"
            aria-label="Switch Map Style"
            className="w-7 h-7 rounded-full clear-glass-btn flex items-center justify-center text-[#304C64]"
          >
            <Layers className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

export const LiveBusMap: React.FC<LiveBusMapProps> = (props) => {
  if (!MAPS_API_KEY) {
    return <InteractiveDemoMap {...props} />;
  }

  return <GoogleBusMapCanvas {...props} />;
};

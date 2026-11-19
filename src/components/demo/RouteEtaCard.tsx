import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Navigation, Clock, Route as RouteIcon, AlertCircle } from 'lucide-react';
import { Bus, BusLocation, BusRoute, RouteEtaSummary, Trip } from '../../types';
import {
  computeLocalRouteEta,
  formatDistanceCompact,
  getRemainingStopsForRoute,
  parseGoogleJsSdkRouteEta,
} from '../../utils/routeEtaHelpers';

interface RouteEtaCardProps {
  routes: BusRoute[];
  selectedRoute?: BusRoute;
  selectedBus?: Bus;
  selectedLocation?: BusLocation;
  activeTrip?: Trip;
  selectedStopId?: string;
  onSelectRoute: (routeId: string) => void;
  onSelectStop: (stopId: string | undefined) => void;
  onResolvedRoutePolyline?: (routeId: string, waypoints: [number, number][]) => void;
}

async function tryComputeRoutesViaJsSdk(params: {
  route: BusRoute;
  location?: BusLocation;
  currentStopIndex: number;
  extraDelayMinutes: number;
}): Promise<RouteEtaSummary | null> {
  if (typeof window === 'undefined') return null;
  const gMaps = (window as any).google?.maps;
  if (!gMaps?.importLibrary) return null;

  const { upcomingStops } = getRemainingStopsForRoute(params.route, params.currentStopIndex);
  if (upcomingStops.length === 0) return null;

  const originCoord = params.location
    ? { lat: params.location.latitude, lng: params.location.longitude }
    : { lat: params.route.stops[0].latitude, lng: params.route.stops[0].longitude };

  const lastTarget = upcomingStops[upcomingStops.length - 1];
  const destinationCoord = { lat: lastTarget.latitude, lng: lastTarget.longitude };
  const intermediates = upcomingStops.slice(0, -1).map((stop) => ({
    location: { lat: stop.latitude, lng: stop.longitude },
    vehicleStopover: true,
  }));

  const routesLib = (await gMaps.importLibrary('routes')) as google.maps.RoutesLibrary;
  if (!routesLib?.Route?.computeRoutes) return null;

  const { routes: sdkRoutes } = await routesLib.Route.computeRoutes({
    origin: originCoord,
    destination: destinationCoord,
    intermediates: intermediates.length > 0 ? intermediates : undefined,
    travelMode: 'DRIVING',
    routingPreference: 'TRAFFIC_AWARE',
    internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
    fields: ['durationMillis', 'staticDurationMillis', 'distanceMeters', 'path', 'legs'],
  });

  if (!sdkRoutes || sdkRoutes.length === 0) return null;

  return parseGoogleJsSdkRouteEta({
    sdkRoute: sdkRoutes[0],
    route: params.route,
    currentStopIndex: params.currentStopIndex,
    extraDelayMinutes: params.extraDelayMinutes,
  });
}

export const RouteEtaCard: React.FC<RouteEtaCardProps> = ({
  routes,
  selectedRoute,
  selectedBus,
  selectedLocation,
  activeTrip,
  selectedStopId,
  onSelectRoute,
  onSelectStop,
  onResolvedRoutePolyline,
}) => {
  const [etaSummary, setEtaSummary] = useState<RouteEtaSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorNote, setErrorNote] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState<number>(0);

  const currentStopIndex =
    activeTrip && selectedRoute && activeTrip.routeId === selectedRoute.id
      ? activeTrip.currentStopIndex
      : 0;
  const delayMinutes =
    activeTrip && selectedRoute && activeTrip.routeId === selectedRoute.id
      ? activeTrip.delayMinutes
      : 0;

  const fetchRouteEta = useCallback(
    async (signal?: AbortSignal) => {
      if (!selectedRoute) return;
      setIsLoading(true);
      setErrorNote(null);

      try {
        let backendFallbackEta: RouteEtaSummary | null = null;

        try {
          const res = await fetch('/api/maps/route-eta', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              routeId: selectedRoute.id,
              busId: selectedBus?.id || selectedRoute.assignedBusId,
            }),
            signal,
          });

          const contentType = res.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const data = await res.json();

            if (res.status === 429 || data?.quotaExceeded) {
              window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
              if (data?.eta) {
                setEtaSummary(data.eta);
                setErrorNote('Using corridor estimate while live Routes API quota recovers.');
                return;
              }
            }

            if (res.ok && data?.eta) {
              const computed: RouteEtaSummary = data.eta;
              if (computed.source === 'google_routes_api') {
                setEtaSummary(computed);
                if (
                  computed.decodedWaypoints &&
                  computed.decodedWaypoints.length > 1 &&
                  onResolvedRoutePolyline
                ) {
                  onResolvedRoutePolyline(selectedRoute.id, computed.decodedWaypoints);
                }
                return;
              }
              backendFallbackEta = computed;
            }
          }
        } catch (err: any) {
          if (err?.name === 'AbortError') return;
        }

        // Upgrade via Maps JS SDK Route.computeRoutes when client Maps SDK is loaded
        try {
          const sdkEta = await tryComputeRoutesViaJsSdk({
            route: selectedRoute,
            location: selectedLocation,
            currentStopIndex,
            extraDelayMinutes: delayMinutes,
          });

          if (signal?.aborted) return;
          if (sdkEta) {
            setEtaSummary(sdkEta);
            if (
              sdkEta.decodedWaypoints &&
              sdkEta.decodedWaypoints.length > 1 &&
              onResolvedRoutePolyline
            ) {
              onResolvedRoutePolyline(selectedRoute.id, sdkEta.decodedWaypoints);
            }
            return;
          }
        } catch (sdkErr: any) {
          const msg = String(sdkErr?.message || '');
          if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('QUOTA') || msg.includes('429')) {
            window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
            setErrorNote('Using corridor estimate while live Routes API quota recovers.');
          }
        }

        if (signal?.aborted) return;

        const localFallback =
          backendFallbackEta ||
          computeLocalRouteEta({
            route: selectedRoute,
            location: selectedLocation,
            currentStopIndex,
            extraDelayMinutes: delayMinutes,
          });
        setEtaSummary(localFallback);
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [
      selectedRoute,
      selectedBus?.id,
      selectedLocation,
      currentStopIndex,
      delayMinutes,
      onResolvedRoutePolyline,
    ]
  );

  // If Maps JS API key is active but library wasn't ready on first mount, re-run once when loaded
  useEffect(() => {
    if (typeof window === 'undefined' || !import.meta.env.VITE_GOOGLE_MAPS_API_KEY) return;
    if (etaSummary?.source === 'google_routes_api') return;
    if ((window as any).google?.maps?.importLibrary) return;

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if ((window as any).google?.maps?.importLibrary) {
        window.clearInterval(timer);
        setRefreshTick((n) => n + 1);
      } else if (attempts >= 20) {
        window.clearInterval(timer);
      }
    }, 250);

    return () => window.clearInterval(timer);
  }, [etaSummary?.source]);

  useEffect(() => {
    const controller = new AbortController();
    fetchRouteEta(controller.signal);
    return () => controller.abort();
  }, [
    selectedRoute?.id,
    selectedBus?.id,
    currentStopIndex,
    delayMinutes,
    refreshTick,
    fetchRouteEta,
  ]);

  const upcomingStops = useMemo(
    () => (etaSummary?.stopEtas || []).filter((s) => !s.isPassed),
    [etaSummary]
  );

  const focusedStopEta = useMemo(() => {
    if (!upcomingStops.length) return undefined;
    if (selectedStopId) {
      const match = upcomingStops.find((s) => s.stopId === selectedStopId);
      if (match) return match;
    }
    return upcomingStops[upcomingStops.length - 1];
  }, [upcomingStops, selectedStopId]);

  const displayArrivalClock =
    focusedStopEta?.estimatedArrivalTime || etaSummary?.estimatedArrivalTime || '--:--';
  const displayEtaMinutes =
    focusedStopEta?.etaMinutes ?? etaSummary?.etaMinutes ?? 0;
  const displayDistanceMeters =
    focusedStopEta?.cumulativeDistanceMeters && focusedStopEta.cumulativeDistanceMeters > 0
      ? focusedStopEta.cumulativeDistanceMeters
      : etaSummary?.distanceMeters ?? 0;

  const trafficLabel = useMemo(() => {
    if (!etaSummary) return 'Calculating';
    if (etaSummary.trafficDeltaMinutes >= 2) {
      return `+${etaSummary.trafficDeltaMinutes} min traffic`;
    }
    return 'Clear traffic';
  }, [etaSummary]);

  const trafficColorClass =
    etaSummary?.trafficCondition === 'heavy'
      ? 'text-[#E2480C]'
      : etaSummary?.trafficCondition === 'moderate'
      ? 'text-amber-700'
      : 'text-[#059669]';

  const sourceLabel =
    etaSummary?.source === 'google_routes_api'
      ? 'Google Routes API · Traffic-Aware'
      : 'Google Routes Corridor Model';

  return (
    <section
      data-testid="route-eta-card"
      aria-label="Dynamic Route ETA Calculator"
      className="clear-glass-card rounded-2xl p-3.5 space-y-3"
    >
      {/* Top Header Row */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <RouteIcon className="w-3.5 h-3.5 text-[#26788E] shrink-0" />
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-600 truncate">
              Dynamic Arrival ETA
            </h2>
          </div>
          <p className="text-[11px] font-medium text-slate-500 truncate mt-0.5">
            {sourceLabel}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setRefreshTick((n) => n + 1)}
          disabled={isLoading || !selectedRoute}
          aria-label="Refresh route ETA"
          data-testid="refresh-route-eta-btn"
          className="min-h-[44px] min-w-[44px] px-2.5 rounded-xl clear-glass-btn flex items-center justify-center gap-1.5 text-[11px] font-bold text-[#26788E] whitespace-nowrap shrink-0 disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* Bus Route Selector */}
      <div
        role="tablist"
        aria-label="Select bus route for ETA"
        className="grid grid-cols-3 gap-1.5"
      >
        {routes.map((route) => {
          const active = route.id === selectedRoute?.id;
          const shortCode = route.code.replace(/^(NR-|CP-)/, '');
          return (
            <button
              key={route.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`select-route-${route.id}`}
              onClick={() => {
                onSelectRoute(route.id);
                onSelectStop(undefined);
              }}
              className={`min-h-[44px] px-2 py-1.5 rounded-xl text-left transition-all whitespace-nowrap overflow-hidden ${
                active ? 'clear-glass-btn-primary' : 'clear-glass-btn'
              }`}
            >
              <span className="block text-[11px] font-extrabold leading-tight truncate">
                Route {shortCode}
              </span>
              <span
                className={`block text-[10px] font-medium leading-tight truncate mt-0.5 ${
                  active ? 'text-white/85' : 'text-slate-500'
                }`}
              >
                {route.type === 'afternoon' ? 'Afternoon' : 'Morning'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Dynamic ETA Readout */}
      <div className="p-3 rounded-xl bg-white/45 border border-white/75 space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-slate-500 truncate">
              {focusedStopEta
                ? `Arriving at ${focusedStopEta.stopName}`
                : selectedRoute?.name || 'Route Destination'}
            </p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span
                data-testid="eta-arrival-clock"
                className="text-2xl font-extrabold tracking-tight text-[#304C64] tabular-nums"
              >
                {displayArrivalClock}
              </span>
              <span
                data-testid="eta-minutes-remaining"
                className="text-sm font-extrabold text-[#26788E] tabular-nums"
              >
                {isLoading && !etaSummary ? 'Computing…' : `${displayEtaMinutes} min`}
              </span>
            </div>
          </div>

          <div className="text-right shrink-0">
            <p className="text-[11px] font-bold text-[#304C64] tabular-nums">
              {formatDistanceCompact(displayDistanceMeters)}
            </p>
            <p className={`text-[11px] font-bold tabular-nums ${trafficColorClass}`}>
              {trafficLabel}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-white/60 text-[11px] font-medium text-slate-600">
          <span className="flex items-center gap-1 truncate">
            <Clock className="w-3 h-3 text-[#26788E] shrink-0" />
            <span className="tabular-nums truncate">
              Scheduled {focusedStopEta?.scheduledTime || '08:10 AM'} ·{' '}
              {selectedBus?.busNumber || 'Bus 14'}
            </span>
          </span>

          {selectedStopId && (
            <button
              type="button"
              onClick={() => onSelectStop(undefined)}
              className="text-[11px] font-bold text-[#26788E] hover:underline whitespace-nowrap shrink-0"
            >
              Final Stop
            </button>
          )}
        </div>
      </div>

      {errorNote && (
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-800 px-1">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-[#E2480C]" />
          <span className="leading-snug">{errorNote}</span>
        </div>
      )}

      {/* Per-Stop Arrival Schedule */}
      {upcomingStops.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 px-0.5">
            Stop-by-Stop ETA Breakdown
          </p>
          <div className="space-y-1">
            {upcomingStops.map((stop) => {
              const isSelectedStop =
                selectedStopId === stop.stopId ||
                (!selectedStopId && stop.stopId === focusedStopEta?.stopId);
              return (
                <button
                  key={stop.stopId}
                  type="button"
                  data-testid={`eta-stop-row-${stop.stopId}`}
                  onClick={() =>
                    onSelectStop(selectedStopId === stop.stopId ? undefined : stop.stopId)
                  }
                  className={`w-full min-h-[44px] px-2.5 py-2 rounded-xl flex items-center justify-between gap-2 text-left transition-all ${
                    isSelectedStop
                      ? 'bg-[#26788E]/12 border border-[#26788E]/40'
                      : 'bg-white/30 hover:bg-white/50 border border-white/60'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold shrink-0 ${
                        isSelectedStop
                          ? 'bg-[#26788E] text-white'
                          : 'bg-slate-700/15 text-[#304C64]'
                      }`}
                    >
                      {stop.sequenceOrder}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#304C64] truncate">
                        {stop.stopName}
                      </p>
                      <p className="text-[10px] font-medium text-slate-500 tabular-nums truncate">
                        Sched {stop.scheduledTime} ·{' '}
                        {formatDistanceCompact(stop.cumulativeDistanceMeters)}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-xs font-extrabold text-[#304C64] tabular-nums">
                      {stop.estimatedArrivalTime}
                    </p>
                    <p className="text-[10px] font-bold text-[#26788E] tabular-nums flex items-center justify-end gap-0.5">
                      <Navigation className="w-2.5 h-2.5" />
                      <span>{stop.etaMinutes} min</span>
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};

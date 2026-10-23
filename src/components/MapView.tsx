// src/components/MapView.tsx — the child's position as the SERVER reported it.
//
// This component has no source of truth of its own: every fact on it arrives as a prop, and Task 9
// replaces those props in App.tsx without touching this file. That rule exists because of a
// measurement, not a preference — the shipped v1.3 build drew a child pin at a fabricated Algiers
// centre with an "all safe" badge for a position no source ever reported (audited on a guardian's
// phone, 2026-10-11). A pin therefore requires a real fix, and the drawing code holds no fallback
// numbers. Every sentence this screen says comes from src/translations/catalog.ts, so the fr/en
// screens are as translatable as the Arabic one (§12: no scattered copy inside a component). What the
// machine guard actually bans is any Arabic codepoint in this file plus a hard-coded RTL layout; the
// literals that remain are language-neutral by construction — decorative emoji and the em-dash that
// stands in for an absent value.
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, Maximize2, ZoomIn, ZoomOut, ChevronDown, X } from 'lucide-react';
import { haversineMeters, kmPerHour, type Freshness } from '../services/traccar/positions.ts';
import { translate, type CatalogLang } from '../translations/catalog.ts';
import type { ServerPosition } from '../services/traccar/types.ts';
import type { Geometry, LatLng } from '../services/traccar/wkt.ts';
import {
  CHILD_ICON_SIZE,
  childFixLatLng,
  childIconHtml,
  scaleForZoom,
  zoomForRing,
} from './map/childIcon';
import { createCircleDrag, type DragPoint } from './map/circleDrag';

export type MapZone = { id: string; name: string; geometry: Geometry };

interface MapViewProps {
  // §12: the map is one of the three-language screens, and it may not choose a language for itself.
  // `lang` is a control value the caller already validated (R-M1-14), so a wrong one throws here
  // rather than silently rendering Arabic copy to a French-speaking guardian.
  lang: CatalogLang;
  childName: string;
  // The chosen reading (Task 5's resolveSourceReadings) or null when no source reported one.
  position: ServerPosition | null;
  // Task 5's freshnessOf value; null means there is no reading at all.
  freshness: Freshness | null;
  // Task 5's formatPositionLabel output — the only sentence this screen may say about age.
  label: string | null;
  zones: MapZone[];
  history: LatLng[];
  // §3: two sources more than 300 m apart. The map must announce it, not silently pick one.
  sourceConflict?: boolean;
  onSelectCoordinates?: (lat: number, lng: number) => void;
  // ZonesScreen's circle tool (brief Task 8 Step 3: the circle button draws by drag). While true, panning is replaced
  // by a drag that draws a dashed circle and reports centre + radius on release; a tap still reaches
  // onSelectCoordinates so the centre can be placed without a drag. The gesture itself is browser
  // work and stays NOT RUN until a measured run names it (R-M1-19).
  drawCircle?: boolean;
  onCircleDrawn?: (center: LatLng, radiusMeters: number) => void;
}

const ZONE_TONE = '#047857';
const HISTORY_TONE = '#1d4ed8';
// Where the map looks when it has nothing to frame. A viewport default, never a child position:
// the marker code path cannot reach it, because it requires a fix before drawing anything.
const EMPTY_VIEW: [number, number] = [0, 0];

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const popupRow = (key: string, value: string) => `
  <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:3px;">
    <span style="color:#64748b;">${key}</span>
    <strong style="direction:ltr;">${value}</strong>
  </div>`;

// §12's colour-blind rule in data form: every freshness state has a SHAPE, and the legend lists them
// as shape→fact pairs so the panel cannot drift out of sync with what childIconHtml actually emits.
// The silent row reuses `position.noDataFromServer` — one sentence for one fact, in one place.
const LEGEND_SHAPES = [
  ['map.legendArrowShape', 'map.legendArrowNote'],
  ['map.legendDotShape', 'map.legendDotNote'],
  ['map.legendSilentShape', 'position.noDataFromServer'],
  ['map.legendAgingShape', 'map.legendAgingNote'],
  ['map.legendRingShape', 'map.legendRingNote'],
  ['map.legendZoneShape', 'map.legendZoneNote'],
  ['map.legendTrackShape', 'map.legendTrackNote'],
] as const;

export const MapView: React.FC<MapViewProps> = ({
  lang,
  childName,
  position,
  freshness,
  label,
  zones,
  history,
  sourceConflict,
  onSelectCoordinates,
  drawCircle,
  onCircleDrawn,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const childMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const zoneLayersRef = useRef<L.Layer[]>([]);
  const historyPolylineRef = useRef<L.Polyline | null>(null);
  const distanceLineRef = useRef<L.Polyline | null>(null);
  const hasFramedRef = useRef<boolean>(false);
  const selectCallbackRef = useRef<MapViewProps['onSelectCoordinates']>(onSelectCoordinates);
  const circleCallbackRef = useRef<MapViewProps['onCircleDrawn']>(onCircleDrawn);
  const previewCircleRef = useRef<L.Circle | null>(null);
  const circleDragRef = useRef<ReturnType<typeof createCircleDrag> | null>(null);
  if (!circleDragRef.current) circleDragRef.current = createCircleDrag();

  const [isAutoFollow, setIsAutoFollow] = useState<boolean>(false);
  const [isLegendOpen, setIsLegendOpen] = useState<boolean>(false);
  // The draw effect is declared before the map-creating effect, so it must re-run once the map exists
  // (the circle tool can be armed on the very first render — ZonesScreen defaults to it).
  const [mapReady, setMapReady] = useState<boolean>(false);
  // One shorthand for the whole file: copy is a catalog key plus the caller's language. A missing key
  // throws on purpose — the parity guard in tests/app/positions.test.ts fails the suite first.
  const t = (key: string, vars?: Record<string, string | number>) => translate(key, lang, vars);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  // Only used to re-run the update effect when the zoom changes: the ring's metre radius is fixed,
  // so what the guardian sees of it is a function of the zoom level.
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  useEffect(() => {
    selectCallbackRef.current = onSelectCoordinates;
  }, [onSelectCoordinates]);
  useEffect(() => {
    circleCallbackRef.current = onCircleDrawn;
  }, [onCircleDrawn]);

  // The circle-drag tool. Panning is off while it is armed (a drag IS the drawing, not a pan); the
  // dashed preview is a local layer that never becomes a zone — only a completed drag calls back, and
  // the guardian still has to press Save. The gesture is a Pointer Events stream on the map container:
  // Leaflet's Map event system does not forward DOM touch events (map.on('touchstart', …) never fired,
  // review 2), and pointer capture keeps delivering moves after the finger leaves the map. A release
  // under 6 px is a tap: the map's own click handler places the centre at the typed radius.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!drawCircle) {
      map.dragging.enable();
      return;
    }
    map.dragging.disable();
    const container = map.getContainer();
    const drag = circleDragRef.current!;
    const previousTouchAction = container.style.touchAction;
    // Without this the browser claims the touch for scrolling and cancels our pointer stream.
    container.style.touchAction = 'none';
    let activePointer: number | null = null;

    const clearPreview = () => {
      if (previewCircleRef.current) {
        map.removeLayer(previewCircleRef.current);
        previewCircleRef.current = null;
      }
    };
    const pointOf = (event: PointerEvent): DragPoint | null => {
      const latlng = map.mouseEventToLatLng(event);
      const px = map.mouseEventToContainerPoint(event);
      if (!Number.isFinite(latlng.lat) || !Number.isFinite(latlng.lng)) return null;
      return { lat: latlng.lat, lon: latlng.lng, x: px.x, y: px.y };
    };
    const releasePointer = (event: PointerEvent) => {
      try {
        if (container.hasPointerCapture(event.pointerId)) container.releasePointerCapture(event.pointerId);
      } catch {
        // Capture may already be gone (pointercancel / synthetic event); nothing to release.
      }
    };

    const begin = (event: PointerEvent) => {
      if (activePointer !== null) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      // Leaflet's zoom and attribution controls live inside the container; they keep their clicks.
      if (event.target instanceof Element && event.target.closest('.leaflet-control-container')) return;
      const point = pointOf(event);
      if (!point || !drag.begin(point)) return;
      activePointer = event.pointerId;
      try {
        container.setPointerCapture(event.pointerId);
      } catch {
        // No capture support (jsdom / older engine): moves that leave the map are simply lost.
      }
      event.preventDefault();
      clearPreview();
      previewCircleRef.current = L.circle([point.lat, point.lon], {
        radius: 1, color: '#10b981', weight: 2, dashArray: '6 6', fillOpacity: 0.08,
      }).addTo(map);
    };
    const move = (event: PointerEvent) => {
      if (activePointer !== event.pointerId) return;
      const point = pointOf(event);
      const preview = point ? drag.move(point) : null;
      if (!preview) return;
      previewCircleRef.current?.setRadius(Math.max(preview.radiusMeters, 1));
      event.preventDefault();
    };
    const finish = (event: PointerEvent) => {
      if (activePointer !== event.pointerId) return;
      const outcome = drag.finish(pointOf(event) ?? undefined);
      activePointer = null;
      releasePointer(event);
      clearPreview();
      if (outcome?.drawn && outcome.center) {
        circleCallbackRef.current?.(
          { lat: outcome.center.lat, lon: outcome.center.lon },
          Math.round(outcome.radiusMeters),
        );
      }
    };
    const cancel = (event: PointerEvent) => {
      if (activePointer !== event.pointerId) return;
      drag.cancel();
      activePointer = null;
      releasePointer(event);
      clearPreview();
    };
    const lostCapture = (event: PointerEvent) => {
      // Capture lost without a release (the browser took the gesture): end it without drawing.
      if (activePointer !== event.pointerId) return;
      drag.cancel();
      activePointer = null;
      clearPreview();
    };

    container.addEventListener('pointerdown', begin);
    container.addEventListener('pointermove', move);
    container.addEventListener('pointerup', finish);
    container.addEventListener('pointercancel', cancel);
    container.addEventListener('lostpointercapture', lostCapture);
    // A release outside the container must end the gesture even where capture is unavailable (or
    // throws). When the container sees the event first these are no-ops: activePointer is already null.
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', cancel);
    return () => {
      container.removeEventListener('pointerdown', begin);
      container.removeEventListener('pointermove', move);
      container.removeEventListener('pointerup', finish);
      container.removeEventListener('pointercancel', cancel);
      container.removeEventListener('lostpointercapture', lostCapture);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', cancel);
      container.style.touchAction = previousTouchAction;
      drag.reset();
      activePointer = null;
      clearPreview();
      map.dragging.enable();
    };
  }, [drawCircle, mapReady]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors | KidGuard DZ',
      maxZoom: 19,
    }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      // A drag release also produces a click at the RELEASE point. While panning is disabled Leaflet
      // does not suppress it, so consuming it here is what keeps the drawn circle centred on its start
      // instead of its rim (review 2, Critical). Once per drag; a later tap selects normally.
      if (circleDragRef.current?.consumeClickSuppression()) return;
      const clicked = childFixLatLng(e?.latlng?.lat, e?.latlng?.lng);
      if (clicked) selectCallbackRef.current?.(clicked[0], clicked[1]);
    });

    // A manual pan or zoom ends auto-follow; the guardian, not the feed, owns the viewport.
    map.on('dragstart', () => setIsAutoFollow(false));
    map.on('zoomend', () => {
      // The ring keeps its metre radius, so its pixel size changes with the zoom by itself.
      if (mapRef.current) setZoomLevel(mapRef.current.getZoom());
    });

    map.setView(EMPTY_VIEW, 1);
    mapRef.current = map;
    setMapReady(true);
    setTimeout(() => {
      if (mapRef.current) mapRef.current.invalidateSize();
    }, 200);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
      childMarkerRef.current = null;
      accuracyCircleRef.current = null;
      zoneLayersRef.current = [];
      historyPolylineRef.current = null;
      distanceLineRef.current = null;
      hasFramedRef.current = false;
    };
  }, []);

  const zoneCenter = (zone: MapZone): [number, number] | null =>
    zone.geometry.kind === 'circle'
      ? childFixLatLng(zone.geometry.lat, zone.geometry.lon)
      : null;

  const frameAll = (map: L.Map, fix: [number, number] | null) => {
    const points: [number, number][] = [];
    if (fix) points.push(fix);
    for (const zone of zones || []) {
      const center = zoneCenter(zone);
      if (center) points.push(center);
      if (zone.geometry.kind !== 'circle') {
        for (const p of zone.geometry.points) {
          const vertex = childFixLatLng(p.lat, p.lon);
          if (vertex) points.push(vertex);
        }
      }
    }
    if (points.length === 0) return false;
    const bounds = L.latLngBounds(points);
    if (!bounds.isValid()) return false;
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 18 });
    return true;
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // ── 1. The child: a pin exists only for a real fix ──────────────────────────────────────────
    // The conflict banner promises that NEITHER source is shown, so the marker path keeps that
    // promise itself rather than relying on Task 9 to pass `position: null` alongside it.
    const fix = !sourceConflict && position ? childFixLatLng(position.latitude, position.longitude) : null;
    const icon = childIconHtml({
      course: position?.course ?? null,
      freshness,
      hasFix: fix !== null,
    });

    if (!fix) {
      if (childMarkerRef.current && map.hasLayer(childMarkerRef.current)) map.removeLayer(childMarkerRef.current);
      childMarkerRef.current = null;
      if (accuracyCircleRef.current && map.hasLayer(accuracyCircleRef.current)) map.removeLayer(accuracyCircleRef.current);
      accuracyCircleRef.current = null;
    } else {
      const leafletIcon = L.divIcon({
        className: 'kg-child-icon',
        html: icon.html,
        iconSize: [CHILD_ICON_SIZE, CHILD_ICON_SIZE],
        iconAnchor: [CHILD_ICON_SIZE / 2, CHILD_ICON_SIZE / 2],
        popupAnchor: [0, -CHILD_ICON_SIZE / 2],
      });

      if (!childMarkerRef.current || !map.hasLayer(childMarkerRef.current)) {
        const marker = L.marker(fix, { icon: leafletIcon, zIndexOffset: 1000 }).addTo(map);
        // No `draggable`: a dragged pin used to write a child location nobody reported.
        childMarkerRef.current = marker;
      } else {
        childMarkerRef.current.setLatLng(fix);
        childMarkerRef.current.setIcon(leafletIcon);
      }

      const safeName = escapeHtml(childName);
      const speed = position ? kmPerHour(position) : null;
      const popupHtml = `
        <div style="font-family:system-ui,sans-serif;text-align:${dir === 'rtl' ? 'right' : 'left'};direction:${dir};padding:6px;min-width:210px;box-sizing:border-box;color:#0f172a;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin-bottom:8px;">
            <strong style="font-size:14px;line-height:1.3;">${safeName}</strong>
            <span style="width:10px;height:10px;border-radius:50%;border:2px solid ${icon.tone};display:inline-block;"></span>
          </div>
          <div style="font-size:12px;color:#334155;line-height:1.6;">
            ${popupRow(t('map.lastReading'), label ? escapeHtml(label) : '—')}
            ${popupRow(t('map.coordinates'), `${fix[0].toFixed(5)}, ${fix[1].toFixed(5)}`)}
            ${speed === null ? '' : popupRow(t('map.speed'), `${Math.round(speed)} ${t('map.speedUnit')}`)}
          </div>
        </div>`;

      if (childMarkerRef.current.getPopup()) childMarkerRef.current.setPopupContent(popupHtml);
      else childMarkerRef.current.bindPopup(popupHtml);
    }

    // ── 2. Accuracy ring at its true metre scale, and only when one was reported ────────────────
    const ring = fix && position
      ? scaleForZoom(position.accuracy, map.getZoom(), fix[0])
      : { ringMeters: null as number | null, pixelRadius: 0 };

    if (fix && ring.ringMeters !== null) {
      const circleOptions = {
        radius: ring.ringMeters,
        color: icon.tone,
        fillColor: icon.tone,
        fillOpacity: 0.1,
        weight: 1.5,
        dashArray: '4, 4',
      };
      if (!accuracyCircleRef.current || !map.hasLayer(accuracyCircleRef.current)) {
        accuracyCircleRef.current = L.circle(fix, circleOptions).addTo(map);
      } else {
        accuracyCircleRef.current.setLatLng(fix);
        accuracyCircleRef.current.setRadius(ring.ringMeters);
        accuracyCircleRef.current.setStyle({ color: icon.tone, fillColor: icon.tone });
      }
    } else if (accuracyCircleRef.current && map.hasLayer(accuracyCircleRef.current)) {
      map.removeLayer(accuracyCircleRef.current);
      accuracyCircleRef.current = null;
    }

    // ── 3. Zones, drawn from the geometry the server stores ─────────────────────────────────────
    for (const layer of zoneLayersRef.current) {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    }
    zoneLayersRef.current = [];

    let nearest: { zone: MapZone; center: [number, number]; distance: number } | null = null;
    for (const zone of zones || []) {
      const center = zoneCenter(zone);
      const geometry = zone.geometry;

      if (geometry.kind === 'circle' && center) {
        const circle = L.circle(center, {
          radius: geometry.radiusMeters,
          color: ZONE_TONE,
          fillColor: ZONE_TONE,
          fillOpacity: 0.12,
          weight: 2,
        }).addTo(map);
        const name = escapeHtml(zone.name);
        circle.bindPopup(`
          <div style="font-family:system-ui,sans-serif;text-align:${dir === 'rtl' ? 'right' : 'left'};direction:${dir};padding:2px;color:#0f172a;">
            <strong style="color:#047857;">🏰 ${name}</strong><br/>
            <span style="font-size:11px;color:#475569;">${t('map.radiusMeters', { radius: Math.round(geometry.radiusMeters) })}</span>
          </div>`);
        zoneLayersRef.current.push(circle);

        if (fix) {
          const distance = haversineMeters(fix[0], fix[1], center[0], center[1]);
          if (!nearest || distance < nearest.distance) nearest = { zone, center, distance };
        }
      } else if (geometry.kind === 'polygon') {
        const ringPoints = geometry.points
          .map((p) => childFixLatLng(p.lat, p.lon))
          .filter((p): p is [number, number] => p !== null);
        if (ringPoints.length >= 3) {
          const polygon = L.polygon(ringPoints, {
            color: ZONE_TONE,
            fillColor: ZONE_TONE,
            fillOpacity: 0.12,
            weight: 2,
          }).addTo(map);
          polygon.bindPopup(`<div style="direction:${dir};color:#047857;">🏰 ${escapeHtml(zone.name)}</div>`);
          zoneLayersRef.current.push(polygon);
        }
      } else if (geometry.kind === 'linestring') {
        const routePoints = geometry.points
          .map((p) => childFixLatLng(p.lat, p.lon))
          .filter((p): p is [number, number] => p !== null);
        if (routePoints.length >= 2) {
          const route = L.polyline(routePoints, { color: ZONE_TONE, weight: 3, opacity: 0.7 }).addTo(map);
          route.bindPopup(`<div style="direction:${dir};color:#047857;">🛣️ ${escapeHtml(zone.name)}</div>`);
          zoneLayersRef.current.push(route);
        }
      }
    }

    // A plain distance to a zone centre is a measurement; whether the child is "inside" is the
    // server's event to declare, so the map says the number and draws the line, and nothing more.
    if (fix && nearest) {
      const lineCoords: [number, number][] = [fix, nearest.center];
      if (!distanceLineRef.current || !map.hasLayer(distanceLineRef.current)) {
        distanceLineRef.current = L.polyline(lineCoords, {
          color: ZONE_TONE, weight: 2, opacity: 0.7, dashArray: '6, 6',
        }).addTo(map);
      } else {
        distanceLineRef.current.setLatLngs(lineCoords);
      }
    } else if (distanceLineRef.current) {
      if (map.hasLayer(distanceLineRef.current)) map.removeLayer(distanceLineRef.current);
      distanceLineRef.current = null;
    }

    // ── 4. History track, vertex by vertex as reported ──────────────────────────────────────────
    const track = (history || [])
      .map((p) => childFixLatLng(p.lat, p.lon))
      .filter((p): p is [number, number] => p !== null);
    if (track.length > 1) {
      if (!historyPolylineRef.current || !map.hasLayer(historyPolylineRef.current)) {
        historyPolylineRef.current = L.polyline(track, {
          color: HISTORY_TONE, weight: 3, opacity: 0.6, dashArray: '4, 4',
        }).addTo(map);
      } else {
        historyPolylineRef.current.setLatLngs(track);
      }
    } else if (historyPolylineRef.current && map.hasLayer(historyPolylineRef.current)) {
      map.removeLayer(historyPolylineRef.current);
      historyPolylineRef.current = null;
    }

    // Frame the data once when it first arrives, then leave the viewport to the guardian.
    if (!hasFramedRef.current && (fix || (zones || []).length > 0)) {
      if (frameAll(map, fix)) hasFramedRef.current = true;
    }

    if (isAutoFollow && fix) {
      map.flyTo(fix, zoomForRing(position?.accuracy ?? null, fix[0]), { animate: true, duration: 1 });
    }
  }, [lang, childName, position, freshness, label, zones, history, sourceConflict, isAutoFollow, zoomLevel]);

  const handleRecenterOnChild = () => {
    const map = mapRef.current;
    if (!map) return;
    const fix = position ? childFixLatLng(position.latitude, position.longitude) : null;
    if (!fix) {
      setIsLegendOpen(false);
      return;
    }
    // Zoom so the reported radius fits the screen instead of pretending a fixed level is precise.
    map.flyTo(fix, zoomForRing(position?.accuracy ?? null, fix[0]), { animate: true, duration: 1 });
    childMarkerRef.current?.openPopup();
  };

  const handleFitAllBounds = () => {
    const map = mapRef.current;
    if (!map) return;
    const fix = position ? childFixLatLng(position.latitude, position.longitude) : null;
    if (frameAll(map, fix)) hasFramedRef.current = true;
  };

  return (
    <div className="relative w-full h-full min-h-0 rounded-2xl overflow-hidden shadow-inner border border-slate-200 dark:border-slate-800">
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {sourceConflict && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-amber-950/95 text-amber-100 border border-amber-500/60 rounded-2xl px-3 py-2 text-[11px] font-bold shadow-2xl">
          {t('map.sourceConflict')}
        </div>
      )}

      <div className="absolute top-3 right-3 left-auto z-10 flex flex-col items-end gap-2 pointer-events-auto">
        <button
          onClick={handleRecenterOnChild}
          className="h-11 w-11 sm:h-12 sm:w-12 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl border border-emerald-400/60 shadow-2xl backdrop-blur-md flex items-center justify-center transition-all active:scale-95 group shrink-0"
          title={t('map.recenterTitle')}
        >
          <div className="p-1 rounded-xl bg-white/20 text-white group-hover:scale-110 transition-transform">
            <LocateFixed className="w-5 h-5" />
          </div>
        </button>

        <button
          onClick={() => mapRef.current?.zoomIn()}
          className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-slate-900/95 hover:bg-slate-800 text-emerald-400 hover:text-white transition-all active:scale-90 flex items-center justify-center border border-slate-700/80 shadow-2xl backdrop-blur-md shrink-0"
          title={t('map.zoomInTitle')}
        >
          <ZoomIn className="w-5 h-5 text-emerald-400" />
        </button>

        <button
          onClick={() => mapRef.current?.zoomOut()}
          className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-slate-900/95 hover:bg-slate-800 text-amber-400 hover:text-white transition-all active:scale-90 flex items-center justify-center border border-slate-700/80 shadow-2xl backdrop-blur-md shrink-0"
          title={t('map.zoomOutTitle')}
        >
          <ZoomOut className="w-5 h-5 text-amber-400" />
        </button>

        <button
          onClick={handleFitAllBounds}
          className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-slate-900/95 hover:bg-slate-800 text-blue-400 hover:text-white transition-all active:scale-90 flex items-center justify-center border border-slate-700/80 shadow-2xl backdrop-blur-md shrink-0"
          title={t('map.fitAllTitle')}
        >
          <Maximize2 className="w-5 h-5 text-blue-400" />
        </button>

        <button
          onClick={() => setIsAutoFollow(!isAutoFollow)}
          className={`h-11 w-11 sm:h-12 sm:w-12 rounded-2xl border shadow-2xl backdrop-blur-md flex items-center justify-center text-xs font-extrabold transition-all active:scale-95 shrink-0 ${
            isAutoFollow
              ? 'bg-emerald-950/95 border-emerald-500 text-emerald-300'
              : 'bg-slate-900/90 hover:bg-slate-800 text-slate-300 border-slate-700/80'
          }`}
          title={t(isAutoFollow ? 'map.followOffTitle' : 'map.followOnTitle')}
        >
          <span className="text-base" aria-hidden="true">🔄</span>
        </button>
      </div>

      <div className="absolute top-3 left-3 right-auto z-10 pointer-events-auto">
        {!isLegendOpen ? (
          <button
            onClick={() => setIsLegendOpen(true)}
            className="bg-slate-900/95 hover:bg-slate-800 text-slate-200 px-3 py-2 rounded-2xl border border-slate-700/80 shadow-2xl backdrop-blur-md flex items-center gap-2 text-xs font-bold transition-all active:scale-95 group"
            title={t('map.legendOpenTitle')}
          >
            <span className="text-sm group-hover:rotate-12 transition-transform">🗺️</span>
            <span className="text-xs font-extrabold">{t('map.legendTitle')}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
        ) : (
          <div className="bg-slate-900/95 backdrop-blur-md text-white p-3 rounded-2xl border border-slate-700/90 shadow-2xl text-xs space-y-2.5 w-[220px]">
            <div className="flex items-center justify-between font-bold border-b border-slate-800 pb-1.5 text-emerald-400">
              <span className="flex items-center gap-1.5 font-extrabold">
                <span>🗺️</span>
                <span>{t('map.legendTitle')}</span>
              </span>
              <button
                onClick={() => setIsLegendOpen(false)}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                title={t('map.legendCloseTitle')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* §12: the states differ by SHAPE, so the legend says so in shapes, not colours. Each row
                is one catalog pair (the shape, then the fact it stands for) — no copy lives here. */}
            <div className="space-y-1.5 text-[11px] text-slate-200">
              {LEGEND_SHAPES.map(([shapeKey, noteKey]) => (
                <div key={shapeKey} className="flex items-center justify-between bg-slate-800/60 p-1.5 rounded-xl border border-slate-700/40">
                  <span className="font-bold">{t(shapeKey)}</span>
                  <span className="text-[10px] text-slate-400">{t(noteKey)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="absolute bottom-3 right-3 rtl:right-auto rtl:left-3 z-10 bg-slate-900/90 backdrop-blur-md text-white px-3 py-1.5 rounded-xl border border-slate-700/50 shadow-lg text-[11px]">
        <span className="font-mono">{label ?? '—'}</span>
      </div>
    </div>
  );
};

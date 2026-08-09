import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { LocateFixed, Maximize2, ZoomIn, ZoomOut, ChevronDown, ChevronUp, X, MapPin } from 'lucide-react';
import { LocationPoint, SafeZone, KidState } from '../types';

interface MapViewProps {
  location: LocationPoint;
  safeZones: SafeZone[];
  kidState: KidState;
  childName: string;
  locationHistory: LocationPoint[];
  onSelectCoordinates?: (lat: number, lng: number) => void;
  onChildLocationChange?: (lat: number, lng: number) => void;
}

// Haversine distance helper in meters
function isValidCoord(lat: any, lng: any): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    !isNaN(lat) &&
    !isNaN(lng) &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function safeLat(lat: any, fallback = 36.7538): number {
  const parsed = typeof lat === 'number' ? lat : parseFloat(lat);
  return !isNaN(parsed) && Number.isFinite(parsed) && parsed >= -90 && parsed <= 90 ? parsed : fallback;
}

function safeLng(lng: any, fallback = 3.0588): number {
  const parsed = typeof lng === 'number' ? lng : parseFloat(lng);
  return !isNaN(parsed) && Number.isFinite(parsed) && parsed >= -180 && parsed <= 180 ? parsed : fallback;
}

function safeNum(val: any, fallback = 10): number {
  const parsed = typeof val === 'number' ? val : parseFloat(val);
  return !isNaN(parsed) && Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  if (!isValidCoord(lat1, lon1) || !isValidCoord(lat2, lon2)) return 0;
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export const MapView: React.FC<MapViewProps> = ({
  location,
  safeZones,
  kidState,
  childName,
  locationHistory,
  onSelectCoordinates,
  onChildLocationChange,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const childMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const zoneCirclesRef = useRef<L.Circle[]>([]);
  const zoneCenterMarkersRef = useRef<L.Marker[]>([]);
  const historyPolylineRef = useRef<L.Polyline | null>(null);
  const distanceLineRef = useRef<L.Polyline | null>(null);

  // Auto-Follow State (disabled by default so user can pan/zoom freely)
  const [isAutoFollow, setIsAutoFollow] = useState<boolean>(false);
  // Collapsible Map Legend State (starts collapsed so map is completely clear)
  const [isLegendOpen, setIsLegendOpen] = useState<boolean>(false);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapRef.current) {
      const initLat = safeLat(location?.latitude, 36.7538);
      const initLng = safeLng(location?.longitude, 3.0588);

      const map = L.map(mapContainerRef.current, {
        center: [initLat, initLng],
        zoom: 16,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors | KidGuard DZ',
        maxZoom: 19,
      }).addTo(map);

      // Select coordinates or click to reposition
      map.on('click', (e: L.LeafletMouseEvent) => {
        if (onSelectCoordinates && e?.latlng && isValidCoord(e.latlng.lat, e.latlng.lng)) {
          onSelectCoordinates(e.latlng.lat, e.latlng.lng);
        }
      });

      // Disable auto-follow automatically if user manually drags or zooms map
      map.on('dragstart', () => {
        setIsAutoFollow(false);
      });

      mapRef.current = map;

      // Force recalculate container size for Leaflet tile rendering
      setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.invalidateSize();
        }
      }, 200);
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      childMarkerRef.current = null;
      accuracyCircleRef.current = null;
      zoneCirclesRef.current = [];
      zoneCenterMarkersRef.current = [];
      historyPolylineRef.current = null;
      distanceLineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    try {
      const childLat = safeLat(location?.latitude, 36.7538);
      const childLng = safeLng(location?.longitude, 3.0588);
      const childAccuracy = Math.max(1, safeNum(location?.accuracy, 10));

      const isViolated = kidState !== 'SAFE' && kidState !== 'RETURNED_TO_SAFE_ZONE';

      // 1. High Visibility Child Pin Avatar Marker
      const pinBg = isViolated ? '#ef4444' : '#10b981';
      const pulseBg = isViolated ? 'rgba(239, 68, 68, 0.45)' : 'rgba(16, 185, 129, 0.45)';

      const childPinHtml = `
        <div style="position: relative; width: 68px; height: 72px; display: flex; flex-direction: column; align-items: center; cursor: grab;">
          <div style="position: absolute; bottom: -2px; width: 48px; height: 18px; border-radius: 50%; background: ${pulseBg}; animation: ping 1.4s cubic-bezier(0, 0, 0.2, 1) infinite; z-index: 1;"></div>
          <div style="position: relative; z-index: 2; display: flex; flex-direction: column; align-items: center;">
            <div style="background: ${pinBg}; color: white; border: 2px solid #ffffff; box-shadow: 0 4px 14px rgba(0,0,0,0.5); padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 900; white-space: nowrap; font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; gap: 4px; line-height: 1;">
              <span>👦</span>
              <span>${childName}</span>
            </div>
            <div style="width: 36px; height: 36px; background: ${pinBg}; border: 3px solid #ffffff; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); box-shadow: 0 4px 12px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; margin-top: -3px;">
              <div style="transform: rotate(45deg); font-size: 16px; font-weight: bold; color: white;">
                📍
              </div>
            </div>
          </div>
        </div>
      `;

      const customChildIcon = L.divIcon({
        className: 'child-pin-marker-container',
        html: childPinHtml,
        iconSize: [68, 72],
        iconAnchor: [34, 68],
        popupAnchor: [0, -60],
      });

      if (!childMarkerRef.current || !map.hasLayer(childMarkerRef.current)) {
        const marker = L.marker([childLat, childLng], {
          icon: customChildIcon,
          draggable: true,
          zIndexOffset: 1000,
        }).addTo(map);

        marker.on('dragend', (e: L.DragEndEvent) => {
          const newPos = e.target.getLatLng();
          if (onChildLocationChange && isValidCoord(newPos.lat, newPos.lng)) {
            onChildLocationChange(newPos.lat, newPos.lng);
          }
        });

        childMarkerRef.current = marker;
      } else {
        childMarkerRef.current.setLatLng([childLat, childLng]);
        childMarkerRef.current.setIcon(customChildIcon);
      }

      const speedKmH = location?.speed
        ? Math.round(location.speed > 50 ? location.speed : location.speed * 3.6)
        : 0;

      const popupHtml = `
        <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: right; direction: rtl; padding: 6px; min-width: 210px; box-sizing: border-box;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 8px;">
            <strong style="font-size: 14px; color: #0f172a; line-height: 1.3;">🚸 ${childName}</strong>
            <span style="font-size: 10px; padding: 3px 8px; border-radius: 8px; background: ${isViolated ? '#fee2e2' : '#d1fae5'}; color: ${isViolated ? '#991b1b' : '#065f46'}; font-weight: 800; white-space: nowrap;">
              ${isViolated ? 'خارج المنطقة' : 'داخل المنطقة الآمنة'}
            </span>
          </div>
          <div style="font-size: 12px; color: #334155; line-height: 1.6;">
            <div style="display: flex; justify-content: space-between; gap: 6px; margin-bottom: 3px;">
              <span style="color: #64748b;">📍 الموقع:</span>
              <strong style="font-family: monospace; direction: ltr;">${childLat.toFixed(5)}, ${childLng.toFixed(5)}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; gap: 6px; margin-bottom: 3px;">
              <span style="color: #64748b;">🎯 دقة GPS:</span>
              <strong>±${Math.round(childAccuracy)} متر</strong>
            </div>
            <div style="display: flex; justify-content: space-between; gap: 6px; margin-bottom: 3px;">
              <span style="color: #64748b;">⚡ السرعة:</span>
              <strong>${speedKmH} كم/س</strong>
            </div>
            <div style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed #cbd5e1; font-size: 11px; color: #0284c7; line-height: 1.4;">
              💡 يمكنك سحب هذا الدبوس بالماوس أو الإصبع لنقل مكان الطفل.
            </div>
          </div>
        </div>
      `;

      if (childMarkerRef.current.getPopup()) {
        childMarkerRef.current.setPopupContent(popupHtml);
      } else {
        childMarkerRef.current.bindPopup(popupHtml);
      }

      // 2. Accuracy Circle
      if (!accuracyCircleRef.current || !map.hasLayer(accuracyCircleRef.current)) {
        accuracyCircleRef.current = L.circle([childLat, childLng], {
          radius: childAccuracy,
          color: pinBg,
          fillColor: pinBg,
          fillOpacity: 0.12,
          weight: 1.5,
          dashArray: '4, 4',
        }).addTo(map);
      } else {
        accuracyCircleRef.current.setLatLng([childLat, childLng]);
        accuracyCircleRef.current.setRadius(childAccuracy);
        accuracyCircleRef.current.setStyle({ color: pinBg, fillColor: pinBg });
      }

      // 3. Render Safe Zone Circles and Center Markers
      zoneCirclesRef.current.forEach((c) => {
        if (map.hasLayer(c)) map.removeLayer(c);
      });
      zoneCirclesRef.current = [];

      zoneCenterMarkersRef.current.forEach((m) => {
        if (map.hasLayer(m)) map.removeLayer(m);
      });
      zoneCenterMarkersRef.current = [];

      let nearestZone: SafeZone | null = null;
      let minDistance = Infinity;

      (safeZones || []).forEach((zone) => {
        if (!zone || !zone.active) return;
        const zLat = safeLat(zone.latitude, 36.7538);
        const zLng = safeLng(zone.longitude, 3.0588);
        if (!isValidCoord(zLat, zLng)) return;

        const zRadius = Math.max(10, safeNum(zone.radius, 100));

        const dist = getDistanceMeters(childLat, childLng, zLat, zLng);

        if (dist < minDistance) {
          minDistance = dist;
          nearestZone = zone;
        }

        // Safe Zone Circle
        const circle = L.circle([zLat, zLng], {
          radius: zRadius,
          color: '#10b981',
          fillColor: '#10b981',
          fillOpacity: 0.15,
          weight: 2,
        }).addTo(map);

        // Center Pin Marker
        const zoneCenterHtml = `
          <div style="display: flex; flex-direction: column; align-items: center;">
            <div style="background: #047857; color: white; font-size: 10px; font-weight: bold; padding: 2px 6px; border-radius: 8px; border: 1px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); white-space: nowrap;">
              🏰 ${zone.name}
            </div>
            <div style="width: 12px; height: 12px; background: #047857; border: 2px solid white; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.3); margin-top: -2px;"></div>
          </div>
        `;

        const zoneIcon = L.divIcon({
          className: 'zone-center-pin',
          html: zoneCenterHtml,
          iconSize: [30, 30],
          iconAnchor: [15, 20],
        });

        const zoneMarker = L.marker([zLat, zLng], {
          icon: zoneIcon,
        }).addTo(map);

        zoneMarker.bindPopup(`
          <div style="font-family: system-ui, sans-serif; text-align: right; direction: rtl; padding: 2px;">
            <strong style="color: #047857;">🏰 المنطقة الآمنة: ${zone.name}</strong><br/>
            <span style="font-size: 11px; color: #475569;">نصف القطر: ${zRadius} متر</span><br/>
            <span style="font-size: 10px; color: #059669; font-weight: 600;">
              ${dist <= zRadius ? 'الطفل متواجد بالداخل' : `الطفل يبعد ${dist} متر عن المركز`}
            </span>
          </div>
        `);

        zoneCirclesRef.current.push(circle);
        zoneCenterMarkersRef.current.push(zoneMarker);
      });

      // 4. Vector Distance Line between Child Pin & Nearest Safe Zone
      if (nearestZone) {
        const activeZone = nearestZone as SafeZone;
        const nzLat = safeLat(activeZone.latitude, 36.7538);
        const nzLng = safeLng(activeZone.longitude, 3.0588);
        if (isValidCoord(nzLat, nzLng)) {
          const lineCoords: [number, number][] = [
            [childLat, childLng],
            [nzLat, nzLng],
          ];

          const lineColor = isViolated ? '#ef4444' : '#10b981';

          if (!distanceLineRef.current || !map.hasLayer(distanceLineRef.current)) {
            distanceLineRef.current = L.polyline(lineCoords, {
              color: lineColor,
              weight: 2.5,
              opacity: 0.85,
              dashArray: '6, 6',
            }).addTo(map);
          } else {
            distanceLineRef.current.setLatLngs(lineCoords);
            distanceLineRef.current.setStyle({ color: lineColor });
          }
        }
      } else if (distanceLineRef.current) {
        if (map.hasLayer(distanceLineRef.current)) {
          map.removeLayer(distanceLineRef.current);
        }
        distanceLineRef.current = null;
      }

      // 5. History Polyline
      const validHistory = (locationHistory || []).filter((pt) =>
        isValidCoord(pt?.latitude, pt?.longitude)
      );
      if (validHistory.length > 1) {
        const latLngs = validHistory.map(
          (pt) => [safeLat(pt.latitude), safeLng(pt.longitude)] as [number, number]
        );
        if (!historyPolylineRef.current || !map.hasLayer(historyPolylineRef.current)) {
          historyPolylineRef.current = L.polyline(latLngs, {
            color: '#3b82f6',
            weight: 3,
            opacity: 0.6,
            dashArray: '4, 4',
          }).addTo(map);
        } else {
          historyPolylineRef.current.setLatLngs(latLngs);
        }
      }

      // Auto-Follow child only if explicitly enabled by parent
      if (isAutoFollow) {
        map.flyTo([childLat, childLng], map.getZoom(), {
          animate: true,
          duration: 1,
        });
      }
    } catch (err) {
      console.warn('Leaflet map update caught transient error:', err);
    }
  }, [location, safeZones, kidState, childName, locationHistory, onChildLocationChange, isAutoFollow]);

  const handleRecenterOnChild = () => {
    if (mapRef.current) {
      const cLat = safeLat(location?.latitude, 36.7538);
      const cLng = safeLng(location?.longitude, 3.0588);
      mapRef.current.flyTo([cLat, cLng], 17, {
        animate: true,
        duration: 1,
      });
      if (childMarkerRef.current) {
        childMarkerRef.current.openPopup();
      }
    }
  };

  const handleZoomIn = () => {
    if (mapRef.current) {
      mapRef.current.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (mapRef.current) {
      mapRef.current.zoomOut();
    }
  };

  const handleFitAllBounds = () => {
    if (!mapRef.current) return;
    const cLat = safeLat(location?.latitude, 36.7538);
    const cLng = safeLng(location?.longitude, 3.0588);
    const points: [number, number][] = [[cLat, cLng]];

    (safeZones || []).forEach((z) => {
      if (z && z.active && isValidCoord(z.latitude, z.longitude)) {
        points.push([safeLat(z.latitude), safeLng(z.longitude)]);
      }
    });

    const validPoints = points.filter(([lat, lng]) => isValidCoord(lat, lng));
    if (validPoints.length > 0) {
      try {
        const bounds = L.latLngBounds(validPoints);
        if (bounds.isValid()) {
          mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
        }
      } catch (err) {
        console.warn('fitBounds error handled:', err);
      }
    }
  };

  return (
    <div className="relative w-full h-full min-h-[420px] rounded-2xl overflow-hidden shadow-inner border border-slate-200 dark:border-slate-800">
      <div ref={mapContainerRef} className="w-full h-full z-0" />

      {/* Map Side Action Buttons (Separated, Enlarged & Vertical) */}
      <div className="absolute top-3 right-3 rtl:right-auto rtl:left-3 z-10 flex flex-col gap-2.5 pointer-events-auto">
        
        {/* Recenter on Child Main Action Button */}
        <button
          onClick={handleRecenterOnChild}
          className="h-11 sm:h-12 px-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl border border-emerald-400/60 shadow-2xl backdrop-blur-md flex items-center gap-2 text-xs font-black transition-all active:scale-95 group shrink-0"
          title="إعادة التركيز المباشر والتكبير على مكان الطفل"
        >
          <div className="p-1 rounded-xl bg-white/20 text-white group-hover:scale-110 transition-transform">
            <LocateFixed className="w-5 h-5" />
          </div>
          <span className="font-extrabold whitespace-nowrap">📍 التركيز</span>
        </button>

        {/* Zoom In (+) Button */}
        <button
          onClick={handleZoomIn}
          className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-slate-900/95 hover:bg-slate-800 text-emerald-400 hover:text-white transition-all active:scale-90 flex items-center justify-center font-black text-xl border border-slate-700/80 shadow-2xl backdrop-blur-md shrink-0"
          title="تكبير الخريطة (+)"
        >
          <ZoomIn className="w-5 h-5 text-emerald-400" />
        </button>

        {/* Zoom Out (-) Button */}
        <button
          onClick={handleZoomOut}
          className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-slate-900/95 hover:bg-slate-800 text-amber-400 hover:text-white transition-all active:scale-90 flex items-center justify-center font-black text-xl border border-slate-700/80 shadow-2xl backdrop-blur-md shrink-0"
          title="تصغير الخريطة (-)"
        >
          <ZoomOut className="w-5 h-5 text-amber-400" />
        </button>

        {/* Fit Bounds / Overview Button */}
        <button
          onClick={handleFitAllBounds}
          className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-slate-900/95 hover:bg-slate-800 text-blue-400 hover:text-white transition-all active:scale-90 flex items-center justify-center border border-slate-700/80 shadow-2xl backdrop-blur-md shrink-0"
          title="عرض جميع المناطق والطفل معاً على الخريطة"
        >
          <Maximize2 className="w-5 h-5 text-blue-400" />
        </button>

        {/* Auto-Follow Toggle Button */}
        <button
          onClick={() => setIsAutoFollow(!isAutoFollow)}
          className={`h-11 px-3 rounded-2xl border shadow-2xl backdrop-blur-md flex items-center justify-center gap-1.5 text-xs font-extrabold transition-all active:scale-95 shrink-0 ${
            isAutoFollow
              ? 'bg-emerald-950/95 border-emerald-500 text-emerald-300'
              : 'bg-slate-900/90 hover:bg-slate-800 text-slate-300 border-slate-700/80'
          }`}
          title={isAutoFollow ? 'إيقاف التتبع التلقائي' : 'تفعيل التتبع التلقائي للتحرك مع الطفل'}
        >
          <span className="text-sm">🔄</span>
          <span className="text-[11px] font-extrabold">
            {isAutoFollow ? 'تتبع' : 'حر'}
          </span>
        </button>
      </div>

      {/* Collapsible Map Legend (Minimizable to save map area) */}
      <div className="absolute top-3 left-3 rtl:left-auto rtl:right-3 z-10 pointer-events-auto">
        {!isLegendOpen ? (
          /* Small Compact Legend Trigger Pill */
          <button
            onClick={() => setIsLegendOpen(true)}
            className="bg-slate-900/95 hover:bg-slate-800 text-slate-200 px-3 py-2 rounded-2xl border border-slate-700/80 shadow-2xl backdrop-blur-md flex items-center gap-2 text-xs font-bold transition-all active:scale-95 group"
            title="عرض مفاتيح الخريطة والرموز"
          >
            <span className="text-sm group-hover:rotate-12 transition-transform">🗺️</span>
            <span className="text-xs font-extrabold">مفاتيح الخريطة</span>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
        ) : (
          /* Expanded Map Legend Card */
          <div className="bg-slate-900/95 backdrop-blur-md text-white p-3 rounded-2xl border border-slate-700/90 shadow-2xl text-xs space-y-2.5 w-[210px] animate-in fade-in duration-200">
            <div className="flex items-center justify-between font-bold border-b border-slate-800 pb-1.5 text-emerald-400">
              <span className="flex items-center gap-1.5 font-extrabold">
                <span>🗺️</span>
                <span>مفاتيح الخريطة</span>
              </span>
              <button
                onClick={() => setIsLegendOpen(false)}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                title="إخفاء مفتاح الخريطة"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-1.5 text-[11px] text-slate-200">
              <div className="flex items-center justify-between bg-slate-800/60 p-1.5 rounded-xl border border-slate-700/40">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 border-2 border-white shrink-0 shadow-sm" />
                  <span className="font-bold">موقع الطفل</span>
                </div>
                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-mono">
                  {kidState === 'SAFE' ? 'آمن 🟢' : 'تنبيه 🔴'}
                </span>
              </div>

              <div className="flex items-center justify-between bg-slate-800/60 p-1.5 rounded-xl border border-slate-700/40">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-800 border-2 border-emerald-400 shrink-0 shadow-sm" />
                  <span className="font-bold">المنطقة الآمنة</span>
                </div>
                <span className="text-[10px] text-slate-400">نطاق حماية</span>
              </div>

              <div className="flex items-center justify-between bg-slate-800/60 p-1.5 rounded-xl border border-slate-700/40">
                <div className="flex items-center gap-2">
                  <span className="w-4 h-0.5 bg-blue-400 rounded shrink-0 border border-blue-300" />
                  <span className="font-bold">المسار السابق</span>
                </div>
                <span className="text-[10px] text-blue-300">خط حركة</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating Coordinates Status Bar */}
      <div className="absolute bottom-3 right-3 rtl:right-auto rtl:left-3 z-10 bg-slate-900/90 backdrop-blur-md text-white px-3 py-1.5 rounded-xl border border-slate-700/50 shadow-lg text-[11px]">
        <div className="flex items-center gap-1.5 font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span>GPS: {safeLat(location?.latitude).toFixed(4)}, {safeLng(location?.longitude).toFixed(4)}</span>
        </div>
      </div>
    </div>
  );
};

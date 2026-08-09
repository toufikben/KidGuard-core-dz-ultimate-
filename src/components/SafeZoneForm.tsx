import React, { useState } from 'react';
import { MapPin, Save, X, Navigation } from 'lucide-react';
import { SafeZone, LocationPoint } from '../types';
import { Language, translations } from '../translations';

interface SafeZoneFormProps {
  currentLocation: LocationPoint;
  onSave: (zone: Omit<SafeZone, 'id' | 'createdAt'>) => void;
  onClose: () => void;
  lang: Language;
  selectedCoords?: { lat: number; lng: number } | null;
}

export const SafeZoneForm: React.FC<SafeZoneFormProps> = ({
  currentLocation,
  onSave,
  onClose,
  lang,
  selectedCoords,
}) => {
  const t = translations[lang];

  const [name, setName] = useState('المدرسة / School');
  const [latStr, setLatStr] = useState<string>(
    selectedCoords
      ? String(selectedCoords.lat)
      : String(currentLocation?.latitude ?? 36.7538)
  );
  const [lngStr, setLngStr] = useState<string>(
    selectedCoords
      ? String(selectedCoords.lng)
      : String(currentLocation?.longitude ?? 3.0588)
  );
  const [radius, setRadius] = useState(250); // Default 250m
  const [active, setActive] = useState(true);

  const formatRadiusDisplay = (r: number) => {
    if (r >= 1000) {
      return `${r} متر (${(r / 1000).toFixed(1)} كم)`;
    }
    return `${r} متر`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const parsedLat = parseFloat(latStr);
    const parsedLng = parseFloat(lngStr);

    const safeLat =
      !isNaN(parsedLat) && Number.isFinite(parsedLat) && parsedLat >= -90 && parsedLat <= 90
        ? parsedLat
        : currentLocation?.latitude ?? 36.7538;

    const safeLng =
      !isNaN(parsedLng) && Number.isFinite(parsedLng) && parsedLng >= -180 && parsedLng <= 180
        ? parsedLng
        : currentLocation?.longitude ?? 3.0588;

    onSave({
      name: name.trim(),
      latitude: safeLat,
      longitude: safeLng,
      radius: isNaN(radius) || radius <= 0 ? 250 : radius,
      active,
    });
  };

  const handleUseCurrentLocation = () => {
    const safeLat = currentLocation?.latitude ?? 36.7538;
    const safeLng = currentLocation?.longitude ?? 3.0588;
    setLatStr(String(safeLat));
    setLngStr(String(safeLng));
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl text-white">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold">{t.addSafeZone}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-sm">
          {/* Zone Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {t.zoneName}
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: المنزل، الروضة، النادي"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Quick Location Picker Button */}
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            className="w-full py-2 px-3 rounded-xl bg-slate-800 border border-slate-700 hover:border-emerald-500 text-slate-200 hover:text-white flex items-center justify-center gap-2 text-xs transition-colors"
          >
            <Navigation className="w-4 h-4 text-emerald-400" />
            {t.useCurrentLocation}
          </button>

          {/* Coordinates Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {t.latitude}
              </label>
              <input
                type="number"
                step="any"
                required
                value={latStr}
                onChange={(e) => setLatStr(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                {t.longitude}
              </label>
              <input
                type="number"
                step="any"
                required
                value={lngStr}
                onChange={(e) => setLngStr(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Radius Slider, Numeric Input & Presets */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs font-semibold text-slate-300">
              <span>{t.radiusMeters}</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">إدخال مباشر:</span>
                <input
                  type="number"
                  min="50"
                  max="100000"
                  step="50"
                  value={radius}
                  onChange={(e) => setRadius(Math.max(50, parseInt(e.target.value || '50', 10)))}
                  className="w-24 bg-slate-800 border border-emerald-500/40 rounded-lg px-2 py-0.5 text-emerald-400 font-bold text-center text-xs font-mono focus:outline-none focus:border-emerald-400"
                />
                <span className="text-emerald-400 font-bold text-xs font-mono">
                  ({(radius / 1000).toFixed(1)} كم)
                </span>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: '250م', value: 250 },
                { label: '500م', value: 500 },
                { label: '1 كم', value: 1000 },
                { label: '2 كم', value: 2000 },
                { label: '5 كم', value: 5000 },
                { label: '10 كم', value: 10000 },
                { label: '20 كم', value: 20000 },
                { label: '50 كم', value: 50000 },
              ].map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setRadius(preset.value)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                    radius === preset.value
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <input
              type="range"
              min="50"
              max="50000"
              step="100"
              value={radius}
              onChange={(e) => setRadius(parseInt(e.target.value, 10))}
              className="w-full accent-emerald-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>50 متر</span>
              <span>5,000 متر (5 كم)</span>
              <span>25,000 متر (25 كم)</span>
              <span>50,000 متر (50 كم)</span>
            </div>
          </div>

          {/* Active Switch */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <span className="text-xs font-medium text-slate-300">
              حالة التفعيل تلقائياً
            </span>
            <button
              type="button"
              onClick={() => setActive(!active)}
              className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
                active ? 'bg-emerald-600' : 'bg-slate-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  active ? 'translate-x-6 rtl:-translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Actions */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-medium"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg shadow-emerald-600/20"
            >
              <Save className="w-4 h-4" />
              {t.saveZone}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

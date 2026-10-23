// src/components/ZonesScreen.tsx — the drawn zone goes to the SERVER and the server stays the truth
// (AC-2, Task 8). This screen never keeps a zone list of its own and never touches a browser storage:
// it loads with `service.listZones()`, and after every create/update/delete it shows the list the
// service READ BACK from `GET /geofences`, not the object it just built. The write gate is the
// service's (`whoAmI` admin bit from the server, R-M1-8); the "edit" control here is disabled for a
// non-admin purely as the on-screen half of that gate — disabling it cannot itself secure a write, so
// a forged `admin` in the DOM would still be refused by the service.
//
// §12 / R-M1-18 (the machine guard in tests/app/zones.test.ts): this file holds NO Arabic codepoint and
// no hard-coded RTL — every sentence is a catalog key plus the caller's `lang`, exactly like MapView.
// The literals that remain are language-neutral by construction (ids, the em-dash for an absent value).
//
// The drawing tools are the three the brief names — circle (drag), polygon (click), route (consecutive
// points). The SAVE path is what Task 8 measures (the live AC-2 run + probe line); the drawing GESTURE
// itself is NOT RUN here (R-M1-19), so the circle is offered as a click-to-place centre plus a radius
// control rather than a pixel-drag, and polygon/route accumulate real map clicks through MapView's
// existing coordinate callback.
import React, { useEffect, useMemo, useState } from 'react';
import { Circle, Pentagon, Route, Plus, Trash2, UserCog, X } from 'lucide-react';
import { MapView, type MapZone } from './MapView';
import { translate, type CatalogLang } from '../translations/catalog.ts';
import { parseWkt, type Geometry, type LatLng, type ZoneType } from '../services/traccar/wkt.ts';
import {
  type ZoneDraft,
  type ZoneService,
} from '../services/traccar/zones.ts';
import { TraccarError } from '../services/traccar/client.ts';
import type { ServerGeofence } from '../services/traccar/types.ts';
import { zoneErrorMessage } from './zonesMessage.ts';

type DrawMode = 'circle' | 'polygon' | 'route';

// The seven §6 types. A route is a DRAWING tool (a linestring geometry), not one of these seven
// labels, so it is deliberately not a value here — the type says what the place IS, the tool says how
// the shape was drawn.
const ZONE_TYPES: { value: ZoneType; key: string }[] = [
  { value: 'school', key: 'zones.type.school' },
  { value: 'home', key: 'zones.type.home' },
  { value: 'park', key: 'zones.type.park' },
  { value: 'outing', key: 'zones.type.outing' },
  { value: 'mosque', key: 'zones.type.mosque' },
  { value: 'activity', key: 'zones.type.activity' },
  { value: 'relative', key: 'zones.type.relative' },
];

const MODE_TOOLS: { value: DrawMode; key: string; Icon: typeof Circle }[] = [
  { value: 'circle', key: 'zones.mode.circle', Icon: Circle },
  { value: 'polygon', key: 'zones.mode.polygon', Icon: Pentagon },
  { value: 'route', key: 'zones.mode.route', Icon: Route },
];

export type ZonesScreenProps = {
  // A control value the caller already validated (App owns the stored locale). `lang` is required so
  // this screen can never render Arabic copy to a French-speaking guardian; it does not choose a
  // language for itself.
  lang: CatalogLang;
  // The service is built from the signed-in session's client (see App). `null` means nobody is signed
  // in, and then the screen can only say so — it never invents a zone list and never reads a local one.
  service: ZoneService | null;
  // The on-screen half of the write gate. The real gate is the service reading `whoAmI()` from the
  // server; this is `session.user?.admin === true`, the same server-named bit, so they cannot disagree.
  isAdmin: boolean;
  childName: string;
  // The child device the zone is evaluated against and the guardians who must receive the exit alert.
  // Task 9 supplies the device id; until then a zone saves without a device link (the alert
  // subscription still runs, R-M1-10).
  childDeviceId?: number;
  guardianUserIds?: number[];
};

// A server geofence becomes a drawable MapZone only through parseWkt — the one module that knows the
// `lat lon` order. A stored area we cannot read is dropped from the view, never guessed at.
function toMapZone(zone: ServerGeofence): MapZone | null {
  try {
    return { id: String(zone.id), name: zone.name, geometry: parseWkt(zone.area) };
  } catch {
    return null;
  }
}

export const ZonesScreen: React.FC<ZonesScreenProps> = ({
  lang,
  service,
  isAdmin,
  childName,
  childDeviceId,
  guardianUserIds,
}) => {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const t = (key: string, vars?: Record<string, string | number>) => translate(key, lang, vars);

  const [zones, setZones] = useState<ServerGeofence[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [mode, setMode] = useState<DrawMode>('circle');
  const [type, setType] = useState<ZoneType>('school');
  const [name, setName] = useState('');
  const [center, setCenter] = useState<LatLng | null>(null);
  const [radius, setRadius] = useState(120);
  const [points, setPoints] = useState<LatLng[]>([]);
  const [buffer, setBuffer] = useState(150);
  const [activeFrom, setActiveFrom] = useState('');
  const [activeTo, setActiveTo] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);

  // The list is the SERVER's. It is read on mount and after every write; nothing local is shown.
  useEffect(() => {
    if (!service) {
      setZones([]);
      setLoaded(false);
      return;
    }
    let alive = true;
    setLoaded(false);
    service
      .listZones()
      .then((rows) => { if (alive) { setZones(rows); setLoaded(true); } })
      .catch((error) => { if (alive) { setMessage(zoneErrorMessage(error, lang)); setLoaded(true); } });
    return () => { alive = false; };
  }, [service, lang]);

  const mapZones = useMemo<MapZone[]>(
    () => zones.map(toMapZone).filter((z): z is MapZone => z !== null),
    [zones],
  );

  // The in-progress shape, drawn alongside the saved zones so the guardian sees what they are about to
  // save. Only complete-enough shapes are previewed; a half-drawn one is not fabricated into a place.
  const previewZones = useMemo<MapZone[]>(() => {
    if (mode === 'circle' && center) {
      return [{ id: 'preview', name: name || t('zones.new'), geometry: { kind: 'circle', lat: center.lat, lon: center.lon, radiusMeters: radius } }];
    }
    if (mode === 'polygon' && points.length >= 3) {
      return [{ id: 'preview', name: name || t('zones.new'), geometry: { kind: 'polygon', points } }];
    }
    if (mode === 'route' && points.length >= 2) {
      return [{ id: 'preview', name: name || t('zones.new'), geometry: { kind: 'linestring', points, bufferMeters: buffer } }];
    }
    return [];
  }, [mode, center, radius, points, buffer, name, t]);

  // A geometry is built ONLY from a drawing the guardian actually made. There is no (0, 0) fallback:
  // an unfinished drawing stays `null` and submit() refuses with a catalog sentence — otherwise a
  // circle with no picked centre would be saved in the Gulf of Guinea as if it were the school.
  function draftGeometry(): Geometry | null {
    if (mode === 'circle') {
      return center ? { kind: 'circle', lat: center.lat, lon: center.lon, radiusMeters: radius } : null;
    }
    if (mode === 'polygon') return points.length >= 3 ? { kind: 'polygon', points } : null;
    return points.length >= 2 ? { kind: 'linestring', points, bufferMeters: buffer } : null;
  }

  const geometryReady = draftGeometry() !== null;

  function buildAttributes(): Record<string, unknown> | undefined {
    if (!activeFrom && !activeTo) return undefined;
    const attributes: Record<string, unknown> = {};
    if (activeFrom) attributes.activeFrom = activeFrom;
    if (activeTo) attributes.activeTo = activeTo;
    return attributes;
  }

  function resetDraft() {
    setEditingId(null);
    setName('');
    setCenter(null);
    setPoints([]);
    setRadius(120);
    setBuffer(150);
    setActiveFrom('');
    setActiveTo('');
    setMode('circle');
    setType('school');
  }

  async function submit() {
    if (!service) return;
    const geometry = draftGeometry();
    if (!geometry) {
      setMessage(t('zones.needGeometry'));
      return;
    }
    setSaving(true);
    setMessage(null);
    const draft: ZoneDraft = {
      id: editingId ?? undefined,
      name,
      type,
      geometry,
      attributes: buildAttributes(),
      deviceId: childDeviceId,
      userIds: guardianUserIds,
    };
    try {
      // createZone runs validateZone first (a 30 m school never reaches the server) and, after the POST,
      // ensures the geofenceExit subscription carries `web` (R-M1-10) — its failure throws, so the alert
      // state is announced here rather than swallowed.
      const list = editingId !== null ? await service.updateZone(draft) : await service.createZone(draft);
      setZones(list);
      setMessage(t('zones.saved'));
      resetDraft();
    } catch (error) {
      setMessage(zoneErrorMessage(error, lang));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    if (!service) return;
    setMessage(null);
    try {
      // A zone still linked to a device refuses (ZoneLinkedError) and leaves nothing half-saved (brief case W).
      const list = await service.deleteZone(id);
      setZones(list);
      setMessage(t('zones.deleted'));
    } catch (error) {
      setMessage(zoneErrorMessage(error, lang));
    }
  }

  function startEdit(zone: ServerGeofence) {
    if (!service || !isAdmin) return;
    let geometry: Geometry;
    try {
      geometry = parseWkt(zone.area);
    } catch {
      setMessage(zoneErrorMessage(new TraccarError('badpayload', 200, 'unreadable area'), lang));
      return;
    }
    setEditingId(zone.id);
    setName(zone.name);
    const attributes = (zone.attributes ?? {}) as Record<string, unknown>;
    setActiveFrom(typeof attributes.activeFrom === 'string' ? attributes.activeFrom : '');
    setActiveTo(typeof attributes.activeTo === 'string' ? attributes.activeTo : '');
    if (geometry.kind === 'circle') {
      setMode('circle');
      setCenter({ lat: geometry.lat, lon: geometry.lon });
      setRadius(geometry.radiusMeters);
    } else if (geometry.kind === 'polygon') {
      setMode('polygon');
      setPoints(geometry.points);
    } else {
      setMode('route');
      setPoints(geometry.points);
      setBuffer(geometry.bufferMeters ?? 150);
    }
  }

  const handlePick = (lat: number, lng: number) => {
    if (!isAdmin) return;
    const point: LatLng = { lat, lon: lng };
    if (mode === 'circle') setCenter(point);
    else setPoints((previous) => [...previous, point]);
  };

  const canWrite = service !== null && isAdmin;

  return (
    <div dir={dir} className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 text-white space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h2 className="text-lg font-bold">{t('zones.title')}</h2>
          <p className="text-[11px] text-slate-400">{t('zones.serverIsTruth')}</p>
        </div>
        {editingId !== null ? (
          <button type="button" onClick={resetDraft} className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800" title={t('zones.cancel')}>
            <X className="w-4 h-4" />
          </button>
        ) : null}
      </div>

      {service === null ? (
        <p className="text-sm text-amber-300 bg-amber-950/40 border border-amber-700/40 rounded-xl px-3 py-2">{t('zones.signedOut')}</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            {/* Drawing tools (§ the three the brief names). */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">{t('zones.modeLabel')}</label>
              <div className="flex flex-wrap gap-1.5">
                {MODE_TOOLS.map(({ value, key, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => { setMode(value); setPoints([]); setCenter(null); }}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-colors disabled:opacity-40 ${
                      mode === value ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {t(key)}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                {mode === 'circle' ? t('zones.centerHint') : mode === 'polygon' ? t('zones.polygonHint') : t('zones.routeHint')}
              </p>
            </div>

            {/* The seven §6 types. */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">{t('zones.typeLabel')}</label>
              <div className="flex flex-wrap gap-1.5">
                {ZONE_TYPES.map(({ value, key }) => (
                  <button
                    key={value}
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => setType(value)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-40 ${
                      type === value ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                    }`}
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="zone-name" className="block text-xs font-semibold text-slate-300 mb-1">{t('zones.nameLabel')}</label>
              <input
                id="zone-name"
                type="text"
                disabled={!isAdmin}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-emerald-500 disabled:opacity-40"
              />
            </div>

            {mode === 'circle' ? (
              <label className="block text-xs text-slate-300">
                <span className="font-semibold">{t('zones.radiusInput')}</span>
                <input type="number" min={0} disabled={!isAdmin} value={radius} onChange={(event) => setRadius(Number(event.target.value))} className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm font-mono disabled:opacity-40" />
              </label>
            ) : null}

            {mode === 'route' ? (
              <label className="block text-xs text-slate-300">
                <span className="font-semibold">{t('zones.bufferInput')}</span>
                <input type="number" min={0} disabled={!isAdmin} value={buffer} onChange={(event) => setBuffer(Number(event.target.value))} className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm font-mono disabled:opacity-40" />
              </label>
            ) : null}

            {mode !== 'circle' ? <p className="text-[11px] text-slate-400">{t('zones.pointsCount', { count: points.length })}</p> : null}

            {/* Active hours ride as a geofence attribute (§6), never as a separate record. */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">{t('zones.hoursLabel')}</label>
              <div className="flex items-center gap-2">
                <input type="time" disabled={!isAdmin} value={activeFrom} onChange={(event) => setActiveFrom(event.target.value)} className="bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 text-white text-sm font-mono disabled:opacity-40" aria-label={t('zones.hoursFrom')} />
                <span className="text-slate-500 text-xs">—</span>
                <input type="time" disabled={!isAdmin} value={activeTo} onChange={(event) => setActiveTo(event.target.value)} className="bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 text-white text-sm font-mono disabled:opacity-40" aria-label={t('zones.hoursTo')} />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              {editingId !== null ? (
                <button type="button" onClick={resetDraft} className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-medium disabled:opacity-40" disabled={saving}>
                  {t('zones.cancel')}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void submit()}
                disabled={!canWrite || saving || !name.trim() || !geometryReady}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                {saving ? t('zones.saving') : t('zones.save')}
              </button>
            </div>
          </div>

          <div className="h-[clamp(320px,45svh,460px)] rounded-2xl overflow-hidden border border-slate-800">
            <MapView
              lang={lang}
              childName={childName}
              position={null}
              freshness={null}
              label={null}
              zones={[...mapZones, ...previewZones]}
              history={[]}
              onSelectCoordinates={handlePick}
            />
          </div>
        </div>
      )}

      {message ? <p role="alert" className="text-xs text-amber-200 bg-slate-800/70 border border-slate-700 rounded-xl px-3 py-2">{message}</p> : null}

      {/* The saved zones, exactly as the server listed them back. */}
      <div className="space-y-2 border-t border-slate-800 pt-3">
        {!loaded && service !== null ? <p className="text-xs text-slate-400">{t('zones.loading')}</p> : null}
        {loaded && mapZones.length === 0 ? <p className="text-xs text-slate-400">{t('zones.empty')}</p> : null}
        {zones.map((zone) => (
          <div key={zone.id} className="flex items-center justify-between gap-3 bg-slate-800/70 border border-slate-700 rounded-xl px-3 py-2">
            <span className="text-sm font-bold text-emerald-300 truncate">{zone.name}</span>
            <span className="text-[11px] font-mono text-slate-400 truncate" dir="ltr">{zone.area}</span>
            <span className="flex items-center gap-2 shrink-0">
              {/* The edit button («who edits», catalog key zones.edit) is disabled for a non-admin;
                  the service gate behind it reads whoAmI() anyway. */}
              <button
                type="button"
                onClick={() => startEdit(zone)}
                disabled={!isAdmin}
                className="text-xs text-emerald-300 hover:text-white flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 disabled:opacity-40"
              >
                <UserCog className="w-3.5 h-3.5" />
                {t('zones.edit')}
              </button>
              <button
                type="button"
                onClick={() => void remove(zone.id)}
                disabled={!canWrite}
                className="text-xs text-red-300 hover:text-red-200 flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {t('zones.delete')}
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ZonesScreen;

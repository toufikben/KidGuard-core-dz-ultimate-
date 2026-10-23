// The route buffer is an ATTRIBUTE the server stores (`polylineDistance`, metres — Geofence.java:86),
// not part of the LINESTRING WKT. Reading it back when the guardian re-opens a route is what keeps an
// edit from silently replacing 150 m with the editor default. An absent, blank or non-numeric value is
// the only case that falls back; a stored 0 is kept and shown, so validateZone refuses it honestly.
export function bufferFromAttributes(
  attributes: Record<string, unknown> | undefined,
  fallback = 150,
): number {
  const raw = attributes?.polylineDistance;
  const value = typeof raw === 'number'
    ? raw
    : typeof raw === 'string' && raw.trim() !== ''
      ? Number(raw)
      : Number.NaN;
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

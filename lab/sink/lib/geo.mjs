const EARTH_RADIUS_METERS = 6371000;
const toRadians = (degrees) => (degrees * Math.PI) / 180;

export function distanceMeters(lat1, lon1, lat2, lon2) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}

export function circleArea(centerLat, centerLon, radiusMeters) {
  if (!Number.isFinite(centerLat) || Math.abs(centerLat) > 90) throw new Error('centerLat out of range');
  if (!Number.isFinite(centerLon) || Math.abs(centerLon) > 180) throw new Error('centerLon out of range');
  // الـ 50 م حدّ أدنى لأن دقة GPSواقعياً 20–50م؛ دائرة أضيق تُحدث إنذارات خروج خاطئة
  if (!(radiusMeters >= 50)) throw new Error('radius must be >= 50 m (design spec section 6)');
  return `CIRCLE (${centerLat} ${centerLon}, ${radiusMeters})`;
}

export function parseCircle(area) {
  const match = /^CIRCLE \(([-\d.]+) ([-\d.]+), ([\d.]+)\)$/.exec(area.trim());
  if (!match) throw new Error(`cannot parse circle area: ${area}`);
  return { lat: Number(match[1]), lon: Number(match[2]), radiusMeters: Number(match[3]) };
}

export function polylineArea(points, bufferMeters = 100) {
  if (points.length < 2) throw new Error('a route zone needs at least 2 points');
  for (const point of points) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) throw new Error('point must have lat/lon');
  }
  return {
    area: `LINESTRING (${points.map((p) => `${p.lat} ${p.lon}`).join(', ')})`,
    attributes: { polylineDistance: bufferMeters },
  };
}

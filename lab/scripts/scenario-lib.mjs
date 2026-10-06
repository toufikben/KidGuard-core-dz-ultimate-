import { circleArea, parseCircle } from '../sink/lib/geo.mjs';

export function validateScenario(scenario, knownTypes) {
  const errors = [];
  if (!scenario.name) errors.push('name is required');
  if (!knownTypes.includes(scenario.expectEvent)) errors.push(`unknown expectEvent: ${scenario.expectEvent}`);
  if (!Array.isArray(scenario.readings) || scenario.readings.length < 4) {
    errors.push('at least 4 readings are required');
  }
  let previous = -1;
  for (const [index, reading] of (scenario.readings ?? []).entries()) {
    if (!(reading.offsetSec > previous)) errors.push(`reading ${index}: offsetSec must increase`);
    previous = reading.offsetSec;
    if (!Number.isFinite(reading.lat) || !Number.isFinite(reading.lon)) errors.push(`reading ${index}: lat/lon`);
    // عدد منتهٍ وغير سالب: null يتجاوز null>=0 في JS فيبتلع قياساً مفقوداً في أداة أمان أطفال
    if (!(Number.isFinite(reading.accuracy) && reading.accuracy >= 0)) errors.push(`reading ${index}: accuracy required`);
  }
  if (scenario.zone?.type === 'circle') {
    try { parseCircle(circleArea(scenario.zone.lat, scenario.zone.lon, scenario.zone.radiusMeters)); }
    catch (error) { errors.push(`zone: ${error.message}`); }
  } else if (scenario.zone?.type === 'polyline') {
    if ((scenario.zone.points ?? []).length < 2) errors.push('polyline zone needs >= 2 points');
    if (!(scenario.zone.bufferMeters >= 50)) errors.push('polyline buffer must be >= 50 m');
  } else {
    errors.push('zone must be circle or polyline');
  }
  return errors;
}

export function toOsmAndParams(uniqueId, reading, absoluteTimeSec) {
  return [
    ['id', uniqueId],
    ['valid', 'true'],
    ['timestamp', String(Math.floor(absoluteTimeSec))],
    ['lat', reading.lat],
    ['lon', reading.lon],
    ['accuracy', reading.accuracy],
    ['speed', reading.speedKnots],
    ['bearing', reading.course ?? 0],
  ];
}

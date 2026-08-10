import { GeofenceMonitor } from '../src/services/GeofenceMonitor';
import { RiskEngine } from '../src/services/RiskEngine';
import { LocationPoint, SafeZone } from '../src/types';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const zone: SafeZone = {
  id: 'zone-test',
  name: 'Test Zone',
  latitude: 0,
  longitude: 0,
  radius: 100,
  active: true,
  createdAt: Date.now(),
};

const outsideLocation: LocationPoint = {
  latitude: 0.002,
  longitude: 0,
  accuracy: 10,
  speed: 0,
  heading: null,
  altitude: null,
  timestamp: Date.now(),
};

const insideLocation: LocationPoint = {
  ...outsideLocation,
  latitude: 0,
};

const geofence = GeofenceMonitor.getInstance();
geofence.resetState();
assert(geofence.evaluate(insideLocation, [zone], false).status === 'SAFE_INSIDE', 'A location at the zone center must be safe');
assert(geofence.evaluate(outsideLocation, [zone], false).status === 'EXIT_PENDING', 'The first reliable exit must be pending');
assert(geofence.evaluate(outsideLocation, [zone], false).status === 'EXIT_PENDING', 'The second reliable exit must remain pending');
assert(geofence.evaluate(outsideLocation, [zone], false).status === 'EXIT_CONFIRMED', 'The third reliable exit must be confirmed');

const risk = RiskEngine.getInstance();
risk.resetEngine();
const assessment = risk.assessRisk(
  { ...outsideLocation, speed: 20, isMockLocation: true },
  {
    status: 'EXIT_CONFIRMED',
    violatedZones: [zone],
    distanceToNearestZone: 900,
    nearestZoneName: zone.name,
    consecutiveOutsideCount: 3,
    confidence: 100,
    insideZoneNames: [],
  },
  5,
  true,
  true,
  'en',
  true
);
assert(assessment.riskScore === 100, 'Critical risk inputs must be capped at 100');
assert(assessment.riskLevel === 'CRITICAL', 'Critical risk inputs must produce CRITICAL');
assert(assessment.state === 'EMERGENCY', 'Instant emergency mode must produce EMERGENCY');

console.log('core unit tests passed');

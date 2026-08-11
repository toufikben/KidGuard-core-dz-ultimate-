import { GeofenceMonitor } from '../src/services/GeofenceMonitor';
import { RiskEngine } from '../src/services/RiskEngine';
import { LocationPoint, SafeZone } from '../src/types';
import { HealthMonitorService } from '../src/services/HealthMonitorService';
import { SecurityChecker } from '../src/services/SecurityChecker';

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
const pendingAssessment = risk.assessRisk(
  outsideLocation,
  {
    status: 'EXIT_PENDING',
    violatedZones: [zone],
    distanceToNearestZone: 500,
    nearestZoneName: zone.name,
    consecutiveOutsideCount: 1,
    confidence: 100,
    insideZoneNames: [],
  },
  80,
  false,
  false,
  'en',
  true
);
assert(pendingAssessment.state === 'MONITORING', 'Pending exit must remain MONITORING');
assert(pendingAssessment.riskScore === 0, 'Pending exit must not escalate risk');

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

// GPS loss must be represented as a health/security condition, not an emergency.
const security = SecurityChecker.getInstance();
const missingGps = security.checkSecurity(null, true);
assert(missingGps.gpsDisabled, 'Missing GPS fix must be reported as disabled/unavailable');
assert(!missingGps.tamperDetected, 'Missing GPS must not be treated as tampering');

const health = HealthMonitorService.getInstance();
health.setPermissionStatus('location', true);
const unavailableHealth = health.getHealthDiagnostics(null);
assert(!unavailableHealth.gpsActive, 'Health diagnostics must mark GPS inactive when no fix exists');

health.setPermissionStatus('location', false);
const deniedHealth = health.getHealthDiagnostics(insideLocation);
assert(!deniedHealth.gpsActive, 'Revoked location permission must keep GPS inactive');

// A valid fix after an interruption must restore GPS health without creating an alert.
health.setPermissionStatus('location', true);
health.updateLastLocationTime(insideLocation.timestamp);
const restoredHealth = health.getHealthDiagnostics(insideLocation);
assert(restoredHealth.gpsActive, 'A valid location fix must restore GPS health');
assert(restoredHealth.lastLocationTime === insideLocation.timestamp, 'GPS recovery must update last location time');

// Poor accuracy must not count as a confirmed exit or trigger emergency behavior.
geofence.resetState();
const weakSignalLocation: LocationPoint = { ...outsideLocation, accuracy: 250 };
const weakSignalEval = geofence.evaluate(weakSignalLocation, [zone], false);
assert(weakSignalEval.status === 'EXIT_PENDING', 'Weak GPS signal must remain pending');
assert(weakSignalEval.consecutiveOutsideCount === 0, 'Weak GPS signal must not count toward exit confirmation');
risk.resetEngine();
const weakSignalAssessment = risk.assessRisk(
  weakSignalLocation,
  weakSignalEval,
  85,
  false,
  false,
  'en',
  false
);
assert(weakSignalAssessment.state === 'MONITORING', 'Weak GPS signal must remain MONITORING');
assert(weakSignalAssessment.riskScore === 0, 'Weak GPS signal must not raise risk');

console.log('core unit tests passed');

import { GeofenceMonitor } from '../src/services/GeofenceMonitor';
import { RiskEngine } from '../src/services/RiskEngine';
import { LocationPoint, SafeZone } from '../src/types';
import { HealthMonitorService } from '../src/services/HealthMonitorService';
import { SecurityChecker } from '../src/services/SecurityChecker';
import { OfflineQueueService } from '../src/services/OfflineQueueService';
import { SyncApiService } from '../src/services/SyncApiService';
import { OfflineEvent } from '../src/types';
import { ProtectionStateService } from '../src/services/ProtectionStateService';
import { PairingService } from '../src/services/PairingService';
import { privacyDataService } from '../src/services/PrivacyDataService';

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

// Offline synchronization must retain events during network/server failures and recover safely.
const storage = new Map<string, string>();
(globalThis as typeof globalThis & { localStorage: Storage }).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => { storage.set(key, value); },
  removeItem: (key: string) => { storage.delete(key); },
  clear: () => { storage.clear(); },
  key: (index: number) => Array.from(storage.keys())[index] ?? null,
  get length() { return storage.size; },
};
(globalThis as unknown as { window: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout } }).window = {
  setTimeout,
  clearTimeout,
};

const queue = OfflineQueueService.getInstance();
queue.clearQueue();
const queuedEvent = queue.enqueueEvent(
  'EXIT_CONFIRMED',
  'incident-network-1',
  'kid-network-1',
  { reason: 'network test' }
);
assert(queue.getPendingEvents().length === 1, 'An event must be queued before synchronization');
const duplicate = queue.enqueueEvent(
  'EXIT_CONFIRMED',
  'incident-network-1',
  'kid-network-1',
  { reason: 'duplicate network test' }
);
assert(duplicate.id === queuedEvent.id, 'Duplicate pending events must be deduplicated');
assert(queuedEvent.idempotencyKey === 'kidguard:incident-network-1:EXIT_CONFIRMED', 'Events must receive a deterministic idempotency key');

const originalSyncApiGetter = SyncApiService.getInstance;
let sendMode: 'offline' | 'server-error' | 'online' = 'offline';
const fakeSyncApi = {
  async sendEvents(events: OfflineEvent[]): Promise<void> {
    assert(events.length === 1, 'Each synchronization attempt should send one queued event');
    if (sendMode === 'offline') throw new TypeError('Failed to fetch');
    if (sendMode === 'server-error') throw new Error('Sync API returned HTTP 503');
  },
} as SyncApiService;
(SyncApiService as unknown as { getInstance: () => SyncApiService }).getInstance = () => fakeSyncApi;

const offlineResult = await queue.syncQueue();
assert(offlineResult.syncedCount === 0 && offlineResult.failedCount === 1, 'Network loss must report a failed synchronization');
const afterOffline = queue.getPendingEvents();
assert(afterOffline.length === 1, 'Network loss must keep the event queued');
assert(afterOffline[0].status === 'FAILED' && afterOffline[0].retryCount === 1, 'Network failure must mark the event FAILED and increment retry count');

  const failedDuplicate = queue.enqueueEvent(
    'EXIT_CONFIRMED',
    'incident-network-1',
    'kid-network-1',
    { reason: 'duplicate after offline failure' }
  );
  assert(failedDuplicate.id === queuedEvent.id, 'Failed events must remain deduplicated during retry');

  sendMode = 'server-error';
  const serverErrorResult = await queue.syncQueue();
assert(serverErrorResult.syncedCount === 0 && serverErrorResult.failedCount === 1, 'HTTP server errors must report a failed synchronization');
assert(queue.getPendingEvents()[0].retryCount === 2, 'Server errors must increment retry count without dropping the event');

sendMode = 'online';
const recoveryResult = await queue.syncQueue();
assert(recoveryResult.syncedCount === 1 && recoveryResult.failedCount === 0, 'Synchronization must recover after connectivity returns');
assert(queue.getPendingEvents().length === 0, 'Successfully synchronized events must leave the pending queue');
assert(queue.getAllEvents().some((event) => event.id === queuedEvent.id && event.status === 'SENT'), 'Recovered event must be retained as SENT history');
  queue.clearQueue();
  (SyncApiService as unknown as { getInstance: typeof originalSyncApiGetter }).getInstance = originalSyncApiGetter;

  // Protection state must survive reloads and distinguish trusted fresh data from stale data.
  const protection = ProtectionStateService.getInstance();
  protection.reset();
  const protectionPoint: LocationPoint = { ...insideLocation, timestamp: Date.now() };
  const snapshot = protection.recordLocation(protectionPoint, 'LIVE_GPS');
  assert(snapshot.source === 'LIVE_GPS', 'Live fixes must be marked as trusted live GPS snapshots');
  assert(protection.getLastKnownLocation(snapshot.capturedAt)?.isStale === false, 'A fresh last-known location must not be stale');
  const incident = protection.startIncident('kid-state-1', 'confirmed exit', snapshot);
  const sameIncident = protection.startIncident('kid-state-1', 'repeated exit', snapshot);
  assert(incident.id === sameIncident.id, 'Repeated signals must update one incident instead of creating duplicates');
  assert(sameIncident.status === 'MONITORING', 'A newly opened incident must start in MONITORING state');
  const request = protection.requestCheckIn('kid-state-1');
  assert(request.status === 'PENDING', 'A new check-in must wait for the child response');
  const response = protection.respondToCheckIn('CONFIRMED');
  assert(response?.status === 'CONFIRMED', 'The child response must close a pending check-in');
  assert(protection.getIncident()?.checkIn?.status === 'CONFIRMED', 'Incident state must include the confirmed check-in');
  const stale = protection.getLastKnownLocation(snapshot.capturedAt + ProtectionStateService.getStaleAfterMs() + 1);
  assert(stale?.isStale === true, 'A location older than the freshness window must be marked stale');
  protection.resolveIncident();
  assert(protection.getIncident()?.status === 'RESOLVED', 'A resolved incident must remain auditable locally');
  protection.reset();

  // Pairing security: short-lived code, attempt limit, session expiry and explicit revocation.
  storage.clear();
  (PairingService as unknown as { instance?: PairingService }).instance = undefined;
  const pairing = PairingService.getInstance();
  const pairingInfo = pairing.getPairingInfo();
  assert(pairingInfo.pairingCodeExpiresAt > Date.now(), 'A new pairing code must expire in the future');
  for (let attempt = 0; attempt < PairingService.getMaxPairingAttempts(); attempt++) {
    assert(!pairing.pairWithCode('000000'), 'Incorrect pairing codes must be rejected');
  }
  assert(!pairing.pairWithCode(pairingInfo.pairingCode), 'Pairing must lock after the maximum failed attempts');
  const refreshedCode = pairing.generateNewPairingCode();
  assert(pairing.pairWithCode(refreshedCode), 'A freshly generated valid code must pair successfully');
  assert(pairing.isSessionValid(), 'A newly paired device must have a valid session');
  pairing.revokeDevice();
  assert(!pairing.isSessionValid(), 'Revoked devices must not have a valid session');
  assert(!pairing.pairWithCode(refreshedCode), 'A revoked session must not be silently reused');

  // Privacy export/delete: export is useful but must not contain secrets.
  localStorage.setItem('kidguard_alert_policy', JSON.stringify({ childName: 'Test', parentPinHash: 'secret-hash', smsEnabled: true }));
  localStorage.setItem('kidguard_device_pairing', JSON.stringify({ kidId: 'kid-test', deviceToken: 'secret-token', parentAccountId: 'secret-parent', pairingCode: '123456', isPaired: false }));
  localStorage.setItem('kidguard_alert_history', JSON.stringify([{ id: 'alert-1' }]));
  const privacyExport = privacyDataService.exportData();
  const exportedPolicy = privacyExport.data.kidguard_alert_policy as Record<string, unknown>;
  const exportedPairing = privacyExport.data.kidguard_device_pairing as Record<string, unknown>;
  assert(exportedPolicy.parentPinHash === undefined, 'Privacy export must redact the parent PIN hash');
  assert(exportedPairing.deviceToken === undefined && exportedPairing.pairingCode === undefined, 'Privacy export must redact pairing secrets');
  assert(privacyExport.data.kidguard_alert_history !== undefined, 'Privacy export must include non-secret local history');
  privacyDataService.deleteLocalData();
  assert(privacyDataService.getManagedStorageKeys().every((key) => localStorage.getItem(key) === null), 'Delete local data must remove every managed key');

console.log('core unit tests passed');

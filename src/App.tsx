/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { App as CapApp } from '@capacitor/app';
import {
  DeviceRole,
  LocationPoint,
  SafeZone,
  LoggedAlert,
  ProtectionIncident,
  LastKnownLocation,
  CheckInRequest,
} from './types';
import { Language } from './translations';
import { isCatalogLang, translate } from './translations/catalog.ts';
import type { ServerGeofence, ServerUser } from './services/traccar/types.ts';
import type { MapZone } from './components/MapView';
import { activeClient } from './services/traccar/session.ts';
import { TraccarError } from './services/traccar/client.ts';
import { useSession } from './state/session.ts';
import {
  assignGuardian,
  clearChildren,
  deviceDisplayName,
  guardianSummary,
  listGuardiansFor,
  listServerUsers,
  pickSelectedChild,
  refreshChildren,
  unassignGuardian,
  useChildren,
} from './state/children.ts';
import { createZoneService, type ZoneDraft } from './services/traccar/zones.ts';
import { parseWkt } from './services/traccar/wkt.ts';
import { Navbar } from './components/Navbar';
import { ParentDashboard } from './components/ParentDashboard';
import { ChildScreen } from './components/ChildScreen';
import { ContactsScreen } from './components/ContactsScreen';
import { AlertsLog, useLiveAlerts } from './components/AlertsLog';
import { ZonesScreen } from './components/ZonesScreen';
import { SettingsModal } from './components/SettingsModal';

import { GeofenceMonitor } from './services/GeofenceMonitor';
import { RiskEngine } from './services/RiskEngine';
import { AlertPolicyManager } from './services/AlertPolicyManager';
import { HealthMonitorService } from './services/HealthMonitorService';
import { AudioService } from './services/AudioService';
import { GpsFreshnessService } from './services/GpsFreshnessService';
import { PairingService } from './services/PairingService';
import { OfflineQueueService } from './services/OfflineQueueService';
import { BackgroundLocationService } from './services/BackgroundLocationService';
import { SmsService } from './services/SmsService';
import { verifyPin } from './services/SecurityUtils';
import { ProtectionStateService } from './services/ProtectionStateService';

const ROLE_KEY = 'kidguard_role';
const LANG_KEY = 'kidguard_lang';

// One honest line per guardian-link failure. A refused write is named as a refusal (the same words
// the session layer uses), never as a generic failure; anything else says the action failed. The
// server's own body is never shown.
function guardianFailureLine(error: unknown, lang: Language, fallbackKey: string): string {
  if (error instanceof TraccarError) {
    if (error.kind === 'forbidden') return translate('session.forbidden', lang);
    if (error.kind === 'unauthorized') return translate('session.unauthorized', lang);
  }
  return translate(fallbackKey, lang);
}

// AC-2 (Task 8): the zone record lives on the SERVER (GET/POST /api/geofences via zones.ts), so the
// old `kidguard_safe_zones` localStorage key is GONE — there is nothing here to load and nothing to
// save. The `safeZones` state below is only the legacy in-memory prototype loop that the child-role
// RiskEngine still consumes until Task 11 removes that branch; it is never persisted.

export default function App() {
  const [role, setRole] = useState<DeviceRole>(() => {
    try {
      return (localStorage.getItem(ROLE_KEY) as DeviceRole) || 'PARENT';
    } catch {
      return 'PARENT';
    }
  });

  const [lang, setLang] = useState<Language>(() => {
    try {
      // The stored value is whatever a previous run wrote, so it is checked, not cast: an unknown
      // locale would reach translate() on the position label and take the screen down (R-M1-14).
      const stored = localStorage.getItem(LANG_KEY);
      return isCatalogLang(stored) ? stored : 'ar';
    } catch {
      return 'ar';
    }
  });

  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('dark');

  // R-M1-23 / R-M1-29: the guardian shell has four VIEWS, not two roles. App always renders this
  // shell; the stored `kidguard_role` still exists for Task 11 but no render branch reads it any more.
  const [view, setView] = useState<'dashboard' | 'children' | 'contacts' | 'alerts'>('dashboard');
  const [selectedChildId, setSelectedChildId] = useState<number | null>(null);

  const [location, setLocation] = useState<LocationPoint>({
    latitude: 36.7538,
    longitude: 3.0588,
    accuracy: 12,
    speed: 0,
    heading: 0,
    altitude: 45,
    timestamp: Date.now(),
    isMockLocation: false,
  });

  const [safeZones, setSafeZones] = useState<SafeZone[]>([]);

  // The session store (Task 6) is the only thing that can hand App a server client. `activeClient()`
  // returns the SAME signed-in client `signIn` built, or null when nobody is signed in — and a null
  // service is what ZonesScreen shows as «sign in required», never a fabricated local list (AC-2).
  // The memo re-reads it whenever the session status changes, so signing in is what makes it live.
  const session = useSession();
  const zoneService = useMemo(() => {
    const client = activeClient();
    return client ? createZoneService({ client }) : null;
  }, [session.status]);

  // Task 9: the children are SERVER data (`GET /devices`, then each device's latest `/positions`).
  // `selectedChild` is the exact rule the controller ruling names: the chosen device id, else the
  // first visible child, else null. ZonesScreen is only rendered when this is non-null (R-M1-21).
  const childrenState = useChildren();
  // R-M1-29: the alerts view owns the live channel. The hook is mounted unconditionally (Rules of
  // Hooks) but only connects while the view is open and a session is signed in; leaving either
  // closes the socket, cancels the fallback timer and revokes the token once (R-M1-34).
  const liveAlerts = useLiveAlerts(view === 'alerts' && session.status === 'signed-in');
  const selectedChild = pickSelectedChild(childrenState.children, selectedChildId);

  // Contacts are read only for the selected child and only while the contacts view is open.
  const [guardians, setGuardians] = useState<ServerUser[]>([]);
  const [guardianCandidates, setGuardianCandidates] = useState<ServerUser[]>([]);
  const [guardiansLoading, setGuardiansLoading] = useState(false);
  const [guardiansError, setGuardiansError] = useState<string | null>(null);
  const guardianRequest = useRef(0);
  // The zones the map draws once a session exists: the server's own re-read (listZones after every
  // write), never a local record.
  const [serverZones, setServerZones] = useState<ServerGeofence[]>([]);

  const [alertHistory, setAlertHistory] = useState<LoggedAlert[]>(() =>
    AlertPolicyManager.getInstance().getAlertHistory()
  );
  const [isSirenActive, setIsSirenActive] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isSimulatingOutside, setIsSimulatingOutside] = useState(false);
  const [parentActiveTab, setParentActiveTab] = useState<
    'map' | 'zones' | 'alerts' | 'health' | 'settings' | 'pairing'
  >('map');
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [locationPermissionReady, setLocationPermissionReady] = useState(!Capacitor.isNativePlatform());
  const [showLocationRationale, setShowLocationRationale] = useState(false);
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);
  const [isBgTracking, setIsBgTracking] = useState(false);
  const protectionState = ProtectionStateService.getInstance();
  const gpsFreshness = GpsFreshnessService.getInstance();
  const [lastKnownLocation, setLastKnownLocation] = useState<LastKnownLocation | null>(() =>
    protectionState.getLastKnownLocation()
  );
  const [activeIncident, setActiveIncident] = useState<ProtectionIncident | null>(() =>
    protectionState.getIncident()
  );
  const [checkIn, setCheckIn] = useState<CheckInRequest | null>(() =>
    protectionState.getIncident()?.checkIn ?? null
  );

  // PIN gate for settings
  const [pinUnlocked, setPinUnlocked] = useState(false);

  const alertPolicyManager = AlertPolicyManager.getInstance();
  const [alertPolicy, setAlertPolicy] = useState(alertPolicyManager.getConfig());

  const pairingService = PairingService.getInstance();
  const [pairingInfo, setPairingInfo] = useState(pairingService.getPairingInfo());

  const healthMonitor = HealthMonitorService.getInstance();
  const [healthStatus, setHealthStatus] = useState(
    healthMonitor.getHealthDiagnostics(location)
  );

  // Persist role & language
  useEffect(() => {
    try {
      localStorage.setItem(ROLE_KEY, role);
    } catch {
      // ignore
    }
  }, [role]);

  useEffect(() => {
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      // ignore
    }
  }, [lang]);

  // Refresh offline queue count
  const refreshOfflineCount = useCallback(() => {
    const count = OfflineQueueService.getInstance().getPendingEvents().length;
    setPendingOfflineCount(count);
  }, []);

  useEffect(() => {
    refreshOfflineCount();
  }, [refreshOfflineCount]);

  // The map's saved-zone outlines are the SERVER's too. This effect reads `/geofences` (listZones)
  // when a session appears; after every write ZonesScreen hands the same server-read list back through
  // `onServerZones`, so there is no second read and no stale outline. With no service the map draws
  // nothing — there is no local record to fall back to.
  useEffect(() => {
    if (!zoneService) {
      setServerZones([]);
      return;
    }
    let alive = true;
    zoneService
      .listZones()
      .then((rows) => {
        if (alive) setServerZones(rows);
      })
      .catch(() => {
        // The map keeps no outline it was not given; ZonesScreen names the failure on its own screen.
        if (alive) setServerZones([]);
      });
    return () => {
      alive = false;
    };
  }, [zoneService]);

  // The child list is refreshed when a session becomes signed-in, and on a language change so the
  // labels follow the guardian's language. With no session the store is CLEARED: a previous
  // guardian's children must not outlive the session that was allowed to see them.
  useEffect(() => {
    if (session.status === 'signed-in') {
      void refreshChildren(lang);
    } else {
      clearChildren(lang);
    }
  }, [session.status, lang]);

  // Read the selected child's guardian links + the accounts that could be shared. The ticket makes
  // the last request win, so switching children quickly cannot paint an older child's guardians.
  // /permissions is admin-only (002 §4): a viewer gets NO request at all and no empty list either.
  const loadGuardians = useCallback(async (deviceId: number) => {
    if (session.user?.admin !== true) {
      guardianRequest.current += 1;
      setGuardians([]);
      setGuardianCandidates([]);
      setGuardiansError(null);
      setGuardiansLoading(false);
      return;
    }
    const ticket = ++guardianRequest.current;
    setGuardiansLoading(true);
    setGuardiansError(null);
    // Clear the previous child's rows immediately: showing them under a newly selected child would
    // claim a link the server has not confirmed for this device.
    setGuardians([]);
    setGuardianCandidates([]);
    try {
      const [linked, all] = await Promise.all([
        listGuardiansFor(deviceId),
        listServerUsers(),
      ]);
      if (ticket !== guardianRequest.current) return;
      setGuardians(linked);
      setGuardianCandidates(all.filter((user) => !linked.some((guardian) => guardian.id === user.id)));
    } catch (error) {
      if (ticket !== guardianRequest.current) return;
      setGuardians([]);
      setGuardianCandidates([]);
      setGuardiansError(guardianFailureLine(error, lang, 'contacts.loadFailed'));
    } finally {
      if (ticket === guardianRequest.current) setGuardiansLoading(false);
    }
  }, [lang, session.user?.admin]);

  useEffect(() => {
    if (view !== 'contacts' || selectedChild === null || session.status !== 'signed-in' || session.user?.admin !== true) {
      guardianRequest.current += 1;
      setGuardians([]);
      setGuardianCandidates([]);
      setGuardiansError(null);
      setGuardiansLoading(false);
      return;
    }
    void loadGuardians(selectedChild.device.id);
  }, [view, selectedChild?.device.id, session.status, loadGuardians]);

  const handleAssignGuardian = async (userId: number) => {
    if (!selectedChild) return;
    setGuardiansError(null);
    try {
      // The state layer re-reads identity() on this call; `isAdmin` below only disables the button.
      await assignGuardian(selectedChild.device.id, userId);
      await loadGuardians(selectedChild.device.id);
    } catch (error) {
      setGuardiansError(guardianFailureLine(error, lang, 'contacts.actionFailed'));
    }
  };

  const handleUnassignGuardian = async (userId: number) => {
    if (!selectedChild) return;
    setGuardiansError(null);
    try {
      await unassignGuardian(selectedChild.device.id, userId);
      await loadGuardians(selectedChild.device.id);
    } catch (error) {
      setGuardiansError(guardianFailureLine(error, lang, 'contacts.actionFailed'));
    }
  };

  const handleRefreshGuardians = () => {
    if (selectedChild) void loadGuardians(selectedChild.device.id);
  };

  const runEvaluation = useCallback(
    async (currentLoc: LocationPoint, zones: SafeZone[]) => {
      const freshness = gpsFreshness.accept(currentLoc);
      if (freshness.accepted === false) {
        console.warn('[GPS] Ignoring unusable location fix', freshness.reason, freshness.ageMs);
        return;
      }

      const currentPolicy = alertPolicyManager.getConfig();
      const geofenceMonitor = GeofenceMonitor.getInstance();
      const geofenceEval = geofenceMonitor.evaluate(
        currentLoc,
        zones,
        currentPolicy.instant1mExitEmergency ?? false,
        currentPolicy.exitConfirmationsRequired,
        currentPolicy.exitConfirmationDelayMinutes
      );

      const riskEngine = RiskEngine.getInstance();
      const assessment = riskEngine.assessRisk(
        currentLoc,
        geofenceEval,
        healthStatus.batteryLevel,
        healthStatus.tamperDetected,
        currentLoc.isMockLocation || false,
        lang,
        currentPolicy.instant1mExitEmergency ?? false
      );

      const loggedAlert = await alertPolicyManager.evaluateAndDispatch(
        assessment,
        currentLoc
      );

      if (loggedAlert) {
        setAlertHistory((prev) => [loggedAlert, ...prev]);
      }

      const shouldOpenIncident =
        assessment.state === 'OUTSIDE_ZONE' ||
        assessment.state === 'DANGER' ||
        assessment.state === 'EMERGENCY';
      if (shouldOpenIncident) {
        const incident = protectionState.startIncident(
          pairingInfo.kidId || 'child-local',
          assessment.riskFactors[0] || assessment.state,
          protectionState.recordLocation(currentLoc, 'LIVE_GPS')
        );
        setActiveIncident(incident);
        setLastKnownLocation(protectionState.getLastKnownLocation());
      } else if (assessment.state === 'SAFE' || assessment.state === 'RETURNED_TO_SAFE_ZONE') {
        protectionState.resolveIncident();
        setActiveIncident(protectionState.getIncident());
        if (AudioService.getInstance().isSirenRunning()) {
          AudioService.getInstance().stopEmergencySiren();
        }
        setIsSirenActive(false);
      }

      if (
        currentPolicy.triggerEmergencyOnExit &&
        (assessment.state === 'OUTSIDE_ZONE' ||
          assessment.state === 'DANGER' ||
          assessment.state === 'EMERGENCY')
      ) {
        if (!AudioService.getInstance().isSirenRunning()) {
          AudioService.getInstance().startEmergencySiren();
          setIsSirenActive(true);
        }
      }

      if (
        assessment.state === 'DANGER' ||
        assessment.state === 'EMERGENCY' ||
        assessment.state === 'OUTSIDE_ZONE'
      ) {
        OfflineQueueService.getInstance().enqueueEvent(
          assessment.state === 'EMERGENCY' ? 'EMERGENCY' : 'EXIT_CONFIRMED',
          loggedAlert ? loggedAlert.incidentId : `inc_${Date.now()}`,
          pairingInfo.kidId,
          {
            latitude: currentLoc.latitude,
            longitude: currentLoc.longitude,
            riskScore: assessment.riskScore,
            state: assessment.state,
          }
        );
        refreshOfflineCount();
      }

      setHealthStatus(healthMonitor.getHealthDiagnostics(currentLoc));
      setRiskAssessment(assessment);
      setLastKnownLocation(protectionState.getLastKnownLocation());
      return assessment;
    },
    [
      healthStatus.batteryLevel,
      healthStatus.tamperDetected,
      lang,
      pairingInfo.kidId,
      protectionState,
      refreshOfflineCount,
    ]
  );

  const [riskAssessment, setRiskAssessment] = useState(() =>
    RiskEngine.getInstance().assessRisk(
      location,
      GeofenceMonitor.getInstance().evaluate(location, safeZones),
      85,
      false,
      false,
      lang
    )
  );

  // Explain location use before the native runtime permission prompt.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    Geolocation.checkPermissions()
      .then((status) => {
        const granted = status.location === 'granted' || status.coarseLocation === 'granted';
        setLocationPermissionReady(granted);
        setShowLocationRationale(!granted);
      })
      .catch((error) => {
        console.warn('[Location] permission check failed', error);
        setShowLocationRationale(true);
      });
  }, []);

  const handleLocationPermissionRequest = async () => {
    try {
      const status = await Geolocation.requestPermissions({
        permissions: ['location', 'coarseLocation'],
      });
      const granted = status.location === 'granted' || status.coarseLocation === 'granted';
      setLocationPermissionReady(granted);
      setShowLocationRationale(!granted);
      if (!granted) {
        setGeoError(
          lang === 'ar'
            ? 'لم يتم منح صلاحية الموقع. لا يمكن تشغيل التتبع حتى تسمح بها من إعدادات Android.'
            : 'Location permission was not granted. Enable it in Android settings to start tracking.'
        );
      }
    } catch (error) {
      console.warn('[Location] permission request failed', error);
      setShowLocationRationale(true);
    }
  };

  // Hybrid GPS: Background service on native (Android/iOS via Capacitor), HTML5 on web
  useEffect(() => {
    const bgService = BackgroundLocationService.getInstance();
    let unsub: (() => void) | null = null;
    let webWatchId: number | null = null;

    const handleLocation = (realLoc: LocationPoint) => {
      setGeoError(null);
      if (!isSimulatingOutside) {
        protectionState.recordLocation(realLoc, Capacitor.isNativePlatform() ? 'BACKGROUND_GPS' : 'LIVE_GPS');
        setLastKnownLocation(protectionState.getLastKnownLocation());
        setLocation(realLoc);
        runEvaluation(realLoc, safeZones);
      }
    };

    const startTracking = async () => {
      if (Capacitor.isNativePlatform() && !locationPermissionReady) {
        return;
      }
      if (Capacitor.isNativePlatform()) {
        // Native background GPS
        unsub = bgService.onLocation(handleLocation);
        const ok = await bgService.start();
        setIsBgTracking(ok && bgService.isTracking());
        if (!ok) {
          setGeoError(
            lang === 'ar'
              ? 'تعذر تشغيل التتبع في الخلفية. تحقق من أذونات الموقع.'
              : lang === 'fr'
              ? "Impossible de démarrer le suivi en arrière-plan. Vérifiez les autorisations."
              : 'Could not start background tracking. Check location permissions.'
          );
        }
      } else {
        // Web / browser fallback
        if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
          setGeoError(
            lang === 'ar'
              ? 'جهازك لا يدعم خدمة تحديد الموقع'
              : lang === 'fr'
              ? "La géolocalisation n'est pas prise en charge"
              : 'Geolocation is not supported on this device'
          );
          return;
        }
        webWatchId = navigator.geolocation.watchPosition(
          (pos) => {
            handleLocation({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy || 10,
              speed: pos.coords.speed ?? 0,
              heading: pos.coords.heading ?? 0,
              altitude: pos.coords.altitude ?? 0,
              timestamp: pos.timestamp || Date.now(),
              isMockLocation: false,
            });
          },
          (err) => {
            const msg =
              err.code === 1
                ? lang === 'ar'
                  ? 'تم رفض إذن الموقع. يرجى تفعيله من إعدادات المتصفح.'
                  : lang === 'fr'
                  ? "Autorisation de localisation refusée. Veuillez l'activer dans les paramètres."
                  : 'Location permission denied. Please enable it in browser settings.'
                : err.code === 2
                ? lang === 'ar'
                  ? 'تعذر الحصول على الموقع. تحقق من تفعيل GPS.'
                  : lang === 'fr'
                  ? "Position indisponible. Vérifiez que le GPS est activé."
                  : 'Position unavailable. Check that GPS is enabled.'
                : lang === 'ar'
                ? 'انتهت مهلة تحديد الموقع. حاول مرة أخرى.'
                : lang === 'fr'
                ? "Délai de localisation dépassé. Réessayez."
                : 'Location request timed out.';
            setGeoError(msg);
            console.warn('GPS error:', err.message);
          },
          {
            enableHighAccuracy: true,
            maximumAge: 2000,
            timeout: 15000,
          }
        );
      }
    };

    startTracking();

    // Re-start background tracking when the app returns from background (native only)
    let appStateHandle: { remove: () => void } | null = null;
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive && !bgService.isTracking()) {
          bgService.start().then((ok) => setIsBgTracking(ok && bgService.isTracking()));
        }
      }).then((h) => {
        appStateHandle = h;
      });
    }

    return () => {
      if (unsub) unsub();
      if (Capacitor.isNativePlatform()) {
        bgService.stop();
      }
      if (webWatchId != null) {
        navigator.geolocation.clearWatch(webWatchId);
      }
      appStateHandle?.remove();
    };
  }, [isSimulatingOutside, safeZones, runEvaluation, lang, locationPermissionReady]);

  useEffect(() => {
    const checkDeviceHealth = () => {
      const diagnostics = healthMonitor.getHealthDiagnostics(location);
      setHealthStatus(diagnostics);
      if (diagnostics.batteryLevel <= (alertPolicy.batteryAlertThreshold ?? 15)) {
        void alertPolicyManager.sendBatteryAlert(location, diagnostics.batteryLevel);
      }
    };
    checkDeviceHealth();
    const healthTimer = window.setInterval(checkDeviceHealth, 60_000);
    return () => window.clearInterval(healthTimer);
  }, [location, alertPolicy.batteryAlertThreshold, alertPolicy.batterySmsEnabled, alertPolicy.smsMode]);

  // The map's child feed. Task 9 replaces these four values with `useChildren()` output and nothing
  // else changes: until a server source reports the child there is no reading, no freshness and no
  // track, and the map says «لا بيانات من الخادم» instead of drawing the fabricated pin the audited
  // v1.3 build put at 36.7538/3.0588. The legacy `location` state is the ADULT's own geolocation —
  // feeding it to the child's map is the exact confusion that audit measured.

  // AC-2: zone records are the SERVER's. There is no local save: the old `saveSafeZones` helper and
  // its `kidguard_safe_zones` key were removed, and the zones tab renders ZonesScreen (below), which
  // reads back from `GET /geofences` after every write. `safeZones` remains only as the in-memory
  // prototype list the child-role RiskEngine consumes until Task 11 removes that branch.

  const handleUpdateAlertPolicy = (newConfig: Partial<typeof alertPolicy>) => {
    alertPolicyManager.updateConfig(newConfig);
    setAlertPolicy(alertPolicyManager.getConfig());
  };

  const handleToggleSiren = () => {
    const audioService = AudioService.getInstance();
    if (isSirenActive) {
      audioService.stopEmergencySiren();
      setIsSirenActive(false);
    } else {
      audioService.startEmergencySiren();
      setIsSirenActive(true);
    }
  };

  const handleStartAudioRecording = async () => {
    const audioService = AudioService.getInstance();
    if (isRecordingAudio) {
      audioService.stopEmergencyRecording();
      setIsRecordingAudio(false);
    } else {
      const ok = await audioService.startEmergencyRecording(undefined, () => {
        setIsRecordingAudio(false);
      });
      if (ok) setIsRecordingAudio(true);
    }
  };

  const handleSyncNow = async () => {
    await OfflineQueueService.getInstance().syncQueue();
    setHealthStatus(healthMonitor.getHealthDiagnostics(location));
    refreshOfflineCount();
  };

  const handleRequestCheckIn = () => {
    const request = protectionState.requestCheckIn(pairingInfo.kidId || 'child-local');
    setCheckIn(request);
    setActiveIncident(protectionState.getIncident());
  };

  const handleRespondCheckIn = () => {
    const response = protectionState.respondToCheckIn('CONFIRMED');
    setCheckIn(response);
    setActiveIncident(protectionState.getIncident());
  };

  const handleGenerateNewPairingCode = () => {
    pairingService.generateNewPairingCode();
    setPairingInfo(pairingService.getPairingInfo());
  };

  const handlePairWithCode = (code: string) => {
    const success = pairingService.pairWithCode(code);
    setPairingInfo(pairingService.getPairingInfo());
    return success;
  };

  const handleRevokeDevice = () => {
    pairingService.revokeDevice();
    setPairingInfo(pairingService.getPairingInfo());
  };

  const handleTriggerSos = () => {
    AudioService.getInstance().startEmergencySiren();
    setIsSirenActive(true);
    const sosLoc: LocationPoint = { ...location, timestamp: Date.now() };
    runEvaluation(sosLoc, safeZones);
  };

  const handleSendManualSms = async () => {
    const phone = alertPolicy.parentPhone.trim();
    if (!phone) {
      window.alert(lang === 'ar' ? 'أضف رقم الوالد أولاً من الإعدادات.' : 'Add the parent phone number first in Settings.');
      return;
    }
    const result = await SmsService.getInstance().sendAlertSms(
      phone,
      alertPolicy.childName,
      'تنبيه يدوي من الطفل / Manual SOS',
      { ...location, timestamp: Date.now() },
      'CONFIRM'
    );
    if (!result.success) {
      window.alert(result.error || (lang === 'ar' ? 'تعذر فتح تطبيق الرسائل.' : 'Could not open the SMS app.'));
    }
  };

  const handleRoleChange = async (nextRole: DeviceRole) => {
    if (nextRole === role) return;
    if (nextRole === 'PARENT' && alertPolicy.parentPinHash && !pinUnlocked) {
      const entered = window.prompt(
        lang === 'ar' ? 'أدخل رمز PIN الخاص بالوالد:' : lang === 'fr' ? 'Entrez le code PIN parent :' : 'Enter parent PIN:'
      );
      if (!entered || !(await verifyPin(entered, alertPolicy.parentPinHash))) {
        window.alert(lang === 'ar' ? 'رمز PIN غير صحيح' : lang === 'fr' ? 'Code PIN incorrect' : 'Incorrect PIN');
        return;
      }
      setPinUnlocked(true);
    }
    setRole(nextRole);
  };

  // PIN-protected open settings
  const handleOpenSettings = async () => {
    if (alertPolicy.parentPinHash && !pinUnlocked) {
      const entered = window.prompt(
        lang === 'ar' ? 'أدخل رمز PIN الخاص بالوالد:' : lang === 'fr' ? 'Entrez le code PIN parent :' : 'Enter parent PIN:'
      );
      if (!entered || !(await verifyPin(entered, alertPolicy.parentPinHash))) {
        window.alert(lang === 'ar' ? 'رمز PIN غير صحيح' : lang === 'fr' ? 'Code PIN incorrect' : 'Incorrect PIN');
        return;
      }
      setPinUnlocked(true);
    }
    setIsSettingsModalOpen(true);
  };

  // The zones the map may draw are the SERVER's, read from `GET /geofences` on sign-in and after
  // every ZonesScreen write. Each stored area is read through the one module that knows the
  // `lat lon` order; an area we cannot parse is dropped, never defaulted (AC-2).
  const mapZones = useMemo<MapZone[]>(() => serverZones
    .map((zone) => {
      try {
        return { id: String(zone.id), name: zone.name, geometry: parseWkt(zone.area) };
      } catch {
        return null;
      }
    })
    .filter((zone): zone is MapZone => zone !== null), [serverZones]);

  // The map's child feed is now the selected child's server reading: position, freshness and label
  // all come from `useChildren()`. A track history endpoint is not part of this task, so the map is
  // given an empty history rather than a fabricated one; a conflict becomes readings=null in the
  // state layer, which is why the map still receives sourceConflict={false}.

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className={`min-h-[100dvh] font-sans bg-slate-950 text-slate-100 transition-colors ${
        theme === 'light' ? 'light-mode-override' : ''
      }`}
    >
      {showLocationRationale && Capacitor.isNativePlatform() && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-emerald-500/30 bg-slate-900 p-5 text-right shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="location-rationale-title">
            <h2 id="location-rationale-title" className="text-lg font-bold text-emerald-300">السماح بتحديد موقع الطفل</h2>
            <p className="mt-3 text-sm leading-6 text-slate-200">يستخدم KidGuard موقع الجهاز لمراقبة وجود الطفل داخل المناطق الآمنة وتنبيه الوالد عند الخروج منها. يعمل التتبع في الخلفية فقط أثناء تفعيل الحماية، وتظهر إشارة التتبع المستمرة من Android.</p>
            <p className="mt-2 text-xs leading-5 text-slate-400">لن يبدأ التطبيق طلب صلاحية Android قبل ضغطك على زر المتابعة. يمكنك رفض الطلب، لكن التتبع والتنبيهات المرتبطة بالموقع لن تعملا.</p>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setShowLocationRationale(false)} className="flex-1 rounded-xl border border-slate-700 px-3 py-2.5 text-sm text-slate-300">لاحقاً</button>
              <button type="button" onClick={handleLocationPermissionRequest} className="flex-1 rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white">متابعة والسماح</button>
            </div>
          </div>
        </div>
      )}
      <Navbar
        view={view}
        onViewChange={setView}
        lang={lang}
        setLang={setLang}
        theme={theme}
        setTheme={setTheme}
        isOnline={healthStatus.networkConnected}
        onOpenSettings={handleOpenSettings}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        lang={lang}
        setLang={setLang}
        theme={theme}
        setTheme={setTheme}
        alertPolicy={alertPolicy}
        onUpdateAlertPolicy={handleUpdateAlertPolicy}
        healthStatus={healthStatus}
        role={role}
      />

      <main className="pb-0 sm:pb-6">
        {/* GPS permission / error banner */}
        {geoError && (
          <div className="bg-amber-900/90 border-b border-amber-700 py-2 px-4 text-center text-xs text-amber-100">
            ⚠️ {geoError}
          </div>
        )}

        {/* Native background tracking status */}
        {Capacitor.isNativePlatform() && (
          <div className="bg-slate-900/70 border-b border-slate-800 py-1 px-4 text-center text-[10px] text-emerald-400">
            {isBgTracking ? '📡 تتبع خلفي نشط' : '📡 تتبع خلفي متوقف'}
          </div>
        )}

        {/* Simulation banner */}
        <div className="bg-slate-900/90 border-b border-slate-800 py-2 px-4 text-center text-xs text-slate-400 flex items-center justify-center gap-4 flex-wrap">
          <span className="font-semibold text-slate-300">
            اختبار ومحاكاة الخروج من المنطقة الآمنة:
          </span>
          <button
            onClick={() => {
              const next = !isSimulatingOutside;
              const szLat = safeZones[0]?.latitude;
              const szLng = safeZones[0]?.longitude;
              const baseLat =
                typeof szLat === 'number' && Number.isFinite(szLat) ? szLat : 36.7538;
              const baseLng =
                typeof szLng === 'number' && Number.isFinite(szLng) ? szLng : 3.0588;

              setIsSimulatingOutside(next);
              GeofenceMonitor.getInstance().resetState();
              RiskEngine.getInstance().resetEngine();

              const simulatedLoc = {
                ...location,
                latitude: next ? baseLat + 0.025 : baseLat,
                longitude: next ? baseLng + 0.025 : baseLng,
                speed: next ? 4 : 0,
                timestamp: Date.now(),
              };
              setLocation(simulatedLoc);
              runEvaluation(simulatedLoc, safeZones);
            }}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all border ${
              isSimulatingOutside
                ? 'bg-red-500/20 text-red-300 border-red-500/40 shadow-sm'
                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
            }`}
          >
            {isSimulatingOutside
              ? 'إيقاف المحاكاة وإعادة الطفل للمنطقة'
              : 'محاكاة: الطفل داخل المنطقة الآمنة'}
          </button>
        </div>

        {view === 'dashboard' && (
          <ParentDashboard
            location={location}
            riskAssessment={riskAssessment}
            alertHistory={alertHistory}
            healthStatus={healthStatus}
            alertPolicy={alertPolicy}
            pairingInfo={pairingInfo}
            lang={lang}
            zonesPanel={
              <>
                {/* R-M1-21: without a server-selected child there is NO zone panel — the sentence
                    below says why. With one, the literal childDeviceId wiring is what makes the
                    saved zone actually evaluated. */}
                {selectedChild && (
                  <ZonesScreen
                    lang={lang}
                    service={zoneService}
                    isAdmin={session.user?.admin === true}
                    childName={deviceDisplayName(selectedChild.device, lang)}
                    childDeviceId={selectedChild.device.id}
                    guardianUserIds={session.user ? [session.user.id] : undefined}
                    onServerZones={setServerZones}
                  />
                )}
                {!selectedChild && (
                  <p className="text-sm text-amber-200 bg-amber-950/40 border border-amber-700/40 rounded-2xl px-4 py-5">
                    {translate('zones.noChild', lang)}
                  </p>
                )}
              </>
            }
            onUpdateAlertPolicy={handleUpdateAlertPolicy}
            onSyncNow={handleSyncNow}
            onTriggerSiren={handleToggleSiren}
            isSirenActive={isSirenActive}
            onStartAudioRecording={handleStartAudioRecording}
            isRecordingAudio={isRecordingAudio}
            onPingLocation={() => runEvaluation(location, safeZones)}
            onGenerateNewPairingCode={handleGenerateNewPairingCode}
            onPairWithCode={handlePairWithCode}
            onRevokeDevice={handleRevokeDevice}
            childPosition={selectedChild?.readings ?? null}
            childFreshness={selectedChild?.freshness ?? null}
            childLabel={selectedChild?.label ?? null}
            mapZones={mapZones}
            mapHistory={[]}
            sourceConflict={false}
            onOpenSettings={handleOpenSettings}
            activeTab={parentActiveTab}
            onTabChange={setParentActiveTab}
            pendingOfflineCount={pendingOfflineCount}
            activeIncident={activeIncident}
            lastKnownLocation={lastKnownLocation}
            checkIn={checkIn}
            onRequestCheckIn={handleRequestCheckIn}
          />
        )}

        {view === 'children' && (
          <ChildScreen
            lang={lang}
            loading={childrenState.loading}
            error={childrenState.error}
            children={childrenState.children}
            selectedId={selectedChild?.device.id ?? null}
            onSelect={setSelectedChildId}
            onRefresh={() => { void refreshChildren(lang); }}
          />
        )}

        {view === 'contacts' && (
          <ContactsScreen
            lang={lang}
            children={childrenState.children}
            selectedId={selectedChild?.device.id ?? null}
            onSelectChild={setSelectedChildId}
            guardians={guardians}
            candidates={guardianCandidates}
            summary={guardianSummary(guardians)}
            loading={guardiansLoading}
            error={guardiansError ?? childrenState.error}
            isAdmin={session.user?.admin === true}
            onAssign={(userId) => { void handleAssignGuardian(userId); }}
            onUnassign={(userId) => { void handleUnassignGuardian(userId); }}
            onRefresh={handleRefreshGuardians}
          />
        )}

        {view === 'alerts' && (
          <AlertsLog
            lang={lang}
            entries={liveAlerts.entries}
            devices={childrenState.children.map((child) => child.device)}
            connection={liveAlerts.connection}
          />
        )}
      </main>
    </div>
  );
}
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { DeviceRole, LocationPoint, SafeZone, LoggedAlert } from './types';
import { Language } from './translations';
import { Navbar } from './components/Navbar';
import { ParentDashboard } from './components/ParentDashboard';
import { ChildView } from './components/ChildView';
import { SettingsModal } from './components/SettingsModal';

import { GeofenceMonitor } from './services/GeofenceMonitor';
import { RiskEngine } from './services/RiskEngine';
import { AlertPolicyManager } from './services/AlertPolicyManager';
import { HealthMonitorService } from './services/HealthMonitorService';
import { AudioService } from './services/AudioService';
import { PairingService } from './services/PairingService';
import { OfflineQueueService } from './services/OfflineQueueService';
import { BackgroundLocationService } from './services/BackgroundLocationService';
import { SmsService } from './services/SmsService';
import { verifyPin } from './services/SecurityUtils';

const SAFE_ZONES_KEY = 'kidguard_safe_zones';
const ROLE_KEY = 'kidguard_role';
const LANG_KEY = 'kidguard_lang';

function loadSafeZones(): SafeZone[] {
  try {
    const raw = localStorage.getItem(SAFE_ZONES_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Remove legacy demo zones so they can never be used for real tracking.
    const zones = parsed.filter(
      (zone): zone is SafeZone =>
        zone && zone.id !== 'zone_school_1' && zone.id !== 'zone_home_2'
    );
    if (zones.length !== parsed.length) {
      localStorage.setItem(SAFE_ZONES_KEY, JSON.stringify(zones));
    }
    return zones;
  } catch {
    return [];
  }
}

function saveSafeZones(zones: SafeZone[]) {
  try {
    localStorage.setItem(SAFE_ZONES_KEY, JSON.stringify(zones));
  } catch {
    // ignore
  }
}

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
      return (localStorage.getItem(LANG_KEY) as Language) || 'ar';
    } catch {
      return 'ar';
    }
  });

  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('dark');

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

  const [locationHistory, setLocationHistory] = useState<LocationPoint[]>([]);
  const [safeZones, setSafeZones] = useState<SafeZone[]>(() => loadSafeZones());
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
  const [pendingOfflineCount, setPendingOfflineCount] = useState(0);
  const [isBgTracking, setIsBgTracking] = useState(false);

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

  const runEvaluation = useCallback(
    async (currentLoc: LocationPoint, zones: SafeZone[]) => {
      const currentPolicy = alertPolicyManager.getConfig();
      const geofenceMonitor = GeofenceMonitor.getInstance();
      const geofenceEval = geofenceMonitor.evaluate(
        currentLoc,
        zones,
        currentPolicy.instant1mExitEmergency ?? false
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
      return assessment;
    },
    [
      healthStatus.batteryLevel,
      healthStatus.tamperDetected,
      lang,
      pairingInfo.kidId,
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

  // Hybrid GPS: Background service on native (Android/iOS via Capacitor), HTML5 on web
  useEffect(() => {
    const bgService = BackgroundLocationService.getInstance();
    let unsub: (() => void) | null = null;
    let webWatchId: number | null = null;

    const handleLocation = (realLoc: LocationPoint) => {
      setGeoError(null);
      if (!isSimulatingOutside) {
        setLocation(realLoc);
        setLocationHistory((hist) => [...hist.slice(-30), realLoc]);
        runEvaluation(realLoc, safeZones);
      }
    };

    const startTracking = async () => {
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
  }, [isSimulatingOutside, safeZones, runEvaluation, lang]);

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

  const handleChildLocationChange = useCallback(
    (lat: number, lng: number) => {
      const updatedLoc: LocationPoint = {
        ...location,
        latitude: lat,
        longitude: lng,
        timestamp: Date.now(),
      };
      setLocation(updatedLoc);
      setLocationHistory((hist) => [...hist.slice(-30), updatedLoc]);
      runEvaluation(updatedLoc, safeZones);
    },
    [location, safeZones, runEvaluation]
  );

  const handleSaveSafeZone = (zoneData: Omit<SafeZone, 'id' | 'createdAt'>) => {
    const newZone: SafeZone = {
      ...zoneData,
      id: `zone_${Date.now()}`,
      createdAt: Date.now(),
    };
    const updated = [...safeZones, newZone];
    setSafeZones(updated);
    saveSafeZones(updated);
    runEvaluation(location, updated);
  };

  const handleDeleteSafeZone = (zoneId: string) => {
    const confirmMsg =
      lang === 'ar'
        ? 'هل أنت متأكد من حذف هذه المنطقة الآمنة؟'
        : lang === 'fr'
        ? 'Êtes-vous sûr de vouloir supprimer cette zone sûre ?'
        : 'Are you sure you want to delete this safe zone?';
    if (!window.confirm(confirmMsg)) return;

    const updated = safeZones.filter((z) => z.id !== zoneId);
    setSafeZones(updated);
    saveSafeZones(updated);
    runEvaluation(location, updated);
  };

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

  const handleGenerateNewPairingCode = () => {
    pairingService.generateNewPairingCode();
    setPairingInfo(pairingService.getPairingInfo());
  };

  const handlePairWithCode = (code: string) => {
    const success = pairingService.pairWithCode(code);
    setPairingInfo(pairingService.getPairingInfo());
    return success;
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

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className={`min-h-[100dvh] font-sans bg-slate-950 text-slate-100 transition-colors ${
        theme === 'light' ? 'light-mode-override' : ''
      }`}
    >
      <Navbar
        role={role}
        setRole={handleRoleChange}
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

        {role === 'PARENT' ? (
          <ParentDashboard
            location={location}
            riskAssessment={riskAssessment}
            safeZones={safeZones}
            alertHistory={alertHistory}
            healthStatus={healthStatus}
            alertPolicy={alertPolicy}
            pairingInfo={pairingInfo}
            locationHistory={locationHistory}
            lang={lang}
            onSaveSafeZone={handleSaveSafeZone}
            onDeleteSafeZone={handleDeleteSafeZone}
            onUpdateAlertPolicy={handleUpdateAlertPolicy}
            onSyncNow={handleSyncNow}
            onTriggerSiren={handleToggleSiren}
            isSirenActive={isSirenActive}
            onStartAudioRecording={handleStartAudioRecording}
            isRecordingAudio={isRecordingAudio}
            onPingLocation={() => runEvaluation(location, safeZones)}
            onGenerateNewPairingCode={handleGenerateNewPairingCode}
            onPairWithCode={handlePairWithCode}
            onChildLocationChange={handleChildLocationChange}
            onOpenSettings={handleOpenSettings}
            activeTab={parentActiveTab}
            onTabChange={setParentActiveTab}
            pendingOfflineCount={pendingOfflineCount}
          />
        ) : (
          <ChildView
            location={location}
            riskAssessment={riskAssessment}
            safeZones={safeZones}
            healthStatus={healthStatus}
            childName={alertPolicy.childName}
            lang={lang}
            onTriggerSos={handleTriggerSos}
            onSendManualSms={handleSendManualSms}
            onTriggerSiren={handleToggleSiren}
            isSirenActive={isSirenActive}
          />
        )}
      </main>
    </div>
  );
}
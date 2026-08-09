/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
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
import { BatteryEngine } from './services/BatteryEngine';

export default function App() {
  const [role, setRole] = useState<DeviceRole>('PARENT');
  const [lang, setLang] = useState<Language>('ar');
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('dark');

  // Initial Coordinates (Algiers, Algeria default)
  const [location, setLocation] = useState<LocationPoint>({
    latitude: 36.7538,
    longitude: 3.0588,
    accuracy: 12,
    speed: 1.2,
    heading: 180,
    altitude: 45,
    timestamp: Date.now(),
    isMockLocation: false,
  });

  const [locationHistory, setLocationHistory] = useState<LocationPoint[]>([
    {
      latitude: 36.7538,
      longitude: 3.0588,
      accuracy: 12,
      speed: 1.2,
      heading: 180,
      altitude: 45,
      timestamp: Date.now() - 300000,
    },
  ]);

  // Default Safe Zones
  const [safeZones, setSafeZones] = useState<SafeZone[]>([
    {
      id: 'zone_school_1',
      name: 'مدرسة التفوق / School',
      latitude: 36.7538,
      longitude: 3.0588,
      radius: 300,
      active: true,
      createdAt: Date.now(),
    },
    {
      id: 'zone_home_2',
      name: 'المنزل / Home',
      latitude: 36.7600,
      longitude: 3.0650,
      radius: 250,
      active: true,
      createdAt: Date.now(),
    },
  ]);

  const [alertHistory, setAlertHistory] = useState<LoggedAlert[]>([]);
  const [isSirenActive, setIsSirenActive] = useState(false);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isSimulatingOutside, setIsSimulatingOutside] = useState(false);
  const [parentActiveTab, setParentActiveTab] = useState<
    'map' | 'zones' | 'alerts' | 'health' | 'settings' | 'pairing'
  >('map');
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Load Initial Configurations
  const alertPolicyManager = AlertPolicyManager.getInstance();
  const [alertPolicy, setAlertPolicy] = useState(alertPolicyManager.getConfig());

  const pairingService = PairingService.getInstance();
  const [pairingInfo, setPairingInfo] = useState(pairingService.getPairingInfo());

  const healthMonitor = HealthMonitorService.getInstance();
  const [healthStatus, setHealthStatus] = useState(
    healthMonitor.getHealthDiagnostics(location)
  );

  // Evaluate Risk on every Location or Zone update
  const runEvaluation = useCallback(
    async (currentLoc: LocationPoint, zones: SafeZone[]) => {
      const currentPolicy = alertPolicyManager.getConfig();
      const geofenceMonitor = GeofenceMonitor.getInstance();
      const geofenceEval = geofenceMonitor.evaluate(
        currentLoc,
        zones,
        currentPolicy.instant1mExitEmergency ?? true
      );

      const riskEngine = RiskEngine.getInstance();
      const assessment = riskEngine.assessRisk(
        currentLoc,
        geofenceEval,
        healthStatus.batteryLevel,
        healthStatus.tamperDetected,
        currentLoc.isMockLocation || false,
        lang,
        currentPolicy.instant1mExitEmergency ?? true
      );

      // Alert Policy Evaluation
      const loggedAlert = await alertPolicyManager.evaluateAndDispatch(
        assessment,
        currentLoc
      );

      if (loggedAlert) {
        setAlertHistory((prev) => [loggedAlert, ...prev]);
      }

      // Automatic Full Danger Siren Trigger on Safe Zone Exit
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

      // Offline Queue Event Enqueue on confirmed exit or emergency
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
      }

      setHealthStatus(healthMonitor.getHealthDiagnostics(currentLoc));
      setRiskAssessment(assessment);
      return assessment;
    },
    [healthStatus.batteryLevel, healthStatus.tamperDetected, lang, pairingInfo.kidId]
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

  // Real-time GPS Watcher using HTML5 Geolocation API
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        // Only override with real GPS if not in test simulation mode
        if (!isSimulatingOutside) {
          const realLoc: LocationPoint = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy || 10,
            speed: pos.coords.speed || 0,
            heading: pos.coords.heading || 0,
            altitude: pos.coords.altitude || 0,
            timestamp: pos.timestamp || Date.now(),
            isMockLocation: false,
          };

          setLocation(realLoc);
          setLocationHistory((hist) => [...hist.slice(-20), realLoc]);
          runEvaluation(realLoc, safeZones);
        }
      },
      (err) => {
        console.warn('Real GPS Watcher notice:', err.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [isSimulatingOutside, safeZones, runEvaluation]);

  // Handler for manual map pin drag or click relocation
  const handleChildLocationChange = useCallback(
    (lat: number, lng: number) => {
      const updatedLoc: LocationPoint = {
        ...location,
        latitude: lat,
        longitude: lng,
        timestamp: Date.now(),
      };
      setLocation(updatedLoc);
      setLocationHistory((hist) => [...hist.slice(-20), updatedLoc]);
      runEvaluation(updatedLoc, safeZones);
    },
    [location, safeZones, runEvaluation]
  );

  // Handlers
  const handleSaveSafeZone = (zoneData: Omit<SafeZone, 'id' | 'createdAt'>) => {
    const newZone: SafeZone = {
      ...zoneData,
      id: `zone_${Date.now()}`,
      createdAt: Date.now(),
    };
    const updated = [...safeZones, newZone];
    setSafeZones(updated);
    runEvaluation(location, updated);
  };

  const handleDeleteSafeZone = (zoneId: string) => {
    const updated = safeZones.filter((z) => z.id !== zoneId);
    setSafeZones(updated);
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
      const ok = await audioService.startEmergencyRecording(
        undefined,
        (url) => {
          console.log('Emergency audio recorded:', url);
          setIsRecordingAudio(false);
        }
      );
      if (ok) setIsRecordingAudio(true);
    }
  };

  const handleSyncNow = async () => {
    await OfflineQueueService.getInstance().syncQueue();
    setHealthStatus(healthMonitor.getHealthDiagnostics(location));
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

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className={`min-h-screen font-sans bg-slate-950 text-slate-100 transition-colors ${
        theme === 'light' ? 'light-mode-override' : ''
      }`}
    >
      {/* Top Navigation */}
      <Navbar
        role={role}
        setRole={setRole}
        lang={lang}
        setLang={setLang}
        theme={theme}
        setTheme={setTheme}
        isOnline={healthStatus.networkConnected}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
      />

      {/* Settings Modal (Global) */}
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

      {/* Main View Container */}
      <main className="pb-12">
        {/* Quick Simulation Banner Control for Testing Safe Zone Exit */}
        <div className="bg-slate-900/90 border-b border-slate-800 py-2 px-4 text-center text-xs text-slate-400 flex items-center justify-center gap-4 flex-wrap">
          <span className="font-semibold text-slate-300">اختبار ومحاكاة الخروج من المنطقة الآمنة:</span>
          <button
            onClick={() => {
              const next = !isSimulatingOutside;
              setIsSimulatingOutside(next);
              if (!next) {
                // Reset location back inside safe zone
                const szLat = safeZones[0]?.latitude;
                const szLng = safeZones[0]?.longitude;
                const resetLoc = {
                  ...location,
                  latitude: typeof szLat === 'number' && !isNaN(szLat) && Number.isFinite(szLat) ? szLat : 36.7538,
                  longitude: typeof szLng === 'number' && !isNaN(szLng) && Number.isFinite(szLng) ? szLng : 3.0588,
                  speed: 1.0,
                };
                setLocation(resetLoc);
                GeofenceMonitor.getInstance().resetState();
                RiskEngine.getInstance().resetEngine();
                runEvaluation(resetLoc, safeZones);
              }
            }}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all border ${
              isSimulatingOutside
                ? 'bg-red-500/20 text-red-300 border-red-500/40 shadow-sm'
                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
            }`}
          >
            {isSimulatingOutside ? 'محاكاة: الطفل خارج المنطقة (الآن)' : 'محاكاة: الطفل داخل المنطقة الآمنة'}
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
            onOpenSettings={() => setIsSettingsModalOpen(true)}
            activeTab={parentActiveTab}
            onTabChange={setParentActiveTab}
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
            onTriggerSiren={handleToggleSiren}
            isSirenActive={isSirenActive}
          />
        )}
      </main>
    </div>
  );
}

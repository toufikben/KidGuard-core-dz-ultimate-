import React, { useState } from 'react';
import {
  ShieldAlert,
  Map,
  MapPin,
  Bell,
  Activity,
  Settings,
  Smartphone,
  Plus,
  Volume2,
  VolumeX,
  Mic,
  RefreshCw,
  PhoneCall,
  ExternalLink,
  BatteryCharging,
  Clock,
  Trash2,
} from 'lucide-react';
import {
  AlertPolicyConfig,
  DevicePairing,
  HealthStatus,
  KidState,
  LocationPoint,
  LoggedAlert,
  RiskAssessment,
  SafeZone,
} from '../types';
import { Language, translations } from '../translations';
import { MapView } from './MapView';
import { SafeZoneForm } from './SafeZoneForm';
import { AlertPolicySettings } from './AlertPolicySettings';
import { HealthDiagnosticsModal } from './HealthDiagnosticsModal';
import { PairingModal } from './PairingModal';

interface ParentDashboardProps {
  location: LocationPoint;
  riskAssessment: RiskAssessment;
  safeZones: SafeZone[];
  alertHistory: LoggedAlert[];
  healthStatus: HealthStatus;
  alertPolicy: AlertPolicyConfig;
  pairingInfo: DevicePairing;
  locationHistory: LocationPoint[];
  lang: Language;
  onSaveSafeZone: (zone: Omit<SafeZone, 'id' | 'createdAt'>) => void;
  onDeleteSafeZone: (zoneId: string) => void;
  onUpdateAlertPolicy: (config: Partial<AlertPolicyConfig>) => void;
  onSyncNow: () => void;
  onTriggerSiren: () => void;
  isSirenActive: boolean;
  onStartAudioRecording: () => void;
  isRecordingAudio: boolean;
  onPingLocation: () => void;
  onGenerateNewPairingCode: () => void;
  onPairWithCode: (code: string) => boolean;
  onChildLocationChange?: (lat: number, lng: number) => void;
  onOpenSettings?: () => void;
  activeTab?: 'map' | 'zones' | 'alerts' | 'health' | 'settings' | 'pairing';
  onTabChange?: (tab: 'map' | 'zones' | 'alerts' | 'health' | 'settings' | 'pairing') => void;
}

export const ParentDashboard: React.FC<ParentDashboardProps> = ({
  location,
  riskAssessment,
  safeZones,
  alertHistory,
  healthStatus,
  alertPolicy,
  pairingInfo,
  locationHistory,
  lang,
  onSaveSafeZone,
  onDeleteSafeZone,
  onUpdateAlertPolicy,
  onSyncNow,
  onTriggerSiren,
  isSirenActive,
  onStartAudioRecording,
  isRecordingAudio,
  onPingLocation,
  onGenerateNewPairingCode,
  onPairWithCode,
  onChildLocationChange,
  onOpenSettings,
  activeTab: externalActiveTab,
  onTabChange,
}) => {
  const t = translations[lang];

  const [internalTab, setInternalTab] = useState<
    'map' | 'zones' | 'alerts' | 'health' | 'settings' | 'pairing'
  >('map');

  const activeTab = externalActiveTab ?? internalTab;
  const setActiveTab = (tab: 'map' | 'zones' | 'alerts' | 'health' | 'settings' | 'pairing') => {
    setInternalTab(tab);
    if (onTabChange) {
      onTabChange(tab);
    }
  };

  const [showAddZoneModal, setShowAddZoneModal] = useState(false);
  const [selectedMapCoords, setSelectedMapCoords] = useState<{ lat: number; lng: number } | null>(
    null
  );

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return 'bg-red-500 text-white border-red-600';
      case 'HIGH':
        return 'bg-amber-500 text-white border-amber-600';
      case 'MEDIUM':
        return 'bg-yellow-500 text-slate-900 border-yellow-600';
      default:
        return 'bg-emerald-500 text-white border-emerald-600';
    }
  };

  const getKidStateLabel = (state: KidState) => {
    return t[state] || state;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* 0. Active Siren Emergency Banner */}
      {isSirenActive && (
        <div className="bg-red-600 border-2 border-red-400 rounded-2xl p-4 text-white shadow-2xl animate-pulse flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white text-red-600 rounded-xl animate-bounce shrink-0">
              <Volume2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-black text-base sm:text-lg">🚨 إنذار صفارة الطوارئ (SOS) يعمل الآن!</h3>
              <p className="text-xs text-red-100">تم إطلاق صفارة إنذار عالية التردد لتنبيه المحيطين وإبلاغ الوالد.</p>
            </div>
          </div>
          <button
            onClick={onTriggerSiren}
            className="w-full sm:w-auto px-6 py-2.5 bg-white text-red-700 hover:bg-red-50 font-black text-xs rounded-xl shadow-lg transition-all active:scale-95 border border-red-200 flex items-center justify-center gap-2 shrink-0"
          >
            <VolumeX className="w-4 h-4 text-red-700" />
            <span>إيقاف صفارة SOS الآن</span>
          </button>
        </div>
      )}

      {/* 1. Kid Status Overview Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-white shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          {/* Child Identity & State */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center text-2xl font-bold">
                🚸
              </div>
              <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 border-2 border-slate-900 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold">{alertPolicy.childName}</h2>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold border shadow-sm ${getRiskColor(
                    riskAssessment.riskLevel
                  )}`}
                >
                  {getKidStateLabel(riskAssessment.state)}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-400 mt-1">
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  {new Date(riskAssessment.timestamp).toLocaleTimeString()}
                </span>
                <span className="flex items-center gap-1">
                  <BatteryCharging className="w-3.5 h-3.5 text-amber-400" />
                  {healthStatus.batteryLevel}%
                </span>
                <span>دقة GPS: ±{Math.round(location.accuracy)}م</span>
              </div>
            </div>
          </div>

          {/* Risk Score Gauge */}
          <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700/80 flex items-center gap-4">
            <div>
              <p className="text-xs text-slate-400 font-semibold">{t.riskScore}</p>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-white">
                  {riskAssessment.riskScore}
                </span>
                <span className="text-xs text-slate-400">/ 100</span>
              </div>
            </div>
            <div className="w-24 h-2.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  riskAssessment.riskScore > 70
                    ? 'bg-red-500'
                    : riskAssessment.riskScore > 40
                    ? 'bg-amber-400'
                    : 'bg-emerald-400'
                }`}
                style={{ width: `${riskAssessment.riskScore}%` }}
              />
            </div>
          </div>
        </div>

        {/* Risk Factors Breakdown */}
        <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-800">
          <h3 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-emerald-400" />
            {t.riskFactorsTitle}
          </h3>
          {riskAssessment.riskFactors.length > 0 ? (
            <ul className="space-y-1.5 text-xs text-slate-300">
              {riskAssessment.riskFactors.map((factor, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span>{factor}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-emerald-400 font-medium">{t.noActiveRisk}</p>
          )}
        </div>

        {/* Quick Emergency Action Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <button
            onClick={onTriggerSiren}
            className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              isSirenActive
                ? 'bg-red-600 border-red-500 text-white animate-bounce'
                : 'bg-slate-800 border-slate-700 hover:border-red-500 text-red-400 hover:text-white'
            }`}
          >
            <Volume2 className="w-4 h-4" />
            {isSirenActive ? 'إيقاف الصفارة' : t.triggerSiren}
          </button>

          <button
            onClick={onStartAudioRecording}
            className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
              isRecordingAudio
                ? 'bg-purple-600 border-purple-500 text-white animate-pulse'
                : 'bg-slate-800 border-slate-700 hover:border-purple-500 text-purple-400 hover:text-white'
            }`}
          >
            <Mic className="w-4 h-4" />
            {isRecordingAudio ? 'جاري التسجيل...' : t.recordAudio}
          </button>

          <button
            onClick={onPingLocation}
            className="py-2.5 px-3 rounded-xl bg-slate-800 border border-slate-700 hover:border-emerald-500 text-emerald-400 hover:text-white text-xs font-bold flex items-center justify-center gap-2 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            {t.sendImmediatePing}
          </button>

          <button
            onClick={() => (onOpenSettings ? onOpenSettings() : setActiveTab('settings'))}
            className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 hover:border-amber-500 text-amber-400 hover:text-white flex items-center justify-center transition-all shadow-sm shrink-0"
            title={t.tabSettings}
          >
            <Settings className="w-4 h-4" />
          </button>

          <a
            href={`tel:${alertPolicy.parentPhone}`}
            className="py-2.5 px-3 rounded-xl bg-slate-800 border border-slate-700 hover:border-blue-500 text-blue-400 hover:text-white text-xs font-bold flex items-center justify-center gap-2 transition-all"
          >
            <PhoneCall className="w-4 h-4" />
            {t.callParent}
          </a>
        </div>
      </div>

      {/* 2. Navigation Tabs */}
      <div className="bg-slate-900 border border-slate-800 p-1.5 rounded-2xl flex items-center gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('map')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'map'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Map className="w-4 h-4" />
          {t.tabMap}
        </button>

        <button
          onClick={() => setActiveTab('zones')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'zones'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <MapPin className="w-4 h-4" />
          {t.tabSafeZones} ({safeZones.length})
        </button>

        <button
          onClick={() => setActiveTab('alerts')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'alerts'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Bell className="w-4 h-4" />
          {t.tabAlerts} ({alertHistory.length})
        </button>

        <button
          onClick={() => setActiveTab('health')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'health'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Activity className="w-4 h-4" />
          {t.tabHealth}
        </button>

        <button
          onClick={() => setActiveTab('pairing')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'pairing'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          {t.tabPairing}
        </button>
      </div>

      {/* 3. Tab Content View */}
      {activeTab === 'map' && (
        <div className="h-[520px] rounded-3xl overflow-hidden shadow-2xl">
          <MapView
            location={location}
            safeZones={safeZones}
            kidState={riskAssessment.state}
            childName={alertPolicy.childName}
            locationHistory={locationHistory}
            onSelectCoordinates={(lat, lng) => {
              setSelectedMapCoords({ lat, lng });
              setShowAddZoneModal(true);
            }}
            onChildLocationChange={onChildLocationChange}
          />
        </div>
      )}

      {activeTab === 'zones' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-white space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-lg font-bold">{t.tabSafeZones}</h2>
              <p className="text-xs text-slate-400">
                إدارة المناطق الجغرافية الآمنة المسجلة لحماية الطفل
              </p>
            </div>
            <button
              onClick={() => {
                setSelectedMapCoords(null);
                setShowAddZoneModal(true);
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-600/20"
            >
              <Plus className="w-4 h-4" />
              {t.addSafeZone}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {safeZones.map((zone) => (
              <div
                key={zone.id}
                className="bg-slate-800/80 border border-slate-700/80 p-4 rounded-2xl flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-emerald-400">{zone.name}</h3>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        zone.active
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      {zone.active ? t.active : t.inactive}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-2">
                    نصف القطر:{' '}
                    <strong className="text-white">
                      {zone.radius >= 1000
                        ? `${zone.radius} متر (${(zone.radius / 1000).toFixed(1)} كم)`
                        : `${zone.radius} متر`}
                    </strong>
                  </p>
                  <p className="text-[11px] font-mono text-slate-400 mt-1">
                    {typeof zone.latitude === 'number' && !isNaN(zone.latitude) ? zone.latitude.toFixed(5) : '36.75380'}, {typeof zone.longitude === 'number' && !isNaN(zone.longitude) ? zone.longitude.toFixed(5) : '3.05880'}
                  </p>
                </div>

                <div className="flex items-center justify-end border-t border-slate-700/60 pt-3">
                  <button
                    onClick={() => onDeleteSafeZone(zone.id)}
                    className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {t.deleteZone}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'alerts' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-white space-y-4">
          <div className="border-b border-slate-800 pb-4">
            <h2 className="text-lg font-bold">{t.tabAlerts}</h2>
            <p className="text-xs text-slate-400">
              سجل التنبيهات والأحداث الطارئة السابقة ورسائل SMS المرسلة للوالد
            </p>
          </div>

          {alertHistory.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">
              لا توجد تنبيهات مسجلة حتى الآن.
            </p>
          ) : (
            <div className="space-y-3">
              {alertHistory.map((alt) => (
                <div
                  key={alt.id}
                  className="bg-slate-800/80 border border-slate-700 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-red-400">{alt.title}</span>
                      <span className="text-[10px] text-slate-400">
                        ({new Date(alt.timestamp).toLocaleTimeString()})
                      </span>
                    </div>
                    <p className="text-slate-300">{alt.message}</p>
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-1">
                      <span>SMS: {alt.smsSent ? 'تم الإرسال بنجاح' : 'لم يرسل'}</span>
                      <span>
                        الموقع: {typeof alt.location?.latitude === 'number' && !isNaN(alt.location.latitude) ? alt.location.latitude.toFixed(4) : '36.7538'},{' '}
                        {typeof alt.location?.longitude === 'number' && !isNaN(alt.location.longitude) ? alt.location.longitude.toFixed(4) : '3.0588'}
                      </span>
                    </div>
                  </div>

                  <a
                    href={alt.mapsLink}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 bg-emerald-600/30 text-emerald-300 hover:bg-emerald-600 hover:text-white border border-emerald-500/30 rounded-xl font-semibold flex items-center gap-1.5 self-start sm:self-center shrink-0 transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    عرض على Google Maps
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'health' && (
        <HealthDiagnosticsModal
          health={healthStatus}
          lang={lang}
          onSyncNow={onSyncNow}
          pendingOfflineCount={0}
        />
      )}

      {activeTab === 'pairing' && (
        <PairingModal
          pairingInfo={pairingInfo}
          onGenerateNewCode={onGenerateNewPairingCode}
          onPairWithCode={onPairWithCode}
          lang={lang}
        />
      )}

      {/* Add Safe Zone Modal */}
      {showAddZoneModal && (
        <SafeZoneForm
          currentLocation={location}
          selectedCoords={selectedMapCoords}
          onSave={(zone) => {
            onSaveSafeZone(zone);
            setShowAddZoneModal(false);
          }}
          onClose={() => setShowAddZoneModal(false)}
          lang={lang}
        />
      )}
    </div>
  );
};

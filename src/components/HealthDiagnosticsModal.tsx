import React from 'react';
import {
  Activity,
  ShieldCheck,
  Navigation,
  Wifi,
  BatteryCharging,
  RefreshCw,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import { HealthStatus } from '../types';
import { Language, translations } from '../translations';

interface HealthDiagnosticsModalProps {
  health: HealthStatus;
  lang: Language;
  onSyncNow: () => void;
  pendingOfflineCount: number;
}

export const HealthDiagnosticsModal: React.FC<HealthDiagnosticsModalProps> = ({
  health,
  lang,
  onSyncNow,
  pendingOfflineCount,
}) => {
  const t = translations[lang];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white space-y-6">
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Activity className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h2 className="text-lg font-bold">{t.systemHealth}</h2>
            <p className="text-xs text-slate-400">
              تشخيص وحالة خدمات الحماية والتتبع ومراقبة العبث في الخلفية
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-semibold">
          <ShieldCheck className="w-4 h-4" />
          <span>Protection: Active 24/7</span>
        </div>
      </div>

      {/* Security Alerts Banner if detected */}
      {(health.mockLocationDetected || health.tamperDetected) && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold">{t.tamperAlert}</p>
            {health.mockLocationDetected && <p>• {t.mockLocationAlert}</p>}
          </div>
        </div>
      )}

      {/* Health Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Background Service */}
        <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400">{t.protectionActive}</p>
              <p className="text-sm font-bold text-emerald-400">نشطة (Foreground)</p>
            </div>
          </div>
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
        </div>

        {/* GPS Sensor */}
        <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
              <Navigation className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400">{t.gpsStatus}</p>
              <p className={`text-sm font-bold ${health.gpsActive ? 'text-emerald-400' : 'text-amber-400'}`}>
                {health.gpsActive ? 'يعمل بدقة عالية' : 'ضعيف / غير متاح'}
              </p>
            </div>
          </div>
          <span className={`w-2.5 h-2.5 rounded-full ${health.gpsActive ? 'bg-emerald-400' : 'bg-amber-400'}`} />
        </div>

        {/* Network status */}
        <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400">
              <Wifi className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400">{t.networkStatus}</p>
              <p className={`text-sm font-bold ${health.networkConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
                {health.networkConnected ? 'متصل بالإنترنت' : 'منقطع (Offline Queue)'}
              </p>
            </div>
          </div>
          <span className={`w-2.5 h-2.5 rounded-full ${health.networkConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
        </div>

        {/* Battery Engine */}
        <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
              <BatteryCharging className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400">{t.batteryOptimization}</p>
              <p className="text-sm font-bold text-white">
                {health.batteryLevel}% ({health.batteryState})
              </p>
            </div>
          </div>
        </div>

        {/* Sync & Offline Queue */}
        <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between col-span-1 sm:col-span-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-teal-500/20 text-teal-400">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400">{t.offlineQueue}</p>
              <p className="text-sm font-bold text-slate-200">
                {pendingOfflineCount > 0 ? `${pendingOfflineCount} أحداث قيد الانتظار` : 'جميع الأحداث مزامنة'}
              </p>
            </div>
          </div>
          <button
            onClick={onSyncNow}
            className="px-3 py-1.5 rounded-lg bg-emerald-600/30 text-emerald-300 hover:bg-emerald-600 hover:text-white border border-emerald-500/40 text-xs font-semibold flex items-center gap-1 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t.syncNow}
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  BatteryCharging,
  Navigation,
  Lock,
  PhoneCall,
  MessageSquareText,
  Volume2,
  VolumeX,
  CheckCircle2,
} from 'lucide-react';
import {
  HealthStatus,
  KidState,
  LocationPoint,
  SafeZone,
  RiskAssessment,
} from '../types';
import { Language, translations } from '../translations';

interface ChildViewProps {
  location: LocationPoint;
  riskAssessment: RiskAssessment;
  safeZones: SafeZone[];
  healthStatus: HealthStatus;
  childName: string;
  lang: Language;
  onTriggerSos: () => void;
  onSendManualSms: () => void;
  onTriggerSiren: () => void;
  isSirenActive: boolean;
}

export const ChildView: React.FC<ChildViewProps> = ({
  location,
  riskAssessment,
  safeZones,
  healthStatus,
  childName,
  lang,
  onTriggerSos,
  onSendManualSms,
  onTriggerSiren,
  isSirenActive,
}) => {
  const t = translations[lang];

  const [sosCountdown, setSosCountdown] = useState<number | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    if (sosCountdown !== null && sosCountdown > 0) {
      timer = window.setTimeout(() => {
        setSosCountdown(sosCountdown - 1);
      }, 1000);
    } else if (sosCountdown === 0) {
      onTriggerSos();
      setSosCountdown(null);
    }
    return () => clearTimeout(timer);
  }, [sosCountdown, onTriggerSos]);

  const handleStartSosCountdown = () => {
    setSosCountdown(3);
  };

  const handleCancelSos = () => {
    setSosCountdown(null);
  };

  const isSafe = riskAssessment.state === 'SAFE' || riskAssessment.state === 'RETURNED_TO_SAFE_ZONE';

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6 text-white">
      {/* 0. Active Siren / SOS Emergency Bar */}
      {isSirenActive && (
        <div className="bg-red-600 border-2 border-red-400 rounded-2xl p-4 text-white shadow-2xl animate-pulse flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white text-red-600 rounded-xl animate-bounce shrink-0">
              <Volume2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-black text-base">🚨 صفارة إنذار SOS تعمل الآن!</h3>
              <p className="text-xs text-red-100">تم تفعيل التنبيه المباشر بنجاح وإرسال الإشارة للوالد.</p>
            </div>
          </div>
          <button
            onClick={onTriggerSiren}
            className="w-full sm:w-auto px-5 py-2.5 bg-white text-red-700 hover:bg-red-50 font-black text-xs rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 border border-red-200 shrink-0"
          >
            <VolumeX className="w-4 h-4 text-red-700" />
            <span>إيقاف صفارة SOS</span>
          </button>
        </div>
      )}

      {/* 1. Main 24/7 Protection Shield Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-4 shadow-2xl relative overflow-hidden">
        <div
          className={`w-28 h-28 mx-auto rounded-3xl flex items-center justify-center transition-all ${
            isSafe
              ? 'bg-emerald-500/20 text-emerald-400 border-2 border-emerald-500/40 shadow-xl shadow-emerald-500/10'
              : 'bg-red-500/20 text-red-400 border-2 border-red-500/40 animate-pulse shadow-xl shadow-red-500/10'
          }`}
        >
          {isSafe ? (
            <ShieldCheck className="w-16 h-16 animate-pulse" />
          ) : (
            <AlertTriangle className="w-16 h-16 animate-bounce" />
          )}
        </div>

        <div>
          <h2 className="text-2xl font-black tracking-tight">{childName}</h2>
          <p
            className={`text-sm font-bold mt-1 ${
              isSafe ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {t[riskAssessment.state] || riskAssessment.state}
          </p>
        </div>

        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-300">
          <Lock className="w-4 h-4 text-emerald-400" />
          <span>خدمة التتبع والتأمين نشطة 24/7 في الخلفية</span>
        </div>
      </div>

      {/* 2. One-Tap Giant SOS Button */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-4 shadow-xl">
        <h3 className="text-base font-bold text-slate-200">زر الاستغاثة المباشر (SOS)</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          اضغط هنا للاتصال الفوري بوالدك وإرسال تنبيه طوارئ قسوى مع تحديد الموقع بدقة عالية
        </p>

        {sosCountdown !== null ? (
          <div className="space-y-4 py-4">
            <div className="text-5xl font-black text-red-500 animate-ping">
              {sosCountdown}
            </div>
            <p className="text-xs text-red-400 font-bold">{t.sosCountdown}</p>
            <button
              onClick={handleCancelSos}
              className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl border border-slate-700"
            >
              {t.cancel}
            </button>
          </div>
        ) : (
          <button
            onClick={handleStartSosCountdown}
            className="w-40 h-40 mx-auto rounded-full bg-red-600 hover:bg-red-500 text-white font-black text-2xl border-4 border-red-400 shadow-2xl shadow-red-600/50 flex flex-col items-center justify-center gap-2 transform active:scale-95 transition-all"
          >
            <PhoneCall className="w-10 h-10 animate-bounce" />
            <span>SOS</span>
          </button>
        )}

        <button
          onClick={onSendManualSms}
          className="mx-auto inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3 text-xs font-bold text-emerald-300 transition-all hover:bg-emerald-500/20 active:scale-95"
        >
          <MessageSquareText className="h-4 w-4" />
          <span>إرسال موقعي للوالد الآن</span>
        </button>
        <p className="text-[11px] text-slate-500">
          يفتح رسالة SMS جاهزة بالموقع الحالي للتأكيد قبل الإرسال.
        </p>
      </div>

      {/* 3. Siren Toggle */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-red-500/20 text-red-400">
            <Volume2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-200">صفارة الإنذار العالية</p>
            <p className="text-[11px] text-slate-400">تشغيل صفارة طوارئ بصوت مرتفع</p>
          </div>
        </div>
        <button
          onClick={onTriggerSiren}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            isSirenActive
              ? 'bg-red-600 text-white animate-bounce'
              : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
          }`}
        >
          {isSirenActive ? 'إيقاف الصفارة' : 'تشغيل الصفارة'}
        </button>
      </div>

      {/* 4. Device Diagnostics Bar */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center gap-3">
          <BatteryCharging className="w-5 h-5 text-amber-400" />
          <div>
            <p className="text-[10px] text-slate-400">{t.battery}</p>
            <p className="text-sm font-bold">{healthStatus.batteryLevel}%</p>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center gap-3">
          <Navigation className="w-5 h-5 text-blue-400" />
          <div>
            <p className="text-[10px] text-slate-400">{t.gpsSignal}</p>
            <p className="text-sm font-bold">±{Math.round(location.accuracy)}m</p>
          </div>
        </div>
      </div>
    </div>
  );
};

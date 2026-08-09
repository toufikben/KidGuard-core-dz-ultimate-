import React, { useState } from 'react';
import { BellRing, Smartphone, Volume2, Vibrate, RefreshCw, Save, AlertTriangle } from 'lucide-react';
import { AlertPolicyConfig } from '../types';
import { Language, translations } from '../translations';

interface AlertPolicySettingsProps {
  config: AlertPolicyConfig;
  onSave: (newConfig: Partial<AlertPolicyConfig>) => void;
  lang: Language;
}

export const AlertPolicySettings: React.FC<AlertPolicySettingsProps> = ({
  config,
  onSave,
  lang,
}) => {
  const t = translations[lang];

  const [parentPhone, setParentPhone] = useState(config.parentPhone);
  const [childName, setChildName] = useState(config.childName);
  const [smsEnabled, setSmsEnabled] = useState(config.smsEnabled);
  const [firstExitAlertEnabled, setFirstExitAlertEnabled] = useState(
    config.firstExitAlertEnabled
  );
  const [triggerEmergencyOnExit, setTriggerEmergencyOnExit] = useState(
    config.triggerEmergencyOnExit ?? true
  );
  const [instant1mExitEmergency, setInstant1mExitEmergency] = useState(
    config.instant1mExitEmergency ?? true
  );
  const [autoSmsLocationOnExit, setAutoSmsLocationOnExit] = useState(
    config.autoSmsLocationOnExit ?? true
  );
  const [followUpIntervalMinutes, setFollowUpIntervalMinutes] = useState(
    config.followUpIntervalMinutes
  );
  const [maxFollowUpAlerts, setMaxFollowUpAlerts] = useState(config.maxFollowUpAlerts);
  const [resetOnReturn, setResetOnReturn] = useState(config.resetOnReturn);
  const [soundAlertEnabled, setSoundAlertEnabled] = useState(config.soundAlertEnabled);
  const [vibrationEnabled, setVibrationEnabled] = useState(config.vibrationEnabled);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      parentPhone: parentPhone.trim(),
      childName: childName.trim(),
      smsEnabled,
      firstExitAlertEnabled,
      triggerEmergencyOnExit,
      instant1mExitEmergency,
      autoSmsLocationOnExit,
      followUpIntervalMinutes,
      maxFollowUpAlerts,
      resetOnReturn,
      soundAlertEnabled,
      vibrationEnabled,
    });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white space-y-6">
      <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
        <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <BellRing className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-bold">{t.alertPolicyTitle}</h2>
          <p className="text-xs text-slate-400">
            تخصيص سياسة إرسال الرسائل والتنبيهات المباشرة عند خروج الطفل من المنطقة الآمنة
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 text-sm">
        {/* Child & Parent Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {t.childNameLabel}
            </label>
            <input
              type="text"
              required
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {t.parentPhoneLabel}
            </label>
            <input
              type="tel"
              required
              value={parentPhone}
              onChange={(e) => setParentPhone(e.target.value)}
              placeholder="+213555123456"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono text-center text-sm focus:outline-none focus:border-emerald-500 tracking-wider"
            />
            <span className="text-[10px] text-slate-400 block mt-1 text-center">
              {t.phoneDirNotice}
            </span>
          </div>
        </div>

        {/* Toggles List */}
        <div className="space-y-3 pt-3 border-t border-slate-800">
          {/* Option 0: Trigger Full Emergency / Siren on Exit */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-red-950/50 border border-red-500/50">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 shrink-0">
                <AlertTriangle className="w-5 h-5 animate-pulse text-red-400" />
              </div>
              <div>
                <p className="font-bold text-xs text-red-200">
                  تفعيل / إطفاء وضع الخطر الشامل وصفارة SOS تلقائياً عند الخروج
                </p>
                <p className="text-[11px] text-red-300/80">
                  {triggerEmergencyOnExit
                    ? 'مفعّل حالياً: إطلاق صفارات SOS والإنذار العالي فور خروج الطفل من المنطقة'
                    : 'معطّل (منطفئ): لن يتم إطلاق الصفارات تلقائياً عند المغادرة'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTriggerEmergencyOnExit(!triggerEmergencyOnExit)}
              className={`w-12 h-6 rounded-full transition-colors relative p-0.5 shrink-0 ${
                triggerEmergencyOnExit ? 'bg-red-600' : 'bg-slate-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  triggerEmergencyOnExit ? 'translate-x-6 rtl:-translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Option 1: Instant 1m Exit Emergency Mode */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-orange-950/40 border border-orange-500/40">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/20 text-orange-400 border border-orange-500/30 shrink-0">
                <AlertTriangle className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <p className="font-bold text-xs text-orange-200">
                  تفعيل وضع الخطر القسوي المباشر عند الابتعاد بـ 1 متر
                </p>
                <p className="text-[11px] text-orange-300/80">
                  {instant1mExitEmergency
                    ? 'مفعّل: التحول الفوري لوضع الخطر فور تجاوز حدود المنطقة الآمنة بـ 1 متر'
                    : 'معطّل (منطفئ): يتطلب التأكد لعدة ثوانٍ قبل تفعيل الخطر'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setInstant1mExitEmergency(!instant1mExitEmergency)}
              className={`w-12 h-6 rounded-full transition-colors relative p-0.5 shrink-0 ${
                instant1mExitEmergency ? 'bg-orange-600' : 'bg-slate-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  instant1mExitEmergency ? 'translate-x-6 rtl:-translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Option 2: Auto Instant SMS Location */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                <Smartphone className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="font-bold text-xs text-emerald-200">
                  إرسال تلقائي فوري للموقع الجغرافي برسالة نصية (SMS)
                </p>
                <p className="text-[11px] text-emerald-300/80">
                  إرسال SMS تلقائياً يحتوي على رابط Google Maps المباشر فور الخروج من المنطقة الآمنة
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAutoSmsLocationOnExit(!autoSmsLocationOnExit)}
              className={`w-12 h-6 rounded-full transition-colors relative p-0.5 shrink-0 ${
                autoSmsLocationOnExit ? 'bg-emerald-600' : 'bg-slate-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  autoSmsLocationOnExit ? 'translate-x-6 rtl:-translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* SMS Enabled */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-slate-800">
            <div className="flex items-center gap-3">
              <Smartphone className="w-5 h-5 text-emerald-400" />
              <div>
                <p className="font-semibold text-xs text-slate-200">{t.enableSMS}</p>
                <p className="text-[11px] text-slate-400">
                  إرسال SMS يحتوي على رابط Google Maps المباشر
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSmsEnabled(!smsEnabled)}
              className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
                smsEnabled ? 'bg-emerald-600' : 'bg-slate-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  smsEnabled ? 'translate-x-6 rtl:-translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Sound & Vibration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-slate-800">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-semibold text-slate-200">{t.enableSound}</span>
              </div>
              <button
                type="button"
                onClick={() => setSoundAlertEnabled(!soundAlertEnabled)}
                className={`w-10 h-5 rounded-full transition-colors relative p-0.5 ${
                  soundAlertEnabled ? 'bg-emerald-600' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    soundAlertEnabled ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-slate-800">
              <div className="flex items-center gap-2">
                <Vibrate className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-semibold text-slate-200">{t.enableVibration}</span>
              </div>
              <button
                type="button"
                onClick={() => setVibrationEnabled(!vibrationEnabled)}
                className={`w-10 h-5 rounded-full transition-colors relative p-0.5 ${
                  vibrationEnabled ? 'bg-emerald-600' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    vibrationEnabled ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Reset on Return */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-slate-800">
            <div className="flex items-center gap-3">
              <RefreshCw className="w-5 h-5 text-teal-400" />
              <div>
                <p className="font-semibold text-xs text-slate-200">{t.resetOnReturn}</p>
                <p className="text-[11px] text-slate-400">
                  إعادة تعيين التنبيهات المتابعة عند رجوع الطفل للمنطقة الآمنة
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setResetOnReturn(!resetOnReturn)}
              className={`w-12 h-6 rounded-full transition-colors relative p-0.5 ${
                resetOnReturn ? 'bg-emerald-600' : 'bg-slate-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white transition-transform ${
                  resetOnReturn ? 'translate-x-6 rtl:-translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Intervals & Limits */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-800">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              {t.followUpInterval}
            </label>
            <select
              value={followUpIntervalMinutes}
              onChange={(e) => setFollowUpIntervalMinutes(parseInt(e.target.value, 10))}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-emerald-500"
            >
              <option value={2}>كل دقيقتين (مباشر ومكثف)</option>
              <option value={5}>كل 5 دقائق (موصى به)</option>
              <option value={10}>كل 10 دقائق</option>
              <option value={15}>كل 15 دقيقة</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              {t.maxAlerts}
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={maxFollowUpAlerts}
              onChange={(e) => setMaxFollowUpAlerts(parseInt(e.target.value, 10))}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="pt-4 flex justify-end">
          <button
            type="submit"
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all"
          >
            <Save className="w-4 h-4" />
            حفظ إعدادات السياسة
          </button>
        </div>
      </form>
    </div>
  );
};

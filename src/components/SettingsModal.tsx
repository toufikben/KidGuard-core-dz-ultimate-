import React, { useState } from 'react';
import {
  X,
  Settings,
  Globe,
  Sun,
  Moon,
  Monitor,
  BellRing,
  Smartphone,
  Check,
  ShieldAlert,
  Volume2,
  Vibrate,
  Save,
  Activity,
} from 'lucide-react';
import { AlertPolicyConfig, HealthStatus, DeviceRole } from '../types';
import { Language, translations } from '../translations';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  setLang: (lang: Language) => void;
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  alertPolicy: AlertPolicyConfig;
  onUpdateAlertPolicy: (newConfig: Partial<AlertPolicyConfig>) => void;
  healthStatus?: HealthStatus;
  role: DeviceRole;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  lang,
  setLang,
  theme,
  setTheme,
  alertPolicy,
  onUpdateAlertPolicy,
  healthStatus,
  role,
}) => {
  if (!isOpen) return null;

  const t = translations[lang];

  // Local state for policy form
  const [parentPhone, setParentPhone] = useState(alertPolicy.parentPhone);
  const [childName, setChildName] = useState(alertPolicy.childName);
  const [smsEnabled, setSmsEnabled] = useState(alertPolicy.smsEnabled);
  const [firstExitAlertEnabled, setFirstExitAlertEnabled] = useState(
    alertPolicy.firstExitAlertEnabled
  );
  const [triggerEmergencyOnExit, setTriggerEmergencyOnExit] = useState(
    alertPolicy.triggerEmergencyOnExit ?? true
  );
  const [instant1mExitEmergency, setInstant1mExitEmergency] = useState(
    alertPolicy.instant1mExitEmergency ?? true
  );
  const [autoSmsLocationOnExit, setAutoSmsLocationOnExit] = useState(
    alertPolicy.autoSmsLocationOnExit ?? true
  );
  const [followUpIntervalMinutes, setFollowUpIntervalMinutes] = useState(
    alertPolicy.followUpIntervalMinutes
  );
  const [maxFollowUpAlerts, setMaxFollowUpAlerts] = useState(
    alertPolicy.maxFollowUpAlerts
  );
  const [resetOnReturn, setResetOnReturn] = useState(alertPolicy.resetOnReturn);
  const [soundAlertEnabled, setSoundAlertEnabled] = useState(
    alertPolicy.soundAlertEnabled
  );
  const [vibrationEnabled, setVibrationEnabled] = useState(
    alertPolicy.vibrationEnabled
  );

  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSavePolicy = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateAlertPolicy({
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
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-100">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-900/90 sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Settings className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">
                {lang === 'ar' ? 'إعدادات التطبيق والتنبيهات' : lang === 'fr' ? 'Paramètres de l\'application' : 'App Settings & Policies'}
              </h2>
              <p className="text-xs text-slate-400">
                {lang === 'ar'
                  ? 'التحكم في لغة التطبيق، المظهر، وسلوك التنبيهات المباشرة'
                  : 'Customize app language, theme appearance, and live alerts'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-all active:scale-95"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body Scrollable */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 text-sm">

          {/* SECTION 1: Language & Theme Controls */}
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 sm:p-5 space-y-4">
            <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2 border-b border-slate-700/60 pb-2.5">
              <Globe className="w-4 h-4 text-emerald-400" />
              <span>{lang === 'ar' ? 'تخصيص اللغة والمظهر' : 'Language & Appearance'}</span>
            </h3>

            {/* Language Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                {lang === 'ar' ? 'اختر لغة واجهة التطبيق:' : 'Select Display Language:'}
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setLang('ar')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 ${
                    lang === 'ar'
                      ? 'bg-emerald-600 text-white border-emerald-400 shadow-md ring-2 ring-emerald-500/30'
                      : 'bg-slate-900/80 text-slate-300 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  <span className="text-sm">🇩🇿</span>
                  <span>العربية</span>
                  {lang === 'ar' && <Check className="w-3.5 h-3.5 ml-auto text-emerald-200" />}
                </button>

                <button
                  type="button"
                  onClick={() => setLang('en')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 ${
                    lang === 'en'
                      ? 'bg-emerald-600 text-white border-emerald-400 shadow-md ring-2 ring-emerald-500/30'
                      : 'bg-slate-900/80 text-slate-300 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  <span className="text-sm">🇬🇧</span>
                  <span>English</span>
                  {lang === 'en' && <Check className="w-3.5 h-3.5 ml-auto text-emerald-200" />}
                </button>

                <button
                  type="button"
                  onClick={() => setLang('fr')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 ${
                    lang === 'fr'
                      ? 'bg-emerald-600 text-white border-emerald-400 shadow-md ring-2 ring-emerald-500/30'
                      : 'bg-slate-900/80 text-slate-300 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  <span className="text-sm">🇫🇷</span>
                  <span>Français</span>
                  {lang === 'fr' && <Check className="w-3.5 h-3.5 ml-auto text-emerald-200" />}
                </button>
              </div>
            </div>

            {/* Theme Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                {lang === 'ar' ? 'اختر مظهر التطبيق (الثيم):' : 'Select Theme:'}
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTheme('dark')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                    theme === 'dark'
                      ? 'bg-emerald-600 text-white border-emerald-400 shadow-md'
                      : 'bg-slate-900/80 text-slate-300 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  <Moon className="w-4 h-4 text-emerald-300" />
                  <span>{lang === 'ar' ? 'داكن' : 'Dark'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTheme('light')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                    theme === 'light'
                      ? 'bg-emerald-600 text-white border-emerald-400 shadow-md'
                      : 'bg-slate-900/80 text-slate-300 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  <Sun className="w-4 h-4 text-amber-400" />
                  <span>{lang === 'ar' ? 'فاتح' : 'Light'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTheme('system')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                    theme === 'system'
                      ? 'bg-emerald-600 text-white border-emerald-400 shadow-md'
                      : 'bg-slate-900/80 text-slate-300 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  <Monitor className="w-4 h-4 text-blue-400" />
                  <span>{lang === 'ar' ? 'تلقائي' : 'System'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* SECTION 2: Policy & Phone Settings Form */}
          <form onSubmit={handleSavePolicy} className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 sm:p-5 space-y-4">
            <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2 border-b border-slate-700/60 pb-2.5">
              <BellRing className="w-4 h-4 text-amber-400" />
              <span>{t.alertPolicyTitle}</span>
            </h3>

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
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
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
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono text-center text-sm focus:outline-none focus:border-emerald-500 tracking-wider"
                />
                <span className="text-[10px] text-slate-400 block mt-1 text-center">
                  {t.phoneDirNotice}
                </span>
              </div>
            </div>

            {/* Toggle Switches */}
            <div className="space-y-3 pt-2">
              {/* Option 1: Full Emergency / Danger Mode Trigger */}
              <label className="flex items-center justify-between p-3.5 rounded-xl bg-red-950/50 border border-red-500/50 cursor-pointer hover:border-red-400 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 shrink-0">
                    <ShieldAlert className="w-5 h-5 text-red-400 animate-pulse" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-red-200 block">
                      تفعيل / إطفاء وضع الخطر الكامل وصفارة SOS عند الخروج
                    </span>
                    <span className="text-[10px] text-red-300/80 block mt-0.5">
                      {triggerEmergencyOnExit
                        ? 'مفعّل حالياً: إطلاق حالة الخطر وصفارة SOS تلقائياً فور الخروج من المنطقة'
                        : 'معطّل (منطفئ): لن يتم إطلاق صفارة SOS تلقائياً، سيكون التنبيه هادئاً'}
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={triggerEmergencyOnExit}
                  onChange={(e) => setTriggerEmergencyOnExit(e.target.checked)}
                  className="w-5 h-5 rounded text-red-600 focus:ring-red-500 bg-slate-800 border-red-700 shrink-0 cursor-pointer"
                />
              </label>

              {/* Option 2: Instant 1m Exit Emergency Mode */}
              <label className="flex items-center justify-between p-3.5 rounded-xl bg-orange-950/40 border border-orange-500/40 cursor-pointer hover:border-orange-400 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-orange-500/20 text-orange-400 border border-orange-500/30 shrink-0">
                    <ShieldAlert className="w-5 h-5 text-orange-400" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-orange-200 block">
                      تفعيل وضع الخطر المباشر فوراً عند الابتعاد بـ 1 متر
                    </span>
                    <span className="text-[10px] text-orange-300/80 block mt-0.5">
                      {instant1mExitEmergency
                        ? 'مفعّل: التحول الفوري لوضع الخطر بمجرد كسر حدود المنطقة الآمنة بـ 1 متر'
                        : 'معطّل (منطفئ): يتطلب التأكد لعدة ثوانٍ قبل التحول لخطر'}
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={instant1mExitEmergency}
                  onChange={(e) => setInstant1mExitEmergency(e.target.checked)}
                  className="w-5 h-5 rounded text-orange-600 focus:ring-orange-500 bg-slate-800 border-orange-700 shrink-0 cursor-pointer"
                />
              </label>

              {/* Option 2: Automatic Instant Location SMS */}
              <label className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 cursor-pointer hover:border-emerald-400 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
                    <Smartphone className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-emerald-200 block">
                      إرسال تلقائي فوري للموقع الجغرافي برسالة نصية (SMS)
                    </span>
                    <span className="text-[10px] text-emerald-300/80 block mt-0.5">
                      إرسال SMS تلقائياً يحتوي على رابط Google Maps لموقع الطفل فور الخروج من المنطقة الآمنة
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={autoSmsLocationOnExit}
                  onChange={(e) => setAutoSmsLocationOnExit(e.target.checked)}
                  className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500 bg-slate-800 border-emerald-700 shrink-0"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-700/60 cursor-pointer hover:border-slate-600 transition-colors">
                <div className="flex items-center gap-2.5">
                  <Volume2 className="w-4 h-4 text-amber-400" />
                  <div>
                    <span className="text-xs font-bold text-slate-200 block">
                      صوت الإنذار الصوتي المباشر
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      تشغيل نغمة إنذار عند كسر الجدار الجغرافي
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={soundAlertEnabled}
                  onChange={(e) => setSoundAlertEnabled(e.target.checked)}
                  className="w-4 h-4 rounded text-amber-500 focus:ring-amber-500 bg-slate-800 border-slate-700"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-700/60 cursor-pointer hover:border-slate-600 transition-colors">
                <div className="flex items-center gap-2.5">
                  <Vibrate className="w-4 h-4 text-purple-400" />
                  <div>
                    <span className="text-xs font-bold text-slate-200 block">
                      الاهتزاز عند الخطر
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      اهتزاز الجهاز للتنبيه أثناء الخروج
                    </span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={vibrationEnabled}
                  onChange={(e) => setVibrationEnabled(e.target.checked)}
                  className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 bg-slate-800 border-slate-700"
                />
              </label>
            </div>

            {/* Save Button */}
            <div className="pt-2 flex items-center justify-between gap-3">
              {savedSuccess ? (
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 bg-emerald-500/10 px-3 py-2 rounded-xl border border-emerald-500/30">
                  <Check className="w-4 h-4" />
                  <span>تم حفظ الإعدادات والسياسة بنجاح!</span>
                </div>
              ) : <div />}

              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-emerald-950/50"
              >
                <Save className="w-4 h-4" />
                <span>حفظ التغييرات</span>
              </button>
            </div>
          </form>

          {/* SECTION 3: System Diagnostics Info */}
          {healthStatus && (
            <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-4 text-xs space-y-2 text-slate-400">
              <div className="flex items-center justify-between text-slate-300 font-bold border-b border-slate-700/60 pb-2">
                <span className="flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-blue-400" />
                  <span>حالة النظام والاتصال المباشر</span>
                </span>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                  {healthStatus.networkConnected ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                <div>نسبة البطارية: <span className="font-mono font-bold text-white">{healthStatus.batteryLevel}%</span></div>
                <div>دقة GPS: <span className="font-mono font-bold text-white">عالية (&lt;10m)</span></div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};

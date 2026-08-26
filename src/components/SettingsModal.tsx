import React, { useState } from 'react';
import { Capacitor } from '@capacitor/core';
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
  Heart,
  Mail,
  MessageCircle,
  HelpCircle,
  Key,
  ExternalLink,
  CheckCircle,
  X,
  Send,
  Loader2,
} from 'lucide-react';
import { AlertPolicyConfig, HealthStatus, DeviceRole } from '../types';
import { Language, translations } from '../translations';
import { hashPin } from '../services/SecurityUtils';
import { privacyDataService } from '../services/PrivacyDataService';
import { SmsService } from '../services/SmsService';
import { EmailService } from '../services/EmailService';

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
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [smsEnabled, setSmsEnabled] = useState(alertPolicy.smsEnabled);
  const [firstExitAlertEnabled, setFirstExitAlertEnabled] = useState(
    alertPolicy.firstExitAlertEnabled
  );
  const [triggerEmergencyOnExit, setTriggerEmergencyOnExit] = useState(
    alertPolicy.triggerEmergencyOnExit ?? true
  );
  const [instant1mExitEmergency, setInstant1mExitEmergency] = useState(
    alertPolicy.instant1mExitEmergency ?? false
  );
  const [exitConfirmationsRequired, setExitConfirmationsRequired] = useState(
    alertPolicy.exitConfirmationsRequired ?? 3
  );
  const [exitConfirmationDelayMinutes, setExitConfirmationDelayMinutes] = useState(
    alertPolicy.exitConfirmationDelayMinutes ?? 0
  );
  const [autoSmsLocationOnExit] = useState(false);
  const [smsMode] = useState<'CONFIRM'>('CONFIRM');
  const [emailEnabled, setEmailEnabled] = useState(alertPolicy.emailEnabled ?? true);
  const [emailMode, setEmailMode] = useState<'SMTP' | 'MAILTO'>(alertPolicy.emailMode ?? 'SMTP');
  const [emailSender, setEmailSender] = useState(alertPolicy.emailSender ?? '');
  const [emailRecipient, setEmailRecipient] = useState(alertPolicy.emailRecipient ?? '');
  const [emailSmtpHost, setEmailSmtpHost] = useState(alertPolicy.emailSmtpHost ?? 'smtp.gmail.com');
  const [emailSmtpPort, setEmailSmtpPort] = useState(alertPolicy.emailSmtpPort ?? 587);
  const [emailSmtpUsername, setEmailSmtpUsername] = useState(alertPolicy.emailSmtpUsername ?? '');
  const [emailSmtpPassword, setEmailSmtpPassword] = useState('');
  const [showEmailHelp, setShowEmailHelp] = useState(false);
  const [showSmtpGuide, setShowSmtpGuide] = useState(false);
  const [isTestingEmail, setIsTestingEmail] = useState(false);
  const [batterySmsEnabled, setBatterySmsEnabled] = useState(alertPolicy.batterySmsEnabled ?? true);
  const [batteryAlertThreshold, setBatteryAlertThreshold] = useState(alertPolicy.batteryAlertThreshold ?? 15);
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
  const [privacyStatus, setPrivacyStatus] = useState('');
  const [showSmsRationale, setShowSmsRationale] = useState(false);

  const handleExportData = () => {
    const payload = JSON.stringify(privacyDataService.exportData(), null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `kidguard-data-export-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setPrivacyStatus(lang === 'ar' ? 'تم تجهيز ملف التصدير المنقّح وحفظه على جهازك.' : 'The redacted export was prepared and saved on this device.');
  };

  const handleDeleteLocalData = () => {
    const confirmed = window.confirm(
      lang === 'ar'
        ? 'سيحذف هذا كل بيانات KidGuard المحلية، بما فيها الاقتران والمناطق والسجل. هل تريد المتابعة؟'
        : 'This deletes all local KidGuard data, including pairing, zones, and history. Continue?'
    );
    if (!confirmed) return;
    privacyDataService.deleteLocalData();
    window.alert(lang === 'ar' ? 'تم حذف البيانات المحلية. سيُعاد تشغيل التطبيق.' : 'Local data deleted. The app will reload.');
    window.location.reload();
  };

  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin || confirmPin) {
      if (!/^\d{4,8}$/.test(newPin) || newPin !== confirmPin) {
        window.alert('يجب أن يكون PIN من 4 إلى 8 أرقام وأن يتطابق الحقلان.');
        return;
      }
    }
    if (emailMode === 'SMTP' && emailEnabled && emailSmtpPassword) {
      try {
        await EmailService.getInstance().saveSmtpCredentials(emailSmtpHost, emailSmtpPort, emailSmtpUsername || emailSender || emailRecipient, emailSmtpPassword);
      } catch (err: any) {
        if (Capacitor.isNativePlatform()) {
          console.error("SMTP Save Error:", err);
          // Only alert if it's a fatal error that prevents saving entirely
          if (err.message && !err.message.includes('KeyStore')) {
            window.alert(lang === 'ar' ? `تعذر حفظ إعدادات SMTP: ${err.message}` : `Could not save SMTP settings: ${err.message}`);
            return;
          }
        }
      }
    }
    onUpdateAlertPolicy({
      parentPhone: parentPhone.trim(),
      childName: childName.trim(),
      smsEnabled,
      firstExitAlertEnabled,
      triggerEmergencyOnExit,
      instant1mExitEmergency,
      exitConfirmationsRequired,
      exitConfirmationDelayMinutes,
      autoSmsLocationOnExit: false,
      smsMode: 'CONFIRM',
      emailEnabled,
      emailMode,
      emailSender: emailSender.trim(),
      emailRecipient: emailRecipient.trim(),
      emailSmtpHost: emailSmtpHost.trim(),
      emailSmtpPort,
      emailSmtpUsername: emailSmtpUsername.trim() || emailSender.trim(),
      batterySmsEnabled,
      batteryAlertThreshold,
      followUpIntervalMinutes,
      maxFollowUpAlerts,
      resetOnReturn,
      soundAlertEnabled,
      vibrationEnabled,
      ...(newPin ? { parentPinHash: await hashPin(newPin) } : {}),
    });
    setNewPin('');
    setConfirmPin('');
    // Keep emailSmtpPassword in state so it doesn't disappear from UI after save
    // setEmailSmtpPassword(''); 
    setShowSmtpGuide(false);
    setSavedSuccess(true);
    setPrivacyStatus(lang === 'ar' ? 'تم حفظ الإعدادات محليًا على هذا الجهاز.' : 'Settings saved locally on this device.');
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleTestEmail = async () => {
    if (!emailRecipient) {
      window.alert(lang === 'ar' ? 'يرجى إدخال بريد الوالد أولاً.' : 'Please enter parent email first.');
      return;
    }
    if (emailMode === 'SMTP' && !emailSmtpPassword) {
      window.alert(lang === 'ar' ? 'يرجى إدخال كلمة مرور التطبيق لتجربة SMTP.' : 'Please enter App Password for SMTP test.');
      return;
    }

    setIsTestingEmail(true);
    try {
      // Temporarily save for the test if SMTP
      if (emailMode === 'SMTP') {
        try {
          // Use recipient as sender/username for simplified Gmail SMTP
          await EmailService.getInstance().saveSmtpCredentials(emailSmtpHost, emailSmtpPort, emailRecipient, emailSmtpPassword);
        } catch (saveError: any) {
          console.error('Save Error during test:', saveError);
          // If it's just a KeyStore warning but we have fallback, we might still want to try sending
          if (saveError.message && !saveError.message.includes('KeyStore')) {
             window.alert(lang === 'ar' ? `❌ تعذر حفظ الإعدادات: ${saveError.message}` : `❌ Failed to save settings: ${saveError.message}`);
             setIsTestingEmail(false);
             return;
          }
        }
      }
      
      const success = await EmailService.getInstance().sendEmail(
        emailRecipient,
        lang === 'ar' ? 'رسالة تجربة KidGuard' : 'KidGuard Test Message',
        lang === 'ar' ? 'هذه رسالة تجريبية للتأكد من إعدادات البريد في تطبيق KidGuard.' : 'This is a test message to verify email settings in KidGuard app.',
        emailMode
      );

      if (success) {
        if (emailMode === 'MAILTO') {
          window.alert(lang === 'ar' 
            ? 'ℹ️ تم فتح تطبيق البريد وتجهيز الرسالة. يرجى الضغط على "إرسال" من داخل تطبيق البريد لإتمام العملية.' 
            : 'ℹ️ Mail app opened. Please tap "Send" inside the mail app to complete.');
        } else {
          window.alert(lang === 'ar' ? '✅ تم إرسال رسالة التجربة بنجاح!' : '✅ Test email sent successfully!');
        }
      } else {
        window.alert(lang === 'ar' ? '❌ فشل إرسال رسالة التجربة. تحقق من الإعدادات أو اتصال الإنترنت.' : '❌ Failed to send test email. Check settings or internet connection.');
      }
    } catch (error: any) {
      console.error('Test Email Error:', error);
      const errorMsg = error.message || String(error);
      let userMsg = lang === 'ar' ? '❌ حدث خطأ أثناء التجربة: ' : '❌ Error during test: ';
      
      if (errorMsg.includes('auth') || errorMsg.includes('Password')) {
        userMsg += lang === 'ar' ? 'خطأ في كلمة مرور التطبيق أو البريد.' : 'Invalid App Password or email.';
      } else if (errorMsg.includes('network') || errorMsg.includes('timeout') || errorMsg.includes('connect')) {
        userMsg += lang === 'ar' ? 'خطأ في الاتصال بالإنترنت.' : 'Internet connection error.';
      } else {
        userMsg += lang === 'ar' ? 'تأكد من إعدادات SMTP وخدمات Google.' : 'Check SMTP settings and Google services.';
      }
      
      window.alert(userMsg);
    } finally {
      setIsTestingEmail(false);
    }
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">PIN الوالد الجديد (اختياري)</label>
                <input type="password" inputMode="numeric" autoComplete="new-password" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\\D/g, '').slice(0, 8))} placeholder="4-8 أرقام" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono text-center text-sm focus:outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">تأكيد PIN الوالد</label>
                <input type="password" inputMode="numeric" autoComplete="new-password" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value.replace(/\\D/g, '').slice(0, 8))} placeholder="أعد الإدخال" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono text-center text-sm focus:outline-none focus:border-amber-500" />
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

              <div className="rounded-xl border border-blue-500/30 bg-blue-950/30 p-3 space-y-3">
                <p className="text-xs font-bold text-blue-200">تأكيد الخروج من المنطقة الآمنة</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-900/60 p-2.5 text-[11px]">عدد القراءات الموثوقة<input type="number" min={1} max={10} value={exitConfirmationsRequired} onChange={(e) => setExitConfirmationsRequired(Math.min(10, Math.max(1, Number(e.target.value) || 1)))} className="w-16 bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-center" /></label>
                  <label className="flex items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-900/60 p-2.5 text-[11px]">مدة التأكيد بالدقائق<input type="number" min={0} max={30} value={exitConfirmationDelayMinutes} onChange={(e) => setExitConfirmationDelayMinutes(Math.min(30, Math.max(0, Number(e.target.value) || 0)))} className="w-16 bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-center" /></label>
                </div>
                <p className="text-[10px] leading-5 text-blue-200/70">يمكنك الزيادة أو النقصان. يستعمل التطبيق قراءة واحدة على الأقل و10 كحد أقصى، ومدة من 0 إلى 30 دقيقة لتقليل الإنذارات الكاذبة.</p>
              </div>

              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Mail className="w-5 h-5 text-emerald-400" />
                    <div><p className="text-xs font-bold text-emerald-200">إرسال الموقع بالبريد الإلكتروني</p><p className="text-[10px] text-emerald-300/80">إرسال تلقائي عند تأكيد الخروج أو فتح تطبيق البريد يدوياً</p></div>
                  </div>
                  <div className="flex items-center gap-2"><button type="button" onClick={() => setShowEmailHelp(!showEmailHelp)} title="شرح البريد"><HelpCircle className="w-4 h-4 text-cyan-300" /></button><input type="checkbox" checked={emailEnabled} onChange={(e) => setEmailEnabled(e.target.checked)} className="w-5 h-5 rounded text-emerald-600 bg-slate-800" /></div>
                </div>
                {showEmailHelp && <div className="rounded-lg border border-cyan-400/30 bg-cyan-950/30 p-3 text-[11px] leading-5 text-cyan-100">
                  {lang === 'ar' ? 'خيار SMTP يرسل التنبيه أوتوماتيكياً في الخلفية فور وقوع الخطر، أما خيار mailto فيتطلب تدخلاً يدوياً لضغط زر إرسال. لضمان أقصى حماية، ننصح بتفعيل SMTP.' : 'SMTP sends alerts automatically in the background, while mailto requires manual intervention to press send. For maximum safety, we recommend using SMTP.'}
                </div>}
                {emailEnabled && <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2"><label className={`flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer ${emailMode === 'SMTP' ? 'border-emerald-400 bg-emerald-500/10' : 'border-slate-700 bg-slate-900/60'}`}><input type="radio" name="emailMode" checked={emailMode === 'SMTP'} onChange={() => setEmailMode('SMTP')} /><span className="text-[11px]">SMTP (تلقائي)</span></label><label className={`flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer ${emailMode === 'MAILTO' ? 'border-blue-400 bg-blue-500/10' : 'border-slate-700 bg-slate-900/60'}`}><input type="radio" name="emailMode" checked={emailMode === 'MAILTO'} onChange={() => setEmailMode('MAILTO')} /><span className="text-[11px]">mailto (يدوي)</span></label></div>
                  
                  <div className="space-y-2">
                    <input type="email" required value={emailRecipient} onChange={(e) => {
                      setEmailRecipient(e.target.value);
                      if (emailMode === 'SMTP') setEmailSender(e.target.value);
                    }} placeholder={lang === 'ar' ? 'بريد الوالد المستلم' : 'Recipient Email'} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs" />
                  </div>

                  {emailMode === 'SMTP' && <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input type="password" value={emailSmtpPassword} onChange={(e) => setEmailSmtpPassword(e.target.value)} placeholder={lang === 'ar' ? 'كلمة مرور التطبيق (16 حرفاً)' : 'App Password (16 chars)'} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs pr-8 font-mono" />
                      <Key className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-slate-500" />
                    </div>
                    <button type="button" onClick={() => setShowSmtpGuide(true)} className="px-3 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors"><HelpCircle className="w-4 h-4" /></button>
                  </div>}
                  <button
                    type="button"
                    onClick={handleTestEmail}
                    disabled={isTestingEmail}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold hover:bg-slate-750 transition-all disabled:opacity-50"
                  >
                    {isTestingEmail ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    {lang === 'ar' ? 'تجربة إرسال رسالة تحقق' : 'Send Test Verification Email'}
                  </button>
                </>}
              </div>

              {showSmtpGuide && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm">
                  <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
                    <div className="p-5 border-b border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-2.5 text-emerald-400"><Key className="w-5 h-5" /><h3 className="font-bold text-slate-100">{lang === 'ar' ? 'شرح إنشاء كلمة مرور التطبيق' : 'App Password Guide'}</h3></div>
                      <button onClick={() => setShowSmtpGuide(false)} className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 transition-colors"><X className="w-5 h-5" /></button>
                    </div>
                    <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                      <div className="rounded-2xl bg-amber-500/10 border border-amber-500/20 p-4 mb-2">
                        <p className="text-xs leading-6 text-amber-200 font-bold">
                          {lang === 'ar' ? '⚠️ تنبيه هام: هذه ليست كلمة سر الإيميل العادية الخاصة بك.' : '⚠️ Important: This is NOT your regular email password.'}
                        </p>
                        <p className="text-[10px] leading-5 text-amber-300/80 mt-1">
                          {lang === 'ar' ? 'تتطلب Google استخدام «كلمة مرور تطبيق» خفية مكونة من 16 حرفاً لإرسال الرسائل بأمان دون مشاركة كلمة مرور حسابك الأصلية.' : 'Google requires a hidden 16-character "App Password" to send emails securely without sharing your main account password.'}
                        </p>
                      </div>
                      {[
                        { step: 1, ar: 'تفعيل التحقق بخطوتين', en: 'Enable 2-Step Verification', descAr: 'تأكد من تفعيل (2-Step Verification) في حساب Google الخاص بك.', descEn: 'Make sure 2-Step Verification is enabled in your Google Account.' },
                        { step: 2, ar: 'فتح صفحة كلمات مرور التطبيقات', en: 'Open App Passwords Page', descAr: 'انتقل إلى صفحة App Passwords في أمان حساب Google.', descEn: 'Go to the App Passwords page in your Google Security settings.' },
                        { step: 3, ar: 'إنشاء كلمة مرور جديدة', en: 'Create New Password', descAr: 'اكتب اسم التطبيق (مثال: حماية الهاتف) واضغط على زر إنشاء (Create).', descEn: 'Type app name (e.g., Phone Guard) and click Create.' },
                        { step: 4, ar: 'نسخ الرمز في التطبيق', en: 'Copy Code to App', descAr: 'انسخ الرمز المكون من 16 حرفاً باللون الأصفر والصقه في حقل كلمة المرور بالتطبيق.', descEn: 'Copy the 16-character yellow code and paste it into the app password field.' }
                      ].map((s) => (
                        <div key={s.step} className="flex gap-4 p-3 rounded-2xl bg-slate-950/40 border border-slate-800/50">
                          <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-sm shrink-0">{s.step}</div>
                          <div><h4 className="text-xs font-bold text-emerald-200 mb-1">{lang === 'ar' ? s.ar : s.en}</h4><p className="text-[10px] leading-5 text-slate-400">{lang === 'ar' ? s.descAr : s.descEn}</p></div>
                        </div>
                      ))}
                      <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full p-3 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 text-xs font-bold hover:bg-cyan-500/20 transition-all mt-2">
                        {lang === 'ar' ? 'الانتقال لصفحة كلمات مرور تطبيقات Google' : 'Go to Google App Passwords Page'} <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                    <div className="p-5 bg-slate-950/50">
                      <button onClick={() => setShowSmtpGuide(false)} className="w-full py-3.5 rounded-2xl bg-cyan-500 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/20 hover:scale-[1.02] active:scale-95 transition-all">
                        {lang === 'ar' ? 'فهمت ذلك، العودة للإعدادات' : 'Got it, back to settings'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <label className="flex items-center justify-between p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 cursor-pointer hover:border-amber-400 transition-colors">
                <div className="flex items-center gap-2.5">
                  <Smartphone className="w-4 h-4 text-amber-400" />
                  <div>
                    <span className="text-xs font-bold text-amber-200 block">تنبيه البطارية المنخفضة عبر SMS</span>
                    <span className="text-[10px] text-amber-200/70 block">إرسال تنبيه مرة كل 6 ساعات عند بلوغ العتبة</span>
                  </div>
                </div>
                <input type="checkbox" checked={batterySmsEnabled} onChange={(e) => setBatterySmsEnabled(e.target.checked)} className="w-4 h-4 rounded text-amber-600 bg-slate-800 border-amber-700" />
              </label>

              {batterySmsEnabled && (
                <label className="flex items-center justify-between p-3 rounded-xl bg-slate-900/80 border border-slate-700/60">
                  <span className="text-xs font-bold text-slate-200">عتبة تنبيه البطارية (%)</span>
                  <input type="number" min={5} max={50} value={batteryAlertThreshold} onChange={(e) => setBatteryAlertThreshold(Math.min(50, Math.max(5, Number(e.target.value) || 15)))} className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-center text-sm font-mono text-white" />
                </label>
              )}

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


          {/* SECTION 4: Privacy & data controls */}
          <section className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-4 sm:p-5 space-y-3">
            <h3 className="text-sm font-bold text-sky-400 border-b border-slate-700/60 pb-2.5">
              {lang === 'ar' ? 'الخصوصية وإدارة البيانات' : 'Privacy & Data Controls'}
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              {lang === 'ar'
                ? 'يعمل KidGuard محليًا عند عدم توفر الخادم. لا تصدّر هذه الأداة أسرار PIN أو رموز الاقتران. احذف البيانات عند فقدان الجهاز أو قبل تسليمه لشخص آخر.'
                : 'KidGuard works locally when the server is unavailable. Exports exclude PIN and pairing secrets. Delete data before handing the device to someone else.'}
            </p>
            {privacyStatus && <p className="text-xs text-emerald-200 bg-emerald-950/40 border border-emerald-800/60 rounded-xl p-3">{privacyStatus}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button type="button" onClick={handleExportData} className="py-2.5 rounded-xl bg-sky-600/20 border border-sky-500/40 text-sky-200 text-xs font-bold hover:bg-sky-600/30">
                {lang === 'ar' ? 'تصدير بيانات منقّحة' : 'Export redacted data'}
              </button>
              <button type="button" onClick={handleDeleteLocalData} className="py-2.5 rounded-xl bg-red-600/20 border border-red-500/40 text-red-200 text-xs font-bold hover:bg-red-600/30">
                {lang === 'ar' ? 'حذف كل البيانات المحلية' : 'Delete all local data'}
              </button>
            </div>
          </section>

          {/* SECTION 5: About, Dedication & Optional Support */}
          <section className="relative overflow-hidden bg-gradient-to-br from-amber-950/80 via-slate-900 to-emerald-950/50 border-2 border-amber-300/30 ring-1 ring-emerald-400/20 rounded-3xl p-5 sm:p-6 text-center shadow-2xl shadow-amber-950/40">
            <div className="absolute inset-1 rounded-[1.35rem] border border-white/5 pointer-events-none" />
            <div className="absolute -top-16 -left-12 w-44 h-44 rounded-full bg-amber-300/15 blur-3xl" />
            <div className="absolute -bottom-20 -right-12 w-48 h-48 rounded-full bg-emerald-300/15 blur-3xl" />
            <div className="relative space-y-4" dir="rtl">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-[10px] font-bold tracking-wide text-amber-100">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-sm shadow-emerald-300" />
                مساحة تقدير ودعم اختيارية
              </div>
              <div className="mx-auto flex w-14 h-14 items-center justify-center rounded-2xl border border-amber-200/50 bg-gradient-to-br from-amber-300/25 to-amber-500/5 shadow-lg shadow-amber-950/50 rotate-3">
                <Heart className="w-7 h-7 text-amber-200 -rotate-3" fill="currentColor" />
              </div>
              <div>
                <h3 className="text-lg font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-l from-amber-100 via-yellow-200 to-emerald-200">حول KidGuard</h3>
                <p className="mt-1 text-[11px] leading-5 text-slate-300">تطبيق مجاني للمساعدة في تعزيز سلامة الأطفال، بلا إعلانات أو رسوم اشتراك.</p>
              </div>

              <div className="mx-auto max-w-lg rounded-2xl border border-amber-200/25 bg-gradient-to-br from-amber-400/10 to-slate-950/40 px-4 py-4 space-y-2 text-sm leading-7 text-slate-100 shadow-inner shadow-amber-950/30">
                <div className="flex items-center justify-center gap-2 text-amber-200">
                  <span className="h-px w-10 bg-gradient-to-l from-transparent to-amber-300/60" />
                  <p className="font-bold">إهداء</p>
                  <span className="h-px w-10 bg-gradient-to-r from-transparent to-amber-300/60" />
                </div>
                <p className="text-slate-200">إلى أمي وإخوتي، وأصدقائي، وجميع المسلمين الموحّدين على نهج السلف الصالح.</p>
              </div>

              <div className="mx-auto max-w-lg rounded-2xl border border-emerald-300/25 bg-gradient-to-br from-emerald-400/10 to-slate-950/40 px-4 py-4 text-right space-y-2 shadow-inner shadow-emerald-950/25">
                <p className="text-xs font-bold text-emerald-200">رسالة مساعدة</p>
                <p className="text-[11px] leading-6 text-slate-300">
                  من أراد دعم تطوير التطبيق أو تقديم مساعدة مالية اختيارية، يمكنه التواصل مباشرة مع المصمم. المساعدة ليست شرطاً لاستخدام التطبيق.
                </p>
                <p className="text-[11px] font-bold text-amber-200 pt-1">المصمم: بن جداه توفيق</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left border-t border-white/10 pt-1" dir="ltr">
                <a
                  href="mailto:toufik.bendjeddah@gmail.com,toufik155@gmail.com"
                  className="flex items-center gap-2 rounded-2xl border border-sky-300/30 bg-gradient-to-br from-sky-400/15 to-slate-950/30 px-3 py-3 text-[10px] text-sky-100 shadow-lg shadow-sky-950/20 hover:border-sky-200/50 hover:bg-sky-400/20 transition-colors"
                >
                  <Mail className="w-4 h-4 text-sky-300 shrink-0" />
                  <span className="min-w-0 break-all">toufik.bendjeddah@gmail.com<br />toufik155@gmail.com</span>
                </a>
                <a
                  href="https://wa.me/213541558675"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 rounded-2xl border border-emerald-300/30 bg-gradient-to-br from-emerald-400/15 to-slate-950/30 px-3 py-3 text-[10px] text-emerald-100 shadow-lg shadow-emerald-950/20 hover:border-emerald-200/50 hover:bg-emerald-400/20 transition-colors"
                >
                  <MessageCircle className="w-4 h-4 text-emerald-300 shrink-0" />
                  <span>WhatsApp<br /><strong>+213 541 558 675</strong></span>
                </a>
              </div>
            </div>
          </section>

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

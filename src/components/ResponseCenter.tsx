import React, { useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, Copy, ExternalLink, ShieldCheck } from 'lucide-react';
import { LastKnownLocation, ProtectionIncident } from '../types';

interface ResponseCenterProps {
  lastKnownLocation: LastKnownLocation | null;
  activeIncident: ProtectionIncident | null;
  childName: string;
}

export const ResponseCenter: React.FC<ResponseCenterProps> = ({
  lastKnownLocation,
  activeIncident,
  childName,
}) => {
  const [shareStatus, setShareStatus] = useState('');
  const [showSafety, setShowSafety] = useState(false);

  const locationText = useMemo(() => {
    if (!lastKnownLocation) return 'آخر موقع موثوق غير متوفر.';
    const { latitude, longitude, accuracy } = lastKnownLocation.point;
    return `${childName} — آخر موقع موثوق: ${latitude.toFixed(5)}, ${longitude.toFixed(5)} (دقة تقريبية ±${Math.round(accuracy)}م). ${lastKnownLocation.isStale ? 'الموقع قديم وليس حيًا.' : 'تم الالتقاط حديثًا.'}`;
  }, [childName, lastKnownLocation]);

  const shareTemporaryLocation = async () => {
    const text = `${locationText}\nالحالة: ${activeIncident ? 'مراقبة حادثة' : 'مراقبة عادية'}\nتنبيه: هذه مشاركة يدوية لآخر موقع محفوظ وليست تتبعًا حيًا.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'KidGuard — آخر موقع موثوق', text });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      } else {
        window.prompt('انسخ النص يدويًا:', text);
      }
      setShareStatus('تم تجهيز المشاركة لمدة قصيرة؛ تحقّق من المستلم قبل الإرسال.');
    } catch {
      setShareStatus('أُلغيت المشاركة ولم تُرسل أي بيانات.');
    }
  };

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5 text-white shadow-xl space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-sky-500/15 text-sky-300 border border-sky-500/30"><ShieldCheck className="w-5 h-5" /></div>
          <div>
            <h2 className="text-base font-black">مركز إجراءات الاستجابة</h2>
            <p className="text-[11px] text-slate-400">مساعدة عملية، وليست بديلًا عن الاتصال بالجهات المختصة.</p>
          </div>
        </div>
        {activeIncident && <span className="text-[10px] px-2 py-1 rounded-full bg-amber-500/15 text-amber-200 border border-amber-500/30">مراقبة حادثة</span>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button type="button" onClick={shareTemporaryLocation} disabled={!lastKnownLocation} className="flex items-center justify-center gap-2 py-3 rounded-xl bg-sky-600/20 border border-sky-500/40 text-sky-100 text-xs font-bold disabled:opacity-40">
          {navigator.share ? <ExternalLink className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          مشاركة آخر موقع موثوق
        </button>
        <button type="button" onClick={() => setShowSafety((value) => !value)} className="flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-100 text-xs font-bold">
          <BookOpen className="w-4 h-4" /> تعليمات السلامة
        </button>
      </div>

      {shareStatus && <p className="text-[11px] text-sky-200 bg-sky-950/40 border border-sky-900 rounded-xl p-3">{shareStatus}</p>}
      {showSafety && (
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-2 text-xs text-slate-300 leading-relaxed">
          <p className="flex gap-2"><AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />إذا كان الخطر حقيقيًا، اتصل فورًا بالشرطة أو خدمات الطوارئ المحلية، ولا تعتمد على التطبيق وحده.</p>
          <p>تحقق من آخر موقع ووقت الالتقاط، اتصل بالطفل أو المدرسة، وشارك البيانات يدويًا فقط مع شخص موثوق.</p>
          <p>لا تواجه شخصًا مشتبهًا به ولا تنشر موقع الطفل علنًا. احتفظ بسجل الأوقات والرسائل للجهات المختصة.</p>
        </div>
      )}
    </section>
  );
};

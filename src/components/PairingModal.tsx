import React, { useState } from 'react';
import { Smartphone, ShieldCheck, QrCode, CheckCircle2, RefreshCw } from 'lucide-react';
import { DevicePairing } from '../types';
import { Language, translations } from '../translations';

interface PairingModalProps {
  pairingInfo: DevicePairing;
  onGenerateNewCode: () => void;
  onPairWithCode: (code: string) => boolean;
  lang: Language;
}

export const PairingModal: React.FC<PairingModalProps> = ({
  pairingInfo,
  onGenerateNewCode,
  onPairWithCode,
  lang,
}) => {
  const t = translations[lang];
  const [inputCode, setInputCode] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handlePairSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const success = onPairWithCode(inputCode);
    if (success) {
      setSuccessMsg(t.devicePaired);
      setInputCode('');
    } else {
      setErrorMsg('رمز الاقتران غير صحيح. يرجى التأكد وإعادة المحاولة.');
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white space-y-6">
      <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
        <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
          <Smartphone className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-lg font-bold">{t.pairingTitle}</h2>
          <p className="text-xs text-slate-400">
            ربط آمن بين هاتف الوالد وهاتف الطفل لمناعة البيانات ومنع الاختراق
          </p>
        </div>
      </div>

      {/* Paired Status Card */}
      <div
        className={`p-4 rounded-xl border flex items-center justify-between ${
          pairingInfo.isPaired
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
            : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
        }`}
      >
        <div className="flex items-center gap-3">
          {pairingInfo.isPaired ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-400" />
          ) : (
            <ShieldCheck className="w-6 h-6 text-amber-400" />
          )}
          <div>
            <p className="font-bold text-sm">
              {pairingInfo.isPaired ? t.devicePaired : t.deviceNotPaired}
            </p>
            <p className="text-xs opacity-80">
              معرف جهاز الطفل: {pairingInfo.kidId}
            </p>
          </div>
        </div>
      </div>

      {/* Pairing Code Display & QR */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center pt-2">
        {/* Code Generator Display */}
        <div className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700 text-center space-y-3">
          <p className="text-xs text-slate-400 font-medium">{t.pairingCode}</p>
          <div className="text-3xl font-extrabold tracking-widest font-mono text-emerald-400 bg-slate-900 py-3 rounded-xl border border-slate-700">
            {pairingInfo.pairingCode}
          </div>
          <button
            type="button"
            onClick={onGenerateNewCode}
            className="text-xs text-slate-300 hover:text-white flex items-center justify-center gap-1.5 mx-auto py-1 px-3 rounded-lg bg-slate-700/50 hover:bg-slate-700"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            توليد رمز جديد
          </button>
        </div>

        {/* Enter Code Form */}
        <form onSubmit={handlePairSubmit} className="space-y-4">
          <p className="text-xs text-slate-300 leading-relaxed">
            {t.scanCodeInfo}
          </p>

          <div>
            <input
              type="text"
              maxLength={6}
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
              placeholder="000000"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-center text-xl font-bold font-mono tracking-widest text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
            />
          </div>

          {errorMsg && <p className="text-xs text-red-400 font-semibold">{errorMsg}</p>}
          {successMsg && <p className="text-xs text-emerald-400 font-semibold">{successMsg}</p>}

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-600/20 transition-all"
          >
            <QrCode className="w-4 h-4" />
            {t.pairDeviceBtn}
          </button>
        </form>
      </div>
    </div>
  );
};

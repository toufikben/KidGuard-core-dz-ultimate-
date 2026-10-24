// src/components/ChildScreen.tsx — the children the server says this guardian may see (Task 9).
// Props only: App owns the controller, the selection and the refresh call. Every sentence comes from
// the trilingual catalog (R-M1-18), so this file holds no Arabic codepoint and no literal RTL; the
// label on each row is `child.label`, which the state layer built from the server device name and the
// measured reading — never from a local childName setting.
import React from 'react';
import { Baby, RefreshCw } from 'lucide-react';
import { translate, type CatalogLang } from '../translations/catalog.ts';
import { deviceDisplayName, type Child, type ChildFreshness } from '../state/children.ts';

export type ChildScreenProps = {
  lang: CatalogLang;
  loading: boolean;
  error: string | null;
  children: Child[];
  selectedId: number | null;
  onSelect: (deviceId: number) => void;
  onRefresh: () => void;
};

const FRESHNESS_KEY: Record<Exclude<ChildFreshness, null> | 'none', string> = {
  fresh: 'children.freshness.fresh',
  aging: 'children.freshness.aging',
  silent: 'children.freshness.silent',
  none: 'children.freshness.none',
};

export const ChildScreen: React.FC<ChildScreenProps> = ({
  lang,
  loading,
  error,
  children,
  selectedId,
  onSelect,
  onRefresh,
}) => {
  const t = (key: string, vars?: Record<string, string | number>) => translate(key, lang, vars);

  return (
    <section dir={lang === 'ar' ? 'rtl' : 'ltr'} className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      <header className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Baby className="w-5 h-5 text-emerald-400" />
            {t('children.title')}
          </h1>
          <p className="text-[11px] text-slate-400 mt-1">{t('children.serverShared')}</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold hover:bg-slate-700 disabled:opacity-40"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {t('children.refresh')}
        </button>
      </header>

      {error ? (
        <p role="alert" className="text-xs text-amber-200 bg-amber-950/40 border border-amber-700/40 rounded-xl px-3 py-2">
          {error}
        </p>
      ) : null}

      {loading ? <p className="text-xs text-slate-400">{t('children.loading')}</p> : null}

      {!loading && !error && children.length === 0 ? (
        <p className="text-sm text-slate-400 bg-slate-900 border border-slate-800 rounded-2xl px-4 py-6 text-center">
          {t('children.noneShared')}
        </p>
      ) : null}

      <ul className="space-y-2">
        {children.map((child) => {
          const selected = child.device.id === selectedId;
          const freshness = child.freshness ?? 'none';
          // R-M1-26: the serial is never shown whole — only its last four characters identify it.
          const tail = typeof child.device.uniqueId === 'string' ? child.device.uniqueId.trim().slice(-4) : '';
          return (
            <li key={child.device.id}>
              <button
                type="button"
                onClick={() => onSelect(child.device.id)}
                aria-pressed={selected}
                className={`w-full text-start rounded-2xl border px-4 py-3 transition-colors ${
                  selected
                    ? 'bg-emerald-600/15 border-emerald-500/60'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-white truncate">
                    {deviceDisplayName(child.device, lang)}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-bold text-slate-300 bg-slate-800 border border-slate-700 rounded-full px-2 py-0.5">
                      {t(FRESHNESS_KEY[freshness])}
                    </span>
                    {selected ? (
                      <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/40 rounded-full px-2 py-0.5">
                        {t('children.selected')}
                      </span>
                    ) : null}
                  </span>
                </span>
                <span className="mt-1 block text-xs text-slate-300">{child.label}</span>
                {tail !== '' ? (
                  <span className="mt-1 block text-[10px] font-mono text-slate-500" dir="ltr">
                    {`…${tail}`}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default ChildScreen;

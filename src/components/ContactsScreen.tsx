// src/components/ContactsScreen.tsx — who is linked to the selected child (Task 9). Props and
// callbacks only: App reads `/permissions` + `/users` and calls assign/unassign; the real write gate
// is identity() inside the state layer, so `isAdmin` here is only the on-screen half (the same
// server-named bit the session holds). Every sentence is a catalog key (R-M1-18) and the
// single-guardian notice is NOT a disabled state — §5.12 says no vote and time-based escalation, not
// a broken screen.
import React from 'react';
import { Info, RefreshCw, UserMinus, UserPlus, Users } from 'lucide-react';
import { translate, type CatalogLang } from '../translations/catalog.ts';
import type { Child } from '../state/children.ts';
import type { ServerUser } from '../services/traccar/types.ts';

export type ContactsScreenProps = {
  lang: CatalogLang;
  children: Child[];
  selectedId: number | null;
  onSelectChild: (deviceId: number) => void;
  guardians: ServerUser[];
  candidates: ServerUser[];
  summary: { count: number; single: boolean };
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  onAssign: (userId: number) => void;
  onUnassign: (userId: number) => void;
  onRefresh: () => void;
};

// The server may return a user without a name; then the email is the honest identifier and no name
// is invented. When both exist the name leads and the email stays visible.
function displayName(user: ServerUser): string {
  const name = typeof user.name === 'string' ? user.name.trim() : '';
  return name === '' ? user.email : name;
}

export const ContactsScreen: React.FC<ContactsScreenProps> = ({
  lang,
  children,
  selectedId,
  onSelectChild,
  guardians,
  candidates,
  summary,
  loading,
  error,
  isAdmin,
  onAssign,
  onUnassign,
  onRefresh,
}) => {
  const t = (key: string, vars?: Record<string, string | number>) => translate(key, lang, vars);
  const selectedChild = children.find((child) => child.device.id === selectedId) ?? children[0] ?? null;

  return (
    <section dir={lang === 'ar' ? 'rtl' : 'ltr'} className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-4">
      <header className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-400" />
            {t('contacts.title')}
          </h1>
          <p className="text-[11px] text-slate-400 mt-1">{t('contacts.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-xs font-bold hover:bg-slate-700"
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

      {children.length === 0 ? (
        <p className="text-sm text-slate-400 bg-slate-900 border border-slate-800 rounded-2xl px-4 py-6 text-center">
          {t('children.noneShared')}
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-300">{t('contacts.child')}</p>
          <div className="flex flex-wrap gap-1.5">
            {children.map((child) => {
              const selected = child.device.id === selectedChild?.device.id;
              return (
                <button
                  key={child.device.id}
                  type="button"
                  onClick={() => onSelectChild(child.device.id)}
                  aria-pressed={selected}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                    selected
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {child.device.name && child.device.name.trim() !== ''
                    ? child.device.name
                    : t('children.unnamedDevice')}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {selectedChild ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
            <h2 className="text-sm font-bold text-white">{t('contacts.guardians')}</h2>
            <span className="text-[10px] font-mono text-slate-400">{t('contacts.count', { count: summary.count })}</span>
          </div>

          {summary.single ? (
            <p role="status" className="flex items-start gap-2 text-xs text-sky-200 bg-sky-950/40 border border-sky-700/40 rounded-xl px-3 py-2">
              <Info className="w-4 h-4 shrink-0 text-sky-300" />
              <span>{t('contacts.singleGuardian')}</span>
            </p>
          ) : null}

          {loading ? <p className="text-xs text-slate-400">{t('contacts.loading')}</p> : null}

          {!loading && guardians.length === 0 ? (
            <p className="text-xs text-slate-400">{t('contacts.none')}</p>
          ) : null}

          <ul className="space-y-1.5">
            {guardians.map((guardian) => (
              <li
                key={guardian.id}
                className="flex items-center justify-between gap-3 bg-slate-800/70 border border-slate-700 rounded-xl px-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-white truncate">{displayName(guardian)}</span>
                  <span className="block text-[10px] font-mono text-slate-400 truncate" dir="ltr">
                    {guardian.email}
                  </span>
                </span>
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => onUnassign(guardian.id)}
                    className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-2 py-1 hover:bg-red-500/20"
                  >
                    <UserMinus className="w-3.5 h-3.5" />
                    {t('contacts.remove')}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>

          {!isAdmin ? (
            <p className="text-[11px] text-slate-400 bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2">
              {t('contacts.viewerReadOnly')}
            </p>
          ) : (
            <div className="space-y-2 border-t border-slate-800 pt-3">
              <p className="text-xs font-semibold text-slate-300">{t('contacts.available')}</p>
              {candidates.length === 0 ? (
                <p className="text-[11px] text-slate-400">{t('contacts.noCandidates')}</p>
              ) : (
                <ul className="space-y-1.5">
                  {candidates.map((candidate) => (
                    <li
                      key={candidate.id}
                      className="flex items-center justify-between gap-3 bg-slate-800/70 border border-slate-700 rounded-xl px-3 py-2"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-white truncate">{displayName(candidate)}</span>
                        <span className="block text-[10px] font-mono text-slate-400 truncate" dir="ltr">
                          {candidate.email}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => onAssign(candidate.id)}
                        className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-2 py-1 hover:bg-emerald-500/20"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        {t('contacts.add')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
};

export default ContactsScreen;

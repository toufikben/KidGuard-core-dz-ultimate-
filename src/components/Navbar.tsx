import React from 'react';
import { Shield, Baby, LayoutDashboard, Users, Settings, TriangleAlert } from 'lucide-react';
import { Language, translations } from '../translations';
import { translate } from '../translations/catalog.ts';

// R-M1-23 / R-M1-29: the four guardian views. This is navigation: App always renders the guardian
// shell and no branch here reads a device role. `alerts` is the Task 10 log — a view like any other,
// not a bell and not a notification channel.
export type GuardianView = 'dashboard' | 'children' | 'contacts' | 'alerts';

const VIEWS: { value: GuardianView; key: string; Icon: typeof Shield }[] = [
  { value: 'dashboard', key: 'tabs.dashboard', Icon: LayoutDashboard },
  { value: 'children', key: 'tabs.children', Icon: Baby },
  { value: 'contacts', key: 'tabs.contacts', Icon: Users },
  { value: 'alerts', key: 'tabs.alerts', Icon: TriangleAlert },
];

interface NavbarProps {
  view: GuardianView;
  onViewChange: (view: GuardianView) => void;
  lang: Language;
  setLang: (lang: Language) => void;
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  isOnline: boolean;
  onOpenSettings?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  view,
  onViewChange,
  lang,
  isOnline,
  onOpenSettings,
}) => {
  const t = translations[lang];

  return (
    <header className="bg-slate-900/95 backdrop-blur-md text-white border-b border-slate-800/80 sticky top-0 z-50 shadow-lg select-none">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2">
        
        {/* Custom Stylized KidGuard Brand Icon */}
        <div className="flex items-center shrink-0 select-none cursor-pointer" title="KidGuard DZ">
          <div className="relative group flex items-center justify-center">
            {/* Ambient Backlight Glow */}
            <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-teal-400 rounded-2xl blur-sm opacity-60 group-hover:opacity-100 transition-opacity" />
            
            {/* Main Shield Icon Frame */}
            <div className="relative px-3 py-1.5 rounded-xl bg-slate-900 border border-emerald-500/50 flex items-center gap-2 shadow-xl">
              <div className="relative flex items-center justify-center text-emerald-400">
                <Shield className="w-6 h-6 text-emerald-400 fill-emerald-500/20 stroke-[2.2]" />
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-emerald-300">
                  👦
                </span>
              </div>
              
              {/* Monogram Badge inside icon frame */}
              <div className="flex items-center gap-1">
                <span className="text-xs font-black tracking-widest text-emerald-400 font-mono">
                  KG
                </span>
                <span className="text-[9px] font-black font-mono text-amber-400 bg-amber-400/10 px-1 py-0.2 rounded border border-amber-400/30">
                  DZ
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Unified Top Controls Toolbar */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          
          {/* Online Indicator Badge */}
          <div className="hidden xl:flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700/60">
            <span
              className={`w-2 h-2 rounded-full ${
                isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span>{isOnline ? translate('nav.online', lang) : translate('nav.offline', lang)}</span>
          </div>

          {/* Guardian view switcher — dashboard | children | contacts | alerts (no role branch, R-M1-29) */}
          <div className="bg-slate-800/90 p-0.5 rounded-lg flex items-center border border-slate-700/80 h-8 sm:h-9 shrink-0">
            {VIEWS.map(({ value, key, Icon }) => (
              <button
                key={value}
                onClick={() => onViewChange(value)}
                aria-pressed={view === value}
                aria-label={translate(key, lang)}
                className={`h-7 sm:h-8 flex items-center gap-1 px-2.5 sm:px-3 rounded-md text-xs font-bold transition-all ${
                  view === value
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{translate(key, lang)}</span>
              </button>
            ))}
          </div>

          {/* Settings Button - Permanently visible in Navbar for all roles and tabs */}
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 hover:border-amber-400 flex items-center justify-center transition-all active:scale-95 shadow-md group shrink-0"
              title={t.tabSettings || 'الإعدادات'}
              aria-label={t.tabSettings || 'الإعدادات'}
            >
              <Settings className="w-4 h-4 text-amber-400 group-hover:rotate-90 transition-transform duration-300" />
            </button>
          )}

        </div>
      </div>
    </header>
  );
};

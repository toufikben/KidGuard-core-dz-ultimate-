// src/components/AlertsLog.tsx — the guardian's alert log, read from the server's live channel.
//
// What this screen refuses to say:
//  - It is not a history. The log exists only in this session's memory (R-M1-32), so the since-opened
//    badge is always visible and a reopened screen starts empty. No browser storage and no historical
//    request exist anywhere in this file.
//  - A dropped live channel is announced: the connection badge names the state and the fallback
//    cadence, the last known reading is labelled with noDataLabel(), and no copy calls anything safe
//    (R-M1-34).
//  - P2 stays an in-app sentence. No bell, no call and no police word is imported or rendered
//    (R-M1-35); the icons below are chosen from that constraint, not for decoration.
//  - `attributes.message` is unmeasured and never read (R-M1-33). Every row is built from measured
//    fields only: type, tier, device identity and the counted readings behind a confirmed exit.
//  - All visible copy goes through the catalog (R-M1-18), and a device is named by the shared helper
//    with at most the last four serial characters (R-M1-36).
import React, { useEffect, useState } from 'react';
import { Info, Siren, TriangleAlert, WifiOff } from 'lucide-react';
import { translate, type CatalogLang } from '../translations/catalog.ts';
import { noDataLabel } from '../services/traccar/positions.ts';
import { deviceDisplayName } from '../state/children.ts';
import {
  eventLog,
  pendingAck,
  type AlertTier,
  type LoggedEvent,
} from '../services/traccar/events.ts';
import { LIVE_POLL_INTERVAL_MS, connectLive, type ConnectionState, type LiveHandle } from '../services/traccar/socket.ts';
import type { ServerDevice } from '../services/traccar/types.ts';

const TIER_ICON: Record<AlertTier, typeof Info> = {
  P0: Siren,
  P1: TriangleAlert,
  P2: WifiOff,
  none: Info,
};

const TYPE_KEY: Record<string, string> = {
  alarm: 'alerts.type.alarm',
  geofenceExit: 'alerts.type.geofenceExit',
  deviceOffline: 'alerts.type.deviceOffline',
};

const TIER_STYLE: Record<AlertTier, string> = {
  P0: 'bg-red-500/15 text-red-300 border-red-500/40',
  P1: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  P2: 'bg-slate-700/40 text-slate-300 border-slate-600/50',
  none: 'bg-slate-800 text-slate-400 border-slate-700',
};

export type AlertsLogProps = {
  lang: CatalogLang;
  entries: readonly LoggedEvent[];
  devices: readonly ServerDevice[];
  connection?: ConnectionState;
  // The announced fallback cadence, in seconds. Defaults to the live channel's own constant.
  pollIntervalSeconds?: number;
  // Accepted as the screen's clock seam; rows are described by measured fields only, so the current
  // render never needs to turn a timestamp into a confident sentence.
  now?: number;
  onAcknowledge?: (eventId: number) => void;
};

function tailOf(device: ServerDevice | undefined): string {
  const uniqueId = typeof device?.uniqueId === 'string' ? device.uniqueId.trim() : '';
  return uniqueId === '' ? '' : `…${uniqueId.slice(-4)}`;
}

// A measured event's own timestamp, rendered as a fixed UTC clock so no locale turns it into
// Arabic-Indic digits or an ambiguous string. An unreadable value renders nothing at all.
function clockOf(eventTime: unknown): string {
  if (typeof eventTime !== 'string') return '';
  const ms = Date.parse(eventTime);
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(11, 19) : '';
}

function connectionLine(connection: ConnectionState, seconds: number, lang: CatalogLang): string {
  if (connection === 'fallback') return translate('alerts.connection.fallback', lang, { seconds });
  return translate(`alerts.connection.${connection}`, lang);
}

export const AlertsLog: React.FC<AlertsLogProps> = (props) => {
  const { lang, entries, devices, onAcknowledge } = props;
  const connection: ConnectionState = props.connection ?? 'connecting';
  const requested = props.pollIntervalSeconds;
  const seconds = typeof requested === 'number' && Number.isFinite(requested) && requested > 0
    ? Math.round(requested)
    : LIVE_POLL_INTERVAL_MS / 1000;
  const pending = pendingAck(entries);
  const byId = new Map<number, ServerDevice>(
    devices.map((device): [number, ServerDevice] => [device.id, device]),
  );
  // A live channel may still be waiting for its first frame; every other state is honestly labelled
  // with the no-data sentence, never with a safety claim.
  const showLastKnown = connection !== 'live';

  return (
    <section dir={lang === 'ar' ? 'rtl' : 'ltr'} className="mx-auto w-full max-w-3xl px-3 py-4 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-white">{translate('alerts.title', lang)}</h2>
          <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-0.5 text-[10px] font-bold text-slate-300">
            {translate('alerts.sinceOpened', lang)}
          </span>
        </div>
        <span
          className={`rounded-full border px-3 py-1 text-[11px] font-bold ${
            connection === 'live'
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              : 'border-amber-500/40 bg-amber-500/10 text-amber-200'
          }`}
        >
          {connectionLine(connection, seconds, lang)}
        </span>
      </header>

      {pending.length > 0 ? (
        <p
          role="status"
          className="mt-3 rounded-xl border border-amber-600/50 bg-amber-950/40 px-3 py-2 text-sm font-bold text-amber-200"
        >
          {translate('alerts.pendingAck', lang)}
        </p>
      ) : null}

      {showLastKnown ? (
        <p className="mt-3 text-xs text-slate-400">{noDataLabel(lang)}</p>
      ) : null}

      {entries.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-6 text-center text-sm text-slate-400">
          {translate('alerts.empty', lang)}
        </p>
      ) : (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
            {translate('alerts.serverEvents', lang)}
          </h3>
          <ul className="space-y-2">
            {entries.map((entry) => {
              const tier = entry.tier;
              const Icon = TIER_ICON[tier];
              const device = byId.get(entry.event.deviceId);
              const name = device ? deviceDisplayName(device, lang) : translate('children.unnamedDevice', lang);
              const tail = tailOf(device);
              const clock = clockOf(entry.event.eventTime);
              const evidence = typeof entry.evidenceCount === 'number' && Number.isFinite(entry.evidenceCount)
                ? entry.evidenceCount
                : null;
              return (
                <li
                  key={`${entry.event.id}:${entry.event.type}`}
                  className="rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <Icon className={`h-4 w-4 ${tier === 'P0' ? 'text-red-300' : tier === 'P1' ? 'text-amber-300' : 'text-slate-400'}`} />
                      <span className="text-sm font-bold text-white">
                        {translate(TYPE_KEY[entry.event.type] ?? 'alerts.type.other', lang)}
                      </span>
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${TIER_STYLE[tier]}`}>
                      {translate(`alerts.tier.${tier.toLowerCase()}`, lang)}
                    </span>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-300">
                    <span className="font-semibold">{name}</span>
                    {tail !== '' ? <span className="font-mono text-slate-500" dir="ltr">{tail}</span> : null}
                    {clock !== '' ? <span className="font-mono text-slate-500" dir="ltr">{clock}</span> : null}
                    {entry.acknowledged ? (
                      <span className="text-emerald-300">{translate('alerts.acknowledged', lang)}</span>
                    ) : null}
                  </div>

                  {evidence !== null ? (
                    <p className="mt-1 text-xs text-slate-400">
                      {translate('alerts.exitEvidence', lang, { count: evidence })}
                    </p>
                  ) : null}

                  {onAcknowledge && (tier === 'P0' || tier === 'P1') && !entry.acknowledged ? (
                    <button
                      type="button"
                      onClick={() => onAcknowledge(entry.event.id)}
                      className="mt-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-bold text-slate-200"
                    >
                      {translate('alerts.acknowledge', lang)}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
};

export type LiveAlertsState = {
  entries: readonly LoggedEvent[];
  connection: ConnectionState;
};

// The screen's one side effect: while the alerts view is open, hold a live channel and fold its
// events and readings into a fresh in-memory log. Leaving the view closes the handle, which closes
// the socket, cancels the fallback timer and revokes the token exactly once (R-M1-34). Nothing here
// writes a store, and no failure message is read or printed.
export function useLiveAlerts(enabled: boolean): LiveAlertsState {
  const [entries, setEntries] = useState<readonly LoggedEvent[]>([]);
  const [connection, setConnection] = useState<ConnectionState>(enabled ? 'connecting' : 'closed');

  useEffect(() => {
    if (!enabled) {
      setConnection('closed');
      return undefined;
    }

    const log = eventLog();
    let alive = true;
    let handle: LiveHandle | null = null;
    const publish = () => {
      if (alive) setEntries(log.entries.slice());
    };

    setEntries([]);
    setConnection('connecting');

    connectLive({
      onEvent: (event) => {
        log.accept(event);
        publish();
      },
      onPositions: (positions) => {
        for (const reading of positions) log.notePosition(reading);
        publish();
      },
      onDisconnect: publish,
      onState: (next) => {
        if (alive) setConnection(next);
      },
    }).then((opened) => {
      if (!alive) {
        opened.close();
        return;
      }
      handle = opened;
    }).catch(() => {
      // connectLive builds no message that carries a secret; the screen only needs the state.
      if (alive) setConnection('fallback');
    });

    return () => {
      alive = false;
      handle?.close();
    };
  }, [enabled]);

  return { entries, connection };
}

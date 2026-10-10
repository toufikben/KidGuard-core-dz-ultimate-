// src/state/session.ts — the session state the screens consume: idle | signing-in | signed-in |
// failed(kind). It is a small observable store plus the React hook over it, so the state machine is
// testable without a DOM and the component stays a projection of one snapshot.
//
// What this layer owns and what it refuses:
//  - A failure keeps its measured ErrorKind from the Task 3 client and prints ONE catalog line for
//    it. The server's own body never reaches the screen: a 401 body can name the account, and the
//    measured 404 body of GET /session is a Java exception excerpt.
//  - The failure text is Arabic by default and comes from the trilingual catalog, so a failure always
//    reads as a failure — never as the child being live, safe, or guaranteed.
//  - The minted socket token is not part of any snapshot. Task 10 reads it from the service layer,
//    and a screen cannot accidentally render a credential that this object could carry.
//  - There is no local fallback identity. When the server stops recognising the session the user
//    becomes null, because R-M1-8 forbids inventing a guardian the server never named.
import { useSyncExternalStore } from 'react';
import { TraccarError, type ErrorKind } from '../services/traccar/client.ts';
import * as session from '../services/traccar/session.ts';
import type { ServerUser } from '../services/traccar/types.ts';
import { translate, type CatalogLang } from '../translations/catalog.ts';

export type SessionStatus = 'idle' | 'signing-in' | 'signed-in' | 'failed';

export type SessionSnapshot = {
  status: SessionStatus;
  kind: ErrorKind | null;
  user: ServerUser | null;
  message: string | null;
};

// One catalog key per measured failure kind. `network` deliberately reuses the position layer's
// sentence: §12 makes the same fact sayable in the same words — no data from the server, and nothing
// about the child. No key below claims safety, and the copy guard test in tests/app/session.test.ts
// fails the build if one ever does.
const FAILURE_COPY: Record<ErrorKind, string> = {
  unauthorized: 'session.unauthorized',
  forbidden: 'session.forbidden',
  notfound: 'session.notFound',
  server: 'session.server',
  timeout: 'session.timeout',
  badpayload: 'session.badPayload',
  network: 'position.noDataFromServer',
};

const IDLE: SessionSnapshot = { status: 'idle', kind: null, user: null, message: null };

export type SignInArgs = Parameters<typeof session.signIn>[0];

export type SessionController = {
  getSnapshot: () => SessionSnapshot;
  getServerSnapshot: () => SessionSnapshot;
  subscribe: (listener: () => void) => () => void;
  setLang: (lang: CatalogLang) => void;
  signIn: (args: SignInArgs) => Promise<SessionSnapshot>;
  signOut: () => Promise<SessionSnapshot>;
  refresh: () => Promise<SessionSnapshot>;
};

// Every request path in this module goes through the Task 3 client, which rejects with a
// TraccarError carrying the kind. Anything else is a defect in our own code; it is still reported as
// a failed operation rather than as silence, because the one thing the guardian may not be told is
// that nothing went wrong.
function kindOf(error: unknown): ErrorKind {
  return error instanceof TraccarError ? error.kind : 'server';
}

export function createSessionController({ lang = 'ar' }: { lang?: CatalogLang } = {}): SessionController {
  let currentLang: CatalogLang = lang;
  let state: SessionSnapshot = { ...IDLE };
  const listeners = new Set<() => void>();

  const publish = (next: SessionSnapshot) => {
    state = next;
    for (const listener of listeners) listener();
  };

  const failed = (kind: ErrorKind): SessionSnapshot => ({
    status: 'failed',
    kind,
    user: null,
    message: translate(FAILURE_COPY[kind], currentLang),
  });

  return {
    getSnapshot: () => state,
    // React needs this third form to render on a server or during hydration; the snapshot is plain
    // memory, so the server snapshot is simply the current one.
    getServerSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    // `lang` is not server data, so an unknown language still throws from `translate` (R-M1-14):
    // the caller that stores a locale owns validating it, and this layer owns refusing to invent one.
    setLang: (next) => {
      currentLang = next;
      if (state.kind !== null) publish(failed(state.kind));
    },

    async signIn(args) {
      publish({ ...IDLE, status: 'signing-in' });
      try {
        const user = await session.signIn(args);
        publish({ status: 'signed-in', kind: null, user, message: null });
      } catch (error) {
        publish(failed(kindOf(error)));
      }
      return state;
    },

    async signOut() {
      try {
        await session.signOut();
        publish({ ...IDLE });
      } catch (error) {
        // The local record is already gone: service signOut drops it before its first call. What
        // failed is the server being told, so the screen says so instead of claiming a clean exit.
        publish(failed(kindOf(error)));
      }
      return state;
    },

    async refresh() {
      try {
        const user = await session.whoAmI();
        publish({ status: 'signed-in', kind: null, user, message: null });
      } catch (error) {
        // R-M1-8's forbidden third source: the measured 404 has no local reading, so the identity
        // goes with the session rather than being replaced by an assumption.
        session.resetSession();
        publish(failed(kindOf(error)));
      }
      return state;
    },
  };
}

// The app-wide session. Screens take it through useSession(); tests build their own controller so a
// fake server and a real one cannot leak between cases.
export const sessionController = createSessionController();

export function useSession(controller: SessionController = sessionController) {
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  return {
    ...snapshot,
    signIn: controller.signIn,
    signOut: controller.signOut,
    refresh: controller.refresh,
    setLang: controller.setLang,
  };
}

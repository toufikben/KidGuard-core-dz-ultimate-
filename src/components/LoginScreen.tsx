// src/components/LoginScreen.tsx — the one screen that turns a guardian into a session.
//
// Two fields and one button, and nothing that could write what was typed: there is deliberately no
// remember-me control here, because the only thing such a switch could do in this app is put a
// password where the storage rules say it must never go (the sign-out test reads browser storage and
// asserts the session layer left it empty).
//
// Honesty rules this file is written under (§4/§12, R-M1-14):
//  - Arabic is the default language and the layout follows it (dir="rtl").
//  - Every string comes from the trilingual catalog; nothing is hard-coded in the markup.
//  - A failed sign-in prints the catalog's failure line and reads as a failure. The screen never
//    says the child is live, safe, or guaranteed — and it never prints the server's own error body.
//  - The footer names the server only when GET /api/server actually answered with something usable;
//    otherwise it says the truth in words: unknown server. `serverVersionLine` degrades on data
//    instead of throwing, so a broken version cannot blank this screen out.
import React, { useEffect, useState } from 'react';
import { probeServerVersion, serverVersionLine } from '../services/traccar/session.ts';
import { sessionController, useSession, type SessionController } from '../state/session.ts';
import { translate, type CatalogLang } from '../translations/catalog.ts';

export type LoginScreenProps = {
  // The lab serves the app same-origin behind a proxy (007 §7), which is why '/api' is the default;
  // the wiring task that owns src/App.tsx passes whatever the device is actually pointed at.
  baseUrl?: string;
  lang?: CatalogLang;
  controller?: SessionController;
  // A version already read from the server, if the parent has one. The screen also reads it itself on
  // mount through `probe`; this prop is what makes the printed line testable without a browser.
  serverVersion?: string | null;
  probe?: (baseUrl: string) => Promise<string | null>;
};

export function LoginScreen({
  baseUrl = '/api',
  lang = 'ar',
  controller = sessionController,
  serverVersion = null,
  probe = probeServerVersion,
}: LoginScreenProps) {
  const session = useSession(controller);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verified, setVerified] = useState<string | null>(serverVersion);

  useEffect(() => {
    let alive = true;
    const show = (value: string | null) => { if (alive) setVerified(value); };
    probe(baseUrl).then(show, show);
    return () => { alive = false; };
  }, [baseUrl, probe]);

  const busy = session.status === 'signing-in';

  return (
    <section dir={lang === 'ar' ? 'rtl' : 'ltr'} className="login-screen">
      <h1>{translate('login.title', lang)}</h1>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) void session.signIn({ baseUrl, email, password });
        }}
      >
        <label htmlFor="guardian-email">{translate('session.email', lang)}</label>
        <input
          id="guardian-email"
          name="email"
          type="email"
          value={email}
          autoComplete="off"
          onChange={(event) => setEmail(event.target.value)}
        />
        <label htmlFor="guardian-password">{translate('session.password', lang)}</label>
        <input
          id="guardian-password"
          name="password"
          type="password"
          value={password}
          autoComplete="off"
          onChange={(event) => setPassword(event.target.value)}
        />
        <button type="submit" disabled={busy}>
          {busy ? translate('login.signingIn', lang) : translate('session.signIn', lang)}
        </button>
        {session.status === 'failed' && session.message !== null ? <p role="alert">{session.message}</p> : null}
        {session.status === 'signed-in' && session.user !== null ? (
          <p>{translate('login.signedInAs', lang, { email: session.user.email })}</p>
        ) : null}
        {session.status === 'signed-in' ? (
          <button type="button" onClick={() => void session.signOut()}>
            {translate('session.signOut', lang)}
          </button>
        ) : null}
      </form>
      <footer>{serverVersionLine(verified, lang)}</footer>
    </section>
  );
}

export default LoginScreen;

// src/translations/catalog.ts — the single trilingual copy catalog for the position/freshness layer.
// Tasks 6–11 append their keys HERE, never inside a component: the key-parity guard in
// tests/app/positions.test.ts fails the build if any key is missing a language or blank.
// The product is Arabic-first and must never overstate — no live/safe/guaranteed framing here.
export type CatalogLang = 'ar' | 'fr' | 'en';
export type CatalogEntry = { ar: string; fr: string; en: string };

export const catalog: Record<string, CatalogEntry> = {
  // Age of the last fix, formatted from `fixTime` (R30). `{age}` is integer seconds, ASCII digits.
  'position.ageSeconds': { ar: 'منذ {age} ثانية', fr: 'il y a {age} s', en: '{age} s ago' },
  // GPS accuracy as a radius. `{accuracy}` is integer metres.
  'position.accuracyMeters': { ar: '±{accuracy} م', fr: '±{accuracy} m', en: '±{accuracy} m' },
  // A silent source is announced as no-data, never as safety.
  'position.noDataFromServer': { ar: 'لا بيانات من الخادم', fr: 'Aucune donnée du serveur', en: 'No data from the server' },
  'position.locationMayNotBeCurrent': { ar: 'قد لا يكون الموقع الحالي دقيقاً', fr: 'la position actuelle peut ne pas être à jour', en: 'the current location may not be up to date' },

  // Task 6 — the session layer (sign-in, identity, sign-out) and its screen. Every failure below is
  // a failure in all three languages: none of them may soften into a claim about the child, and the
  // server's own body is never shown (the 401 body can name the account).
  'session.signIn': { ar: 'تسجيل الدخول', fr: 'Connexion', en: 'Sign in' },
  'session.signOut': { ar: 'تسجيل الخروج', fr: 'Déconnexion', en: 'Sign out' },
  'session.email': { ar: 'البريد الإلكتروني', fr: 'Adresse e-mail', en: 'Email address' },
  'session.password': { ar: 'كلمة المرور', fr: 'Mot de passe', en: 'Password' },
  'session.unauthorized': { ar: 'بيانات الدخول غير صحيحة', fr: 'Identifiants incorrects', en: 'Incorrect sign-in details' },
  'session.forbidden': { ar: 'هذا الحساب لا يملك الصلاحية المطلوبة', fr: "Ce compte n'a pas les droits requis", en: 'This account lacks the required permission' },
  'session.notFound': { ar: 'لا يعترف الخادم بهذه الجلسة', fr: 'Le serveur ne reconnaît pas cette session', en: 'The server does not recognize this session' },
  'session.server': { ar: 'أخطأ الخادم في معالجة الطلب', fr: 'Le serveur a échoué', en: 'The server failed the request' },
  'session.timeout': { ar: 'انتهت مهلة الاتصال بالخادم', fr: 'Délai de connexion au serveur dépassé', en: 'The server took too long to answer' },
  'session.badPayload': { ar: 'استجابة الخادم غير مفهومة', fr: 'Réponse du serveur illisible', en: 'Unreadable response from the server' },
  'login.title': { ar: 'دخول الأولياء', fr: 'Connexion des accompagnateurs', en: 'Guardian sign-in' },
  'login.signingIn': { ar: 'جارٍ تسجيل الدخول…', fr: 'Connexion en cours…', en: 'Signing in…' },
  'login.signedInAs': { ar: 'تم تسجيل الدخول باسم {email}', fr: 'Connecté en tant que {email}', en: 'Signed in as {email}' },
  // Step 3: the footer names the server only when /api/server actually answered — otherwise it says
  // the truth in words, which is that we do not know what server is out there.
  'login.serverVersion': { ar: 'إصدار الخادم {version}', fr: 'serveur {version}', en: 'server {version}' },
  'login.serverUnknown': { ar: 'الخادم غير معروف', fr: 'serveur inconnu', en: 'unknown server' },
};

// Translate one catalog key into one language, substituting {placeholder} tokens. Digits are handed
// in as plain ASCII strings on purpose: Intl.NumberFormat('ar') would emit Arabic-Indic numerals and
// break the deterministic, testable contract the label regexes assert. Throws rather than returning
// a confident half-sentence when a key or a language value is absent.
export function translate(key: string, lang: CatalogLang, vars?: Record<string, string | number>): string {
  const entry = catalog[key];
  if (!entry) throw new Error(`catalog key is missing: ${key}`);
  const template = entry[lang];
  if (typeof template !== 'string' || template.length === 0) throw new Error(`catalog ${key}.${lang} is blank`);
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => String(vars?.[name] ?? ''));
}

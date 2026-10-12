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

  // Task 7 — the map. §12 and the plan's catalog rule ("كل مهمة تضيف مفاتيحها هنا لا داخل المكوّن")
  // mean MapView.tsx now holds no literal copy at all; the guard in tests/app/childIcon.test.ts fails
  // the suite if a single Arabic word reappears there. Nothing below may claim safety: these name
  // shapes, ages and accuracy — the verdict belongs to the server.
  'map.lastReading': { ar: 'آخر قراءة', fr: 'Dernière lecture', en: 'Last reading' },
  'map.coordinates': { ar: 'الإحداثيات', fr: 'Coordonnées', en: 'Coordinates' },
  'map.speed': { ar: 'السرعة', fr: 'Vitesse', en: 'Speed' },
  'map.speedUnit': { ar: 'كم/س', fr: 'km/h', en: 'km/h' },
  'map.radiusMeters': { ar: 'نصف القطر: {radius} متر', fr: 'rayon : {radius} m', en: 'radius: {radius} m' },
  // §3: the sentence is only ever shown when both sources exist and disagree by over 300 m, and what
  // it promises is that NEITHER is drawn — the marker path enforces the same thing.
  'map.sourceConflict': {
    ar: '⚠️ مصدران للموقع يتعارضان: لا يُعرض أيٌّ منهما على الخريطة',
    fr: "⚠️ Deux sources de position se contredisent : aucune n'est affichée sur la carte",
    en: '⚠️ Two position sources conflict: neither is shown on the map',
  },
  'map.recenterTitle': {
    ar: 'إعادة التركيز على آخر موقع بلّغ عنه الخادم',
    fr: 'Recentrer sur la dernière position signalée par le serveur',
    en: 'Recentre on the last position the server reported',
  },
  'map.zoomInTitle': { ar: 'تكبير الخريطة (+)', fr: 'Zoomer la carte (+)', en: 'Zoom in (+)' },
  'map.zoomOutTitle': { ar: 'تصغير الخريطة (-)', fr: 'Dézoomer la carte (-)', en: 'Zoom out (-)' },
  'map.fitAllTitle': {
    ar: 'عرض جميع المناطق والطفل معاً على الخريطة',
    fr: 'Afficher toutes les zones et l’enfant sur la carte',
    en: 'Show all zones and the child together on the map',
  },
  'map.followOnTitle': { ar: 'تفعيل التتبع التلقائي', fr: 'Activer le suivi automatique', en: 'Enable auto-follow' },
  'map.followOffTitle': { ar: 'إيقاف التتبع التلقائي', fr: 'Désactiver le suivi automatique', en: 'Disable auto-follow' },
  'map.legendOpenTitle': {
    ar: 'عرض مفاتيح الخريطة والرموز',
    fr: 'Afficher la légende et les symboles de la carte',
    en: 'Show the map legend and symbols',
  },
  'map.legendTitle': { ar: 'مفاتيح الخريطة', fr: 'Légende de la carte', en: 'Map legend' },
  'map.legendCloseTitle': { ar: 'إخفاء مفتاح الخريطة', fr: 'Masquer la légende', en: 'Hide the legend' },
  // The legend explains SHAPES, because §12 forbids a state that only a colour carries. Each row is
  // the shape and the fact it stands for; a guardian who cannot see the tone still reads all five.
  'map.legendArrowShape': { ar: 'سهم ▲', fr: 'Flèche ▲', en: 'Arrow ▲' },
  'map.legendArrowNote': { ar: 'الخادم أرسل اتجاهًا', fr: 'Le serveur a envoyé une direction', en: 'The server sent a heading' },
  'map.legendDotShape': { ar: 'نقطة ●', fr: 'Point ●', en: 'Dot ●' },
  'map.legendDotNote': { ar: 'موقع بلا اتجاه', fr: 'Position sans direction', en: 'A position with no heading' },
  'map.legendAgingShape': {
    ar: 'إطار خارجي منقّط حول الرمز',
    fr: 'Contour pointillé autour du symbole',
    en: 'Dotted outline around the symbol',
  },
  'map.legendAgingNote': {
    ar: 'قراءة متقادمة (أكثر من 3 دقائق)',
    fr: 'Lecture ancienne (plus de 3 minutes)',
    en: 'An aging reading (over 3 minutes)',
  },
  'map.legendSilentShape': {
    ar: 'علامة ؟ بحواف متقطّعة',
    fr: 'Marque ? aux bords tiretés',
    en: '? mark with a dashed edge',
  },
  // `position.noDataFromServer` is this row note already; the legend reuses it rather than keeping a
  // second copy of the sentence that the label printer emits.
  'map.legendRingShape': {
    ar: 'دائرة متقطّعة حول الطفل',
    fr: 'Cercle tireté autour de l’enfant',
    en: 'Dashed circle around the child',
  },
  'map.legendRingNote': {
    ar: 'دقّة آخر قراءة بمقياسها الحقيقي',
    fr: 'Précision de la dernière lecture, à son échelle réelle',
    en: 'The last reading’s accuracy at its true scale',
  },
  'map.legendZoneShape': { ar: '🏰 منطقة', fr: '🏰 Zone', en: '🏰 Zone' },
  'map.legendZoneNote': {
    ar: 'الشكل كما يخزّنه الخادم',
    fr: 'La forme telle que le serveur la stocke',
    en: 'The shape as the server stores it',
  },
  'map.legendTrackShape': { ar: 'خط الحركة', fr: 'Tracé du parcours', en: 'Track line' },
  'map.legendTrackNote': {
    ar: 'قراءات سابقة مُبلَّغ بها',
    fr: 'Lectures précédentes signalées',
    en: 'Previously reported readings',
  },
};

// A locale is a control value, not data: whatever a screen read out of storage must be narrowed
// before it reaches `translate`, which throws on an unknown language (R-M1-14). App.tsx owns the
// stored value, so App.tsx owns this check.
export function isCatalogLang(value: unknown): value is CatalogLang {
  return value === 'ar' || value === 'fr' || value === 'en';
}

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

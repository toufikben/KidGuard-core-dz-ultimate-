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

  // Task 8 — zones drawn on the map and saved on the server (AC-2). These three lines are the whole
  // alert/delete vocabulary; ZonesScreen.tsx holds no literal copy (the guard there fails otherwise).
  // R-M1-10: a saved zone with no alert is a §4 lie, so the ABSENCE of a subscription is announced as
  // its own fact — never softened into "already present"/"no change" (the wording the Task 2 probe
  // review struck). Nothing here claims the child is safe; each names only what the server does/does not
  // have. `zones.alert.missing` is byte-checked by tests/app/zones.test.ts against the /لا اشتراك/ regex.
  'zones.alert.missing': {
    ar: 'لا اشتراك تنبيه لهذه المنطقة على الخادم',
    fr: "Aucun abonnement d'alerte pour cette zone sur le serveur",
    en: 'No alert subscription for this zone on the server',
  },
  'zones.alert.failed': {
    ar: 'تعذّر تحديث اشتراك التنبيه لهذه المنطقة',
    fr: "Échec de la mise à jour de l'abonnement d'alerte pour cette zone",
    en: 'Failed to update the alert subscription for this zone',
  },
  // (و): deleting a zone the child's device is still linked to would drop an evaluation the alerts
  // run on, so the screen refuses and names the link — no half-saved state (AC-2 forbids localStorage).
  'zones.delete.linked': {
    ar: 'لا يمكن حذف هذه المنطقة: هي موصولة بجهاز',
    fr: 'Suppression impossible : cette zone est liée à un appareil',
    en: 'Cannot delete: this zone is still linked to a device',
  },

  // Task 8 Step 3 — the zones SCREEN (§6 seven types, drawing modes, active hours, admin-gated edit).
  // Every string lives here so ZonesScreen.tsx can hold zero Arabic codepoints (R-M1-18); the guard in
  // tests/app/zones.test.ts fails the suite if a literal returns to the component or if a key loses a
  // language (the parity guard in positions.test.ts). Nothing below claims the child is safe/live —
  // these describe shapes, the server, and the guardian's own rights, and each is re-read from the
  // server on every save (AC-2: the server is the truth, never the local object).
  'zones.title': { ar: 'المناطق', fr: 'Zones', en: 'Zones' },
  'zones.serverIsTruth': {
    ar: 'تُحفظ المناطق على الخادم وتُقرأ منه؛ لا سجلّ محلي لها',
    fr: 'Les zones sont enregistrées et relues depuis le serveur ; aucun registre local',
    en: 'Zones are saved on and read back from the server; there is no local register',
  },
  'zones.signedOut': {
    ar: 'سجّل الدخول كمسؤول لإدارة المناطق',
    fr: 'Connectez-vous en tant qu’administrateur pour gérer les zones',
    en: 'Sign in as an administrator to manage zones',
  },
  'zones.loading': { ar: 'جارٍ قراءة المناطق من الخادم…', fr: 'Lecture des zones depuis le serveur…', en: 'Reading zones from the server…' },
  'zones.empty': { ar: 'لا توجد مناطق على الخادم بعد', fr: 'Aucune zone sur le serveur pour le moment', en: 'No zones on the server yet' },
  'zones.new': { ar: 'منطقة جديدة', fr: 'Nouvelle zone', en: 'New zone' },
  // «من يعدّل»: the edit affordance. It is DISABLED for a non-admin (the write gate itself lives in the
  // service, which reads whoAmI() from the server, not a local flag — R-M1-8).
  'zones.edit': { ar: 'من يعدّل', fr: 'Modifier', en: 'Edit' },
  'zones.save': { ar: 'حفظ على الخادم', fr: 'Enregistrer sur le serveur', en: 'Save to the server' },
  'zones.saving': { ar: 'جارٍ الحفظ على الخادم…', fr: 'Enregistrement sur le serveur…', en: 'Saving to the server…' },
  'zones.cancel': { ar: 'إلغاء', fr: 'Annuler', en: 'Cancel' },
  'zones.delete': { ar: 'حذف', fr: 'Supprimer', en: 'Delete' },
  'zones.nameLabel': { ar: 'اسم المنطقة', fr: 'Nom de la zone', en: 'Zone name' },
  'zones.typeLabel': { ar: 'النوع', fr: 'Type', en: 'Type' },
  'zones.modeLabel': { ar: 'أداة الرسم', fr: 'Outil de dessin', en: 'Drawing tool' },
  'zones.mode.circle': { ar: 'دائرة (بالسحب)', fr: 'Cercle (glisser)', en: 'Circle (drag)' },
  'zones.mode.polygon': { ar: 'مضلّع (بالنقر)', fr: 'Polygone (clic)', en: 'Polygon (click)' },
  'zones.mode.route': { ar: 'مسار (نقاط متتالية)', fr: 'Tracé (points consécutifs)', en: 'Route (consecutive points)' },
  'zones.radiusInput': { ar: 'نصف القطر بالمتر', fr: 'Rayon en mètres', en: 'Radius in metres' },
  'zones.bufferInput': { ar: 'هامش المسار بالمتر', fr: 'Marge du tracé en mètres', en: 'Route buffer in metres' },
  'zones.pointsCount': { ar: 'عدد النقاط: {count}', fr: 'Nombre de points : {count}', en: 'Point count: {count}' },
  'zones.hoursLabel': { ar: 'الأوقات الفعّالة (سمة)', fr: 'Heures actives (attribut)', en: 'Active hours (attribute)' },
  'zones.hoursFrom': { ar: 'من', fr: 'De', en: 'From' },
  'zones.hoursTo': { ar: 'إلى', fr: 'À', en: 'To' },
  'zones.centerHint': { ar: 'انقر على الخريطة لتحديد المركز', fr: 'Cliquez sur la carte pour fixer le centre', en: 'Click the map to set the centre' },
  'zones.polygonHint': { ar: 'انقر لإضافة رؤوس المضلّع (٣ على الأقل)', fr: 'Cliquez pour ajouter des sommets (au moins 3)', en: 'Click to add polygon vertices (at least 3)' },
  'zones.routeHint': { ar: 'انقر لإضافة نقاط المسار بالترتيب', fr: 'Cliquez pour ajouter les points du tracé dans l’ordre', en: 'Click to add route points in order' },
  'zones.saved': { ar: 'حُفظت المنطقة على الخادم', fr: 'Zone enregistrée sur le serveur', en: 'Zone saved on the server' },
  'zones.deleted': { ar: 'حُذفت المنطقة من الخادم', fr: 'Zone supprimée du serveur', en: 'Zone deleted from the server' },
  // Saving an unfinished drawing would put a zone at (0, 0) — a real place in the Gulf of Guinea, not
  // the school the guardian meant. The screen refuses with this line before any request.
  'zones.needGeometry': {
    ar: 'أكمل رسم المنطقة أولاً: مركز للدائرة، أو ٣ رؤوس للمضلّع، أو نقطتان للمسار',
    fr: 'Terminez le dessin : un centre pour le cercle, 3 sommets pour le polygone ou 2 points pour le tracé',
    en: 'Finish the drawing first: a centre for the circle, 3 vertices for the polygon or 2 points for the route',
  },
  // §6 seven zone types. الأوقات الفعّالة تُخزَّن كسمة، لا كنوع.
  'zones.type.school': { ar: 'مدرسة', fr: 'École', en: 'School' },
  'zones.type.home': { ar: 'بيت', fr: 'Domicile', en: 'Home' },
  'zones.type.park': { ar: 'حديقة', fr: 'Parc', en: 'Park' },
  'zones.type.outing': { ar: 'نزهة', fr: 'Sortie', en: 'Outing' },
  'zones.type.mosque': { ar: 'مسجد', fr: 'Mosquée', en: 'Mosque' },
  'zones.type.activity': { ar: 'نشاط', fr: 'Activité', en: 'Activity' },
  'zones.type.relative': { ar: 'بيت قريب', fr: 'Chez un proche', en: 'A relative’s home' },
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

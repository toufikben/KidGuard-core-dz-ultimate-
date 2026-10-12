import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  childIconHtml,
  scaleForZoom,
  zoomForRing,
  childFixLatLng,
  CHILD_ICON_COLORS,
  CHILD_ICON_GLYPHS,
  DEFAULT_VIEW_ZOOM,
  RING_ZOOM_MIN,
  RING_ZOOM_MAX,
} from '../../src/components/map/childIcon.ts';

// The icon's contract is (course, freshness, hasFix). `freshness` is written out literally in this
// typed input because it is the field name Task 5 actually produces (positions.ts freshnessOf) — a
// later rename to `fresh` would stop compiling HERE rather than show a confident pin on a phone.
type IconInput = Parameters<typeof childIconHtml>[0];
const input = (over: Partial<IconInput>): IconInput => ({ course: null, freshness: 'fresh', hasFix: true, ...over });

// Strip every hex colour so a comparison below can only pass on a STRUCTURAL difference: §12 says a
// colour-blind guardian must be able to tell the states apart, so a diff that is only hex codes fails.
const withoutColor = (html: string) => html.replace(/#[0-9a-fA-F]{3,8}\b/g, '');

// ── (أ)+(ب) heading: an arrow only when the server actually reported a course ────────────────────
test('(أ) no course in the reading yields a dot, and no rotation is written at all', () => {
  const { shape, html } = childIconHtml(input({ course: null }));
  assert.equal(shape, 'dot');
  assert.doesNotMatch(html, /rotate\(/, 'a dot must not carry a rotation: ' + html);
  assert.ok(html.includes(CHILD_ICON_GLYPHS.dot), 'the dot glyph must be present');
});

test('(ب) course 90 writes rotate(90deg) into the HTML and picks the arrow shape', () => {
  const { shape, html } = childIconHtml(input({ course: 90 }));
  assert.equal(shape, 'arrow');
  assert.match(html, /rotate\(90deg\)/);
  assert.ok(html.includes(CHILD_ICON_GLYPHS.arrow));
});

// 0° is north — a real heading, not a missing one. `if (!course)` would draw a dot for it, and the
// guardian would read "we don't know which way they're going" when the server said due north.
test('course 0 is north, not an unknown heading, so it still draws the rotated arrow', () => {
  const { shape, html } = childIconHtml(input({ course: 0 }));
  assert.equal(shape, 'arrow');
  assert.match(html, /rotate\(0deg\)/);
});

// Normalisation is asserted at both wrap-around ends: 450 is 90 and -90 is 270, so the CSS transform
// stays inside one turn and a NaN-free number reaches the stylesheet.
test('the course is normalised into one turn before it reaches the transform', () => {
  assert.match(childIconHtml(input({ course: 450 })).html, /rotate\(90deg\)/);
  assert.match(childIconHtml(input({ course: -90 })).html, /rotate\(270deg\)/);
  // The two cases above pass even if the window is half a turn (450 % 180 is still 90). South is the
  // case that a `% 180` bug folds onto north — measured: mutation row 6 escaped until this line.
  assert.match(childIconHtml(input({ course: 200 })).html, /rotate\(200deg\)/);
});

test('a non-finite course is an unknown heading: dot, no rotation', () => {
  const { shape, html } = childIconHtml(input({ course: Number.NaN }));
  assert.equal(shape, 'dot');
  assert.doesNotMatch(html, /rotate\(/);
});

// ── (ج)+(د) freshness tones ─────────────────────────────────────────────────────────────────────
test('(ج) a silent source is grey, carries a question mark, and loses the arrow', () => {
  const { shape, tone, html } = childIconHtml(input({ course: 90, freshness: 'silent' }));
  assert.equal(tone, CHILD_ICON_COLORS.silent);
  assert.equal(shape, 'dot', 'a source we cannot read has no direction to point');
  assert.ok(html.includes(CHILD_ICON_GLYPHS.unknown), 'silent must show the question mark: ' + html);
});

test('(د) an aging source takes the amber tone', () => {
  assert.equal(childIconHtml(input({ freshness: 'aging' })).tone, CHILD_ICON_COLORS.aging);
});

test('the three freshness tones are three distinct colour-blind-readable tokens', () => {
  const tones = [
    childIconHtml(input({ freshness: 'fresh' })).tone,
    childIconHtml(input({ freshness: 'aging' })).tone,
    childIconHtml(input({ freshness: 'silent' })).tone,
  ];
  assert.deepEqual(new Set(tones).size, 3, `tones collided: ${tones.join(' / ')}`);
  const palette: string[] = Object.values(CHILD_ICON_COLORS);
  for (const tone of tones) assert.ok(palette.includes(tone), `${tone} is not a catalog token`);
});

// `null` freshness means "no reading at all" (the fourth value Task 9's Child type carries). It must
// land on the silent presentation — a missing value may never select the fresh tone by falling
// through a comparison the way freshnessOf(NaN) once did.
test('freshness null (no reading) falls to the silent presentation, never to fresh', () => {
  const { tone, shape, html } = childIconHtml(input({ course: 90, freshness: null }));
  assert.equal(tone, CHILD_ICON_COLORS.silent);
  assert.equal(shape, 'dot');
  assert.ok(html.includes(CHILD_ICON_GLYPHS.unknown));
});

// ── (هـ) shape, not colour, carries the difference (§12 colour blindness) ───────────────────────
test('(هـ) fresh and silent differ after every hex code is removed — colour alone is not the signal', () => {
  const fresh = withoutColor(childIconHtml(input({ course: 90, freshness: 'fresh' })).html);
  const silent = withoutColor(childIconHtml(input({ course: 90, freshness: 'silent' })).html);
  assert.notEqual(fresh, silent, 'the two states are identical without colour');
  assert.match(silent, /dashed/, 'silent must differ in border style, not only in glyph');
  assert.doesNotMatch(fresh, /dashed/);
  assert.equal(childIconHtml(input({ course: 90, freshness: 'fresh' })).shape, 'arrow');
  assert.equal(childIconHtml(input({ course: 90, freshness: 'silent' })).shape, 'dot');
});

// ── the phone-audit ruling: no pin without a real fix ───────────────────────────────────────────
// Measured on the guardian's phone (v1.3): a pin, a «آمن في المنطقة» badge and coordinates
// 36.7538/3.0588 that no source ever reported. `hasFix: false` must therefore override even a
// 'fresh' tone: the icon module is where that lie is structurally impossible.
test('hasFix false forces the silent presentation even when freshness says fresh', () => {
  const { tone, shape, html } = childIconHtml(input({ course: 90, freshness: 'fresh', hasFix: false }));
  assert.equal(tone, CHILD_ICON_COLORS.silent);
  assert.equal(shape, 'dot');
  assert.ok(html.includes(CHILD_ICON_GLYPHS.unknown));
});

// ── (و) no child face ───────────────────────────────────────────────────────────────────────────
test('(و) the icon embeds no child face, image, or asset URL', () => {
  const html = childIconHtml(input({ course: 90 })).html;
  assert.doesNotMatch(html, /<img|\.png|\.svg|\.jpg|url\(|background-image/i, html);
  assert.doesNotMatch(html, /👦|🚸|🧒|avatar|face/i, html);
});

// ── (ز) contrast: no light-on-light text inside the icon HTML ───────────────────────────────────
test('(ز) every colour in the icon comes from the catalog and no text is white-on-light', () => {
  const html = childIconHtml(input({ course: 90, freshness: 'aging' })).html;
  const used = [...html.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase());
  assert.ok(used.length > 0, 'the html lost its colours entirely');
  const allowed = new Set(Object.values(CHILD_ICON_COLORS).map((c) => c.toLowerCase()));
  for (const color of used) assert.ok(allowed.has(color), `off-catalog colour ${color}`);
  // White is only ever a PLATE (background) in this module; any `color: white/#fff…` would be
  // white text, and on the white plate it would be invisible.
  assert.doesNotMatch(html, /color:\s*(#fff|#ffffff|white)\b/i, html);
});

// ── the accuracy ring: true metres scale, never a fixed pixel blob or an invented radius ────────
test('an unknown accuracy draws no ring: the server said nothing, so the map may not say 10 m', () => {
  for (const accuracy of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, -25]) {
    assert.deepEqual(
      scaleForZoom(accuracy as number | null, 16, 36.75),
      { ringMeters: null, pixelRadius: 0 },
      `accuracy ${accuracy} must produce no ring`,
    );
  }
});

test('the ring keeps its metre radius at every zoom and its pixel size follows the zoom', () => {
  const near = scaleForZoom(25, 17, 36.75);
  const far = scaleForZoom(25, 14, 36.75);
  assert.equal(near.ringMeters, 25, 'the radius on the ground is the accuracy in metres, unchanged');
  assert.equal(far.ringMeters, 25);
  assert.equal(near.pixelRadius / far.pixelRadius, 8, 'three zoom levels is 2^3 pixels per metre');
  assert.ok(near.pixelRadius > far.pixelRadius);
});

// The published Web Mercator resolution is 156543.03392 m/px at zoom 0 on the equator; pinning the
// constant here is what catches a scale that was quietly halved or shifted by a zoom level.
test('the pixel scale is the published Web Mercator resolution, to the metre', () => {
  const { pixelRadius } = scaleForZoom(156_543.03392, 0, 0);
  assert.ok(Math.abs(pixelRadius - 1) < 1e-6, `156543.03392 m at z0/lat0 must be 1 px, got ${pixelRadius}`);
});

// Mercator stretches as latitude grows, so a metre is MORE pixels away from the equator, not fewer.
// Dropping the cos(latitude) factor would make the two equal — that is the mutation this kills.
test('the Mercator factor is applied: the same ring covers more pixels away from the equator', () => {
  assert.ok(scaleForZoom(100, 15, 60).pixelRadius > scaleForZoom(100, 15, 0).pixelRadius);
});

// `zoom` and `latitude` are control inputs, not data from the server: a broken one is a bug in the
// caller, so it throws rather than degrading into a silently wrong scale (R-M1-14).
test('scaleForZoom throws on a non-finite zoom or latitude instead of inventing a scale', () => {
  assert.throws(() => scaleForZoom(25, Number.NaN, 36.75), /zoom/);
  assert.throws(() => scaleForZoom(25, 16, Number.NaN), /latitude/);
  assert.throws(() => scaleForZoom(25, 16, 91), /latitude/);
});

test('zoomForRing pulls back for a wide ring and never for a tight one', () => {
  const tight = zoomForRing(25, 36.75);
  const wide = zoomForRing(4000, 36.75);
  assert.ok(wide < tight, `4000 m (${wide}) must sit further out than 25 m (${tight})`);
  assert.ok(RING_ZOOM_MIN <= wide && wide <= RING_ZOOM_MAX, `${wide} escaped the clamp`);
  assert.ok(RING_ZOOM_MIN <= tight && tight <= RING_ZOOM_MAX, `${tight} escaped the clamp`);
});

test('zoomForRing clamps to the configured bounds for absurd radii', () => {
  assert.equal(zoomForRing(100_000_000, 36.75), RING_ZOOM_MIN);
  assert.equal(zoomForRing(0.001, 36.75), RING_ZOOM_MAX);
});

// No accuracy reported means there is nothing to frame, so the map keeps its ordinary viewport zoom.
// This is a VIEWPORT default, which is allowed; a position default is not (see childFixLatLng).
test('zoomForRing with no radius returns the plain viewport zoom, not a fitted one', () => {
  assert.equal(zoomForRing(null, 36.75), DEFAULT_VIEW_ZOOM);
  assert.equal(zoomForRing(Number.NaN, 36.75), DEFAULT_VIEW_ZOOM);
});

// ── the fix guard: a marker needs a real position ───────────────────────────────────────────────
test('childFixLatLng passes a real coordinate pair through as [lat, lng]', () => {
  assert.deepEqual(childFixLatLng(36.7, 3.06), [36.7, 3.06]);
});

// The fabricated pair is what the shipped app drew for a child nobody reported. Feeding the guard
// nothing must return null, never that pair — this is the whole phone audit in one assertion.
test('childFixLatLng returns null for missing, non-numeric, or out-of-domain input — and never a default', () => {
  for (const [lat, lng] of [[undefined, undefined], [Number.NaN, 3], [91, 3], [36, 181], ['36.75', 3], [null, null]]) {
    assert.equal(childFixLatLng(lat, lng), null, `${lat},${lng} is not a fix`);
  }
  assert.notDeepEqual(childFixLatLng(undefined, undefined), [36.7538, 3.0588]);
});

// ── MapView source guards: the rules that cannot be asserted through the DOM ────────────────────
// MapView mounts Leaflet, so it has no runtime test seat in this suite. These guards read the
// source, exactly like harness.test.ts guards the test script: they pin the DECISIONS (no invented
// position, no invented accuracy, no second source of truth, one knots conversion, one haversine)
// and each one turns RED on the specific mutation it names.
const mapSource = () => readFileSync(new URL('../../src/components/MapView.tsx', import.meta.url), 'utf8');

test('MapView carries no fabricated coordinate and no invented accuracy default', () => {
  const src = mapSource();
  assert.doesNotMatch(src, /36\.7538|3\.0588/, 'the map must not hold an Algiers fallback');
  // The bare identifiers, not just their call sites: a mutation run proved that banning only
  // `safeNum(` lets the helper come back as a definition, waiting for someone to call it.
  assert.doesNotMatch(src, /\bsafeNum\b|\bsafeLat\b|\bsafeLng\b/, 'the fabricating helpers must be gone');
  assert.ok(src.includes('childFixLatLng'), 'the map must gate its marker on a real fix');
});

test('MapView converts knots through kmPerHour and keeps no second haversine', () => {
  const src = mapSource();
  assert.doesNotMatch(src, /speed\s*>\s*50/, 'the km/h unit guess (M5) must be gone');
  assert.match(src, /import \{[^}]*kmPerHour[^}]*\} from '\.\.\/services\/traccar\/positions\.ts'/);
  assert.doesNotMatch(src, /getDistanceMeters|Math\.sin\(dLat/, 'M6: one haversine, in positions.ts');
  assert.match(src, /haversineMeters/);
});

// §1.5 + the brief's binding decision: the map shows props. The child source arrives in Task 9 by
// replacing the props in App.tsx, never by giving the map a fetch, a geolocation watch, or a hook.
test('MapView has no data source of its own and no client-side safety verdict', () => {
  const src = mapSource();
  assert.doesNotMatch(src, /useChildren|fetch\(|navigator\.geolocation|localStorage/, 'a second source of truth');
  assert.doesNotMatch(src, /kidState/, 'the map must not read the legacy risk state');
  assert.doesNotMatch(src, /داخل المنطقة|خارج المنطقة|متواجد بالداخل|آمن 🟢|'آمن'|تنبيه 🔴/,
    'a safety verdict belongs to the server, not the pin');
  assert.ok(src.includes('childIconHtml'), 'the icon must come from the tested module');
});

// ── fix round 1 (independent review of Task 7) ─────────────────────────────────────────────────
// The brief's (هـ) compared fresh against silent, but §12 says the STATES (plural) must survive
// colour-blindness. Fresh and aging were byte-identical once the hex codes were stripped: the only
// difference was green vs amber, the classic confusing pair. Aging now carries an extra shape —
// an outer dotted ring — that neither the fresh nor the silent pin emits.
test('fresh and aging differ even after every hex code is removed', () => {
  const fresh = withoutColor(childIconHtml(input({ course: 90, freshness: 'fresh' })).html);
  const aging = withoutColor(childIconHtml(input({ course: 90, freshness: 'aging' })).html);
  assert.notEqual(fresh, aging, 'an aging pin must be recognisable without colour');
  assert.match(aging, /outline:2px dotted/, 'the aging shape is an outer dotted ring');
  assert.doesNotMatch(fresh, /outline:/);
  // The two non-colour channels must not collide: dashed belongs to "no readable data", dotted to
  // "old data", and a guardian who cannot see the tone still has three distinct shapes.
  assert.doesNotMatch(aging, /dashed/, 'the aging ring must not reuse the silent border style');
});

test('only a real aging reading gets the ring: silent, null, and no-fix pins never emit it', () => {
  for (const over of [
    { freshness: 'fresh' },
    { freshness: 'silent' },
    { freshness: null },
    { freshness: 'aging', hasFix: false },
  ] as Partial<IconInput>[]) {
    const html = childIconHtml(input(over)).html;
    assert.doesNotMatch(html, /outline:/, `${JSON.stringify(over)} must not carry the aging ring: ${html}`);
  }
});

// A radius of exactly zero metres is not a measurement the server took; it is the same "nothing to
// draw" case zoomForRing already refuses. The two call sites must not disagree about that.
test('an accuracy of zero is refused by both ring call sites, not drawn as a zero-metre ring', () => {
  assert.deepEqual(scaleForZoom(0, 16, 36.75), { ringMeters: null, pixelRadius: 0 });
  assert.equal(zoomForRing(0, 36.75), DEFAULT_VIEW_ZOOM);
});

// §12 and the plan's catalog rule: "كل مهمة لاحقة تضيف مفاتيحها هنا لا داخل المكوّن". The map was
// rewritten by this task, so the file may now hold no literal copy at all — including the fr/en
// screens, which MapView could not render without `lang`.
test('MapView carries no literal copy: every string is a catalog key and the language is a prop', () => {
  const src = mapSource();
  assert.doesNotMatch(src, /[؀-ۿ]/, 'the map must read its copy from src/translations/catalog.ts');
  assert.match(src, /lang: CatalogLang/, 'the map cannot choose a language for itself');
  assert.match(src, /import \{[^}]*translate[^}]*\} from '\.\.\/translations\/catalog\.ts'/);
  // Layout follows the language too. A hard-coded `direction:rtl` carries no Arabic codepoint, so the
  // ban above cannot see it — and it would put a French guardian's zone popup on the wrong side.
  assert.doesNotMatch(src, /direction:rtl/, 'the popup direction must follow lang, never a literal rtl');
  assert.match(src, /direction:\$\{dir\}/, 'the direction must come from the language the caller passed');
});

// The conflict banner claims «لا يُعرض أيٌّ منهما على الخريطة». A banner that lies about the pin is a
// safety claim, so the marker path itself refuses the position while the sources disagree — the
// component keeps its own promise instead of relying on Task 9 to pass null.
test('MapView draws no child pin while the two sources conflict', () => {
  const src = mapSource();
  assert.match(src, /!\s*sourceConflict\s*&&\s*position\s*\?\s*childFixLatLng/,
    'the fix must be gated on sourceConflict, not only on position');
});

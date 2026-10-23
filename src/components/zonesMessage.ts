// src/components/zonesMessage.ts — one failure becomes one screen sentence in the guardian's language.
// The service errors are thrown from modules that have no `lang`, so rendering `.message` directly
// would show Arabic (or a debug code) to a French-speaking guardian. This resolver maps the error
// CLASS/REASON — and, for a refused geometry, each ZoneViolation CODE — through the catalog using the
// screen's own `lang`. Nothing here decides whether a failure happened; it names what the service said.
import { TraccarError } from '../services/traccar/client.ts';
import { ZoneAlertError, ZoneLinkedError, ZoneValidationError } from '../services/traccar/zones.ts';
import type { ZoneViolation } from '../services/traccar/wkt.ts';
import { translate, type CatalogLang } from '../translations/catalog.ts';

function violationMessage(violation: ZoneViolation, lang: CatalogLang): string {
  switch (violation.code) {
    case 'radiusMin':
      return translate('zones.error.radiusMin', lang, { need: violation.need });
    case 'polygonMinPoints':
      return translate('zones.error.polygonMinPoints', lang);
    case 'routeMinPoints':
      return translate('zones.error.routeMinPoints', lang);
    case 'bufferMissing':
      return translate('zones.error.bufferMissing', lang);
    case 'bufferMin':
      return translate('zones.error.bufferMin', lang, { need: violation.need });
  }
}

export function zoneErrorMessage(error: unknown, lang: CatalogLang): string {
  if (error instanceof ZoneValidationError) {
    return error.violations.map((violation) => violationMessage(violation, lang)).join(' — ');
  }
  if (error instanceof ZoneAlertError) {
    return translate(error.reason === 'nosubscription' ? 'zones.alert.missing' : 'zones.alert.failed', lang);
  }
  if (error instanceof ZoneLinkedError) return translate('zones.delete.linked', lang);
  if (error instanceof TraccarError && error.kind === 'forbidden') return translate('session.forbidden', lang);
  return translate('session.server', lang);
}

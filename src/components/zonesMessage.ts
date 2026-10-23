// src/components/zonesMessage.ts — one failure becomes one screen sentence in the guardian's language.
// The service errors carry a catalog-backed ARABIC line in `.message` (they are thrown from modules
// that have no `lang`), so rendering `.message` directly would show Arabic to a French-speaking
// guardian. This resolver maps the error CLASS/REASON through the catalog with the screen's own lang.
// ZoneValidationError is the exception: its list is the specific reason (Task 4 wording) and is shown
// as thrown until validateZone grows a language parameter.
import { TraccarError } from '../services/traccar/client.ts';
import { ZoneAlertError, ZoneLinkedError, ZoneValidationError } from '../services/traccar/zones.ts';
import { translate, type CatalogLang } from '../translations/catalog.ts';

export function zoneErrorMessage(error: unknown, lang: CatalogLang): string {
  if (error instanceof ZoneValidationError) return error.message;
  if (error instanceof ZoneAlertError) {
    return translate(error.reason === 'nosubscription' ? 'zones.alert.missing' : 'zones.alert.failed', lang);
  }
  if (error instanceof ZoneLinkedError) return translate('zones.delete.linked', lang);
  if (error instanceof TraccarError && error.kind === 'forbidden') return translate('session.forbidden', lang);
  return translate('session.server', lang);
}

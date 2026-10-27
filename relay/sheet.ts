// relay/sheet.ts — one deterministic Arabic incident sheet, computed from an Incident snapshot.
// Never an email, never a full serial, never NaN. Bounded at 4000 characters with the lab footer
// and the AC-17 honesty line always kept. Times are printed as UTC so the text does not depend on
// the machine's timezone.
import type { Incident } from './types.ts';

export const MAX_SHEET_CHARS = 4000;
const LAB_FOOTER = 'بيانات مختبر — ليست حادثة حقيقية';
const AC17 = 'كلمة التحقق العائلية: غير منفّذة في M2 (AC-17)';
const MAX_DELIVERY_LINES = 20;

const TIER_LABEL: Record<Incident['tier'], string> = {
  P0: 'P0 — استغاثة (SOS)',
  P1: 'P1 — أولوية عالية',
  P2: 'P2 — معلومة',
};

const STATE_LABEL: Record<Incident['state'], (incident: Incident) => string> = {
  active: () => 'نشط',
  assigned: (incident) => `مُسنَد إلى مستلم #${incident.assigneeUserId ?? '—'}`,
  degraded: () => 'متدهور',
};

const DELIVERY_LABEL = { sent: 'أُرسل', delivered: 'وصل', opened: 'فُتح' } as const;

const ACTION_LABEL: Record<string, string> = {
  ingest: 'أُنشئ الحادث',
  sent: 'أُرسل إلى جهة اتصال',
  delivered: 'وصل الإشعار',
  opened: 'فُتح في التطبيق',
  ack: 'أكّد المستلم',
  window_expired: 'انتهت مهلة التأكيد',
  escalation: 'تصعيد',
  degraded: 'أُعلن تدهور المصدر',
};

function clockOf(iso: string | null): string {
  if (iso === null) return '—';
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? `${new Date(ms).toISOString().slice(11, 19)} UTC` : '—';
}

function ageLine(incident: Incident, nowMs: number): string {
  if (incident.position.fixTime === null) return 'عمر الموقع: غير معروف';
  const ms = Date.parse(incident.position.fixTime);
  if (!Number.isFinite(ms)) return 'عمر الموقع: غير معروف';
  return `عمر الموقع: ${Math.max(0, Math.round((nowMs - ms) / 1000))} ثانية`;
}

function coordinateLine(incident: Incident): string {
  const { latitude, longitude } = incident.position;
  if (latitude === null || longitude === null) return 'الموقع: غير معروف';
  return `الموقع: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

function accuracyLine(incident: Incident): string | null {
  const accuracy = incident.position.accuracy;
  return accuracy === null ? null : `الدقة: ±${Math.round(accuracy)} م`;
}

function speedLine(incident: Incident): string | null {
  const knots = incident.position.speedKnots;
  if (knots === null) return null;
  return `السرعة: ${(knots * 1.852).toFixed(1)} كم/س`;
}

function deliveryLine(incident: Incident, index: number): string {
  const recipient = incident.recipients[index];
  const delivery = incident.deliveries[index];
  const name = recipient.name ? ` ${recipient.name}` : '';
  const parts = [`${index + 1}. #${recipient.userId}${name} — ${DELIVERY_LABEL[delivery.state]}`];
  parts.push(`أُرسل ${clockOf(delivery.sentAt)}`);
  if (delivery.deliveredAt !== null) parts.push(`وصل ${clockOf(delivery.deliveredAt)}`);
  if (delivery.openedAt !== null) parts.push(`فُتح ${clockOf(delivery.openedAt)}`);
  return parts.join('، ');
}

function assemble(incident: Incident, nowMs: number, timelineLimit: number, deliveryLimit: number): string {
  const lines: string[] = [
    'KidGuard — ورقة حادث',
    `المعرّف: ${incident.id}`,
    `الأولوية: ${TIER_LABEL[incident.tier]}`,
    `الحالة: ${STATE_LABEL[incident.state](incident)}`,
    `الحدث: ${incident.eventType}${incident.alarm ? ` / ${incident.alarm}` : ''} — ${clockOf(incident.eventTime)}`,
    `الجهاز: ${incident.deviceName ?? 'غير معروف'}${incident.deviceSerialLast4 ? ` (…${incident.deviceSerialLast4})` : ''}`,
    `المنطقة: ${incident.geofenceName ?? 'خارج أي منطقة معروفة'}`,
    coordinateLine(incident),
    ageLine(incident, nowMs),
  ];
  const accuracy = accuracyLine(incident);
  if (accuracy !== null) lines.push(accuracy);
  const speed = speedLine(incident);
  if (speed !== null) lines.push(speed);
  lines.push('', 'التسلسل:');
  const shownTimeline = timelineLimit === 0 ? [] : incident.timeline.slice(-timelineLimit);
  for (const entry of shownTimeline) {
    lines.push(`${clockOf(entry.at)} — ${ACTION_LABEL[entry.action] ?? entry.action}`);
  }
  if (shownTimeline.length < incident.timeline.length) lines.push('… (اقتُطع)');
  lines.push('', 'تسلسل التسليم:');
  const shown = Math.min(deliveryLimit, incident.recipients.length);
  for (let index = 0; index < shown; index += 1) lines.push(deliveryLine(incident, index));
  if (shown < incident.recipients.length) lines.push(`… و${incident.recipients.length - shown} مستلماً آخر`);
  lines.push('', AC17, LAB_FOOTER);
  return lines.join('\n');
}

export function renderIncidentSheet(incident: Incident, nowMs: number): string {
  let timelineLimit = 12;
  let deliveryLimit = Math.min(MAX_DELIVERY_LINES, incident.recipients.length);
  let text = assemble(incident, nowMs, timelineLimit, deliveryLimit);
  while (text.length > MAX_SHEET_CHARS && (timelineLimit > 0 || deliveryLimit > 0)) {
    if (timelineLimit > 0) timelineLimit -= 1;
    else deliveryLimit -= 1;
    text = assemble(incident, nowMs, timelineLimit, deliveryLimit);
  }
  if (text.length <= MAX_SHEET_CHARS) return text;
  // Last resort: keep the two honest closing lines and cut from the middle of the body.
  const tail = `\n… (اقتُطع)\n${AC17}\n${LAB_FOOTER}`;
  let cut = MAX_SHEET_CHARS - tail.length;
  if ((text.charCodeAt(cut - 1) & 0xfc00) === 0xd800) cut -= 1;
  return `${text.slice(0, cut)}${tail}`;
}

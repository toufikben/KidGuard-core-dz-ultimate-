import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocationPoint } from '../types';
import { randomHex } from './SecurityUtils';

interface DirectSmsPlugin {
  send(options: { phoneNumber: string; message: string }): Promise<{ sent: boolean }>;
}

const DirectSms = registerPlugin<DirectSmsPlugin>('DirectSms');

export interface SmsDispatchResult {
  success: boolean;
  messageId: string;
  phoneNumber: string;
  body: string;
  timestamp: number;
  error?: string;
  method?: 'direct_sms' | 'sms_link' | 'simulated';
}

export type SmsSendMode = 'AUTO' | 'CONFIRM';

export class SmsService {
  private static instance: SmsService;
  private dispatchLogs: SmsDispatchResult[] = [];

  private constructor() {}

  public static getInstance(): SmsService {
    if (!SmsService.instance) {
      SmsService.instance = new SmsService();
    }
    return SmsService.instance;
  }

  public generateMapsUrl(latitude: number, longitude: number): string {
    return `https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
  }

  public createAlertSmsBody(
    childName: string,
    reason: string,
    location: LocationPoint
  ): string {
    const mapsLink = this.generateMapsUrl(location.latitude, location.longitude);
    const acc = Math.round(location.accuracy);
    const latStr = location.latitude.toFixed(6);
    const lngStr = location.longitude.toFixed(6);
    const timeStr = new Date().toLocaleString('ar-DZ', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    });

    return `🚨 [KidGuard DZ] تنبيه موقع الطفل
الاسم: ${childName}
السبب: ${reason}
⏰ الوقت: ${timeStr}
📍 خط العرض: ${latStr}
📍 خط الطول: ${lngStr}
🎯 الدقة: ±${acc}م
🔗 الخريطة: ${mapsLink}`;
  }

  /** Normalize 05xxxxxxxx or 2135xxxxxxxx to +2135xxxxxxxx. */
  public normalizePhone(phone: string): string {
    let cleaned = phone.replace(/[\s\-()]/g, '');
    if (cleaned.startsWith('0') && cleaned.length === 10) {
      cleaned = '+213' + cleaned.slice(1);
    }
    if (!cleaned.startsWith('+') && cleaned.startsWith('213')) {
      cleaned = '+' + cleaned;
    }
    return cleaned;
  }

  private remember(result: SmsDispatchResult): SmsDispatchResult {
    this.dispatchLogs.unshift(result);
    if (this.dispatchLogs.length > 50) this.dispatchLogs.pop();
    return result;
  }

  private openSmsComposer(
    phoneNumber: string,
    body: string,
    messageId: string
  ): SmsDispatchResult {
    try {
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        const smsUri = `sms:${phoneNumber}?body=${encodeURIComponent(body)}`;
        const link = document.createElement('a');
        link.href = smsUri;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return this.remember({
          success: true,
          messageId,
          phoneNumber,
          body,
          timestamp: Date.now(),
          method: 'sms_link',
        });
      }
    } catch (err) {
      console.warn('[SmsService] SMS composer failed', err);
    }

    return this.remember({
      success: false,
      messageId,
      phoneNumber,
      body,
      timestamp: Date.now(),
      error: 'تعذر فتح تطبيق الرسائل على هذا الجهاز',
      method: 'simulated',
    });
  }

  public async sendAlertSms(
    phoneNumber: string,
    childName: string,
    reason: string,
    location: LocationPoint,
    mode: SmsSendMode = 'CONFIRM'
  ): Promise<SmsDispatchResult> {
    const messageId = `sms_${Date.now()}_${randomHex(8)}`;
    const body = this.createAlertSmsBody(childName, reason, location);
    const cleanPhone = this.normalizePhone(phoneNumber);

    if (!cleanPhone) {
      return {
        success: false,
        messageId,
        phoneNumber,
        body,
        timestamp: Date.now(),
        error: 'رقم هاتف الوالد غير مكوّن',
        method: 'simulated',
      };
    }

    if (mode === 'AUTO' && Capacitor.isNativePlatform()) {
      try {
        const result = await DirectSms.send({
          phoneNumber: cleanPhone,
          message: body,
        });
        return this.remember({
          success: result.sent,
          messageId,
          phoneNumber: cleanPhone,
          body,
          timestamp: Date.now(),
          method: 'direct_sms',
          ...(result.sent ? {} : { error: 'لم يؤكد النظام إرسال الرسالة' }),
        });
      } catch (error) {
        console.warn('[SmsService] direct SMS unavailable; opening composer', error);
      }
    }

    return this.openSmsComposer(cleanPhone, body, messageId);
  }

  public getLogs(): SmsDispatchResult[] {
    return [...this.dispatchLogs];
  }
}

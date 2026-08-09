import { LocationPoint } from '../types';

export interface SmsDispatchResult {
  success: boolean;
  messageId: string;
  phoneNumber: string;
  body: string;
  timestamp: number;
  error?: string;
  method?: 'gateway' | 'sms_link' | 'simulated';
}

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

  /** Normalize 05xxxxxxxx → +2135xxxxxxxx */
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

  public async sendAlertSms(
    phoneNumber: string,
    childName: string,
    reason: string,
    location: LocationPoint
  ): Promise<SmsDispatchResult> {
    const messageId = `sms_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
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

    console.log(`[SmsService] Alert to ${cleanPhone}:`, body);

    // Best interim for Algeria: open native SMS app on the phone
    try {
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        const smsUri = `sms:${cleanPhone}?body=${encodeURIComponent(body)}`;
        const link = document.createElement('a');
        link.href = smsUri;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        const result: SmsDispatchResult = {
          success: true,
          messageId,
          phoneNumber: cleanPhone,
          body,
          timestamp: Date.now(),
          method: 'sms_link',
        };
        this.dispatchLogs.unshift(result);
        if (this.dispatchLogs.length > 50) this.dispatchLogs.pop();
        return result;
      }
    } catch (err) {
      console.warn('Native SMS link failed', err);
    }

    // Desktop / fallback
    const result: SmsDispatchResult = {
      success: true,
      messageId,
      phoneNumber: cleanPhone,
      body,
      timestamp: Date.now(),
      method: 'simulated',
    };
    this.dispatchLogs.unshift(result);
    if (this.dispatchLogs.length > 50) this.dispatchLogs.pop();
    return result;
  }

  public getLogs(): SmsDispatchResult[] {
    return [...this.dispatchLogs];
  }
}
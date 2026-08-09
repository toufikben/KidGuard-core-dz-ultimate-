import { LocationPoint } from '../types';

export interface SmsDispatchResult {
  success: boolean;
  messageId: string;
  phoneNumber: string;
  body: string;
  timestamp: number;
  error?: string;
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

  /**
   * Formats Google Maps Link
   */
  public generateMapsUrl(latitude: number, longitude: number): string {
    return `https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
  }

  /**
   * Constructs SMS Body for Safe Zone Exit / Emergency with explicit coordinates & Google Maps link
   */
  public createAlertSmsBody(
    childName: string,
    reason: string,
    location: LocationPoint
  ): string {
    const mapsLink = this.generateMapsUrl(location.latitude, location.longitude);
    const acc = Math.round(location.accuracy);
    const latStr = location.latitude.toFixed(6);
    const lngStr = location.longitude.toFixed(6);

    return `🚨 [KidGuard DZ] تنبيه موقع الطفل: ${childName}
السبب: ${reason}
📍 خط العرض (Latitude): ${latStr}
📍 خط الطول (Longitude): ${lngStr}
🎯 الدقة: ±${acc}م
🔗 رابط الخريطة: ${mapsLink}`;
  }

  /**
   * Dispatches SMS to Parent Phone with Callback Handling
   */
  public async sendAlertSms(
    phoneNumber: string,
    childName: string,
    reason: string,
    location: LocationPoint
  ): Promise<SmsDispatchResult> {
    const messageId = `sms_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const body = this.createAlertSmsBody(childName, reason, location);

    console.log(`[SmsService] Dispatching SMS to ${phoneNumber}:`, body);

    // Simulate SMS Native Plugin / Web SMS Gateway dispatch
    try {
      // Clean phone number
      const cleanPhone = phoneNumber.trim();
      if (!cleanPhone) {
        throw new Error('Parent phone number not configured');
      }

      const result: SmsDispatchResult = {
        success: true,
        messageId,
        phoneNumber: cleanPhone,
        body,
        timestamp: Date.now(),
      };

      this.dispatchLogs.unshift(result);
      if (this.dispatchLogs.length > 50) {
        this.dispatchLogs.pop();
      }

      return result;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to send SMS';
      const failedResult: SmsDispatchResult = {
        success: false,
        messageId,
        phoneNumber,
        body,
        timestamp: Date.now(),
        error: errorMsg,
      };

      this.dispatchLogs.unshift(failedResult);
      return failedResult;
    }
  }

  public getLogs(): SmsDispatchResult[] {
    return [...this.dispatchLogs];
  }
}

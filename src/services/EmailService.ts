import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocationPoint } from '../types';
import { randomHex } from './SecurityUtils';

interface SmtpEmailPlugin {
  saveCredentials(options: { host: string; port: number; username: string; password: string }): Promise<{ saved: boolean }>;
  clearCredentials(): Promise<{ cleared: boolean }>;
  hasCredentials(): Promise<{ configured: boolean }>;
  send(options: { recipient: string; subject: string; body: string }): Promise<{ sent: boolean }>;
}

const SmtpEmail = registerPlugin<SmtpEmailPlugin>('SmtpEmail');

export type EmailMode = 'SMTP' | 'MAILTO';
export interface EmailDispatchResult { success: boolean; messageId: string; recipient: string; body: string; timestamp: number; method: 'smtp' | 'mailto'; error?: string; }

export class EmailService {
  private static instance: EmailService;
  private logs: EmailDispatchResult[] = [];
  private constructor() {}
  public static getInstance(): EmailService { return this.instance ??= new EmailService(); }

  public mapsUrl(latitude: number, longitude: number): string {
    return `https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
  }

  public createBody(childName: string, reason: string, location: LocationPoint): string {
    const time = new Date(location.timestamp || Date.now()).toLocaleString('ar-DZ');
    return `تنبيه KidGuard\nاسم الطفل: ${childName}\nالسبب: ${reason}\nالوقت: ${time}\nالموقع: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}\nدقة GPS: ±${Math.round(location.accuracy)}م\nرابط الخريطة: ${this.mapsUrl(location.latitude, location.longitude)}`;
  }

  public async saveSmtpCredentials(host: string, port: number, username: string, password: string): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;
    try { 
      const result = await SmtpEmail.saveCredentials({ host: host.trim(), port, username: username.trim(), password });
      return result.saved; 
    } catch (error) {
      console.error('Save SMTP Credentials Error:', error);
      throw error; // Rethrow to let the UI handle specific error messages
    }
  }

  public async clearSmtpCredentials(): Promise<void> { if (Capacitor.isNativePlatform()) { try { await SmtpEmail.clearCredentials(); } catch { /* no-op */ } } }

  public async sendEmail(recipient: string, subject: string, body: string, mode: EmailMode): Promise<boolean> {
    if (mode === 'SMTP' && Capacitor.isNativePlatform()) {
      try {
        const result = await SmtpEmail.send({ recipient: recipient.trim(), subject, body });
        return result.sent;
      } catch (error) {
        console.error('SMTP Error:', error);
        throw error;
      }
    }
    if (mode === 'MAILTO') {
      try {
        const href = `mailto:${encodeURIComponent(recipient.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = href;
        return true;
      } catch { return false; }
    }
    return false;
  }

  public async sendAlert(recipient: string, childName: string, reason: string, location: LocationPoint, mode: EmailMode): Promise<EmailDispatchResult> {
    const messageId = `email_${Date.now()}_${randomHex(8)}`;
    const body = this.createBody(childName, reason, location);
    const subject = `🚨 KidGuard: خروج ${childName} من المنطقة الآمنة`;
    try {
      const success = await this.sendEmail(recipient, subject, body, mode);
      return this.remember({ success, messageId, recipient, body, timestamp: Date.now(), method: mode.toLowerCase() as 'smtp' | 'mailto', ...(success ? {} : { error: 'فشل الإرسال' }) });
    } catch (error) {
      return this.remember({ success: false, messageId, recipient, body, timestamp: Date.now(), method: mode.toLowerCase() as 'smtp' | 'mailto', error: String(error) });
    }
  }

  private remember(result: EmailDispatchResult): EmailDispatchResult { this.logs.unshift(result); if (this.logs.length > 50) this.logs.pop(); return result; }
  public getLogs(): EmailDispatchResult[] { return [...this.logs]; }
}

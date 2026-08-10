import { AlertPolicyConfig, LocationPoint, LoggedAlert, RiskAssessment } from '../types';
import { SmsService } from './SmsService';
import { AudioService } from './AudioService';
import { OfflineQueueService } from './OfflineQueueService';

export class AlertPolicyManager {
  private static instance: AlertPolicyManager;

  private config: AlertPolicyConfig = {
    firstExitAlertEnabled: true,
    triggerEmergencyOnExit: true,
    instant1mExitEmergency: true,
    autoSmsLocationOnExit: true,
    smsMode: 'CONFIRM',
    followUpIntervalMinutes: 5,
    maxFollowUpAlerts: 3,
    resetOnReturn: true,
    soundAlertEnabled: true,
    vibrationEnabled: true,
    smsEnabled: true,
    batterySmsEnabled: true,
    batteryAlertThreshold: 15,
    testModeEnabled: false,
    parentPhone: '',
    childName: 'طفل / Child',
    parentPinHash: '',
  };

  private activeIncidentId: string | null = null;
  private alertSentCount: number = 0;
  private lastAlertTimestamp: number = 0;
  private alertHistory: LoggedAlert[] = [];
  private lastBatteryAlertTimestamp = 0;

  private constructor() {
    this.loadConfig();
    this.loadAlertHistory();
  }

  public static getInstance(): AlertPolicyManager {
    if (!AlertPolicyManager.instance) {
      AlertPolicyManager.instance = new AlertPolicyManager();
    }
    return AlertPolicyManager.instance;
  }

  public getConfig(): AlertPolicyConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<AlertPolicyConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.saveConfig();
  }

  private saveConfig(): void {
    try {
      localStorage.setItem('kidguard_alert_policy', JSON.stringify(this.config));
    } catch (e) {
      console.warn('Failed to save alert policy', e);
    }
  }

  private loadConfig(): void {
    try {
      const saved = localStorage.getItem('kidguard_alert_policy');
      if (saved) {
        this.config = { ...this.config, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Failed to load alert policy', e);
    }
  }

  private saveAlertHistory(): void {
    try {
      localStorage.setItem(
        'kidguard_alert_history',
        JSON.stringify(this.alertHistory.slice(0, 50))
      );
    } catch (e) {
      console.warn('Failed to save alert history', e);
    }
  }

  private loadAlertHistory(): void {
    try {
      const saved = localStorage.getItem('kidguard_alert_history');
      if (saved) {
        this.alertHistory = JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load alert history', e);
    }
  }

  private triggerVibration(): void {
    if (!this.config.vibrationEnabled) return;
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([200, 100, 200, 100, 400]);
      }
    } catch {
      // ignore
    }
  }

  private triggerSoundAlert(): void {
    if (!this.config.soundAlertEnabled) return;
    try {
      AudioService.getInstance().playUiBeep();
    } catch {
      // ignore
    }
  }

  public async evaluateAndDispatch(
    assessment: RiskAssessment,
    location: LocationPoint
  ): Promise<LoggedAlert | null> {
    if (assessment.state === 'SAFE' || assessment.state === 'RETURNED_TO_SAFE_ZONE') {
      if (this.config.resetOnReturn && this.activeIncidentId) {
        this.activeIncidentId = null;
        this.alertSentCount = 0;
        this.lastAlertTimestamp = 0;
      }
      return null;
    }

    const now = Date.now();

    if (!this.activeIncidentId) {
      this.activeIncidentId = `inc_${now}_${Math.floor(Math.random() * 1000)}`;
      this.alertSentCount = 0;
      this.lastAlertTimestamp = 0;
    }

    const isFirstAlert = this.alertSentCount === 0;

    if (isFirstAlert) {
      if (!this.config.firstExitAlertEnabled) return null;
    } else {
      if (this.alertSentCount >= this.config.maxFollowUpAlerts) return null;
      const elapsedMinutes = (now - this.lastAlertTimestamp) / (1000 * 60);
      if (elapsedMinutes < this.config.followUpIntervalMinutes) return null;
    }

    const incidentId = this.activeIncidentId;
    const title = `[${assessment.riskLevel}] ${
      assessment.state === 'EMERGENCY'
        ? 'تنبيه طوارئ قسوى!'
        : 'تنبيه خروج من المنطقة الآمنة'
    }`;
    const reason =
      assessment.riskFactors.length > 0
        ? assessment.riskFactors[0]
        : 'خروج من المنطقة الآمنة';
    const message = `${this.config.childName}: ${reason}`;

    this.triggerVibration();
    this.triggerSoundAlert();

    let smsSent = false;

    // FIX: respect both smsEnabled AND autoSmsLocationOnExit
    const shouldSendSms =
      this.config.smsEnabled &&
      !!this.config.parentPhone &&
      (this.config.autoSmsLocationOnExit || assessment.state === 'EMERGENCY');

    if (shouldSendSms) {
      const res = await SmsService.getInstance().sendAlertSms(
        this.config.parentPhone,
        this.config.childName,
        reason,
        location,
        this.config.smsMode === 'AUTO' ? 'AUTO' : 'CONFIRM'
      );
      smsSent = res.success;
      if (!res.success && this.config.smsMode === 'AUTO') {
        OfflineQueueService.getInstance().enqueueEvent(
          'RISK_HIGH',
          incidentId,
          'child-local',
          { kind: 'sms', phoneNumber: this.config.parentPhone, childName: this.config.childName, reason, location },
        );
      }
    }

    const mapsLink = SmsService.getInstance().generateMapsUrl(
      location.latitude,
      location.longitude
    );

    const loggedAlert: LoggedAlert = {
      id: `alt_${now}_${Math.floor(Math.random() * 1000)}`,
      incidentId,
      title,
      message,
      level: assessment.riskLevel,
      location,
      timestamp: now,
      smsSent,
      mapsLink,
    };

    this.alertSentCount++;
    this.lastAlertTimestamp = now;
    this.alertHistory.unshift(loggedAlert);
    if (this.alertHistory.length > 100) this.alertHistory.pop();
    this.saveAlertHistory();

    return loggedAlert;
  }

  public async sendBatteryAlert(location: LocationPoint, batteryLevel: number): Promise<boolean> {
    const threshold = this.config.batteryAlertThreshold ?? 15;
    if (!this.config.batterySmsEnabled || batteryLevel > threshold || !this.config.parentPhone) return false;
    const now = Date.now();
    if (now - this.lastBatteryAlertTimestamp < 6 * 60 * 60 * 1000) return false;
    this.lastBatteryAlertTimestamp = now;
    const result = await SmsService.getInstance().sendAlertSms(
      this.config.parentPhone,
      this.config.childName,
      `انخفاض حاد في البطارية: ${batteryLevel}%`,
      location,
      this.config.smsMode === 'AUTO' ? 'AUTO' : 'CONFIRM'
    );
    if (!result.success && this.config.smsMode === 'AUTO') {
      OfflineQueueService.getInstance().enqueueEvent(
        'BATTERY_CRITICAL',
        `battery_${now}`,
        'child-local',
        { kind: 'sms', phoneNumber: this.config.parentPhone, childName: this.config.childName, reason: `البطارية ${batteryLevel}%`, location },
      );
    }
    return result.success;
  }

  public getAlertHistory(): LoggedAlert[] {
    return [...this.alertHistory];
  }

  public clearAlertHistory(): void {
    this.alertHistory = [];
    this.saveAlertHistory();
  }

  /** Validate Algerian mobile: +2135/6/7XXXXXXXX or 05/06/07XXXXXXXX */
  public static isValidAlgeriaPhone(phone: string): boolean {
    const cleaned = phone.replace(/[\s\-()]/g, '');
    return /^(\+213|0)[5-7]\d{8}$/.test(cleaned);
  }
}
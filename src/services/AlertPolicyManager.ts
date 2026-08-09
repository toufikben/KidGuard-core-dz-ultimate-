import { AlertPolicyConfig, LocationPoint, LoggedAlert, RiskAssessment } from '../types';
import { SmsService } from './SmsService';

export class AlertPolicyManager {
  private static instance: AlertPolicyManager;

  private config: AlertPolicyConfig = {
    firstExitAlertEnabled: true,
    triggerEmergencyOnExit: true, // Trigger emergency siren automatically on exit
    instant1mExitEmergency: true, // Default to true (Immediate full danger mode on exit >1m)
    autoSmsLocationOnExit: true, // Default to true (Automatic instant SMS with GPS location link)
    followUpIntervalMinutes: 5,
    maxFollowUpAlerts: 3,
    resetOnReturn: true,
    soundAlertEnabled: true,
    vibrationEnabled: true,
    smsEnabled: true,
    parentPhone: '+213555123456',
    childName: 'أمير / Amir',
    parentPin: '1234',
  };

  private activeIncidentId: string | null = null;
  private alertSentCount: number = 0;
  private lastAlertTimestamp: number = 0;
  private alertHistory: LoggedAlert[] = [];

  private constructor() {
    this.loadConfig();
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
      console.warn('Failed to save alert policy to localStorage', e);
    }
  }

  private loadConfig(): void {
    try {
      const saved = localStorage.getItem('kidguard_alert_policy');
      if (saved) {
        this.config = { ...this.config, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Failed to load alert policy from localStorage', e);
    }
  }

  /**
   * Processes risk evaluation & determines if SMS / Alert trigger is needed
   */
  public async evaluateAndDispatch(
    assessment: RiskAssessment,
    location: LocationPoint
  ): Promise<LoggedAlert | null> {
    // 1. Reset on Safe Return
    if (assessment.state === 'SAFE' || assessment.state === 'RETURNED_TO_SAFE_ZONE') {
      if (this.config.resetOnReturn && this.activeIncidentId) {
        console.log(`[AlertPolicy] Child returned to safe zone. Resetting incident ${this.activeIncidentId}`);
        this.activeIncidentId = null;
        this.alertSentCount = 0;
        this.lastAlertTimestamp = 0;
      }
      return null;
    }

    const now = Date.now();

    // 2. Start new Incident if none active
    if (!this.activeIncidentId) {
      this.activeIncidentId = `inc_${now}_${Math.floor(Math.random() * 1000)}`;
      this.alertSentCount = 0;
      this.lastAlertTimestamp = 0;
    }

    // 3. Check if first exit alert
    const isFirstAlert = this.alertSentCount === 0;

    if (isFirstAlert) {
      if (!this.config.firstExitAlertEnabled) return null;
    } else {
      // Follow-up checks
      if (this.alertSentCount >= this.config.maxFollowUpAlerts) {
        return null; // Max follow ups reached
      }

      const elapsedMinutes = (now - this.lastAlertTimestamp) / (1000 * 60);
      if (elapsedMinutes < this.config.followUpIntervalMinutes) {
        return null; // Interval not reached yet
      }
    }

    // Prepare Alert
    const incidentId = this.activeIncidentId;
    const title = `[${assessment.riskLevel}] ${
      assessment.state === 'EMERGENCY'
        ? 'تنبيه طوارئ قسوى!'
        : 'تنبيه خروج من المنطقة الآمنة'
    }`;
    const reason = assessment.riskFactors.length > 0 ? assessment.riskFactors[0] : 'خروج من المنطقة الآمنة';
    const message = `${this.config.childName}: ${reason}`;

    let smsSent = false;

    // Send SMS if enabled
    if (this.config.smsEnabled && this.config.parentPhone) {
      const smsService = SmsService.getInstance();
      const res = await smsService.sendAlertSms(
        this.config.parentPhone,
        this.config.childName,
        reason,
        location
      );
      smsSent = res.success;
    }

    const mapsLink = SmsService.getInstance().generateMapsUrl(location.latitude, location.longitude);

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

    if (this.alertHistory.length > 100) {
      this.alertHistory.pop();
    }

    return loggedAlert;
  }

  public getAlertHistory(): LoggedAlert[] {
    return [...this.alertHistory];
  }

  public clearAlertHistory(): void {
    this.alertHistory = [];
  }
}

export type DeviceRole = 'PARENT' | 'CHILD';

export type KidState =
  | 'SAFE'
  | 'OUTSIDE_ZONE'
  | 'MONITORING'
  | 'SUSPICIOUS'
  | 'DANGER'
  | 'EMERGENCY'
  | 'RETURNED_TO_SAFE_ZONE';

export type ExitCandidateStatus = 'SAFE_INSIDE' | 'EXIT_PENDING' | 'EXIT_CONFIRMED';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface LocationPoint {
  latitude: number;
  longitude: number;
  accuracy: number; // in meters
  speed: number | null; // in m/s or km/h
  heading: number | null;
  altitude: number | null;
  timestamp: number;
  isMockLocation?: boolean;
}

export interface SafeZone {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number; // in meters (e.g. 100m to 1000m)
  active: boolean;
  createdAt: number;
}

export interface RiskAssessment {
  riskScore: number; // 0 to 100
  riskLevel: RiskLevel;
  confidence: number; // 0 to 100%
  riskFactors: string[];
  state: KidState;
  timestamp: number;
}

export interface AlertPolicyConfig {
  firstExitAlertEnabled: boolean;
  triggerEmergencyOnExit: boolean; // Automatic full emergency siren trigger on exit
  instant1mExitEmergency?: boolean; // Immediate full danger mode on exiting safe zone even by 1 meter
  autoSmsLocationOnExit?: boolean; // Automatic alert on danger/exit
  smsMode?: 'AUTO' | 'CONFIRM'; // AUTO uses native direct SMS when permission is granted; CONFIRM opens the composer
  followUpIntervalMinutes: number; // e.g. 5
  maxFollowUpAlerts: number; // e.g. 3
  resetOnReturn: boolean;
  soundAlertEnabled: boolean;
  vibrationEnabled: boolean;
  smsEnabled: boolean;
  batterySmsEnabled?: boolean;
  batteryAlertThreshold?: number;
  testModeEnabled?: boolean;
  parentPhone: string;
  childName: string;
  parentPinHash?: string; // SHA-256 hash; the raw PIN is never persisted
}

export interface OfflineEvent {
  id: string;
  incidentId: string;
  kidId: string;
  zoneId?: string;
  eventType: 'EXIT_CONFIRMED' | 'RISK_HIGH' | 'EMERGENCY' | 'RETURNED_SAFE' | 'BATTERY_CRITICAL' | 'TAMPER_ALERT';
  payload: Record<string, unknown>;
  timestamp: number;
  status: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED';
  retryCount: number;
}

export interface HealthStatus {
  protectionActive: boolean;
  gpsActive: boolean;
  networkConnected: boolean;
  batteryLevel: number; // 0-100
  batteryState: 'NORMAL' | 'OPTIMIZED' | 'SAVING' | 'CRITICAL';
  lastLocationTime: number | null;
  lastSyncTime: number | null;
  permissionsGranted: {
    location: boolean;
    notification: boolean;
    microphone: boolean;
  };
  mockLocationDetected: boolean;
  tamperDetected: boolean;
}

export interface DevicePairing {
  kidId: string;
  childName: string;
  deviceToken: string;
  pairingCode: string;
  pairedAt: number;
  parentAccountId: string;
  isPaired: boolean;
}

export interface EmergencyAudioState {
  isRecording: boolean;
  durationSeconds: number;
  maxDurationSeconds: number;
  audioBlobUrl: string | null;
  recordedAt: number | null;
}

export interface LoggedAlert {
  id: string;
  incidentId: string;
  title: string;
  message: string;
  level: RiskLevel;
  location: LocationPoint;
  timestamp: number;
  smsSent: boolean;
  mapsLink: string;
}

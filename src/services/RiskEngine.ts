import { KidState, LocationPoint, RiskAssessment, RiskLevel } from '../types';
import { GeofenceEvaluation } from './GeofenceMonitor';

export class RiskEngine {
  private static instance: RiskEngine;
  private exitStartTime: number | null = null;

  private constructor() {}

  public static getInstance(): RiskEngine {
    if (!RiskEngine.instance) {
      RiskEngine.instance = new RiskEngine();
    }
    return RiskEngine.instance;
  }

  public assessRisk(
    location: LocationPoint,
    geofenceEval: GeofenceEvaluation,
    batteryLevel: number,
    isTampered: boolean,
    isMockLocation: boolean,
    lang: 'ar' | 'en' | 'fr' = 'ar',
    instant1mExitEmergency: boolean = false
  ): RiskAssessment {
    const factors: string[] = [];
    let score = 0;

    // 1. Check Safe Zone Status
    if (geofenceEval.status === 'SAFE_INSIDE') {
      const wasOutside = this.exitStartTime !== null;
      this.exitStartTime = null;

      if (wasOutside) {
        return {
          riskScore: 0,
          riskLevel: 'LOW',
          confidence: geofenceEval.confidence,
          riskFactors: [
            lang === 'ar' ? 'عاد الطفل بأمان داخل المنطقة الآمنة' : 'Child safely returned to Safe Zone',
          ],
          state: 'RETURNED_TO_SAFE_ZONE',
          timestamp: Date.now(),
        };
      }

      return {
        riskScore: 0,
        riskLevel: 'LOW',
        confidence: geofenceEval.confidence,
        riskFactors: [
          lang === 'ar'
            ? `داخل ${geofenceEval.insideZoneNames.join(', ')}`
            : `Inside ${geofenceEval.insideZoneNames.join(', ')}`,
        ],
        state: 'SAFE',
        timestamp: Date.now(),
      };
    }

    // 2. Confirmed Exit handling - Enforce Minimum Floor (MEDIUM)
    if (!this.exitStartTime) {
      this.exitStartTime = Date.now();
    }

    const durationOutsideMs = Date.now() - this.exitStartTime;
    const durationMinutes = Math.floor(durationOutsideMs / 60000);

    if (instant1mExitEmergency) {
      score = 100;
      factors.push(
        lang === 'ar'
          ? `خروج فوري بـ 1+ متر عن المنطقة الآمنة (${geofenceEval.nearestZoneName || 'المنطقة'}) - وضع الخطر القسوي المباشر!`
          : `Instant exit (1m+) from Safe Zone (${geofenceEval.nearestZoneName || 'Zone'}) - Full Danger Mode Activated!`
      );
    } else {
      // Floor at MEDIUM (min 45 points) for confirmed exit
      score += 45;
      factors.push(
        lang === 'ar'
          ? `خروج مؤكد من المنطقة الآمنة (${geofenceEval.nearestZoneName || 'المنطقة'})`
          : `Confirmed exit from Safe Zone (${geofenceEval.nearestZoneName || 'Zone'})`
      );
    }

    // 3. Duration Factor
    if (durationMinutes > 0) {
      const durationScore = Math.min(25, durationMinutes * 3);
      score += durationScore;
      factors.push(
        lang === 'ar'
          ? `مستمر خارج المنطقة منذ ${durationMinutes} دقيقة`
          : `Outside safe zone for ${durationMinutes} minutes`
      );
    }

    // 4. Distance Delta
    const distance = geofenceEval.distanceToNearestZone;
    if (distance > 800) {
      score += 20;
      factors.push(
        lang === 'ar'
          ? `ابتعاد كبير: ${distance} متر عن أقرب منطقة`
          : `High distance delta: ${distance} meters from nearest zone`
      );
    } else if (distance > 300) {
      score += 10;
      factors.push(
        lang === 'ar'
          ? `ابتعاد متوسط: ${distance} متر`
          : `Moderate distance: ${distance} meters`
      );
    }

    // 5. Speed / Vehicular motion detection
    const speedKmH = location.speed
      ? Math.round((location.speed > 50 ? location.speed : location.speed * 3.6))
      : 0;

    if (speedKmH > 35) {
      score += 20;
      factors.push(
        lang === 'ar'
          ? `سرعة تحرك عالية (مركبة): ${speedKmH} كم/س`
          : `Vehicular speed detected: ${speedKmH} km/h`
      );
    } else if (speedKmH > 15) {
      score += 10;
      factors.push(
        lang === 'ar'
          ? `سرعة تحرك سريعة (دراجة/ركض): ${speedKmH} كم/س`
          : `Fast movement speed: ${speedKmH} km/h`
      );
    }

    // 6. Security & Tampering
    if (isTampered || isMockLocation || location.isMockLocation) {
      score += 35;
      factors.push(
        lang === 'ar'
          ? 'اكتشاف موقع وهمي أو محاولة العبث بالنظام'
          : 'Mock location or app tampering detected'
      );
    }

    // 7. Battery State
    if (batteryLevel <= 10) {
      score += 15;
      factors.push(
        lang === 'ar'
          ? `مستوى بطارية حرج: ${batteryLevel}%`
          : `Critical battery level: ${batteryLevel}%`
      );
    }

    // Cap score at 100
    score = Math.min(100, score);

    // Map Risk Score to RiskLevel & State
    let riskLevel: RiskLevel = 'MEDIUM';
    let state: KidState = 'OUTSIDE_ZONE';

    if (score >= 85) {
      riskLevel = 'CRITICAL';
      state = instant1mExitEmergency ? 'EMERGENCY' : 'DANGER';
    } else if (score >= 70) {
      riskLevel = 'HIGH';
      state = 'SUSPICIOUS';
    } else if (score >= 55) {
      riskLevel = 'MEDIUM';
      state = 'MONITORING';
    } else {
      riskLevel = 'MEDIUM';
      state = 'OUTSIDE_ZONE';
    }

    return {
      riskScore: score,
      riskLevel,
      confidence: geofenceEval.confidence,
      riskFactors: factors,
      state,
      timestamp: Date.now(),
    };
  }

  public resetEngine(): void {
    this.exitStartTime = null;
  }
}

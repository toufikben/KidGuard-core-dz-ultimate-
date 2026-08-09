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

  /** HTML5 Geolocation speed is always in m/s → convert to km/h */
  private toKmH(speedMs: number | null | undefined): number {
    if (speedMs == null || isNaN(speedMs) || speedMs < 0) return 0;
    return Math.round(speedMs * 3.6);
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

    // 1. Inside safe zone
    if (geofenceEval.status === 'SAFE_INSIDE') {
      const wasOutside = this.exitStartTime !== null;
      this.exitStartTime = null;

      if (wasOutside) {
        return {
          riskScore: 0,
          riskLevel: 'LOW',
          confidence: geofenceEval.confidence,
          riskFactors: [
            lang === 'ar'
              ? 'عاد الطفل بأمان داخل المنطقة الآمنة'
              : lang === 'fr'
              ? 'Enfant revenu en sécurité dans la zone'
              : 'Child safely returned to Safe Zone',
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
            ? `داخل ${geofenceEval.insideZoneNames.join(', ') || 'المنطقة الآمنة'}`
            : lang === 'fr'
            ? `À l'intérieur de ${geofenceEval.insideZoneNames.join(', ') || 'zone sûre'}`
            : `Inside ${geofenceEval.insideZoneNames.join(', ') || 'Safe Zone'}`,
        ],
        state: 'SAFE',
        timestamp: Date.now(),
      };
    }

    // 2. Confirmed exit
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
          : lang === 'fr'
          ? `Sortie instantanée (1m+) de la zone sûre (${geofenceEval.nearestZoneName || 'Zone'}) - Mode Danger activé!`
          : `Instant exit (1m+) from Safe Zone (${geofenceEval.nearestZoneName || 'Zone'}) - Full Danger Mode Activated!`
      );
    } else {
      score += 45;
      factors.push(
        lang === 'ar'
          ? `خروج مؤكد من المنطقة الآمنة (${geofenceEval.nearestZoneName || 'المنطقة'})`
          : lang === 'fr'
          ? `Sortie confirmée de la zone sûre (${geofenceEval.nearestZoneName || 'Zone'})`
          : `Confirmed exit from Safe Zone (${geofenceEval.nearestZoneName || 'Zone'})`
      );
    }

    // 3. Duration
    if (durationMinutes > 0) {
      const durationScore = Math.min(25, durationMinutes * 3);
      score += durationScore;
      factors.push(
        lang === 'ar'
          ? `مستمر خارج المنطقة منذ ${durationMinutes} دقيقة`
          : lang === 'fr'
          ? `Hors zone depuis ${durationMinutes} minute(s)`
          : `Outside safe zone for ${durationMinutes} minutes`
      );
    }

    // 4. Distance
    const distance = geofenceEval.distanceToNearestZone;
    if (distance > 800) {
      score += 20;
      factors.push(
        lang === 'ar'
          ? `ابتعاد كبير: ${distance} متر عن أقرب منطقة`
          : lang === 'fr'
          ? `Grande distance: ${distance} m de la zone la plus proche`
          : `High distance delta: ${distance} meters from nearest zone`
      );
    } else if (distance > 300) {
      score += 10;
      factors.push(
        lang === 'ar'
          ? `ابتعاد متوسط: ${distance} متر`
          : lang === 'fr'
          ? `Distance moyenne: ${distance} m`
          : `Moderate distance: ${distance} meters`
      );
    }

    // 5. Speed (always m/s → km/h)
    const speedKmH = this.toKmH(location.speed);
    if (speedKmH > 35) {
      score += 20;
      factors.push(
        lang === 'ar'
          ? `سرعة تحرك عالية (مركبة): ${speedKmH} كم/س`
          : lang === 'fr'
          ? `Vitesse élevée (véhicule): ${speedKmH} km/h`
          : `Vehicular speed detected: ${speedKmH} km/h`
      );
    } else if (speedKmH > 15) {
      score += 10;
      factors.push(
        lang === 'ar'
          ? `سرعة تحرك سريعة (دراجة/ركض): ${speedKmH} كم/س`
          : lang === 'fr'
          ? `Mouvement rapide: ${speedKmH} km/h`
          : `Fast movement speed: ${speedKmH} km/h`
      );
    }

    // 6. Tamper / mock location
    if (isTampered || isMockLocation || location.isMockLocation) {
      score += 35;
      factors.push(
        lang === 'ar'
          ? 'اكتشاف موقع وهمي أو محاولة العبث بالنظام'
          : lang === 'fr'
          ? 'Fausse position ou altération détectée'
          : 'Mock location or app tampering detected'
      );
    }

    // 7. Critical battery
    if (batteryLevel <= 10) {
      score += 15;
      factors.push(
        lang === 'ar'
          ? `مستوى بطارية حرج: ${batteryLevel}%`
          : lang === 'fr'
          ? `Batterie critique: ${batteryLevel}%`
          : `Critical battery level: ${batteryLevel}%`
      );
    }

    score = Math.min(100, score);

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
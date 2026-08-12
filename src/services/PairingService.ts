import { DevicePairing } from '../types';
import { randomDigits, randomHex } from './SecurityUtils';

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_PAIRING_ATTEMPTS = 5;

export class PairingService {
  private static instance: PairingService;
  private pairingInfo: DevicePairing;
  private readonly STORAGE_KEY = 'kidguard_device_pairing';

  private constructor() {
    this.pairingInfo = this.loadPairingInfo();
  }

  public static getInstance(): PairingService {
    if (!PairingService.instance) PairingService.instance = new PairingService();
    return PairingService.instance;
  }

  private loadPairingInfo(): DevicePairing {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<DevicePairing>;
        return {
          kidId: parsed.kidId ?? `kid_${randomHex(12)}`,
          childName: parsed.childName ?? '',
          deviceToken: parsed.deviceToken ?? `device_${randomHex(24)}`,
          pairingCode: parsed.pairingCode ?? randomDigits(6),
          pairingCodeExpiresAt: parsed.pairingCodeExpiresAt ?? 0,
          pairingAttempts: parsed.pairingAttempts ?? 0,
          pairedAt: parsed.pairedAt ?? 0,
          parentAccountId: parsed.parentAccountId ?? `parent_${randomHex(12)}`,
          isPaired: parsed.isPaired ?? false,
          revokedAt: parsed.revokedAt ?? null,
          sessionExpiresAt: parsed.sessionExpiresAt ?? null,
        };
      }
    } catch {
      // Corrupt local state is replaced with a fresh identity below.
    }

    const generated: DevicePairing = {
      kidId: `kid_${randomHex(12)}`,
      childName: '',
      deviceToken: `device_${randomHex(24)}`,
      pairingCode: randomDigits(6),
      pairingCodeExpiresAt: Date.now() + PAIRING_CODE_TTL_MS,
      pairingAttempts: 0,
      pairedAt: 0,
      parentAccountId: `parent_${randomHex(12)}`,
      isPaired: false,
      revokedAt: null,
      sessionExpiresAt: null,
    };
    this.pairingInfo = generated;
    this.savePairingInfo();
    return generated;
  }

  private savePairingInfo(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.pairingInfo));
    } catch {
      // Keep the in-memory state usable if local persistence is unavailable.
    }
  }

  public getPairingInfo(): DevicePairing {
    return { ...this.pairingInfo };
  }

  public generateNewPairingCode(): string {
    this.pairingInfo.pairingCode = randomDigits(6);
    this.pairingInfo.pairingCodeExpiresAt = Date.now() + PAIRING_CODE_TTL_MS;
    this.pairingInfo.pairingAttempts = 0;
    this.pairingInfo.revokedAt = null;
    this.savePairingInfo();
    return this.pairingInfo.pairingCode;
  }

  public pairWithCode(inputCode: string): boolean {
    const normalized = inputCode.trim();
    const now = Date.now();
    if (this.pairingInfo.isPaired && this.isSessionValid(now)) return false;
    if (this.pairingInfo.pairingAttempts >= MAX_PAIRING_ATTEMPTS) return false;
    if (now > this.pairingInfo.pairingCodeExpiresAt) return false;

    this.pairingInfo.pairingAttempts += 1;
    if (normalized !== this.pairingInfo.pairingCode) {
      this.savePairingInfo();
      return false;
    }

    this.pairingInfo.isPaired = true;
    this.pairingInfo.pairedAt = now;
    this.pairingInfo.sessionExpiresAt = now + SESSION_TTL_MS;
    this.pairingInfo.revokedAt = null;
    this.savePairingInfo();
    return true;
  }

  public isSessionValid(at = Date.now()): boolean {
    return Boolean(
      this.pairingInfo.isPaired &&
      !this.pairingInfo.revokedAt &&
      this.pairingInfo.sessionExpiresAt &&
      this.pairingInfo.sessionExpiresAt > at
    );
  }

  public revokeDevice(): void {
    this.pairingInfo.isPaired = false;
    this.pairingInfo.revokedAt = Date.now();
    this.pairingInfo.sessionExpiresAt = null;
    this.pairingInfo.pairingCode = randomDigits(6);
    this.pairingInfo.pairingCodeExpiresAt = 0;
    this.pairingInfo.pairingAttempts = MAX_PAIRING_ATTEMPTS;
    this.savePairingInfo();
  }

  public unpairDevice(): void {
    this.revokeDevice();
  }

  public static getPairingCodeTtlMs(): number {
    return PAIRING_CODE_TTL_MS;
  }

  public static getMaxPairingAttempts(): number {
    return MAX_PAIRING_ATTEMPTS;
  }
}

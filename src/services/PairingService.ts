import { DevicePairing } from '../types';

export class PairingService {
  private static instance: PairingService;
  private pairingInfo: DevicePairing;
  private STORAGE_KEY = 'kidguard_device_pairing';

  private constructor() {
    this.pairingInfo = this.loadPairingInfo();
  }

  public static getInstance(): PairingService {
    if (!PairingService.instance) {
      PairingService.instance = new PairingService();
    }
    return PairingService.instance;
  }

  private loadPairingInfo(): DevicePairing {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load pairing info from localStorage', e);
    }

    // Default pairing code
    return {
      kidId: 'kid_dz_8912',
      childName: 'أمير / Amir',
      deviceToken: 'tok_dz_77192831',
      pairingCode: '892410',
      pairedAt: Date.now(),
      parentAccountId: 'parent_acc_001',
      isPaired: true,
    };
  }

  private savePairingInfo(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.pairingInfo));
    } catch (e) {
      console.warn('Failed to save pairing info', e);
    }
  }

  public getPairingInfo(): DevicePairing {
    return { ...this.pairingInfo };
  }

  public generateNewPairingCode(): string {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    this.pairingInfo.pairingCode = code;
    this.savePairingInfo();
    return code;
  }

  public pairWithCode(inputCode: string): boolean {
    if (inputCode.trim() === this.pairingInfo.pairingCode.trim()) {
      this.pairingInfo.isPaired = true;
      this.pairingInfo.pairedAt = Date.now();
      this.savePairingInfo();
      return true;
    }
    return false;
  }

  public unpairDevice(): void {
    this.pairingInfo.isPaired = false;
    this.savePairingInfo();
  }
}

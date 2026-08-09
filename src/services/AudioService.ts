import { EmergencyAudioState } from '../types';

export class AudioService {
  private static instance: AudioService;
  private audioCtx: AudioContext | null = null;
  private sirenOscillator: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private sirenInterval: number | null = null;
  private isSirenActive: boolean = false;

  // MediaRecorder for emergency audio
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recordingTimer: number | null = null;

  private audioState: EmergencyAudioState = {
    isRecording: false,
    durationSeconds: 0,
    maxDurationSeconds: 30, // 30s emergency limit
    audioBlobUrl: null,
    recordedAt: null,
  };

  private constructor() {}

  public static getInstance(): AudioService {
    if (!AudioService.instance) {
      AudioService.instance = new AudioService();
    }
    return AudioService.instance;
  }

  /**
   * Triggers Web Audio Siren Synth
   */
  public startEmergencySiren(): void {
    if (this.isSirenActive) return;

    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!this.audioCtx) {
        this.audioCtx = new AudioCtxClass();
      }

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      this.sirenOscillator = this.audioCtx.createOscillator();
      this.sirenGain = this.audioCtx.createGain();

      this.sirenOscillator.type = 'sawtooth';
      this.sirenGain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);

      this.sirenOscillator.connect(this.sirenGain);
      this.sirenGain.connect(this.audioCtx.destination);

      let highFreq = true;
      this.sirenOscillator.frequency.setValueAtTime(700, this.audioCtx.currentTime);

      this.sirenOscillator.start();
      this.isSirenActive = true;

      // Alternating frequency siren pitch
      this.sirenInterval = window.setInterval(() => {
        if (!this.sirenOscillator || !this.audioCtx) return;
        const targetFreq = highFreq ? 1200 : 700;
        this.sirenOscillator.frequency.exponentialRampToValueAtTime(
          targetFreq,
          this.audioCtx.currentTime + 0.3
        );
        highFreq = !highFreq;
      }, 400);
    } catch (e) {
      console.warn('Failed to start audio siren', e);
    }
  }

  public stopEmergencySiren(): void {
    if (this.sirenInterval) {
      clearInterval(this.sirenInterval);
      this.sirenInterval = null;
    }

    if (this.sirenOscillator) {
      try {
        this.sirenOscillator.stop();
        this.sirenOscillator.disconnect();
      } catch (e) {
        console.warn('Error stopping oscillator', e);
      }
      this.sirenOscillator = null;
    }

    this.isSirenActive = false;
  }

  public isSirenRunning(): boolean {
    return this.isSirenActive;
  }

  /**
   * Plays a UI confirmation sound
   */
  public playUiBeep(): void {
    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtxClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {
      console.warn('UI Beep failed', e);
    }
  }

  /**
   * Emergency Microphone Audio Recording
   */
  public async startEmergencyRecording(
    onProgress?: (duration: number) => void,
    onComplete?: (blobUrl: string) => void
  ): Promise<boolean> {
    if (this.audioState.isRecording) return false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);

        this.audioState = {
          ...this.audioState,
          isRecording: false,
          audioBlobUrl: url,
          recordedAt: Date.now(),
        };

        if (onComplete) {
          onComplete(url);
        }

        // Stop all track streams
        stream.getTracks().forEach((track) => track.stop());
      };

      this.mediaRecorder.start();
      this.audioState.isRecording = true;
      this.audioState.durationSeconds = 0;

      // Timer for max duration & progress
      this.recordingTimer = window.setInterval(() => {
        this.audioState.durationSeconds++;
        if (onProgress) {
          onProgress(this.audioState.durationSeconds);
        }

        if (this.audioState.durationSeconds >= this.audioState.maxDurationSeconds) {
          this.stopEmergencyRecording();
        }
      }, 1000);

      return true;
    } catch (err) {
      console.warn('Microphone permission denied or audio recording failed', err);
      return false;
    }
  }

  public stopEmergencyRecording(): void {
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    this.audioState.isRecording = false;
  }

  public getAudioState(): EmergencyAudioState {
    return { ...this.audioState };
  }
}

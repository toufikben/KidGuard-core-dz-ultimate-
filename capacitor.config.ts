import type { CapacitorConfig } from '@capacitor/core';

const config: CapacitorConfig = {
  appId: 'dz.kidguard.app',
  appName: 'KidGuard DZ',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  // Critical for background location on Android (prevents halt after ~5 min)
  android: {
    useLegacyBridge: true,
  },
  plugins: {
    Geolocation: {
      // default options if needed
    },
  },
};

export default config;
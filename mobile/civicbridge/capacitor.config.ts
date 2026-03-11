import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.civicbridge.app',
  appName: 'CivicBridge',
  webDir: 'dist',
  server: {
    // For development, point to your backend
    // In production, the app serves from the bundled dist folder
    androidScheme: 'https',
    allowNavigation: ['*'],
  },
  plugins: {
    Keyboard: {
      resize: 'body' as const,
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: 'LIGHT' as const,
      backgroundColor: '#FF9933',
    },
    Camera: {
      // Android permissions handled in AndroidManifest
    },
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
};

export default config;

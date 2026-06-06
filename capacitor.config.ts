import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.babybuddy.app',
  appName: '宝宝管家',
  webDir: 'dist',
  server: {
    // Allow connecting to local network servers (BabyBuddy, fnOS NAS)
    allowNavigation: [
      'http://*',
      'https://*'
    ]
  },
  plugins: {
    // Enable CapacitorHttp to patch global fetch with native HTTP client (bypasses CORS)
    CapacitorHttp: {
      enabled: true,
    },
  },
  android: {
    // Allow mixed content (HTTP images/videos from NAS)
    allowMixedContent: true,
    // Use Cleartext traffic for local network
    useLegacyBridge: false,
    // WebView settings
    backgroundColor: '#FDF6F0'
  }
}

export default config

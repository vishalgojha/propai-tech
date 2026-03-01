import type { CapacitorConfig } from '@capacitor/cli';

const defaultRailwayAppUrl = 'https://propai.live/app';
const configuredRailwayUrl = (
  process.env.PROPAI_RAILWAY_APP_URL ||
  process.env.RAILWAY_APP_URL ||
  defaultRailwayAppUrl
).trim();
const normalizedRailwayUrl = configuredRailwayUrl.replace(/\/+$/, '');
const railwayAppUrl = normalizedRailwayUrl.endsWith('/app')
  ? normalizedRailwayUrl
  : `${normalizedRailwayUrl}/app`;

const config: CapacitorConfig = {
  appId: 'com.propai.mobile',
  appName: 'PropAI Railway Tool',
  webDir: 'www',
  server: {
    url: railwayAppUrl,
    cleartext: railwayAppUrl.startsWith('http://')
  },
  android: {
    allowMixedContent: false
  }
};

export default config;

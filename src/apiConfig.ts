// Live Server Configuration
const LIVE_SERVER_URL = 'https://taxi.webase.co.in';

// API & Socket URLs (Live Server)
export const API_BASE = `${LIVE_SERVER_URL}/api`;
export const SOCKET_URL = LIVE_SERVER_URL;

if (__DEV__) {
  console.log('🚀 App configured for: LIVE SERVER');
  console.log(`- API Base: ${API_BASE}`);
  console.log(`- Socket URL: ${SOCKET_URL}`);
}
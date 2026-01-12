// Localhost + ngrok Configuration
const NGROK_URL = 'https://0e5bbf94f290.ngrok-free.app';
const LOCALHOST_URL = 'http://localhost:5001';

// Use ngrok URL for development (ngrok forwards to localhost:5001)
const SERVER_URL = NGROK_URL;

// API & Socket URLs (Localhost + ngrok)
export const API_BASE = `${SERVER_URL}/api`;
export const SOCKET_URL = SERVER_URL;

if (__DEV__) {
  console.log('🚀 App configured for: LOCALHOST + NGROK');
  console.log(`- ngrok URL: ${NGROK_URL}`);
  console.log(`- Localhost: ${LOCALHOST_URL}`);
  console.log(`- API Base: ${API_BASE}`);
  console.log(`- Socket URL: ${SOCKET_URL}`);
}
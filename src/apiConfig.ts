// config/apiConfig.js (or wherever this file is)

const NGROK_BASE_URL = 'https://c4b82147a41d.ngrok-free.app';

// API & Socket URLs (ngrok only)
export const API_BASE = `${NGROK_BASE_URL}/api`;
export const SOCKET_URL = NGROK_BASE_URL;

console.log('🚀 App configured for: NGROK SERVER ONLY');
console.log(`- API Base: ${API_BASE}`);
console.log(`- Socket URL: ${SOCKET_URL}`);





// import { Platform } from 'react-native';

// // --- Select URLs based on environment ---
// // Set to `true` for local development, `false` for production
// const IS_DEVELOPMENT = true;  // ✅ LOCALHOST MODE - Using local development server

// // ✅ NGROK CONFIGURATION - Using ngrok tunnel
// // Using ngrok URL for both Android and iOS (works for real devices too)
// const NGROK_URL = 'https://27a41765479f.ngrok-free.app';

// const LOCAL_API_URL_ANDROID = `${NGROK_URL}/api`;
// const LOCAL_SOCKET_URL_ANDROID = NGROK_URL;

// // For iOS Simulator - using same ngrok URL
// const LOCAL_API_URL_IOS = `${NGROK_URL}/api`;
// const LOCAL_SOCKET_URL_IOS = NGROK_URL;

// // Production server (currently disabled)
// const PROD_API_URL = 'http://localhost:5001/api';
// const PROD_SOCKET_URL = 'http://localhost:5001';

// export const API_BASE = IS_DEVELOPMENT
//   ? Platform.select({
//       android: LOCAL_API_URL_ANDROID,
//       ios: LOCAL_API_URL_IOS,
//     })
//   : PROD_API_URL;

// export const SOCKET_URL = IS_DEVELOPMENT
//   ? Platform.select({
//       android: LOCAL_SOCKET_URL_ANDROID,
//       ios: LOCAL_SOCKET_URL_IOS,
//     })
//   : PROD_SOCKET_URL;

// console.log(`🚀 App configured for: ${IS_DEVELOPMENT ? 'LOCAL SERVER' : 'LIVE SERVER'}`);
// console.log(`- API Base: ${API_BASE}`);
// console.log(`- Socket URL: ${SOCKET_URL}`);
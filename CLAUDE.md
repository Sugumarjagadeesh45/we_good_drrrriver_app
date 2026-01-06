# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EazyGo Driver is a React Native driver application for a ride-hailing platform. The app handles real-time ride requests, GPS tracking, fare calculations, and driver-customer interactions through Socket.IO and Firebase Cloud Messaging.

## Development Commands

### Running the App
```bash
# Start Metro bundler
npm start

# Run on Android
npm run android

# Run on iOS
npm run ios
```

### Build & Quality
```bash
# Run linter
npm run lint

# Run tests
npm test
```

### Platform-Specific Commands
```bash
# Android - Clean build
cd android && ./gradlew clean && cd ..

# iOS - Install pods (after adding new dependencies)
cd ios && pod install && cd ..
```

## Architecture

### Navigation Structure
The app uses React Navigation with a native stack navigator ([App.tsx:153](App.tsx#L153)):
- **LoginScreen**: OTP-based authentication entry point
- **Screen1**: Main driver dashboard (ride requests, map, status management)
- **ActiveRideScreen**: Active ride management with live tracking
- **RejectRideScreen**: Ride rejection with reason selection
- **Menu Screens**: Profile, Wallet, RideHistory, Settings, Refer

### Authentication Flow
1. User enters phone number in LoginScreen
2. OTP sent via backend API
3. On successful verification, auth token and driver info stored in AsyncStorage
4. App checks for stored credentials on launch ([App.tsx:160-210](App.tsx#L160-L210))
5. Auto-navigates to Screen1 if valid credentials exist

### Real-Time Communication

**Socket.IO Integration** ([src/socket.ts](src/socket.ts))
- WebSocket-only transport for reliability
- Auto-reconnection with 20 attempts, 2s delay
- Secure mode enabled for HTTPS/ngrok connections
- Manual connect via `connectSocket()` function

**Key Socket Events:**
- `driverLocationUpdate`: Broadcasts driver GPS location (foreground & background)
- `newRideRequest`: Incoming ride request from backend
- `driverAcceptedRide`: Driver accepts ride
- `driverCompletedRide`: Final fare and distance submission

**Firebase Cloud Messaging** ([index.js:14-108](index.js#L14-L108))
- Background FCM handler for killed/background app states
- Notifee integration for high-priority, full-screen notifications
- Action buttons (Accept/Reject) in notifications
- Intent storage in AsyncStorage for app resumption

### Background Location Tracking

**Service Implementation** ([src/BackgroundLocationService.tsx](src/BackgroundLocationService.tsx))
- Uses `react-native-background-actions` for persistent foreground service
- 15-second location update intervals
- Emits `driverLocationUpdate` with latitude, longitude, speed, bearing
- Maintains socket connection during background operation
- Auto-reconnects if socket drops

**Starting/Stopping:**
```javascript
import { startBackgroundService, stopBackgroundService } from './BackgroundLocationService';

// When driver goes online
await startBackgroundService();

// When driver goes offline
await stopBackgroundService();
```

### API Configuration

**Environment Switching** ([src/apiConfig.ts](src/apiConfig.ts))
- Toggle `IS_DEVELOPMENT` flag to switch between local/production servers
- Platform-specific URLs for Android/iOS
- Ngrok tunnel support for local development
- Centralized `API_BASE` and `SOCKET_URL` exports

**Update the ngrok URL when tunnel changes:**
```typescript
// src/apiConfig.ts
const NGROK_URL = 'https://your-new-ngrok-url.ngrok-free.app';
```

**API Client** ([utils/api.ts](utils/api.ts))
- Axios instance with automatic auth token injection
- Reads token from AsyncStorage on every request
- Base URL configured via `API_BASE` from apiConfig

### Fare Calculation Logic

**Critical Business Rules** ([src/ride_price_show_final_fare.md](src/ride_price_show_final_fare.md))

1. **Pre-Ride Estimate**: Backend sends estimated fare in ride request payload
2. **Dynamic Calculation**: Starts at OTP verification using driver's GPS location
3. **Final Fare Formula**: `distance_travelled × price_per_km`
4. **Distance Measurement**: Haversine distance from OTP verification point to current location
5. **Completion**: Driver app calculates and sends `finalDistance` and `finalFare` to backend
6. **Backend Verification**: Backend must re-verify fare calculation before charging customer

**No additional fees** (platform fees, taxes, etc.) should be added on the driver app side.

### State Management

**Driver Status States:**
- `offline`: Not accepting rides
- `online`: Available for ride requests, background service running
- `onRide`: Currently servicing a ride

**Ride Status States:**
- `idle`: No active ride
- `onTheWay`: Ride accepted, navigating to pickup
- `accepted`: Arrived at pickup, waiting for passenger
- `started`: OTP verified, ride in progress
- `completed`: Ride finished, fare calculated

**Persistent Storage (AsyncStorage):**
- `authToken`: JWT authentication token
- `driverInfo`: Driver profile JSON (driverId, name, phone, etc.)
- `driverId`: Driver unique identifier
- `driverName`: Driver display name
- `pendingRideRequest`: Ride request received while app was backgrounded
- `rideActionIntent`: Accept/reject action from notification tap

### Map & Location Handling

**Libraries:**
- `react-native-maps`: MapView rendering
- `@react-native-community/geolocation`: GPS position tracking
- `geolib`/`haversine`/`haversine-distance`: Distance calculations
- `@mapbox/polyline`: Route polyline decoding

**Smooth Animations** ([src/Screen1.tsx:93-100](src/Screen1.tsx#L93-L100))
- Animated driver marker position using `Animated.Value`
- Bearing calculation for marker rotation
- Travelled route polyline with opacity animations
- AnimatedMapUtils for coordinate interpolation

**Route Display:**
- Full route from backend (OSRM/Google Directions)
- Visible route segments calculated based on driver position
- Nearest point index tracking for route progression
- Auto-zoom to fit pickup/drop markers

## Key Files

- [App.tsx](App.tsx): Navigation container and auth check
- [src/Screen1.tsx](src/Screen1.tsx): Main driver dashboard with ride request handling
- [src/ActiveRideScreen.tsx](src/ActiveRideScreen.tsx): Active ride tracking and management
- [src/LoginScreen.tsx](src/LoginScreen.tsx): OTP authentication
- [src/socket.ts](src/socket.ts): Socket.IO client configuration
- [src/apiConfig.ts](src/apiConfig.ts): API and socket URL configuration
- [src/BackgroundLocationService.tsx](src/BackgroundLocationService.tsx): Background GPS tracking
- [src/Notifications.tsx](src/Notifications.tsx): Notifee notification service
- [utils/api.ts](utils/api.ts): Axios instance with auth interceptor
- [index.js](index.js): App entry, FCM background handler, Notifee events

## Android Configuration

- **Package**: `com.webase.eazygodriver`
- **Min SDK**: Check [android/build.gradle](android/build.gradle)
- **Firebase**: Google Services plugin enabled ([android/app/build.gradle:5](android/app/build.gradle#L5))
- **ProGuard**: Enabled for release builds
- **Vector Icons**: Font gradle script applied
- **Signing**: Release keystore configured via gradle.properties

## iOS Configuration

- **Bundle ID**: Check [ios/EazygoDriver.xcodeproj](ios/EazygoDriver.xcodeproj)
- **Pods**: Use `pod install` after dependency changes
- **Permissions**: Location (Always & WhenInUse), Notifications required

## Firebase Integration

**Required Services:**
- Firebase Authentication (OTP via backend)
- Cloud Messaging (ride request notifications)
- Firestore (optional, check backend requirements)

**Setup:**
- Android: `google-services.json` in `android/app/`
- iOS: `GoogleService-Info.plist` in `ios/EazygoDriver/`

## Testing Strategy

When testing ride flows:
1. Ensure ngrok URL is updated in apiConfig.ts
2. Start Metro bundler first
3. Check socket connection logs in console
4. Verify background service starts when going online
5. Test notification permissions on physical devices (not emulators)
6. Monitor AsyncStorage for auth persistence

## Common Debugging

**Socket not connecting:**
- Check `IS_DEVELOPMENT` flag in apiConfig.ts
- Verify ngrok URL is current and accessible
- Ensure backend server is running
- Check `secure: true` setting matches HTTPS URLs

**Background location not working:**
- Request location permissions (Always on Android)
- Verify foreground service notification appears
- Check BackgroundActions.isRunning() status
- Review background task logs

**Notifications not appearing:**
- Request notification permissions
- Check FCM token registration
- Verify Notifee channel creation
- Test on physical device (emulators unreliable)

**Auth issues:**
- Clear AsyncStorage: `AsyncStorage.clear()`
- Check authToken in AsyncStorage
- Verify API interceptor adds Authorization header
- Check backend token validation

//live server link

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
  Alert,
  Modal,
  TextInput,
  Dimensions,
  AppState,
  Linking,
  Animated,
  Easing,
  ScrollView,
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import Geolocation from "@react-native-community/geolocation";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE } from "./apiConfig";
import api from "../utils/api";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";
import FontAwesome from "react-native-vector-icons/FontAwesome";
import BackgroundTimer from 'react-native-background-timer';
import NotificationService from './Notifications';

const { width, height } = Dimensions.get("window");

type LocationType = { latitude: number; longitude: number };
type RideType = {
  rideId: string;
  RAID_ID?: string;
  otp?: string;
  pickup: LocationType & { address?: string };
  drop: LocationType & { address?: string };
  routeCoords?: LocationType[];
  fare?: number;
  distance?: string;
  vehicleType?: string; // Add this line
  userName?: string;
  userMobile?: string;
};
type UserDataType = {
  name: string;
  mobile: string;
  location: LocationType;
  userId?: string;
  rating?: number;
};

const DriverScreen = ({ route, navigation }: { route: any; navigation: any }) => {
  const [location, setLocation] = useState<LocationType | null>(
    route.params?.latitude && route.params?.longitude
      ? { latitude: route.params.latitude, longitude: route.params.longitude }
      : null
  );
  const [ride, setRide] = useState<RideType | null>(null);
  const [userData, setUserData] = useState<UserDataType | null>(null);
  const [userLocation, setUserLocation] = useState<LocationType | null>(null);
  const [travelledKm, setTravelledKm] = useState(0);
  const [lastCoord, setLastCoord] = useState<LocationType | null>(null);
  const [otpModalVisible, setOtpModalVisible] = useState(false);
  const [enteredOtp, setEnteredOtp] = useState("");
  const [rideStatus, setRideStatus] = useState<
    "idle" | "onTheWay" | "accepted" | "started" | "completed"
  >("idle");
  const [isRegistered, setIsRegistered] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [driverStatus, setDriverStatus] = useState<
    "offline" | "online" | "onRide"
  >("offline");
  const [isLoading, setIsLoading] = useState(false);
  const mapRef = useRef<MapView | null>(null);
  const [driverId, setDriverId] = useState<string>(route.params?.driverId || "");
  const [driverName, setDriverName] = useState<string>(
    route.params?.driverName || ""
  );
  const [error, setError] = useState<string | null>(null);
  const [driverVehicleType, setDriverVehicleType] = useState<string | null>(null);
 
  // Route handling states
  const [fullRouteCoords, setFullRouteCoords] = useState<LocationType[]>([]);
  const [visibleRouteCoords, setVisibleRouteCoords] = useState<LocationType[]>([]);
  const [nearestPointIndex, setNearestPointIndex] = useState(0);
  const [mapRegion, setMapRegion] = useState<any>(null);

  // App state management
  const [isAppActive, setIsAppActive] = useState(true);

  // New states for verification and bill
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [showBillModal, setShowBillModal] = useState(false);
  const [billDetails, setBillDetails] = useState({
    distance: '0 km',
    travelTime: '0 mins',
    charge: 0,
    userName: '',
    userMobile: '',
    baseFare: 0,
    timeCharge: 0,
    tax: 0
  });
  const [verificationDetails, setVerificationDetails] = useState({
    pickup: '',
    dropoff: '',
    time: '',
    speed: 0,
    distance: 0,
  });
  const [otpSharedTime, setOtpSharedTime] = useState<Date | null>(null);
  const [currentSpeed, setCurrentSpeed] = useState<number>(0);
  

    // Add these new state variables:
  const [isAccepting, setIsAccepting] = useState(false); // Tracks if we are currently processing an acceptance
  const [pendingAcceptRideId, setPendingAcceptRideId] = useState<string | null>(null); // Tracks which rideId we have a pending request for



  // Online/Offline toggle state
  const [isDriverOnline, setIsDriverOnline] = useState(false);
  const [backgroundTrackingActive, setBackgroundTrackingActive] = useState(false);

  // FCM Notification states
  const [hasNotificationPermission, setHasNotificationPermission] = useState(false);
  const [isBackgroundMode, setIsBackgroundMode] = useState(false);

  // Wallet balance state
  const [walletBalance, setWalletBalance] = useState<number>(0);

  // Track if wallet deduction has been done for current online session
  const [hasDeductedForSession, setHasDeductedForSession] = useState(false);

  // Offline verification modal states
  const [showOfflineVerificationModal, setShowOfflineVerificationModal] = useState(false);
  const [driverIdVerification, setDriverIdVerification] = useState('');

  // Animation values
  const driverMarkerAnimation = useRef(new Animated.Value(1)).current;
  const polylineAnimation = useRef(new Animated.Value(0)).current;
  
  // Enhanced UI states - DEFAULT TO MAXIMIZED
  const [riderDetailsVisible, setRiderDetailsVisible] = useState(true);
  const slideAnim = useRef(new Animated.Value(0)).current; // Start at 0 for maximized
  const fadeAnim = useRef(new Animated.Value(1)).current;  // Start at 1 for maximized
  
  // Refs for optimization
  const isMounted = useRef(true);
  const locationUpdateCount = useRef(0);
  const mapAnimationInProgress = useRef(false);
  const navigationInterval = useRef<NodeJS.Timeout | null>(null);
  const lastLocationUpdate = useRef<LocationType | null>(null);
  const routeUpdateThrottle = useRef<NodeJS.Timeout | null>(null);
  const distanceSinceOtp = useRef(0);
  const lastLocationBeforeOtp = useRef<LocationType | null>(null);
  const geolocationWatchId = useRef<number | null>(null);
  const backgroundLocationInterval = useRef<NodeJS.Timeout | null>(null);
  const driverMarkerRef = useRef<any>(null);
  
  // Store OTP verification location
  const [otpVerificationLocation, setOtpVerificationLocation] = useState<LocationType | null>(null);
  
  // Alert for ride already taken
  const [showRideTakenAlert, setShowRideTakenAlert] = useState(false);
  const rideTakenAlertTimeout = useRef<NodeJS.Timeout | null>(null);
  const [alertProgress, setAlertProgress] = useState(new Animated.Value(1));
  
  // Socket import
  let socket: any = null;
  try {
    socket = require("./socket").default;
  } catch (error) {
    console.warn("⚠️ Socket not available:", error);
  }
  
  // ============ PASSENGER DATA FUNCTIONS ============
  
  // Fetch passenger data function
  const fetchPassengerData = useCallback((rideData: RideType): UserDataType => {
    console.log("👤 Extracting passenger data from ride:", rideData.rideId);

    const userDataWithId: UserDataType = {
      name: rideData.userName || "Passenger",
      mobile: rideData.userMobile || "N/A",
      location: rideData.pickup,
      userId: rideData.rideId,
      rating: 4.8,
    };

    console.log("✅ Passenger data extracted successfully:", userDataWithId);
    return userDataWithId;
  }, []);

  // Calculate initials for avatar
  const calculateInitials = (name: string): string => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  // Call passenger function
  const handleCallPassenger = () => {
    if (userData?.mobile) {
      Linking.openURL(`tel:${userData.mobile}`)
        .catch(err => console.error('Error opening phone dialer:', err));
    } else {
      Alert.alert("Error", "Passenger mobile number not available");
    }
  };

  // Message passenger function
  const handleMessagePassenger = () => {
    if (userData?.mobile) {
      Linking.openURL(`sms:${userData.mobile}`)
        .catch(err => console.error('Error opening message app:', err));
    } else {
      Alert.alert("Error", "Passenger mobile number not available");
    }
  };

  // Animation functions for rider details
  const showRiderDetails = () => {
    setRiderDetailsVisible(true);
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      })
    ]).start();
  };

  const hideRiderDetails = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 400, // Slide down completely
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      })
    ]).start(() => {
      setRiderDetailsVisible(false);
    });
  };

  const toggleRiderDetails = () => {
    if (riderDetailsVisible) {
      hideRiderDetails();
    } else {
      showRiderDetails();
    }
  };
  
  // Haversine distance function
  const haversine = (start: LocationType, end: LocationType) => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (end.latitude - start.latitude) * Math.PI / 180;
    const dLon = (end.longitude - start.longitude) * Math.PI / 180;
    const a =
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(start.latitude * Math.PI / 180) * Math.cos(end.latitude * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c * 1000; // Distance in meters
  };
  
  // Save ride state to AsyncStorage for persistence
  const saveRideState = useCallback(async () => {
    try {
      const rideState = {
        ride,
        userData,
        rideStatus,
        driverStatus,
        travelledKm,
        distanceSinceOtp: distanceSinceOtp.current,
        lastLocationBeforeOtp: lastLocationBeforeOtp.current,
        otpVerificationLocation,
        fullRouteCoords,
        visibleRouteCoords,
        userLocation,
        lastCoord,
        riderDetailsVisible // Save UI state
      };
      
      await AsyncStorage.setItem('rideState', JSON.stringify(rideState));
      console.log('✅ Ride state saved to AsyncStorage');
    } catch (error) {
      console.error('❌ Error saving ride state:', error);
    }
  }, [ride, userData, rideStatus, driverStatus, travelledKm, otpVerificationLocation, 
      fullRouteCoords, visibleRouteCoords, userLocation, lastCoord, riderDetailsVisible]);

      
      const restoreRideState = useCallback(async () => {
  try {
    const savedState = await AsyncStorage.getItem('rideState');
    if (savedState) {
      const rideState = JSON.parse(savedState);
      
      // ✅ FIX: Check if ride was completed before refresh
      if (rideState.rideStatus === 'completed') {
        console.log('🔄 Found completed ride from previous session, clearing...');
        await clearRideState();
        return false;
      }
      
      // Only restore if there's an active ride
      if (rideState.ride && (rideState.rideStatus === 'accepted' || rideState.rideStatus === 'started')) {
        console.log('🔄 Restoring ride state from AsyncStorage');
        
        setRide(rideState.ride);
        setUserData(rideState.userData);
        setRideStatus(rideState.rideStatus);
        setDriverStatus(rideState.driverStatus);
        setTravelledKm(rideState.travelledKm || 0);
        distanceSinceOtp.current = rideState.distanceSinceOtp || 0;
        lastLocationBeforeOtp.current = rideState.lastLocationBeforeOtp;
        setOtpVerificationLocation(rideState.otpVerificationLocation);
        setFullRouteCoords(rideState.fullRouteCoords || []);
        setVisibleRouteCoords(rideState.visibleRouteCoords || []);
        setUserLocation(rideState.userLocation);
        setLastCoord(rideState.lastCoord);
        
        // Restore UI state - DEFAULT TO MAXIMIZED
        const shouldShowMaximized = rideState.riderDetailsVisible !== false;
        setRiderDetailsVisible(shouldShowMaximized);
        
        if (shouldShowMaximized) {
          slideAnim.setValue(0);
          fadeAnim.setValue(1);
        } else {
          slideAnim.setValue(400);
          fadeAnim.setValue(0);
        }
        
        console.log('✅ Ride state restored successfully');
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error('❌ Error restoring ride state:', error);
    return false;
  }
}, []);


  
  // Clear ride state from AsyncStorage
  const clearRideState = useCallback(async () => {
    try {
      await AsyncStorage.removeItem('rideState');
      console.log('✅ Ride state cleared from AsyncStorage');
    } catch (error) {
      console.error('❌ Error clearing ride state:', error);
    }
  }, []);
  
  // Fetch wallet balance on mount and when driver goes online
  useEffect(() => {
    const fetchWalletBalance = async () => {
      try {
        const driverInfoStr = await AsyncStorage.getItem('driverInfo');
        if (driverInfoStr) {
          const driverInfo = JSON.parse(driverInfoStr);
          const response = await fetch(
            `${API_BASE}/drivers/wallet/balance/${driverInfo.driverId}`,
            {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' },
            }
          );
          const result = await response.json();
          if (result.success) {
            setWalletBalance(result.balance || 0);
            console.log('✅ Wallet balance fetched:', result.balance);
          }
        }
      } catch (error) {
        console.error('❌ Error fetching wallet balance:', error);
        setWalletBalance(0);
      }
    };

    if (driverId) {
      fetchWalletBalance();
    }
  }, [driverId, isDriverOnline]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMounted.current = false;
      if (navigationInterval.current) {
        clearInterval(navigationInterval.current);
      }
      if (routeUpdateThrottle.current) {
        clearTimeout(routeUpdateThrottle.current);
      }
      if (geolocationWatchId.current) {
        Geolocation.clearWatch(geolocationWatchId.current);
      }
      if (backgroundLocationInterval.current) {
        clearInterval(backgroundLocationInterval.current);
      }
      if (rideTakenAlertTimeout.current) {
        clearTimeout(rideTakenAlertTimeout.current);
      }
      // Clean up notification listeners
      NotificationService.off('rideRequest', handleNotificationRideRequest);
      NotificationService.off('tokenRefresh', () => {});
    };
  }, []);
  
  // App state management
  useEffect(() => {
    const handleAppStateChange = (nextAppState: string) => {
      console.log('📱 App state changed:', nextAppState);
      
      if (nextAppState === 'background') {
        setIsAppActive(false);
        // Save state when app goes to background
        if (ride && (rideStatus === "accepted" || rideStatus === "started")) {
          saveRideState();
        }
      } else if (nextAppState === 'active') {
        setIsAppActive(true);
        // When app comes to foreground, try to restore state if needed
        if (!ride) {
          restoreRideState();
        }
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    return () => {
      subscription.remove();
    };
  }, [ride, rideStatus, saveRideState, restoreRideState]);
  
  // Background location tracking with regular geolocation
  const startBackgroundLocationTracking = useCallback(() => {
    console.log("🔄 Starting background location tracking");
   
    // Stop any existing tracking
    if (geolocationWatchId.current) {
      Geolocation.clearWatch(geolocationWatchId.current);
    }
   
    // Start high-frequency tracking when online
    geolocationWatchId.current = Geolocation.watchPosition(
      (position) => {
        if (!isMounted.current || !isDriverOnline) return;
       
        const newLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
       
        console.log("📍 Location update:", newLocation);
        setLocation(newLocation);
        setCurrentSpeed(position.coords.speed || 0);
       
        // Update distance if ride is active
        if (lastCoord && (rideStatus === "accepted" || rideStatus === "started")) {
          const dist = haversine(lastCoord, newLocation);
          const distanceKm = dist / 1000;
          setTravelledKm((prev) => prev + distanceKm);
         
          if (rideStatus === "started" && lastLocationBeforeOtp.current) {
            distanceSinceOtp.current += distanceKm;
          }
        }
       
        setLastCoord(newLocation);
        lastLocationUpdate.current = newLocation;
       
        // Send to server and socket
        saveLocationToDatabase(newLocation);
      },
      (error) => {
        console.error("❌ Geolocation error:", error);
      },
      {
        enableHighAccuracy: true,
        distanceFilter: 5, // 5 meters
        interval: 3000, // 3 seconds
        fastestInterval: 2000, // 2 seconds
      }
    );
   
    setBackgroundTrackingActive(true);
  }, [isDriverOnline, lastCoord, rideStatus]);
  
  // Stop background location tracking
  const stopBackgroundLocationTracking = useCallback(() => {
    console.log("🛑 Stopping background location tracking");
   
    if (geolocationWatchId.current) {
      Geolocation.clearWatch(geolocationWatchId.current);
      geolocationWatchId.current = null;
    }
   
    if (backgroundLocationInterval.current) {
      clearInterval(backgroundLocationInterval.current);
      backgroundLocationInterval.current = null;
    }
   
    setBackgroundTrackingActive(false);
  }, []);
  
  // FCM: Initialize notification system
   // FCM: Initialize notification system
  useEffect(() => {
    const initializeNotificationSystem = async () => {
      try {
        console.log('🔔 Setting up complete notification system...');
       
        // Initialize the notification service
        const initialized = await NotificationService.initializeNotifications();
       
        if (initialized) {
          console.log('✅ Notification system initialized successfully');
         
          // Get FCM token and send to server
          const token = await NotificationService.getFCMToken();
          if (token && driverId) {
            await sendFCMTokenToServer(token);
          }
         
          // Listen for ride requests
          NotificationService.on('rideRequest', handleNotificationRideRequest);
         
          // Listen for token refresh
          NotificationService.on('tokenRefresh', async (newToken) => {
            console.log('🔄 FCM token refreshed, updating server...');
            if (driverId) {
              await sendFCMTokenToServer(newToken);
            }
          });
         
          setHasNotificationPermission(true);
        } else {
          console.log('❌ Notification system initialization failed');
          setHasNotificationPermission(false);
        }
      } catch (error) {
        console.error('❌ Error in notification system initialization:', error);
        // Don't block app if notifications fail
        setHasNotificationPermission(false);
      }
    };
    
    // Initialize when driver goes online
    if ((driverStatus === 'online' || driverStatus === 'onRide') && !hasNotificationPermission) {
      initializeNotificationSystem();
    }
    
    return () => {
      // Cleanup
      NotificationService.off('rideRequest', handleNotificationRideRequest);
    };
  }, [driverStatus, driverId, hasNotificationPermission]);
  



  
  const sendFCMTokenToServer = async (token: string): Promise<boolean> => {
  try {
    console.log('📤 Sending FCM token to server for driver:', driverId);

    // ✅ Use the correct endpoint that matches your server
    const response = await fetch(`${API_BASE}/drivers/update-fcm-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true',
        'User-Agent': 'EazygoDriverApp/1.0'
      },
      body: JSON.stringify({
        driverId: driverId,
        fcmToken: token,
        platform: Platform.OS
      }),
    });
    
    console.log('📡 FCM token update response:', response.status);
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ FCM token updated on server:', result);
      return true;
    } else {
      console.error('❌ FCM endpoint failed:', response.status);
      
      // Try alternative endpoint
      try {
        const altResponse = await fetch(`${API_BASE}/api/drivers/simple-fcm-update`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'ngrok-skip-browser-warning': 'true',
            'User-Agent': 'EazygoDriverApp/1.0'
          },
          body: JSON.stringify({ driverId, fcmToken: token })
        });
        
        if (altResponse.ok) {
          console.log('✅ FCM token updated via alternative endpoint');
          return true;
        }
      } catch (altError) {
        console.error('❌ Alternative FCM endpoint also failed:', altError);
      }
      
      // Store locally as fallback
      await AsyncStorage.setItem('fcmToken', token);
      console.log('💾 FCM token stored locally as fallback');
      return false;
    }
    
  } catch (error: any) {
    console.error('❌ Network error sending FCM token:', error);
    await AsyncStorage.setItem('fcmToken', token);
    return false;
  }
};


  

const handleNotificationRideRequest = useCallback(async (data: any) => {
  if (!isMounted.current || !data?.rideId || !isDriverOnline) return;

  console.log('🔔 Processing notification ride request:', data.rideId);

  // ✅ FIX: Normalize both types to UPPERCASE for comparison
  const myDriverType = (driverVehicleType || "").toLowerCase(); 
  const requestVehicleType = (data.vehicleType || "").trim().toLowerCase();

  console.log(`🔍 Type Check (FCM): Me=[${myDriverType}] vs Ride=[${requestVehicleType}]`);

  // Only ignore if the types are definitely different
  if (requestVehicleType && myDriverType && myDriverType !== requestVehicleType) {
      console.log(`🚫 Ignoring notification: Driver is ${myDriverType}, ride requires ${requestVehicleType}`);
      return;
  }
  // Use the same logic as the socket ride request handler
  try {
    let pickupLocation, dropLocation;
    
    try {
      if (typeof data.pickup === 'string') {
        pickupLocation = JSON.parse(data.pickup);
      } else {
        pickupLocation = data.pickup;
      }
      
      if (typeof data.drop === 'string') {
        dropLocation = JSON.parse(data.drop);
      } else {
        dropLocation = data.drop;
      }
    } catch (error) {
      console.error('Error parsing notification location data:', error);
      return;
    }
    
    const rideData: RideType = {
      rideId: data.rideId,
      RAID_ID: data.RAID_ID || "N/A",
      otp: data.otp || "0000",
      pickup: {
        latitude: pickupLocation?.lat || pickupLocation?.latitude || 0,
        longitude: pickupLocation?.lng || pickupLocation?.longitude || 0,
        address: pickupLocation?.address || "Unknown location",
      },
      drop: {
        latitude: dropLocation?.lat || dropLocation?.latitude || 0,
        longitude: dropLocation?.lng || dropLocation?.longitude || 0,
        address: dropLocation?.address || "Unknown location",
      },
      fare: parseFloat(data.fare) || 0,
      distance: data.distance || "0 km",
      vehicleType: data.vehicleType,
      userName: data.userName || "Customer",
      userMobile: data.userMobile || "N/A",
    };
    
    setRide(rideData);
    setRideStatus("onTheWay");
    
    Alert.alert(
      "🚖 New Ride Request!",
      `📍 Pickup: ${rideData.pickup.address}\n🎯 Drop: ${rideData.drop.address}\n💰 Fare: ₹${rideData.fare}\n📏 Distance: ${rideData.distance}\n👤 Customer: ${rideData.userName}`,
      [
        {
          text: "❌ Reject",
          onPress: () => rejectRide(rideData.rideId),
          style: "destructive",
        },
        {
          text: "✅ Accept",
          onPress: () => acceptRide(rideData.rideId),
        },
      ],
      { cancelable: false }
    );
  } catch (error) {
    console.error("❌ Error processing notification ride request:", error);
    Alert.alert("Error", "Could not process ride request. Please try again.");
  }
}, [isDriverOnline, driverVehicleType]);






const goOfflineNormally = useCallback(async () => {
  try {
    console.log('🔴 Going offline...');

    // Call backend to stop working hours timer (NO wallet deduction)
    const response = await fetch(`${API_BASE}/drivers/working-hours/stop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await AsyncStorage.getItem("authToken")}`,
      },
      body: JSON.stringify({ driverId: driverId }),
    });

    const result = await response.json();

    if (!result.success) {
      Alert.alert("Error", result.message || "Failed to stop working hours. Please try again.");
      return;
    }

    // Update wallet balance from backend response
    if (result.walletBalance !== undefined) {
      setWalletBalance(result.walletBalance);
      console.log(`💰 Wallet balance updated: ₹${result.walletBalance}`);
    }

    // Go offline
    setIsDriverOnline(false);
    setDriverStatus("offline");
    stopBackgroundLocationTracking();

    // Emit offline status to socket
    if (socket && socket.connected) {
      socket.emit("driverOffline", { driverId });
    }

    await AsyncStorage.setItem("driverOnlineStatus", "offline");
    console.log("🔴 Driver is now offline");

    // Show professional message
    Alert.alert(
      "You're Offline",
      "You have successfully gone offline. Your availability status has been updated.",
      [{ text: "OK" }]
    );
  } catch (error) {
    console.error("❌ Error going offline:", error);
    Alert.alert("Error", "Failed to go offline. Please try again.");
  }
}, [driverId, socket, stopBackgroundLocationTracking]);

// Function to verify driver ID and go offline
const verifyDriverIdAndGoOffline = useCallback(async () => {
  const last4Digits = driverId.slice(-4);

  if (driverIdVerification !== last4Digits) {
    Alert.alert(
      'Verification Failed',
      'The last 4 digits you entered do not match your Driver ID. Please try again.',
      [{ text: "OK" }]
    );
    return;
  }

  // Close modal
  setShowOfflineVerificationModal(false);
  setDriverIdVerification('');

  // Go offline (no wallet deduction)
  await goOfflineNormally();
}, [driverId, driverIdVerification, goOfflineNormally]);

const toggleOnlineStatus = useCallback(async () => {
  if (isDriverOnline) {
    setShowOfflineVerificationModal(true);
    // STOP TIMER HERE
    BackgroundTimer.stopBackgroundTimer();
  } else {
    // STARTING ONLINE
    // Going online - check location permission first
    if (!location) {
      Alert.alert("Location Required", "Please enable location services to go online.");
      return;
    }

    try {
      // Call backend to start working hours timer (backend auto-deducts ₹100)
      const response = await fetch(`${API_BASE}/drivers/working-hours/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await AsyncStorage.getItem("authToken")}`,
        },
        body: JSON.stringify({ driverId: driverId }),
      });

      const result = await response.json();

      if (!result.success) {
        Alert.alert("Cannot Go Online", result.message || "Failed to start working hours. Please try again.");
        return;
      }

      // Update wallet balance from backend response
      if (result.walletBalance !== undefined) {
        setWalletBalance(result.walletBalance);
        console.log(`💰 Wallet balance updated: ₹${result.walletBalance}`);
      }

      // Now go online
      setIsDriverOnline(true);
      setDriverStatus("online");
      startBackgroundLocationTracking();

      // Register with socket
      if (socket && !socket.connected) {
        socket.connect();
      }

      await AsyncStorage.setItem("driverOnlineStatus", "online");
      console.log("🟢 Driver is now online");

      // Show success message with deduction info
      if (result.amountDeducted && result.amountDeducted > 0) {
        Alert.alert(
          "You're Online!",
          `₹${result.amountDeducted} deducted from your wallet.\nCurrent Balance: ₹${result.walletBalance}`,
          [{ text: "OK" }]
        );
      } else {
        Alert.alert("You're Online!", "You can now receive ride requests.", [{ text: "OK" }]);
      }
    } catch (error) {
      console.error("❌ Error starting working hours:", error);
      Alert.alert("Error", "Failed to go online. Please try again.");
    }
  }
}, [isDriverOnline, location, driverId, socket, startBackgroundLocationTracking]);





  // Load driver info and verify token on mount
  useEffect(() => {

    

    // In Screen1.tsx - Complete updated function
const loadDriverInfo = async () => {
  try {
    console.log("🔍 Loading driver info from AsyncStorage...");
    const storedDriverId = await AsyncStorage.getItem("driverId");
    const storedDriverName = await AsyncStorage.getItem("driverName");
    const storedVehicleType = await AsyncStorage.getItem("driverVehicleType"); // NEW
    const token = await AsyncStorage.getItem("authToken");
    const savedOnlineStatus = await AsyncStorage.getItem("driverOnlineStatus");
    
    if (storedDriverId && storedDriverName && token) {
      setDriverId(storedDriverId);
      setDriverName(storedDriverName);
      console.log("✅ Token found, skipping verification");
      
      // Store vehicle type if available
      if (storedVehicleType) {
        console.log(`🚗 Driver vehicle type: ${storedVehicleType}`);
        const normalizedType = storedVehicleType.toLowerCase();
      console.log(`🚗 Driver vehicle type loaded: ${normalizedType}`);
      setDriverVehicleType(normalizedType);
      await AsyncStorage.setItem("driverVehicleType", normalizedType);
   
      } else {
        // ✅ FIXED: REMOVED DEFAULT TO TAXI
        console.warn("⚠️ No vehicle type found in storage. Waiting for update.");
        // Do NOT set to taxi. Do NOT update AsyncStorage.
      }
      
      // Restore online status if it was online before
      if (savedOnlineStatus === "online") {
        setIsDriverOnline(true);
        setDriverStatus("online");
        // Start tracking (socket connect triggered by useEffect on isDriverOnline)
        startBackgroundLocationTracking();
      }
      
      // Try to restore ride state if there was an active ride
      const rideRestored = await restoreRideState();
      if (rideRestored) {
        console.log("✅ Active ride restored from previous session");
      }
    
      if (!location) {
        try {
          const pos = await new Promise<Geolocation.GeoPosition>((resolve, reject) => {
            Geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 15000,
              maximumAge: 0
            });
          });
        
          setLocation({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
          setLastCoord({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        } catch (locationError) {
          console.error("❌ Error getting location:", locationError);
        }
      }
    } else {
      console.log("❌ No driver info or token found, navigating to LoginScreen");
      await AsyncStorage.clear();
      navigation.replace("LoginScreen");
    }
  } catch (error) {
    console.error("❌ Error loading driver info:", error);
    await AsyncStorage.clear();
    navigation.replace("LoginScreen");
  }
};


   
    if (!driverId || !driverName) {
      loadDriverInfo();
    }
  }, [driverId, driverName, navigation, location, restoreRideState]);
  
  // Request user location when ride is accepted
  useEffect(() => {
    if (rideStatus === "accepted" && ride?.rideId && socket) {
      console.log("📍 Requesting initial user location for accepted ride");
      socket.emit("getUserDataForDriver", { rideId: ride.rideId });
      
      const intervalId = setInterval(() => {
        if (rideStatus === "accepted" || rideStatus === "started") {
          socket.emit("getUserDataForDriver", { rideId: ride.rideId });
        }
      }, 10000);
      
      return () => clearInterval(intervalId);
    }
  }, [rideStatus, ride?.rideId]);
  
  // Optimized location saving
  const saveLocationToDatabase = useCallback(
    async (location: LocationType) => {
      try {
        locationUpdateCount.current++;
        if (locationUpdateCount.current % 3 !== 0) { // Send every 3rd update
          return;
        }
       
        const payload = {
          driverId,
          driverName: driverName || "Unknown Driver",
          latitude: location.latitude,
          longitude: location.longitude,
          vehicleType: driverVehicleType,
          status: driverStatus === "onRide" ? "onRide" : isDriverOnline ? "Live" : "offline",
          rideId: driverStatus === "onRide" ? ride?.rideId : null,
          timestamp: new Date().toISOString(),
        };
        
        const response = await fetch(`${API_BASE}/driver-location/update`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
            "User-Agent": "EazygoDriverApp/1.0",
            Authorization: `Bearer ${await AsyncStorage.getItem("authToken")}`,
          },
          body: JSON.stringify(payload),
        });
       
        if (!response.ok) {
          const errorText = await response.text();
          console.error("❌ Failed to save location:", errorText);
          return;
        }
        
        if (socket && socket.connected && isDriverOnline) {
          socket.emit('driverLocationUpdate', {
            driverId,
            latitude: location.latitude,
            longitude: location.longitude,
            status: driverStatus === "onRide" ? "onRide" : "Live",
            rideId: driverStatus === "onRide" ? ride?.rideId : null,
          });
        }
      } catch (error) {
        console.error("❌ Error saving location to DB:", error);
      }
    },
    [driverId, driverName, driverStatus, ride?.rideId, isDriverOnline, driverVehicleType]
  );
  
  // Register driver with socket
  useEffect(() => {
    if (!isRegistered && driverId && location && isDriverOnline && socket) {
      console.log("📝 Registering driver with socket:", driverId);
      socket.emit("registerDriver", {
        driverId,
        driverName,
        latitude: location.latitude,
        longitude: location.longitude,
        vehicleType: driverVehicleType,
      });
      setIsRegistered(true);
    }
  }, [driverId, location, isRegistered, driverName, isDriverOnline, driverVehicleType]);
  
  // Route fetching with real-time updates
  const fetchRoute = useCallback(
    async (origin: LocationType, destination: LocationType) => {
      try {
        console.log("🗺️ Fetching route between:", {
          origin: { lat: origin.latitude, lng: origin.longitude },
          destination: { lat: destination.latitude, lng: destination.longitude },
        });
       
        const url = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson`;
        const response = await fetch(url);
        const data = await response.json();
       
        if (data.routes && data.routes.length > 0) {
          const coords = data.routes[0].geometry.coordinates.map(
            ([lng, lat]: number[]) => ({
              latitude: lat,
              longitude: lng,
            })
          );
          console.log("✅ Route fetched, coordinates count:", coords.length);
          return coords;
        }
      } catch (error) {
        console.error("❌ Error fetching route:", error);
        // Return a straight line route as fallback
        return [origin, destination];
      }
    },
    []
  );
  
  // Find nearest point on route
  const findNearestPointOnRoute = useCallback(
    (currentLocation: LocationType, routeCoords: LocationType[]) => {
      if (!routeCoords || routeCoords.length === 0) return null;
     
      let minDistance = Infinity;
      let nearestIndex = 0;
     
      for (let i = 0; i < routeCoords.length; i++) {
        const distance = haversine(currentLocation, routeCoords[i]);
        if (distance < minDistance) {
          minDistance = distance;
          nearestIndex = i;
        }
      }
     
      return { index: nearestIndex, distance: minDistance };
    },
    []
  );
  
  // Update visible route as driver moves (Dynamic Polyline) - FIXED FOR POST-OTP
  const updateVisibleRoute = useCallback(() => {
    if (!location || !fullRouteCoords.length) return;
   
    const nearestPoint = findNearestPointOnRoute(location, fullRouteCoords);
    if (!nearestPoint) return;
   
    // Always update the visible route when driver moves
    const remainingRoute = fullRouteCoords.slice(nearestPoint.index);
  
    if (remainingRoute.length > 0) {
      // Add current location to make the route more accurate
      const updatedRoute = [location, ...remainingRoute];
      setVisibleRouteCoords(updatedRoute);
      setNearestPointIndex(nearestPoint.index);
    }
  }, [location, fullRouteCoords, findNearestPointOnRoute]);
  
  // Throttled route update
  const throttledUpdateVisibleRoute = useCallback(() => {
    if (routeUpdateThrottle.current) {
      clearTimeout(routeUpdateThrottle.current);
    }
   
    routeUpdateThrottle.current = setTimeout(() => {
      updateVisibleRoute();
    }, 500);
  }, [updateVisibleRoute]);
  
  // Automatically update route as driver moves - FIXED FOR POST-OTP
  useEffect(() => {
    if (rideStatus === "started" && fullRouteCoords.length > 0) {
      throttledUpdateVisibleRoute();
    }
  }, [location, rideStatus, fullRouteCoords, throttledUpdateVisibleRoute]);
  
  // Update pickup route as driver moves
  const updatePickupRoute = useCallback(async () => {
    if (!location || !ride || rideStatus !== "accepted") return;
    
    console.log("🗺️ Updating pickup route as driver moves");
    
    try {
      const pickupRoute = await fetchRoute(location, ride.pickup);
      if (pickupRoute && pickupRoute.length > 0) {
        setRide((prev) => {
          if (!prev) return null;
          console.log("✅ Updated pickup route with", pickupRoute.length, "points");
          return { ...prev, routeCoords: pickupRoute };
        });
      }
    } catch (error) {
      console.error("❌ Error updating pickup route:", error);
    }
  }, [location, ride, rideStatus, fetchRoute]);
  



// Add function to start location updates
const startLocationUpdates = useCallback(() => {
  if (!isDriverOnline || !location || !socket) return;
  
  // Emit initial location
  socket.emit("driverLocationUpdate", {
    driverId,
    latitude: location.latitude,
    longitude: location.longitude,
    status: driverStatus,
    vehicleType: driverVehicleType
  });
  
  console.log('📍 Started location updates for driver:', driverId);
}, [isDriverOnline, location, driverId, driverStatus, socket, driverVehicleType]);

// In Screen1.tsx - Update the handleConnect function
const handleConnect = useCallback(() => {
  if (!isMounted.current) return;
  setSocketConnected(true);
  
  if (location && driverId && isDriverOnline) {
    const finalVehicleType = driverVehicleType || ""; // ✅ FIXED: No default 'taxi'
    
    // Register driver with all necessary info
    socket.emit("registerDriver", {
      driverId,
      driverName,
      latitude: location.latitude,
      longitude: location.longitude,
      vehicleType: finalVehicleType,
      status: driverStatus // Include current status
    });
    setIsRegistered(true);
    
    console.log(`✅ Driver registered: ${driverId} - ${finalVehicleType} - ${driverStatus}`);
    
    // Start emitting location updates
    startLocationUpdates();
  }
}, [isMounted, location, driverId, isDriverOnline, driverVehicleType, driverName, driverStatus, startLocationUpdates, socket]);



  const acceptRide = async (rideId?: string) => {
    const currentRideId = rideId || ride?.rideId;
    if (!currentRideId) {
      Alert.alert("Error", "No ride ID available. Please try again.");
      return;
    }
   
    if (!driverId) {
      Alert.alert("Error", "Driver not properly registered.");
      return;
    }
   
    if (socket && !socket.connected) {
      Alert.alert("Connection Error", "Reconnecting to server...");
      socket.connect();
      socket.once("connect", () => {
        setTimeout(() => acceptRide(currentRideId), 1000);
      });
      return;
    }
   
    setIsLoading(true);
    setRideStatus("accepted");
    setDriverStatus("onRide");
   
    if (socket) {
      socket.emit(
        "acceptRide",
        {
          rideId: currentRideId,
          driverId: driverId,
          driverName: driverName,
        },
        async (response: any) => {
          setIsLoading(false);
          if (!isMounted.current) return;
         
          if (response && response.success) {
            // Use the enhanced passenger data function
            const passengerData = fetchPassengerData(ride!);
            if (passengerData) {
              setUserData(passengerData);
              console.log("✅ Passenger data set:", passengerData);
            }
            
            const initialUserLocation = {
              latitude: response.pickup.lat,
              longitude: response.pickup.lng,
            };
           
            setUserLocation(initialUserLocation);
           
            // Generate dynamic route from driver to pickup (GREEN ROUTE)
            if (location) {
              try {
                const pickupRoute = await fetchRoute(location, initialUserLocation);
                if (pickupRoute) {
                  setRide((prev) => {
                    if (!prev) return null;
                    console.log("✅ Driver to pickup route generated with", pickupRoute.length, "points");
                    return { ...prev, routeCoords: pickupRoute };
                  });
                }
              } catch (error) {
                console.error("❌ Error generating pickup route:", error);
              }
            
              animateToLocation(initialUserLocation, true);
            }
            
            // DEFAULT TO MAXIMIZED VIEW - Show rider details automatically when ride is accepted
            setRiderDetailsVisible(true);
            slideAnim.setValue(0);
            fadeAnim.setValue(1);
            
            // Emit event to notify other drivers that this ride has been taken
            socket.emit("rideTakenByDriver", {
              rideId: currentRideId,
              driverId: driverId,
              driverName: driverName,
            });
            
            socket.emit("driverAcceptedRide", {
              rideId: currentRideId,
              driverId: driverId,
              userId: response.userId,
              driverLocation: location,
            });
           
            setTimeout(() => {
              socket.emit("getUserDataForDriver", { rideId: currentRideId });
            }, 1000);
            
            // Save ride state after accepting
            saveRideState();
          }
        }
      );
    }
  };
  

  // Throttled pickup route update
  const throttledUpdatePickupRoute = useCallback(() => {
    if (routeUpdateThrottle.current) {
      clearTimeout(routeUpdateThrottle.current);
    }
   
    routeUpdateThrottle.current = setTimeout(() => {
      updatePickupRoute();
    }, 2000);
  }, [updatePickupRoute]);
  
  // Update pickup route as driver moves
  useEffect(() => {
    if (rideStatus === "accepted" && location && ride) {
      throttledUpdatePickupRoute();
    }
  }, [location, rideStatus, ride, throttledUpdatePickupRoute]);
  
  // Update drop route as driver moves after OTP
  const updateDropRoute = useCallback(async () => {
    if (!location || !ride || rideStatus !== "started") return;
    
    console.log("🗺️ Updating drop route as driver moves after OTP");
    
    try {
      const dropRoute = await fetchRoute(location, ride.drop);
      if (dropRoute && dropRoute.length > 0) {
        setFullRouteCoords(dropRoute);
        setVisibleRouteCoords(dropRoute);
        console.log("✅ Updated drop route with", dropRoute.length, "points");
      }
    } catch (error) {
      console.error("❌ Error updating drop route:", error);
    }
  }, [location, ride, rideStatus, fetchRoute]);
  
  // Throttled drop route update
  const throttledUpdateDropRoute = useCallback(() => {
    if (routeUpdateThrottle.current) {
      clearTimeout(routeUpdateThrottle.current);
    }
   
    routeUpdateThrottle.current = setTimeout(() => {
      updateDropRoute();
    }, 3000); // Update every 3 seconds
  }, [updateDropRoute]);
  
  // Update drop route as driver moves
  useEffect(() => {
    if (rideStatus === "started" && location && ride) {
      throttledUpdateDropRoute();
    }
  }, [location, rideStatus, ride, throttledUpdateDropRoute]);
  
  // Smooth map animation
  const animateToLocation = useCallback(
    (targetLocation: LocationType, shouldIncludeUser: boolean = false) => {
      if (!mapRef.current || mapAnimationInProgress.current) return;
     
      mapAnimationInProgress.current = true;
      let region = {
        latitude: targetLocation.latitude,
        longitude: targetLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      
      if (shouldIncludeUser && userLocation && location) {
        const points = [location, userLocation, targetLocation];
        const lats = points.map((p) => p.latitude);
        const lngs = points.map((p) => p.longitude);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs);
        const maxLng = Math.max(...lngs);
        const midLat = (minLat + maxLat) / 2;
        const midLng = (minLng + maxLng) / 2;
        const latDelta = (maxLat - minLat) * 1.2;
        const lngDelta = (maxLng - minLng) * 1.2;
       
        region = {
          latitude: midLat,
          longitude: midLng,
          latitudeDelta: Math.max(latDelta, 0.02),
          longitudeDelta: Math.max(lngDelta, 0.02),
        };
      }
      
      setMapRegion(region);
      mapRef.current.animateToRegion(region, 1000);
     
      setTimeout(() => {
        mapAnimationInProgress.current = false;
      }, 1000);
    },
    [userLocation, location]
  );
  

  // ✅ FIX: Accept startLocation as an argument
const startNavigation = useCallback(async (startLocation: LocationType) => {
  if (!ride?.drop || !startLocation) return;
  console.log("🚀 Starting navigation from verified location to drop");

  try {
    // Use the passed startLocation directly
    const routeCoords = await fetchRoute(startLocation, ride.drop);
    
    if (routeCoords && routeCoords.length > 0) {
      console.log("✅ Navigation route fetched successfully:", routeCoords.length, "points");

      setFullRouteCoords(routeCoords);
      setVisibleRouteCoords(routeCoords);

      // Start periodic route re-fetching
      if (navigationInterval.current) clearInterval(navigationInterval.current);
      
      navigationInterval.current = setInterval(async () => {
        if (rideStatus === "started" && location) {
          console.log("🔄 Re-fetching optimized route from current location");
          const updatedRoute = await fetchRoute(location, ride.drop);
          if (updatedRoute && updatedRoute.length > 0) {
            setFullRouteCoords(updatedRoute);
            setVisibleRouteCoords(updatedRoute);
          }
        }
      }, 10000); 

      console.log("🗺️ Navigation started with real-time route updates");
    }
  } catch (error) {
    console.error("❌ Error starting navigation:", error);
  }
}, [ride?.drop, fetchRoute, location, rideStatus]);
  
  // Stop navigation
  const stopNavigation = useCallback(() => {
    console.log("🛑 Stopping navigation mode");
    if (navigationInterval.current) {
      clearInterval(navigationInterval.current);
      navigationInterval.current = null;
    }
  }, []);
  
  // Logout function
  const handleLogout = async () => {
    try {
      console.log("🚪 Initiating logout for driver:", driverId);
     
      if (ride) {
        Alert.alert(
          "Active Ride",
          "Please complete your current ride before logging out.",
          [{ text: "OK" }]
        );
        return;
      }
      
      // Stop background tracking
      stopBackgroundLocationTracking();
      
      await api.post("/drivers/logout");
      await AsyncStorage.clear();
      console.log("✅ AsyncStorage cleared");
      
      if (socket) {
        socket.disconnect();
      }
      
      navigation.replace("LoginScreen");
      console.log("🧭 Navigated to LoginScreen");
    } catch (err) {
      console.error("❌ Error during logout:", err);
      Alert.alert("❌ Logout Error", "Failed to logout. Please try again.");
    }
  };
  
  
  
  // Reject ride
  const rejectRide = (rideId?: string) => {
    const currentRideId = rideId || ride?.rideId;
    if (!currentRideId) return;
   
    // Clean map data
    clearMapData();
   
    setRide(null);
    setRideStatus("idle");
    setDriverStatus("online");
    setUserData(null);
    setUserLocation(null);
    hideRiderDetails();
   
    if (socket) {
      socket.emit("rejectRide", {
        rideId: currentRideId,
        driverId,
      });
    }
   
    Alert.alert("Ride Rejected ❌", "You rejected the ride");
  };
  
  // Clear all map data (markers, routes, polylines)
  const clearMapData = useCallback(() => {
    console.log("🧹 Clearing all map data");
    setFullRouteCoords([]);
    setVisibleRouteCoords([]);
    setNearestPointIndex(0);
    setUserLocation(null);
    setTravelledKm(0);
    setLastCoord(null);
    distanceSinceOtp.current = 0;
    lastLocationBeforeOtp.current = null;
    // Clear OTP verification location
    setOtpVerificationLocation(null);
   
    // Reset map region to driver's current location
    if (location && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }, 1000);
    }
  }, [location]);
  

  
    // Only hides the modal (Safe for Back Button)
  const handleBillModalDismiss = useCallback(() => {
    setShowBillModal(false);
  }, []);

  // Confirms the ride and clears data
  const handleBillModalConfirm = useCallback(() => {
    console.log("💰 Bill confirmed, finalizing ride...");
    
    // Reset all ride states
    setRide(null);
    setUserData(null);
    setOtpSharedTime(null);
    setOtpVerificationLocation(null);
    setRideStatus("idle");
    setDriverStatus("online");
    
    // Clean map
    clearMapData();
    
    // Hide rider details (already hidden, but safe to call)
    hideRiderDetails();
    
    // Clear AsyncStorage
    clearRideState();
    
    // Close modal
    setShowBillModal(false);
    
    console.log("✅ Ride fully completed and cleaned up");
  }, [clearMapData, clearRideState, hideRiderDetails]);




  
  const confirmOTP = async () => {
  if (!ride) return;

  if (!ride.otp) {
    Alert.alert("Error", "OTP not yet received from server.");
    return;
  }

  // Check OTP
  if (enteredOtp === ride.otp) {
    console.log("✅ OTP Matched");

    // 1. IMMEDIATE UI UPDATES
    setOtpModalVisible(false); // Close modal first
    setEnteredOtp(""); 
    setRideStatus("started"); // Change status immediately
    
    // 2. LOGIC UPDATES
    setTravelledKm(0);
    distanceSinceOtp.current = 0;
    
    // Use current location as the "Start" point
    const startPoint = location || lastCoord; 
    
    if (startPoint) {
      lastLocationBeforeOtp.current = startPoint;
      setOtpVerificationLocation(startPoint);
      console.log("📍 OTP verification location stored:", startPoint);
      
      // Start navigation immediately
      if (ride.drop) {
        startNavigation(startPoint); // Pass location directly
        animateToLocation(ride.drop, true);
      }
    }

    setOtpSharedTime(new Date());

    // 3. SOCKET EMITS
    if (socket) {
      const timestamp = new Date().toISOString();
      
      socket.emit("otpVerified", {
        rideId: ride.rideId,
        driverId: driverId,
        userId: userData?.userId,
        timestamp: timestamp,
        driverLocation: startPoint
      });

      socket.emit("driverStartedRide", {
        rideId: ride.rideId,
        driverId: driverId,
        userId: userData?.userId,
        driverLocation: startPoint,
        otpVerified: true,
        timestamp: timestamp
      });
      
      // Force status update on server
      socket.emit("rideStatusUpdate", {
        rideId: ride.rideId,
        status: "started",
        otpVerified: true,
        timestamp: timestamp
      });
    }

    // 4. SAVE STATE
    saveRideState();

    // 5. SHOW ALERT (Inside setTimeout to allow UI to refresh first)
    setTimeout(() => {
      Alert.alert(
        "OTP Verified ✅",
        "Ride Started! Navigation to drop location is active.",
        [
          { 
            text: "OK", 
            onPress: () => console.log("Ride start confirmed by driver") 
          }
        ]
      );
    }, 500);

  } else {
    Alert.alert("Invalid OTP", "The OTP you entered is incorrect. Please try again.");
  }
};
  

  



const completeRide = useCallback(async () => {
  console.log("🏁 COMPLETE RIDE FUNCTION CALLED");
  console.log("📊 Current state:", {
    rideStatus,
    driverStatus,
    rideExists: !!ride,
    locationExists: !!location,
    otpVerificationLocationExists: !!otpVerificationLocation
  });
  
  if (rideStatus !== "started") {
    console.error("❌ Cannot complete: Ride not started, status is", rideStatus);
    Alert.alert("Cannot Complete", "Ride must be started to complete.");
    return;
  }
  
  if (!ride) {
    console.error("❌ Complete Ride Failed: No Ride Data");
    Alert.alert("Error", "Ride data is missing.");
    return;
  }
  
  if (!location) {
    console.error("❌ Complete Ride Failed: No Current Location");
    Alert.alert("Error", "Current location is missing. Please wait for GPS.");
    return;
  }

  // ✅ CRITICAL FIX: Update ride status IMMEDIATELY to prevent race conditions
  setRideStatus("completed");
  setDriverStatus("online");
  
  // ✅ Stop navigation immediately
  stopNavigation();
  
  // Calculate distance from OTP verification location or pickup
  let startPoint = otpVerificationLocation;
  
  if (!startPoint) {
    console.warn("⚠️ OTP Location missing, falling back to Pickup location");
    startPoint = {
      latitude: ride.pickup.latitude,
      longitude: ride.pickup.longitude
    };
  }

  try {
    const distance = haversine(startPoint, location) / 1000;
    const finalDistance = Math.max(distance, 0.1); // Minimum 100 meters
    const farePerKm = ride.fare || 15;
    const finalFare = Math.round(finalDistance * farePerKm);
    
    console.log(`💰 Fare Calculation: ${finalDistance.toFixed(2)}km * ₹${farePerKm} = ₹${finalFare}`);

    // ✅ FIX: Hide rider details BEFORE showing bill modal
    hideRiderDetails();
    
    // Prepare bill details
    const billData = {
      distance: `${finalDistance.toFixed(2)} km`,
      travelTime: `${Math.round(finalDistance * 10)} mins`,
      charge: finalFare,
      userName: userData?.name || 'Customer',
      userMobile: userData?.mobile || 'N/A',
      baseFare: finalFare,
      timeCharge: 0,
      tax: 0
    };
    
    // ✅ CRITICAL: Save completed ride state to AsyncStorage BEFORE showing modal
    await saveRideState();
    
    // Show bill modal
    setBillDetails(billData);
    setShowBillModal(true);
    
    // Clear map data
    clearMapData();
    
    console.log("✅ Ride completion process initiated");

    // ✅ CRITICAL: Emit completion to server AFTER UI is updated
    if (socket && socket.connected) {
      console.log("📡 Emitting ride completion to server...");
      socket.emit("driverCompletedRide", {
        rideId: ride.rideId,
        driverId: driverId,
        userId: userData?.userId,
        distance: finalDistance,
        fare: finalFare,
        actualPickup: startPoint,
        actualDrop: location,
        timestamp: new Date().toISOString()
      });
    }

  } catch (error) {
    console.error("❌ Error in completeRide:", error);
    Alert.alert("Error", "Failed to complete ride. Please try again.");
    
    // Revert status if failed
    setRideStatus("started");
    setDriverStatus("onRide");
  }
}, [
  ride, 
  rideStatus, 
  driverStatus, 
  location, 
  otpVerificationLocation, 
  stopNavigation, 
  clearMapData, 
  socket, 
  driverId, 
  userData,
  haversine,
  hideRiderDetails,
  saveRideState // ✅ Added this dependency
]);




const handleBillModalClose = useCallback(() => {
  console.log("💰 Bill modal closing, finalizing ride...");
  
  // Reset all ride states
  setRide(null);
  setUserData(null);
  setOtpSharedTime(null);
  setOtpVerificationLocation(null);
  setRideStatus("idle");
  setDriverStatus("online");
  
  // Clean map
  clearMapData();
  
  // Hide rider details
  hideRiderDetails();
  
  // Clear AsyncStorage
  clearRideState();
  
  // Close modal
  setShowBillModal(false);
  
  console.log("✅ Ride fully completed and cleaned up");
}, [clearMapData, clearRideState, hideRiderDetails]);
  
  // Handle verification modal close
  const handleVerificationModalClose = () => {
    setShowVerificationModal(false);
  };
  

  const handleRideRequest = useCallback((data: any) => {
  if (!isMounted.current || !data?.rideId || !isDriverOnline) return;

  console.log(`🚗 Received ride request for ${data.vehicleType}`);

    // Default to 'taxi' if null, convert BOTH to lowercase for comparison
    const driverType = (driverVehicleType || "").toLowerCase(); // ✅ FIXED: No default 'taxi'
    const requestVehicleType = (data.vehicleType || "").toLowerCase();

    // ✅ FIX: Case-insensitive comparison
    if (requestVehicleType && driverType && requestVehicleType !== driverType) {
      console.log(`🚫 Ignoring ride request: Driver is ${driverType}, ride requires ${requestVehicleType}`);
      return;
    }
    
    // Process the ride request
    try {
      // Parse pickup and drop locations if they're strings
      let pickupLocation, dropLocation;
      
      try {
        if (typeof data.pickup === 'string') {
          pickupLocation = JSON.parse(data.pickup);
        } else {
          pickupLocation = data.pickup;
        }
        
        if (typeof data.drop === 'string') {
          dropLocation = JSON.parse(data.drop);
        } else {
          dropLocation = data.drop;
        }
      } catch (error) {
        console.error('Error parsing location data:', error);
        return;
      }
      
      const rideData: RideType = {
        rideId: data.rideId,
        RAID_ID: data.RAID_ID || "N/A",
        otp: data.otp || "0000",
        pickup: {
          latitude: pickupLocation?.lat || pickupLocation?.latitude || 0,
          longitude: pickupLocation?.lng || pickupLocation?.longitude || 0,
          address: pickupLocation?.address || "Unknown location",
        },
        drop: {
          latitude: dropLocation?.lat || dropLocation?.latitude || 0,
          longitude: dropLocation?.lng || dropLocation?.longitude || 0,
          address: dropLocation?.address || "Unknown location",
        },
        fare: parseFloat(data.fare) || 0,
        distance: data.distance || "0 km",
        vehicleType: data.vehicleType,
        userName: data.userName || "Customer",
        userMobile: data.userMobile || "N/A",
      };
      
      setRide(rideData);
      setRideStatus("onTheWay");
      
      Alert.alert(
        `🚖 New ${data.vehicleType?.toUpperCase()} Ride Request!`,
        `📍 Pickup: ${rideData.pickup.address}\n🎯 Drop: ${rideData.drop.address}\n💰 Fare: ₹${rideData.fare}\n📏 Distance: ${rideData.distance}\n👤 Customer: ${rideData.userName}\n🚗 Vehicle: ${data.vehicleType}`,
        [
          {
            text: "❌ Reject",
            onPress: () => rejectRide(rideData.rideId),
            style: "destructive",
          },
          {
            text: "✅ Accept",
            onPress: () => acceptRide(rideData.rideId),
          },
        ],
        { cancelable: false }
      );
    } catch (error) {
      console.error("❌ Error processing ride request:", error);
      Alert.alert("Error", "Could not process ride request. Please try again.");
    }
}, [isDriverOnline, driverVehicleType]);
  
  // Show ride taken alert
  const showRideTakenAlertMessage = useCallback(() => {
    setShowRideTakenAlert(true);
    
    // Clear any existing timeout
    if (rideTakenAlertTimeout.current) {
      clearTimeout(rideTakenAlertTimeout.current);
    }
    
    // Animate the progress bar
    Animated.timing(alertProgress, {
      toValue: 0,
      duration: 7000, // 7 seconds
      useNativeDriver: false,
    }).start();
    
    // Set new timeout to hide alert after 7 seconds
    rideTakenAlertTimeout.current = setTimeout(() => {
      setShowRideTakenAlert(false);
      // Reset the progress bar for next time
      alertProgress.setValue(1);
    }, 7000);
  }, [alertProgress]);
  

  
    // Render professional maximized passenger details
  const renderMaximizedPassengerDetails = () => {
    if (!ride || !userData || !riderDetailsVisible) return null;

    return (
      <Animated.View 
        style={[
          styles.maximizedDetailsContainer,
          {
            transform: [{ translateY: slideAnim }],
            opacity: fadeAnim
          }
        ]}
      >
        {/* Header with Branding and Down Arrow */}
        <View style={styles.maximizedHeader}>
          <View style={styles.brandingContainer}>
            <Text style={styles.brandingText}>Webase branding</Text>
          </View>
          <TouchableOpacity onPress={hideRiderDetails} style={styles.minimizeButton}>
            <MaterialIcons name="keyboard-arrow-down" size={28} color="#666" />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <ScrollView style={styles.maximizedContent} showsVerticalScrollIndicator={false}>
          {/* Contact Information */}
          <View style={styles.contactSection}>
            <View style={styles.contactRow}>
              <MaterialIcons name="phone" size={20} color="#666" />
              <Text style={styles.contactLabel}>Phone</Text>
              <Text style={styles.contactValue}>{userData.mobile}</Text>
            </View>
          </View>

          {/* Address Information */}
          <View style={styles.addressSection}>
            <View style={styles.addressRow}>
              <MaterialIcons name="location-on" size={20} color="#666" />
              <Text style={styles.addressLabel}>Pick-up location</Text>
            </View>
            <Text style={styles.addressText}>
              {ride.pickup.address}
            </Text>
            
            <View style={[styles.addressRow, { marginTop: 16 }]}>
              <MaterialIcons name="location-on" size={20} color="#666" />
              <Text style={styles.addressLabel}>Drop-off location</Text>
            </View>
            <Text style={styles.addressText}>
              {ride.drop.address}
            </Text>
          </View>

          {/* Fare Information */}
          <View style={styles.fareSection}>
            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Estimated fare</Text>
              <Text style={styles.fareAmount}>₹{ride.fare}</Text>
            </View>
          </View>
        </ScrollView>

        {/* ✅ FIX: Only show this button if ride is NOT started */}
        {rideStatus === "accepted" && (
          <TouchableOpacity 
            style={styles.startRideButton}
            onPress={() => setOtpModalVisible(true)}
          >
            <Text style={styles.startRideButtonText}>Enter OTP & Start Ride</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    );
  };



  // Render minimized booking bar (2 lines as specified)
  const renderMinimizedBookingBar = () => {
    if (!ride || !userData || riderDetailsVisible) return null;

    return (
      <View style={styles.minimizedBookingBarContainer}>
        <View style={styles.minimizedBookingBar}>
          {/* Line 1: Profile Image, Name, Maximize Arrow */}
          <View style={styles.minimizedFirstRow}>
            <View style={styles.minimizedProfileImage}>
              <Text style={styles.minimizedProfileImageText}>
                {calculateInitials(userData.name)}
              </Text>
            </View>
            <Text style={styles.minimizedProfileName} numberOfLines={1}>
              {userData.name}
            </Text>
            <TouchableOpacity 
              style={styles.minimizedExpandButton}
              onPress={showRiderDetails}
            >
              <MaterialIcons name="keyboard-arrow-up" size={24} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Line 2: Phone Icon, Mobile Number, Call Button */}
          <View style={styles.minimizedSecondRow}>
            <View style={styles.minimizedMobileContainer}>
              <MaterialIcons name="phone" size={16} color="#4CAF50" />
              <Text style={styles.minimizedMobileText} numberOfLines={1}>
                {userData.mobile}
              </Text>
            </View>
            <TouchableOpacity 
              style={styles.minimizedCallButton}
              onPress={handleCallPassenger}
            >
              <MaterialIcons name="call" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  // Socket event listeners for ride taken alerts
  useEffect(() => {
    if (!socket) {
      console.warn("⚠️ Socket not available, skipping socket event listeners");
      return;
    }
    

    

    
    const handleUserLiveLocationUpdate = (data: any) => {
      if (!isMounted.current) return;
     
      if (data && typeof data.lat === "number" && typeof data.lng === "number") {
        const newUserLocation = {
          latitude: data.lat,
          longitude: data.lng,
        };
       
        setUserLocation((prev) => {
          if (
            !prev ||
            prev.latitude !== newUserLocation.latitude ||
            prev.longitude !== newUserLocation.longitude
          ) {
            return newUserLocation;
          }
          return prev;
        });
       
        setUserData((prev) => {
          if (prev) {
            return { ...prev, location: newUserLocation };
          }
          return prev;
        });
      }
    };
    
    const handleUserDataForDriver = (data: any) => {
      if (!isMounted.current) return;
     
      if (data && data.userCurrentLocation) {
        const userLiveLocation = {
          latitude: data.userCurrentLocation.latitude,
          longitude: data.userCurrentLocation.longitude,
        };
       
        setUserLocation(userLiveLocation);
       
        if (userData && !userData.userId && data.userId) {
          setUserData((prev) => (prev ? { ...prev, userId: data.userId } : null));
        }
      }
    };
    
    const handleRideOTP = (data: any) => {
      if (!isMounted.current) return;
     
      if (ride && ride.rideId === data.rideId) {
        setRide((prev) => (prev ? { ...prev, otp: data.otp } : null));
      }
    };
    
    const handleDisconnect = () => {
      if (!isMounted.current) return;
      setSocketConnected(false);
      setIsRegistered(false);
     
      if (ride) {
        setUserData(null);
        setUserLocation(null);
        Alert.alert("Connection Lost", "Reconnecting to server...");
      }
    };
    
    const handleConnectError = (error: Error) => {
      if (!isMounted.current) return;
      setSocketConnected(false);
      setError("Failed to connect to server");
    };
    
    const handleRideCancelled = (data: any) => {
      if (!isMounted.current) return;
     
      if (ride && ride.rideId === data.rideId) {
        stopNavigation();
       
        socket.emit("driverRideCancelled", {
          rideId: ride.rideId,
          driverId: driverId,
          userId: userData?.userId,
        });
       
        // Clean map after cancellation
        clearMapData();
       
        setRide(null);
        setUserData(null);
        setRideStatus("idle");
        setDriverStatus("online");
        hideRiderDetails();
        
        // Clear ride state from AsyncStorage
        clearRideState();
       
        Alert.alert("Ride Cancelled", "The passenger cancelled the ride.");
      }
    };
    
    const handleRideAlreadyAccepted = (data: any) => {
      if (!isMounted.current) return;
     
      // If this driver had ride request, clean up
      if (ride && ride.rideId === data.rideId) {
        // Clean map
        clearMapData();
       
        setRide(null);
        setUserData(null);
        setRideStatus("idle");
        setDriverStatus("online");
        hideRiderDetails();
      }
    };
    
    const handleRideTakenByDriver = (data: any) => {
      if (!isMounted.current) return;
      
      // Only show the alert if this driver is not the one who took the ride
      if (data.driverId !== driverId) {
        Alert.alert(
          "Ride Already Taken",
          data.message || "This ride has already been accepted by another driver. Please wait for the next ride request.",
          [{ text: "OK" }]
        );
        
        // If this driver had the ride request, clean up
        if (ride && ride.rideId === data.rideId) {
          // Clean map
          clearMapData();
         
          setRide(null);
          setUserData(null);
          setRideStatus("idle");
          setDriverStatus("online");
          hideRiderDetails();
        }
      }
    };
    
    const handleRideStarted = (data: any) => {
      if (!isMounted.current) return;
     
      if (ride && ride.rideId === data.rideId) {
        console.log("🎉 Ride started - showing verification modal");
       
        setVerificationDetails({
          pickup: ride.pickup.address || "Pickup location",
          dropoff: ride.drop.address || "Dropoff location",
          time: new Date().toLocaleTimeString(),
          speed: currentSpeed,
          distance: distanceSinceOtp.current,
        });
       
        setShowVerificationModal(true);
      }
    };
    
    socket.on("connect", handleConnect);
    socket.on("newRideRequest", handleRideRequest);
    socket.on("userLiveLocationUpdate", handleUserLiveLocationUpdate);
    socket.on("userDataForDriver", handleUserDataForDriver);
    socket.on("rideOTP", handleRideOTP);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("rideCancelled", handleRideCancelled);
    socket.on("rideAlreadyAccepted", handleRideAlreadyAccepted);
    socket.on("rideTakenByDriver", handleRideTakenByDriver);
    socket.on("rideStarted", handleRideStarted);
   
    // Socket connection based on online status
    if (isDriverOnline && !socket.connected) {
      socket.connect();
    } else if (!isDriverOnline && socket.connected) {
      socket.disconnect();
    }
   
    return () => {
      socket.off("connect", handleConnect);
      socket.off("newRideRequest", handleRideRequest);
      socket.off("userLiveLocationUpdate", handleUserLiveLocationUpdate);
      socket.off("userDataForDriver", handleUserDataForDriver);
      socket.off("rideOTP", handleRideOTP);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("rideCancelled", handleRideCancelled);
      socket.off("rideAlreadyAccepted", handleRideAlreadyAccepted);
      socket.off("rideTakenByDriver", handleRideTakenByDriver);
      socket.off("rideStarted", handleRideStarted);
    };
  }, [location, driverId, driverName, ride, rideStatus, userData, stopNavigation, currentSpeed, isDriverOnline, clearMapData, clearRideState, driverVehicleType, handleRideRequest]);
  
  // LOCATION TRACKING – new unified effect
  useEffect(() => {
    let watchId: number | null = null;

    const requestLocation = async () => {
      try {
        // Android permission (iOS is handled by Info.plist)
        if (Platform.OS === "android" && !location) {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            {
              title: "Location Permission",
              message: "This app needs access to your location for ride tracking",
              buttonNeutral: "Ask Me Later",
              buttonNegative: "Cancel",
              buttonPositive: "OK"
            }
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            Alert.alert("Permission Required", "Location permission is required to go online");
            return;
          }
        }


        
        if (!location) return;               // safety – should never happen
        watchId = Geolocation.watchPosition(
          (pos) => {
            if (!isMounted.current || !isDriverOnline) return;

            const loc: LocationType = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            };

            setLocation(loc);
            setCurrentSpeed(pos.coords.speed || 0);
            lastLocationUpdate.current = loc;

            // ---- distance calculation (same as before) ----
            if (lastCoord && (rideStatus === "accepted" || rideStatus === "started")) {
              const dist = haversine(lastCoord, loc);
              const distanceKm = dist / 1000;
              setTravelledKm((prev) => prev + distanceKm);

              if (rideStatus === "started" && lastLocationBeforeOtp.current) {
                distanceSinceOtp.current += distanceKm;
              }
            }
            setLastCoord(loc);

            // ---- map auto-center (only when idle) ----
            if (locationUpdateCount.current % 10 === 0 && mapRef.current && !ride) {
              mapRef.current.animateToRegion(
                {
                  latitude: loc.latitude,
                  longitude: loc.longitude,
                  latitudeDelta: 0.01,
                  longitudeDelta: 0.01,
                },
                500
              );
            }

            // ---- DB + socket update (unchanged) ----
            saveLocationToDatabase(loc).catch(console.error);
          },
          (err) => {
            console.error("Geolocation error:", err);
          },
          {
            enableHighAccuracy: true,
            distanceFilter: 5,          // tighter filter
            interval: 3000,
            fastestInterval: 2000,
          }
        );
      } catch (e) {
        console.error("Location setup error:", e);
      }
    };

    // start only when driver is online (your toggle controls isDriverOnline)
    if (isDriverOnline) requestLocation();

    return () => {
      if (watchId !== null) Geolocation.clearWatch(watchId);
    };
  }, [isDriverOnline, location, rideStatus, lastCoord, saveLocationToDatabase, driverVehicleType]);
  
  // Save ride state whenever it changes
  useEffect(() => {
    if (ride && (rideStatus === "accepted" || rideStatus === "started")) {
      saveRideState();
    }
  }, [ride, rideStatus, userData, travelledKm, otpVerificationLocation, riderDetailsVisible, saveRideState]);
  
  // UI Rendering
  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => setError(null)}
        >
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }
  
  if (!location) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4caf50" />
        <Text style={styles.loadingText}>Fetching your location...</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => {
            Geolocation.getCurrentPosition(
              (pos) => {
                setLocation({
                  latitude: pos.coords.latitude,
                  longitude: pos.coords.longitude,
                });
              },
              (err) => {
                Alert.alert(
                  "Location Error",
                  "Could not get your location. Please check GPS settings."
                );
              },
              { enableHighAccuracy: true, timeout: 15000 }
            );
          }}
        >
          <Text style={styles.retryText}>Retry Location</Text>
        </TouchableOpacity>
      </View>
    );
  }
  
  return (
    <View style={styles.container}>
      {/* Top-left menu icon */}
      <TouchableOpacity
        style={styles.menuButton}
        onPress={() => navigation.navigate('Menu')}
      >
        <MaterialIcons name="menu" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Top-right logout button */}
      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
      >
        <MaterialIcons name="logout" size={24} color="#fff" />
      </TouchableOpacity>

      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: location.latitude,
          longitude: location.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }}
        showsUserLocation
        showsMyLocationButton
        showsCompass={true}
        showsScale={true}
        zoomControlEnabled={true}
        rotateEnabled={true}
        scrollEnabled={true}
        zoomEnabled={true}
        region={mapRegion}
      >
        {/* Pickup Marker with Blue Icon */}
        {ride && rideStatus !== "started" && (
          <Marker
            coordinate={ride.pickup}
            title="Pickup Location"
            description={ride.pickup.address}
            pinColor="blue"
          >
            <View style={styles.locationMarker}>
              <MaterialIcons name="location-pin" size={32} color="#2196F3" />
              <Text style={styles.markerLabel}>Pickup</Text>
            </View>
          </Marker>
        )}
       
        {/* Drop-off Marker with Red Icon */}
        {ride && (
          <Marker
            coordinate={ride.drop}
            title="Drop Location"
            description={ride.drop.address}
            pinColor="red"
          >
            <View style={styles.locationMarker}>
              <MaterialIcons name="location-pin" size={32} color="#F44336" />
              <Text style={styles.markerLabel}>Drop-off</Text>
            </View>
          </Marker>
        )}
      
        {/* RED ROUTE - Dynamic polyline after OTP (OTP verification to drop) */}
        {rideStatus === "started" && visibleRouteCoords.length > 0 && (
          <Polyline
            coordinates={visibleRouteCoords}
            strokeWidth={6}
            strokeColor="#F44336"
            lineCap="round"
            lineJoin="round"
          />
        )}
      
        {/* GREEN ROUTE - Dynamic polyline before OTP (driver to pickup) */}
        {rideStatus === "accepted" && ride?.routeCoords?.length && (
          <Polyline
            coordinates={ride.routeCoords}
            strokeWidth={5}
            strokeColor="#4caf50"
            lineCap="round"
            lineJoin="round"
          />
        )}
      
        {ride && (rideStatus === "accepted" || rideStatus === "started") && userLocation && (
          <Marker
            coordinate={userLocation}
            title="User Live Location"
            description={`${userData?.name || "User"} - Live Location`}
            tracksViewChanges={false}
          >
            <View style={styles.blackDotMarker}>
              <View style={styles.blackDotInner} />
            </View>
          </Marker>
        )}
      </MapView>
      
      {/* Professional Maximized Passenger Details (Default View) */}
      {renderMaximizedPassengerDetails()}
      
      {/* Minimized Booking Bar (2 lines) */}
      {renderMinimizedBookingBar()}

      {/* Single Bottom Button - Changes based on ride status */}
   
{ride && (rideStatus === "accepted" || rideStatus === "started") && (
  <TouchableOpacity
    style={[
      styles.button, 
      rideStatus === "accepted" ? styles.startButton : styles.completeButton
    ]}
    onPress={() => {
      console.log("🎯 Complete Ride button pressed");
      if (rideStatus === "accepted") {
        setOtpModalVisible(true);
      } else if (rideStatus === "started") {
        completeRide(); // Direct call
      }
    }}
    activeOpacity={0.7}
  >
    <MaterialIcons 
      name={rideStatus === "accepted" ? "play-arrow" : "flag"} 
      size={24} 
      color="#fff" 
    />
    <Text style={styles.btnText}>
      {rideStatus === "accepted" ? "Enter OTP & Start Ride" : `Complete Ride (${distanceSinceOtp.current.toFixed(2)} km)`}
    </Text>
  </TouchableOpacity>
)}

      {/* Ride Taken Alert */}
      {showRideTakenAlert && (
        <View style={styles.rideTakenAlertContainer}>
          <View style={styles.rideTakenAlertContent}>
            <Text style={styles.rideTakenAlertText}>
              This ride is already taken by another driver — please wait.
            </Text>
            <View style={styles.alertProgressBar}>
              <Animated.View 
                style={[
                  styles.alertProgressFill,
                  {
                    width: '100%',
                    transform: [{ scaleX: alertProgress }]
                  }
                ]}
              />
            </View>
          </View>
        </View>
      )}
      
      {/* Center ONLINE | OFFLINE button */}
      {!ride && (
        <View style={styles.onlineToggleContainer}>
          <TouchableOpacity
            style={[
              styles.onlineToggleButton,
              isDriverOnline ? styles.onlineButton : styles.offlineButton
            ]}
            onPress={toggleOnlineStatus}
          >
            <View style={styles.toggleContent}>
              <View style={[
                styles.toggleIndicator,
                { backgroundColor: isDriverOnline ? "#4caf50" : "#f44336" }
              ]} />
              <Text style={styles.toggleButtonText}>
                {isDriverOnline ? "🟢 ONLINE" : "🔴 OFFLINE"}
              </Text>
            </View>
            {backgroundTrackingActive && (
              <Text style={styles.trackingText}>📍 Live tracking active</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
      
      {/* <View style={styles.statusContainer}>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusIndicator,
              { backgroundColor: socketConnected ? "#4caf50" : "#f44336" },
            ]}
          />
          <Text style={styles.statusText}>
            {socketConnected ? "Connected" : "Disconnected"}
          </Text>
          <View
            style={[
              styles.statusIndicator,
              {
                backgroundColor:
                  driverStatus === "online"
                    ? "#4caf50"
                    : driverStatus === "onRide"
                    ? "#ff9800"
                    : "#f44336",
              },
            ]}
          />
          <Text style={styles.statusText}>{driverStatus.toUpperCase()}</Text>
        </View>
       
        {ride && (rideStatus === "accepted" || rideStatus === "started") && userLocation && (
          <Text style={styles.userLocationText}>
            🟢 User Live: {userLocation.latitude.toFixed(4)},{" "}
            {userLocation.longitude.toFixed(4)}
          </Text>
        )}
       
        {rideStatus === "started" && (
          <Text style={styles.distanceText}>
            📏 Distance Travelled: {travelledKm.toFixed(2)} km
          </Text>
        )}
      </View> */}
      
      {ride && rideStatus === "onTheWay" && (
        <View style={styles.rideActions}>
          <TouchableOpacity
            style={[styles.button, styles.acceptButton]}
            onPress={() => acceptRide()}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <MaterialIcons name="check-circle" size={24} color="#fff" />
                <Text style={styles.btnText}>Accept Ride</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.rejectButton]}
            onPress={() => rejectRide()}
          >
            <MaterialIcons name="cancel" size={24} color="#fff" />
            <Text style={styles.btnText}>Reject</Text>
          </TouchableOpacity>
        </View>
      )}
      
      {/* OTP Modal */}
      <Modal visible={otpModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Enter OTP</Text>
              <Text style={styles.modalSubtitle}>Please ask passenger for OTP to start the ride</Text>
            </View>
            <TextInput
              placeholder="Enter 4-digit OTP"
              value={enteredOtp}
              onChangeText={setEnteredOtp}
              keyboardType="numeric"
              style={styles.otpInput}
              maxLength={4}
              autoFocus
              placeholderTextColor="#999"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelModalButton]}
                onPress={() => setOtpModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmModalButton]}
                onPress={confirmOTP}
              >
                <Text style={styles.modalButtonText}>Confirm OTP</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Offline Verification Modal */}
      <Modal
        visible={showOfflineVerificationModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowOfflineVerificationModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Verify Driver ID</Text>
              <Text style={styles.modalSubtitle}>Enter the last 4 digits of your Driver ID to confirm going offline</Text>
            </View>
            <View style={styles.verificationBox}>
              <TextInput
                style={styles.driverIdInput}
                placeholder="••••"
                placeholderTextColor="#bdc3c7"
                value={driverIdVerification}
                onChangeText={setDriverIdVerification}
                keyboardType="number-pad"
                maxLength={4}
                autoFocus
              />
            </View>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelModalButton]}
                onPress={() => {
                  setShowOfflineVerificationModal(false);
                  setDriverIdVerification('');
                }}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmModalButton]}
                onPress={verifyDriverIdAndGoOffline}
              >
                <Text style={styles.modalButtonText}>Confirm Offline</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Verification Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showVerificationModal}
        onRequestClose={handleVerificationModalClose}
      >
        
      </Modal>
      
      {/* Bill Modal */}
     <Modal
        animationType="slide"
        transparent={true}
        visible={showBillModal}
        onRequestClose={handleBillModalDismiss} // ✅ Changed: Just dismiss on Back button
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🏁 Ride Completed</Text>
              <Text style={styles.modalSubtitle}>Thank you for the safe ride!</Text>
            </View>

            <View style={styles.billCard}>
              {/* ... Bill Details ... */}
              {/* Ensure you have the bill details view here exactly as it was */}
               <View style={styles.billSection}>
                <Text style={styles.billSectionTitle}>Customer Details</Text>
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Name:</Text>
                  <Text style={styles.billValue}>{billDetails.userName}</Text>
                </View>
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Mobile:</Text>
                  <Text style={styles.billValue}>{billDetails.userMobile}</Text>
                </View>
              </View>

              <View style={styles.billSection}>
                <Text style={styles.billSectionTitle}>Trip Details</Text>
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Distance:</Text>
                  <Text style={styles.billValue}>{billDetails.distance}</Text>
                </View>
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Time:</Text>
                  <Text style={styles.billValue}>{billDetails.travelTime}</Text>
                </View>
              </View>

              <View style={styles.billSection}>
                <Text style={styles.billSectionTitle}>Fare Breakdown</Text>
                <View style={styles.billRow}>
                  <Text style={styles.billLabel}>Distance Charge:</Text>
                  <Text style={styles.billValue}>₹{billDetails.charge}</Text>
                </View>
                <View style={styles.billDivider} />
                <View style={styles.billRow}>
                  <Text style={styles.billTotalLabel}>Total Amount:</Text>
                  <Text style={styles.billTotalValue}>₹{billDetails.charge}</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity style={styles.confirmButton} onPress={handleBillModalClose}>
              <Text style={styles.confirmButtonText}>Confirm & Close Ride</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default DriverScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a1a",
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#666",
    textAlign: "center",
  },
  // Location Marker Styles
  locationMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#333',
    marginTop: -4,
  },
  // Professional Maximized Passenger Details (Screenshot Layout)
  maximizedDetailsContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
    elevation: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    maxHeight: "80%", // Increased height to ensure it covers the bottom button
  },
  maximizedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  brandingContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  brandingText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333333",
  },
  minimizeButton: {
    padding: 8,
  },
  maximizedContent: {
    flex: 1,
  },
  contactSection: {
    marginBottom: 20,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  contactLabel: {
    fontSize: 14,
    color: "#666666",
    marginLeft: 12,
    flex: 1,
  },
  contactValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333333",
  },
  addressSection: {
    marginBottom: 20,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  addressLabel: {
    fontSize: 14,
    color: "#666666",
    marginLeft: 12,
    fontWeight: "500",
  },
  addressText: {
    fontSize: 16,
    color: "#333333",
    lineHeight: 24,
    paddingHorizontal: 16,
  },
  fareSection: {
    marginBottom: 20,
  },
  fareRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  fareLabel: {
    fontSize: 16,
    color: "#666666",
    fontWeight: "500",
  },
  fareAmount: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#4CAF50",
  },
  startRideButton: {
    backgroundColor: "#2196F3",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  startRideButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  // Minimized Booking Bar Styles (2 lines)
  minimizedBookingBarContainer: {
    position: "absolute",
    bottom: 80,
    left: 16,
    right: 16,
    zIndex: 11,
  },
  minimizedBookingBar: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  minimizedFirstRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  minimizedProfileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#4CAF50",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  minimizedProfileImageText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },
  minimizedProfileName: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333333",
    flex: 1,
  },
  minimizedExpandButton: {
    padding: 4,
  },
  minimizedSecondRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  minimizedMobileContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  minimizedMobileText: {
    fontSize: 14,
    color: "#333333",
    marginLeft: 6,
    flex: 1,
  },
  minimizedCallButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#4CAF50",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  // Ride Taken Alert Styles
  rideTakenAlertContainer: {
    position: "absolute",
    top: 50,
    left: 16,
    right: 16,
    zIndex: 20,
  },
  rideTakenAlertContent: {
    backgroundColor: "rgba(255, 152, 0, 0.9)",
    padding: 16,
    borderRadius: 8,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  rideTakenAlertText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  alertProgressBar: {
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 2,
    marginTop: 8,
    overflow: "hidden",
  },
  alertProgressFill: {
    height: "100%",
    backgroundColor: "#fff",
    borderRadius: 2,
  },
  // Online/Offline Toggle Styles - MOVED TO BOTTOM RIGHT
  onlineToggleContainer: {
    position: "absolute",
    top: 120,
    right: 30,
    left: 'auto',
    zIndex: 11,
  },
  onlineToggleButton: {
    padding: 16,
    borderRadius: 12,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    minWidth: 330,
  },
  onlineButton: {
    backgroundColor: "#4caf50",
  },
  offlineButton: {
    backgroundColor: "#f44336",
  },
  toggleContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  toggleIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  toggleButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  trackingText: {
    color: "#fff",
    fontSize: 11,
    marginTop: 4,
    textAlign: "center",
    fontWeight: "500",
  },
  statusContainer: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 40,
    left: 16,
    right: 16,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    padding: 12,
    borderRadius: 12,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "600",
    marginRight: 16,
    color: "#333",
  },
  userLocationText: {
    fontSize: 11,
    color: "#4caf50",
    fontWeight: "500",
    marginTop: 2,
  },
  distanceText: {
    fontSize: 11,
    color: "#ff9800",
    fontWeight: "500",
    marginTop: 2,
  },
  rideActions: {
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  button: {
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  acceptButton: {
    backgroundColor: "#4caf50",
    flex: 1,
  },
  rejectButton: {
    backgroundColor: "#f44336",
    flex: 1,
  },





  startButton: {
    backgroundColor: "#2196f3",
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
    elevation: 25, // ✅ INCREASED from 3
    zIndex: 100,  // ✅ ADDED for iOS priority
  },
  completeButton: {
    backgroundColor: "#ff9800",
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
    elevation: 25, // ✅ INCREASED from 3
    zIndex: 100,  // ✅ ADDED for iOS priority
  },
  logoutButton: {
    backgroundColor: "#dc3545",
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
    elevation: 25, // ✅ INCREASED from 3
    zIndex: 100,  // ✅ ADDED for iOS priority
  },
  // startButton: {
  //   backgroundColor: "#2196f3",
  //   position: "absolute",
  //   bottom: 20,
  //   left: 16,
  //   right: 16,
  // },
  // completeButton: {
  //   backgroundColor: "#ff9800",
  //   position: "absolute",
  //   bottom: 20,
  //   left: 16,
  //   right: 16,
  // },
  // logoutButton: {
  //   backgroundColor: "#dc3545",
  //   position: "absolute",
  //   bottom: 20,
  //   left: 16,
  //   right: 16,
  // },










  btnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },








  // modalOverlay: {
  //   flex: 1,
  //   justifyContent: "center",
  //   alignItems: "center",
  //   backgroundColor: "rgba(0,0,0,0.7)",
  //   padding: 20,
  // },
  // modalContainer: {
  //   backgroundColor: "white",
  //   padding: 24,
  //   borderRadius: 20,
  //   width: "100%",
  //   elevation: 12,
  //   shadowColor: "#000",
  //   shadowOffset: { width: 0, height: 6 },
  //   shadowOpacity: 0.3,
  //   shadowRadius: 12,
  // },


  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    padding: 20,
    zIndex: 999, // ✅ ADD THIS: Force it to be the top-most layer
  },
  modalContainer: {
    backgroundColor: "white",
    padding: 24,
    borderRadius: 20,
    width: "100%",
    elevation: 99, // ✅ INCREASED from 12: Must be higher than maximizedDetailsContainer (16)
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    zIndex: 1000, // ✅ ADD THIS
  },












  modalHeader: {
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    color: "#333",
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 20,
  },
  otpInput: {
    borderWidth: 2,
    borderColor: "#e0e0e0",
    borderRadius: 12,
    marginVertical: 16,
    padding: 20,
    fontSize: 20,
    textAlign: "center",
    fontWeight: "700",
    backgroundColor: "#f8f9fa",
    color: "#333",
  },
  modalButtons: {
    flexDirection: "row",
    marginTop: 8,
    gap: 12,
  },
  modalButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cancelModalButton: {
    backgroundColor: "#757575",
  },
  confirmModalButton: {
    backgroundColor: "#4caf50",
  },
  modalButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  billCard: {
    backgroundColor: "#F8F9FA",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  billSection: {
    marginBottom: 20,
  },
  billSectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 12,
  },
  billRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  billLabel: {
    fontSize: 14,
    color: "#666666",
    fontWeight: "500",
  },
  billValue: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#333333",
  },
  billDivider: {
    height: 1,
    backgroundColor: "#DDDDDD",
    marginVertical: 12,
  },
  billTotalLabel: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333333",
  },
  billTotalValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#4CAF50",
  },
  confirmButton: {
    backgroundColor: "#4CAF50",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#ffffff",
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: "#f44336",
    marginBottom: 20,
    textAlign: "center",
    lineHeight: 22,
  },
  retryButton: {
    backgroundColor: "#4caf50",
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    elevation: 2,
  },
  retryText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
  blackDotMarker: {
    backgroundColor: "rgba(0, 0, 0, 0.9)",
    width: 14,
    height: 14,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  blackDotInner: {
    backgroundColor: "#000000",
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  modalIconContainer: {
    alignItems: "center",
    marginBottom: 15,
  },
  modalMessage: {
    fontSize: 16,
    color: "#333",
    textAlign: "center",
    marginBottom: 20,
  },
  billDetailsContainer: {
    width: "100%",
    backgroundColor: "#F5F5F5",
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
  },
  modalConfirmButton: {
    backgroundColor: "#4CAF50",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  modalConfirmButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  // Top Navigation Buttons
  menuButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#2ecc71',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    zIndex: 10,
  },
  logoutButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#e74c3c',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    zIndex: 10,
  },
  // Online/Offline Toggle Styles
  onlineToggleContainer: {
    position: "absolute",
    top: 45,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 5,
  },
  onlineToggleButton: {
    padding: 14,
    borderRadius: 30,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    width: 180,
  },
  // Offline Verification Modal Styles
  verificationBox: {
    marginBottom: 20,
  },
  driverIdInput: {
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 20,
    fontSize: 20,
    textAlign: 'center',
    fontWeight: '700',
    backgroundColor: '#f8f9fa',
    color: '#333',
  },
});







































































// import React, { useState, useEffect, useRef, useCallback } from "react";
// import {
//   View,
//   Text,
//   TouchableOpacity,
//   StyleSheet,
//   ActivityIndicator,
//   PermissionsAndroid,
//   Platform,
//   Alert,
//   Modal,
//   TextInput,
//   Dimensions,
//   AppState,
//   Linking,
//   Animated,
//   Easing,
//   ScrollView,
// } from "react-native";
// import MapView, { Marker, Polyline } from "react-native-maps";
// import Geolocation from "@react-native-community/geolocation";
// import AsyncStorage from "@react-native-async-storage/async-storage";
// import { API_BASE } from "./apiConfig";
// import api from "../utils/api";
// import MaterialIcons from "react-native-vector-icons/MaterialIcons";
// import FontAwesome from "react-native-vector-icons/FontAwesome";
// import BackgroundTimer from 'react-native-background-timer';
// import NotificationService from './Notifications';
// import AnimatedMapUtils from './utils/AnimatedMapUtils';

// const { width, height } = Dimensions.get("window");

// type LocationType = { latitude: number; longitude: number };
// type RideType = {
//   rideId: string;
//   RAID_ID?: string;
//   otp?: string;
//   pickup: LocationType & { address?: string };
//   drop: LocationType & { address?: string };
//   routeCoords?: LocationType[];
//   fare?: number;
//   distance?: string;
//   vehicleType?: string; // Add this line
//   userName?: string;
//   userMobile?: string;
// };
// type UserDataType = {
//   name: string;
//   mobile: string;
//   location: LocationType;
//   userId?: string;
//   rating?: number;
// };

// const DriverScreen = ({ route, navigation }: { route: any; navigation: any }) => {
//   const [location, setLocation] = useState<LocationType | null>(
//     route.params?.latitude && route.params?.longitude
//       ? { latitude: route.params.latitude, longitude: route.params.longitude }
//       : null
//   );
//   const [ride, setRide] = useState<RideType | null>(null);
//   const [userData, setUserData] = useState<UserDataType | null>(null);
//   const [userLocation, setUserLocation] = useState<LocationType | null>(null);
//   const [travelledKm, setTravelledKm] = useState(0);
//   const [lastCoord, setLastCoord] = useState<LocationType | null>(null);
//   const [otpModalVisible, setOtpModalVisible] = useState(false);
//   const [enteredOtp, setEnteredOtp] = useState("");
//   const [rideStatus, setRideStatus] = useState<
//     "idle" | "onTheWay" | "accepted" | "started" | "completed"
//   >("idle");
//   const [isRegistered, setIsRegistered] = useState(false);
//   const [socketConnected, setSocketConnected] = useState(false);
//   const [driverStatus, setDriverStatus] = useState<
//     "offline" | "online" | "onRide"
//   >("offline");
//   const [isLoading, setIsLoading] = useState(false);
//   const [isCompletingRide, setIsCompletingRide] = useState(false);
//   const mapRef = useRef<MapView | null>(null);
//   const [driverId, setDriverId] = useState<string>(route.params?.driverId || "");
//   const [driverName, setDriverName] = useState<string>(
//     route.params?.driverName || ""
//   );
//   const [error, setError] = useState<string | null>(null);
 
//   // Route handling states
//   const [fullRouteCoords, setFullRouteCoords] = useState<LocationType[]>([]);
//   const [visibleRouteCoords, setVisibleRouteCoords] = useState<LocationType[]>([]);
//   const [nearestPointIndex, setNearestPointIndex] = useState(0);
//   const [mapRegion, setMapRegion] = useState<any>(null);

//   // ✅ SMOOTH ANIMATION STATES
//   const [driverBearing, setDriverBearing] = useState(0);
//   const [previousLocation, setPreviousLocation] = useState<LocationType | null>(null);
//   const [travelledRoute, setTravelledRoute] = useState<LocationType[]>([]);
//   const animatedLatitude = useRef(new Animated.Value(location?.latitude || 0)).current;
//   const animatedLongitude = useRef(new Animated.Value(location?.longitude || 0)).current;
//   const animatedBearing = useRef(new Animated.Value(0)).current;
//   const polylineOpacity = useRef(new Animated.Value(1)).current;

//   // App state management
//   const [isAppActive, setIsAppActive] = useState(true);

//   // ✅ Prevent multiple button clicks
//   const [isAcceptingRide, setIsAcceptingRide] = useState(false);
//   const [isRejectingRide, setIsRejectingRide] = useState(false);

//   // New states for verification and bill
//   const [showVerificationModal, setShowVerificationModal] = useState(false);
//   const [showBillModal, setShowBillModal] = useState(false);
//   const [billDetails, setBillDetails] = useState({
//     distance: '0 km',
//     travelTime: '0 mins',
//     charge: 0,
//     userName: '',
//     userMobile: '',
//     baseFare: 0,
//     timeCharge: 0,
//     tax: 0
//   });
//   const [verificationDetails, setVerificationDetails] = useState({
//     pickup: '',
//     dropoff: '',
//     time: '',
//     speed: 0,
//     distance: 0,
//   });
//   const [otpSharedTime, setOtpSharedTime] = useState<Date | null>(null);
//   const [currentSpeed, setCurrentSpeed] = useState<number>(0);
  

//     // Add these new state variables:
//   const [isAccepting, setIsAccepting] = useState(false); // Tracks if we are currently processing an acceptance
//   const [pendingAcceptRideId, setPendingAcceptRideId] = useState<string | null>(null); // Tracks which rideId we have a pending request for



//   // Online/Offline toggle state
//   const [isDriverOnline, setIsDriverOnline] = useState(false);
//   const [backgroundTrackingActive, setBackgroundTrackingActive] = useState(false);
 
//   // FCM Notification states
//   const [hasNotificationPermission, setHasNotificationPermission] = useState(false);
//   const [isBackgroundMode, setIsBackgroundMode] = useState(false);
  
//   // Animation values
//   const driverMarkerAnimation = useRef(new Animated.Value(1)).current;
//   const polylineAnimation = useRef(new Animated.Value(0)).current;
  
//   // Enhanced UI states - DEFAULT TO MAXIMIZED
//   const [riderDetailsVisible, setRiderDetailsVisible] = useState(true);
//   const slideAnim = useRef(new Animated.Value(0)).current; // Start at 0 for maximized
//   const fadeAnim = useRef(new Animated.Value(1)).current;  // Start at 1 for maximized

//   // Hamburger Menu States
//   const [profileModalVisible, setProfileModalVisible] = useState(false);
//   const [driverProfile, setDriverProfile] = useState({
//     name: '',
//     phone: '',
//     vehicleNumber: '',
//     vehicleType: '',
//     rating: 0
//   });
  
//   // Refs for optimization
//   const isMounted = useRef(true);
//   const locationUpdateCount = useRef(0);
//   const mapAnimationInProgress = useRef(false);
//   const navigationInterval = useRef<NodeJS.Timeout | null>(null);
//   const lastLocationUpdate = useRef<LocationType | null>(null);
//   const routeUpdateThrottle = useRef<NodeJS.Timeout | null>(null);
//   const distanceSinceOtp = useRef(0);
//   const lastLocationBeforeOtp = useRef<LocationType | null>(null);
//   const geolocationWatchId = useRef<number | null>(null);
//   const backgroundLocationInterval = useRef<NodeJS.Timeout | null>(null);
//   const driverMarkerRef = useRef<any>(null);
  
//   // Store OTP verification location
//   const [otpVerificationLocation, setOtpVerificationLocation] = useState<LocationType | null>(null);
  
//   // Alert for ride already taken
//   const [showRideTakenAlert, setShowRideTakenAlert] = useState(false);
//   const rideTakenAlertTimeout = useRef<NodeJS.Timeout | null>(null);
//   const [alertProgress, setAlertProgress] = useState(new Animated.Value(1));

//   // ========================================
//   // WORKING HOURS TIMER STATES
//   // ========================================
//   const [workingHoursTimer, setWorkingHoursTimer] = useState({
//     active: false,
//     remainingSeconds: 0,
//     formattedTime: '00:00:00',
//     warningsIssued: 0,
//     walletDeducted: false,
//     totalHours: 12,
//   });

//   const [showWorkingHoursWarning, setShowWorkingHoursWarning] = useState(false);
//   const [currentWarning, setCurrentWarning] = useState({
//     number: 0,
//     message: '',
//     remainingTime: '',
//   });

//   const [showOfflineConfirmation, setShowOfflineConfirmation] = useState(false);
//   const [offlineStep, setOfflineStep] = useState<'warning' | 'verification'>('warning'); // Two-step flow
//   const [driverIdConfirmation, setDriverIdConfirmation] = useState('');
//   const onlineStatusChanging = useRef(false);

//   // ✅ FIX: Socket import using useRef to persist across renders
//   const socketRef = useRef<any>(null);

//   // Initialize socket only once
//   if (!socketRef.current) {
//     try {
//       socketRef.current = require("./socket").default;
//       console.log("✅ Socket initialized and stored in ref");
//       console.log("🔍 Socket object type:", typeof socketRef.current);
//       console.log("🔍 Socket has emit method:", typeof socketRef.current?.emit === 'function');
//       console.log("🔍 Socket has on method:", typeof socketRef.current?.on === 'function');
//     } catch (error) {
//       console.warn("⚠️ Socket not available:", error);
//     }
//   }

//   // Use socket from ref
//   const socket = socketRef.current;

//   // Log socket status on every render
//   console.log("🔄 RENDER - Socket status:", {
//     exists: !!socket,
//     connected: socket?.connected,
//     id: socket?.id,
//     hasEmit: typeof socket?.emit === 'function'
//   });

//   // Track rideStatus changes
//   useEffect(() => {
//     console.log("========================================");
//     console.log("🔄 RIDE STATUS CHANGED");
//     console.log("========================================");
//     console.log("📊 New rideStatus:", rideStatus);
//     console.log("⏰ Timestamp:", new Date().toISOString());
//     console.log("========================================");
//   }, [rideStatus]);

//   // ============ PASSENGER DATA FUNCTIONS ============
  
//   // Fetch passenger data function
//   const fetchPassengerData = useCallback((rideData: RideType): UserDataType => {
//     console.log("👤 Extracting passenger data from ride:", rideData.rideId);

//     const userDataWithId: UserDataType = {
//       name: rideData.userName || "Passenger",
//       mobile: rideData.userMobile || "N/A",
//       location: rideData.pickup,
//       userId: rideData.rideId,
//       rating: 4.8,
//     };

//     console.log("✅ Passenger data extracted successfully:", userDataWithId);
//     return userDataWithId;
//   }, []);

//   // Calculate initials for avatar
//   const calculateInitials = (name: string): string => {
//     return name.split(' ').map(n => n[0]).join('').toUpperCase();
//   };

//   // Call passenger function
//   const handleCallPassenger = () => {
//     const mobile = userData?.mobile || ride?.userMobile;
//     if (mobile && mobile !== "N/A") {
//       Linking.openURL(`tel:${mobile}`)
//         .catch(err => console.error('Error opening phone dialer:', err));
//     } else {
//       Alert.alert("Error", "Passenger mobile number not available");
//     }
//   };

//   // Message passenger function
//   const handleMessagePassenger = () => {
//     const mobile = userData?.mobile || ride?.userMobile;
//     if (mobile && mobile !== "N/A") {
//       Linking.openURL(`sms:${mobile}`)
//         .catch(err => console.error('Error opening message app:', err));
//     } else {
//       Alert.alert("Error", "Passenger mobile number not available");
//     }
//   };

//   // Animation functions for rider details
//   const showRiderDetails = () => {
//     setRiderDetailsVisible(true);
//     Animated.parallel([
//       Animated.timing(slideAnim, {
//         toValue: 0,
//         duration: 300,
//         useNativeDriver: true,
//       }),
//       Animated.timing(fadeAnim, {
//         toValue: 1,
//         duration: 300,
//         useNativeDriver: true,
//       })
//     ]).start();
//   };

//   const hideRiderDetails = () => {
//     Animated.parallel([
//       Animated.timing(slideAnim, {
//         toValue: 400, // Slide down completely
//         duration: 300,
//         useNativeDriver: true,
//       }),
//       Animated.timing(fadeAnim, {
//         toValue: 0,
//         duration: 300,
//         useNativeDriver: true,
//       })
//     ]).start(() => {
//       setRiderDetailsVisible(false);
//     });
//   };

//   const toggleRiderDetails = () => {
//     if (riderDetailsVisible) {
//       hideRiderDetails();
//     } else {
//       showRiderDetails();
//     }
//   };
  
//   // Haversine distance function
//   const haversine = (start: LocationType, end: LocationType) => {
//     const R = 6371; // Earth's radius in kilometers
//     const dLat = (end.latitude - start.latitude) * Math.PI / 180;
//     const dLon = (end.longitude - start.longitude) * Math.PI / 180;
//     const a =
//       Math.sin(dLat/2) * Math.sin(dLat/2) +
//       Math.cos(start.latitude * Math.PI / 180) * Math.cos(end.latitude * Math.PI / 180) *
//       Math.sin(dLon/2) * Math.sin(dLon/2);
//     const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
//     return R * c * 1000; // Distance in meters
//   };
  
//   // Save ride state to AsyncStorage for persistence
//   const saveRideState = useCallback(async () => {
//     try {
//       const rideState = {
//         ride,
//         userData,
//         rideStatus,
//         driverStatus,
//         travelledKm,
//         distanceSinceOtp: distanceSinceOtp.current,
//         lastLocationBeforeOtp: lastLocationBeforeOtp.current,
//         otpVerificationLocation,
//         fullRouteCoords,
//         visibleRouteCoords,
//         userLocation,
//         lastCoord,
//         riderDetailsVisible // Save UI state
//       };
      
//       await AsyncStorage.setItem('rideState', JSON.stringify(rideState));
//       console.log('✅ Ride state saved to AsyncStorage');
//     } catch (error) {
//       console.error('❌ Error saving ride state:', error);
//     }
//   }, [ride, userData, rideStatus, driverStatus, travelledKm, otpVerificationLocation, 
//       fullRouteCoords, visibleRouteCoords, userLocation, lastCoord, riderDetailsVisible]);

      
//       const restoreRideState = useCallback(async () => {
//   try {
//     const savedState = await AsyncStorage.getItem('rideState');
//     if (savedState) {
//       const rideState = JSON.parse(savedState);
      
//       // ✅ FIX: Check if ride was completed before refresh
//       if (rideState.rideStatus === 'completed') {
//         console.log('🔄 Found completed ride from previous session, clearing...');
//         await clearRideState();
//         return false;
//       }
      
//       // Only restore if there's an active ride
//       if (rideState.ride && (rideState.rideStatus === 'accepted' || rideState.rideStatus === 'started')) {
//         console.log('🔄 Restoring ride state from AsyncStorage');
        
//         setRide(rideState.ride);
//         setUserData(rideState.userData);
//         setRideStatus(rideState.rideStatus);
//         setDriverStatus(rideState.driverStatus);
//         setTravelledKm(rideState.travelledKm || 0);
//         distanceSinceOtp.current = rideState.distanceSinceOtp || 0;
//         lastLocationBeforeOtp.current = rideState.lastLocationBeforeOtp;
//         setOtpVerificationLocation(rideState.otpVerificationLocation);
//         setFullRouteCoords(rideState.fullRouteCoords || []);
//         setVisibleRouteCoords(rideState.visibleRouteCoords || []);
//         setUserLocation(rideState.userLocation);
//         setLastCoord(rideState.lastCoord);
        
//         // Restore UI state - DEFAULT TO MAXIMIZED
//         const shouldShowMaximized = rideState.riderDetailsVisible !== false;
//         setRiderDetailsVisible(shouldShowMaximized);
        
//         if (shouldShowMaximized) {
//           slideAnim.setValue(0);
//           fadeAnim.setValue(1);
//         } else {
//           slideAnim.setValue(400);
//           fadeAnim.setValue(0);
//         }
        
//         console.log('✅ Ride state restored successfully');
//         return true;
//       }
//     }
//     return false;
//   } catch (error) {
//     console.error('❌ Error restoring ride state:', error);
//     return false;
//   }
// }, []);


  
//   // Clear ride state from AsyncStorage
//   const clearRideState = useCallback(async () => {
//     try {
//       await AsyncStorage.removeItem('rideState');
//       console.log('✅ Ride state cleared from AsyncStorage');
//     } catch (error) {
//       console.error('❌ Error clearing ride state:', error);
//     }
//   }, []);
  
//   // Cleanup on unmount
//   useEffect(() => {
//     return () => {
//       isMounted.current = false;
//       if (navigationInterval.current) {
//         clearInterval(navigationInterval.current);
//       }
//       if (routeUpdateThrottle.current) {
//         clearTimeout(routeUpdateThrottle.current);
//       }
//       if (geolocationWatchId.current) {
//         Geolocation.clearWatch(geolocationWatchId.current);
//       }
//       if (backgroundLocationInterval.current) {
//         clearInterval(backgroundLocationInterval.current);
//       }
//       if (rideTakenAlertTimeout.current) {
//         clearTimeout(rideTakenAlertTimeout.current);
//       }
//       // Clean up notification listeners
//       NotificationService.off('rideRequest', handleNotificationRideRequest);
//       NotificationService.off('tokenRefresh', () => {});
//       NotificationService.off('workingHoursWarning', handleWorkingHoursWarning);
//       NotificationService.off('autoStop', handleAutoStop);
//       NotificationService.off('continueWorking', handlePurchaseExtendedHours);
//       NotificationService.off('skipWarning', handleSkipWarning);
//     };
//   }, []);
  
//   // Load driver profile data
//   useEffect(() => {
//     const loadDriverProfile = async () => {
//       try {
//         const [name, phone, vehicleNumber, vehicleType] = await AsyncStorage.multiGet([
//           'driverName',
//           'phoneNumber',
//           'vehicleNumber',
//           'vehicleType'
//         ]);

//         setDriverProfile({
//           name: name[1] || driverName,
//           phone: phone[1] || '',
//           vehicleNumber: vehicleNumber[1] || '',
//           vehicleType: vehicleType[1] || 'taxi',
//           rating: 4.5 // Default rating, can be fetched from backend
//         });
//       } catch (error) {
//         console.error('Error loading driver profile:', error);
//       }
//     };

//     loadDriverProfile();
//   }, [driverName]);

//   // Profile Handler
//   const handleOpenProfile = () => {
//     setProfileModalVisible(true);
//   };

//   // App state management
//   useEffect(() => {
//     const handleAppStateChange = (nextAppState: string) => {
//       console.log('📱 App state changed:', nextAppState);
      
//       if (nextAppState === 'background') {
//         setIsAppActive(false);
//         // Save state when app goes to background
//         if (ride && (rideStatus === "accepted" || rideStatus === "started")) {
//           saveRideState();
//         }
//       } else if (nextAppState === 'active') {
//         setIsAppActive(true);
//         // When app comes to foreground, try to restore state if needed
//         if (!ride) {
//           restoreRideState();
//         }
//       }
//     };

//     const subscription = AppState.addEventListener('change', handleAppStateChange);
    
//     return () => {
//       subscription.remove();
//     };
//   }, [ride, rideStatus, saveRideState, restoreRideState]);
  
//   // ✅ SMOOTH ANIMATED Background location tracking
//   const startBackgroundLocationTracking = useCallback(() => {
//     console.log("🔄 Starting background location tracking with SMOOTH ANIMATIONS");

//     // Stop any existing tracking
//     if (geolocationWatchId.current) {
//       Geolocation.clearWatch(geolocationWatchId.current);
//     }

//     // Start high-frequency tracking when online
//     geolocationWatchId.current = Geolocation.watchPosition(
//       (position) => {
//         if (!isMounted.current || !isDriverOnline) return;

//         const newLocation = {
//           latitude: position.coords.latitude,
//           longitude: position.coords.longitude,
//         };

//         const speed = position.coords.speed || 0; // meters per second
//         const heading = position.coords.heading || 0; // degrees (0-360)

//         console.log("📍 Location update:", newLocation, `Speed: ${speed.toFixed(1)}m/s`, `Heading: ${heading.toFixed(1)}°`);

//         // ✅ SMOOTH ANIMATION: Only update if location changed significantly
//         if (previousLocation && AnimatedMapUtils.isSignificantLocationChange(previousLocation, newLocation, 5)) {

//           // Calculate bearing from movement
//           const calculatedBearing = AnimatedMapUtils.calculateBearing(previousLocation, newLocation);
//           const finalBearing = heading > 0 ? heading : calculatedBearing;

//           // ✅ SMOOTH MARKER POSITION ANIMATION
//           AnimatedMapUtils.animateMarkerToCoordinate(
//             animatedLatitude,
//             animatedLongitude,
//             previousLocation,
//             newLocation,
//             speed
//           );

//           // ✅ SMOOTH MARKER ROTATION ANIMATION
//           AnimatedMapUtils.animateMarkerRotation(
//             animatedBearing,
//             driverBearing,
//             finalBearing,
//             500
//           );

//           setDriverBearing(finalBearing);

//           // ✅ SMOOTH CAMERA TRACKING: Follow driver with bearing
//           if (mapRef.current && (rideStatus === "accepted" || rideStatus === "started")) {
//             AnimatedMapUtils.animateCameraToRegion(
//               mapRef,
//               newLocation,
//               finalBearing,
//               800
//             );
//           }

//           // ✅ DYNAMIC POLYLINE: Update travelled vs remaining route
//           if (rideStatus === "started" && fullRouteCoords.length > 0) {
//             const progressiveRoute = AnimatedMapUtils.getProgressiveRoute(newLocation, fullRouteCoords);

//             // Smooth transition
//             AnimatedMapUtils.animatePolylineUpdate(polylineOpacity, () => {
//               setTravelledRoute(progressiveRoute.travelled);
//               setVisibleRouteCoords(progressiveRoute.remaining);
//             });

//             console.log(`🛣️ Route progress: ${progressiveRoute.progress.toFixed(1)}%`);
//           }
//         }

//         setLocation(newLocation);
//         setPreviousLocation(newLocation);
//         setCurrentSpeed(speed);

//         // Update distance if ride is active
//         if (lastCoord && (rideStatus === "accepted" || rideStatus === "started")) {
//           const dist = AnimatedMapUtils.haversineDistance(lastCoord, newLocation);
//           const distanceKm = dist / 1000;
//           setTravelledKm((prev) => prev + distanceKm);

//           if (rideStatus === "started" && lastLocationBeforeOtp.current) {
//             distanceSinceOtp.current += distanceKm;
//           }
//         }

//         setLastCoord(newLocation);
//         lastLocationUpdate.current = newLocation;

//         // Send to server and socket with bearing
//         saveLocationToDatabase(newLocation);

//         // ✅ Send bearing to socket for real-time tracking
//         if (socket?.connected) {
//           socket.emit("driverLocationUpdate", {
//             driverId,
//             latitude: newLocation.latitude,
//             longitude: newLocation.longitude,
//             bearing: driverBearing,
//             speed,
//             timestamp: new Date().toISOString(),
//           });
//         }
//       },
//       (error) => {
//         console.error("❌ Geolocation error:", error);
//       },
//       {
//         enableHighAccuracy: true,
//         distanceFilter: 3, // ✅ 3 meters for smoother updates
//         interval: 1000, // ✅ 1 second for professional smoothness
//         fastestInterval: 500, // ✅ 500ms fastest update
//       }
//     );

//     setBackgroundTrackingActive(true);
//   }, [isDriverOnline, lastCoord, rideStatus, previousLocation, driverBearing, fullRouteCoords, driverId, socket, animatedLatitude, animatedLongitude, animatedBearing, polylineOpacity, saveLocationToDatabase]);
  
//   // Stop background location tracking
//   const stopBackgroundLocationTracking = useCallback(() => {
//     console.log("🛑 Stopping background location tracking");
   
//     if (geolocationWatchId.current) {
//       Geolocation.clearWatch(geolocationWatchId.current);
//       geolocationWatchId.current = null;
//     }
   
//     if (backgroundLocationInterval.current) {
//       clearInterval(backgroundLocationInterval.current);
//       backgroundLocationInterval.current = null;
//     }
   
//     setBackgroundTrackingActive(false);
//   }, []);

//   // ✅ Initialize animated values when location first becomes available
//   useEffect(() => {
//     if (location) {
//       console.log("🎯 Initializing animated marker at:", location);
//       animatedLatitude.setValue(location.latitude);
//       animatedLongitude.setValue(location.longitude);

//       // Set previous location for smooth transitions
//       if (!previousLocation) {
//         setPreviousLocation(location);
//       }
//     }
//   }, [location?.latitude, location?.longitude]);

//   // FCM: Initialize notification system
//    // FCM: Initialize notification system
//   useEffect(() => {
//     const initializeNotificationSystem = async () => {
//       try {
//         console.log('🔔 Setting up complete notification system...');
       
//         // Initialize the notification service
//         const initialized = await NotificationService.initializeNotifications();
       
//         if (initialized) {
//           console.log('✅ Notification system initialized successfully');
         
//           // Get FCM token and send to server
//           const token = await NotificationService.getFCMToken();
//           if (token && driverId) {
//             await sendFCMTokenToServer(token);
//           }
         
//           // Listen for ride requests
//           NotificationService.on('rideRequest', handleNotificationRideRequest);
         
//           // Listen for token refresh
//           NotificationService.on('tokenRefresh', async (newToken) => {
//             console.log('🔄 FCM token refreshed, updating server...');
//             if (driverId) {
//               await sendFCMTokenToServer(newToken);
//             }
//           });

//           // ✅ Listen for working hours events
//           NotificationService.on('workingHoursWarning', handleWorkingHoursWarning);
//           NotificationService.on('autoStop', handleAutoStop);
//           NotificationService.on('continueWorking', handlePurchaseExtendedHours);
//           NotificationService.on('skipWarning', handleSkipWarning);
         
//           setHasNotificationPermission(true);
//         } else {
//           console.log('❌ Notification system initialization failed');
//           setHasNotificationPermission(false);
//         }
//       } catch (error) {
//         console.error('❌ Error in notification system initialization:', error);
//         // Don't block app if notifications fail
//         setHasNotificationPermission(false);
//       }
//     };
    
//     // Initialize when driver goes online
//     if ((driverStatus === 'online' || driverStatus === 'onRide') && !hasNotificationPermission) {
//       initializeNotificationSystem();
//     }
    
//     return () => {
//       // Cleanup
//       NotificationService.off('rideRequest', handleNotificationRideRequest);
//       NotificationService.off('workingHoursWarning', handleWorkingHoursWarning);
//       NotificationService.off('autoStop', handleAutoStop);
//       NotificationService.off('continueWorking', handlePurchaseExtendedHours);
//       NotificationService.off('skipWarning', handleSkipWarning);
//     };
//   }, [driverStatus, driverId, hasNotificationPermission]);
  



  
//   const sendFCMTokenToServer = async (token: string): Promise<boolean> => {
//   try {
//     console.log('📤 Sending FCM token to server for driver:', driverId);
    
//     // ✅ Use the correct endpoint that matches your server
//     const response = await fetch(`${API_BASE}/drivers/update-fcm-token`, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify({
//         driverId: driverId,
//         fcmToken: token,
//         platform: Platform.OS
//       }),
//     });
    
//     console.log('📡 FCM token update response:', response.status);
    
//     if (response.ok) {
//       const result = await response.json();
//       console.log('✅ FCM token updated on server:', result);
//       return true;
//     } else {
//       console.error('❌ FCM endpoint failed:', response.status);
      
//       // Try alternative endpoint
//       try {
//         const altResponse = await fetch(`${API_BASE}/drivers/simple-fcm-update`, {
//           method: 'POST',
//           headers: { 'Content-Type': 'application/json' },
//           body: JSON.stringify({ driverId, fcmToken: token })
//         });
        
//         if (altResponse.ok) {
//           console.log('✅ FCM token updated via alternative endpoint');
//           return true;
//         }
//       } catch (altError) {
//         console.error('❌ Alternative FCM endpoint also failed:', altError);
//       }
      
//       // Store locally as fallback
//       await AsyncStorage.setItem('fcmToken', token);
//       console.log('💾 FCM token stored locally as fallback');
//       return false;
//     }
    
//   } catch (error: any) {
//     console.error('❌ Network error sending FCM token:', error);
//     await AsyncStorage.setItem('fcmToken', token);
//     return false;
//   }
// };


  

// const handleNotificationRideRequest = useCallback(async (data: any) => {
//   if (!isMounted.current || !data?.rideId || !isDriverOnline) return;

//   console.log('🔔 Processing notification ride request:', data.rideId);

//   // ✅ FIX: Normalize both types to LOWERCASE for comparison (STRICT RULE)
//   const storedType = await AsyncStorage.getItem("vehicleType");
//   const myDriverType = (storedType || "taxi").trim().toLowerCase(); // ✅ ALWAYS LOWERCASE
//   const requestVehicleType = (data.vehicleType || "").trim().toLowerCase(); // ✅ ALWAYS LOWERCASE

//   console.log(`🔍 Type Check (FCM): Me=[${myDriverType}] vs Ride=[${requestVehicleType}]`);

//   // ✅ STRICT: Only process if vehicle types match exactly
//   if (requestVehicleType && myDriverType && myDriverType !== requestVehicleType) {
//       console.log(`🚫 Ignoring notification: Driver is ${myDriverType}, ride requires ${requestVehicleType}`);
//       return;
//   }
//   // Use the same logic as the socket ride request handler
//   try {
//     let pickupLocation, dropLocation;
    
//     try {
//       if (typeof data.pickup === 'string') {
//         pickupLocation = JSON.parse(data.pickup);
//       } else {
//         pickupLocation = data.pickup;
//       }
      
//       if (typeof data.drop === 'string') {
//         dropLocation = JSON.parse(data.drop);
//       } else {
//         dropLocation = data.drop;
//       }
//     } catch (error) {
//       console.error('Error parsing notification location data:', error);
//       return;
//     }
    
//     const rideData: RideType = {
//       rideId: data.rideId,
//       RAID_ID: data.RAID_ID || "N/A",
//       otp: data.otp || "0000",
//       pickup: {
//         latitude: pickupLocation?.lat || pickupLocation?.latitude || 0,
//         longitude: pickupLocation?.lng || pickupLocation?.longitude || 0,
//         address: pickupLocation?.address || "Unknown location",
//       },
//       drop: {
//         latitude: dropLocation?.lat || dropLocation?.latitude || 0,
//         longitude: dropLocation?.lng || dropLocation?.longitude || 0,
//         address: dropLocation?.address || "Unknown location",
//       },
//       fare: parseFloat(data.fare) || 0,
//       distance: data.distance || "0 km",
//       vehicleType: data.vehicleType,
//       userName: data.userName || "Customer",
//       userMobile: data.userMobile || "N/A",
//     };
    
//     setRide(rideData);
//     setRideStatus("onTheWay");
    
//     Alert.alert(
//       "🚖 New Ride Request!",
//       `📍 Pickup: ${rideData.pickup.address}\n🎯 Drop: ${rideData.drop.address}\n💰 Fare: ₹${rideData.fare}\n📏 Distance: ${rideData.distance}\n👤 Customer: ${rideData.userName}`,
//       [
//         {
//           text: "❌ Reject",
//           onPress: () => rejectRide(rideData.rideId),
//           style: "destructive",
//         },
//         {
//           text: "✅ Accept",
//           onPress: () => acceptRide(rideData.rideId),
//         },
//       ],
//       { cancelable: false }
//     );
//   } catch (error) {
//     console.error("❌ Error processing notification ride request:", error);
//     Alert.alert("Error", "Could not process ride request. Please try again.");
//   }
// }, [isDriverOnline]);


// // ========================================
// // WORKING HOURS API FUNCTIONS
// // ========================================

// /**
//  * Format seconds to HH:MM:SS
//  */
// const formatTime = (seconds: number): string => {
//   const hours = Math.floor(seconds / 3600);
//   const minutes = Math.floor((seconds % 3600) / 60);
//   const secs = seconds % 60;
//   return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
// };

// const fetchTimerStatus = useCallback(async () => {
//   if (!driverId) return;
//   try {
//     const response = await fetch(`${API_BASE}/drivers/working-hours/status/${driverId}`);
//     const result = await response.json();

//     if (result.success) {
//       setWorkingHoursTimer({
//         active: result.timerActive || false,
//         remainingSeconds: result.remainingSeconds || 0,
//         formattedTime: result.formattedTime || '00:00:00',
//         warningsIssued: result.warningsIssued || 0,
//         walletDeducted: result.walletDeducted || false,
//         totalHours: Math.floor((result.remainingSeconds || 0) / 3600),
//       });
//       console.log(`⏱️ Timer Update: ${result.formattedTime} | Warnings: ${result.warningsIssued}`);
//     }
//   } catch (error) {
//     console.error('❌ Error fetching timer status:', error);
//   }
// }, [driverId]);

// const startWorkingHoursTimer = useCallback(async () => {
//   if (!driverId) return false;
//   try {
//     console.log('⏱️ Starting working hours timer for driver:', driverId);
//     const response = await fetch(`${API_BASE}/drivers/working-hours/start`, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ driverId })
//     });
//     const text = await response.text();
//     let result;
//     try {
//       result = JSON.parse(text);
//     } catch (e) {
//       console.error('❌ Failed to parse start timer response:', text.substring(0, 100));
//       return false;
//     }

//     if (result.success) {
//       console.log('✅ Working hours timer started:', result);

//       // ✅ FIX: Update state immediately to start the local timer
//       setWorkingHoursTimer({
//         active: true,
//         remainingSeconds: result.remainingSeconds || 43200, // Default 12h
//         formattedTime: formatTime(result.remainingSeconds || 43200),
//         warningsIssued: 0,
//         walletDeducted: true,
//         totalHours: 12,
//       });

//       // ✅ FIX: Update wallet balance (check if backend returns it)
//       if (result.walletBalance !== undefined) {
//         console.log(`💰 Wallet Debited. New Balance: ₹${result.walletBalance}`);
//         updateLocalWalletBalance(result.walletBalance);
//       } else {
//         // Backend didn't return wallet balance, fetch it separately
//         console.log('⚠️ Backend did not return walletBalance, fetching separately...');
//         fetchAndUpdateWalletBalance();
//       }

//       return true;
//     } else {
//       console.warn('⚠️ Timer start failed:', result.message);
//       // ✅ Don't show alert here - let toggleOnlineStatus handle it
//       // Alert.alert('Could not go online', result.message);
//       return false;
//     }
//   } catch (error: any) {
//     console.error('❌ Failed to start working hours timer:', error);
//     console.error('❌ Error details:', {
//       message: error?.message,
//       code: error?.code,
//       name: error?.name,
//     });
//     // ✅ Don't show alert here - let toggleOnlineStatus handle it
//     // Alert.alert('Error', 'Could not contact server to go online.');
//     return false;
//   }
// }, [driverId, fetchTimerStatus]);

// // Helper to update wallet in AsyncStorage so MenuScreen shows correct amount
// const updateLocalWalletBalance = async (newBalance: number) => {
//   try {
//     const driverInfoStr = await AsyncStorage.getItem('driverInfo');
//     if (driverInfoStr) {
//       const info = JSON.parse(driverInfoStr);
//       info.wallet = newBalance;
//       await AsyncStorage.setItem('driverInfo', JSON.stringify(info));
//       console.log(`✅ Local wallet updated to: ₹${newBalance}`);
//     }
//   } catch (e) {
//     console.error("Failed to update local wallet:", e);
//   }
// };

// // Fetch wallet balance from backend and update locally
// const fetchAndUpdateWalletBalance = async () => {
//   if (!driverId) return;
//   try {
//     const response = await fetch(`${API_BASE}/drivers/${driverId}/wallet`);
//     const result = await response.json();

//     if (result.success && result.walletBalance !== undefined) {
//       console.log(`💰 Fetched wallet balance: ₹${result.walletBalance}`);
//       updateLocalWalletBalance(result.walletBalance);
//     } else {
//       console.warn('⚠️ Could not fetch wallet balance');
//     }
//   } catch (error) {
//     console.error('❌ Error fetching wallet balance:', error);
//   }
// };

// const stopWorkingHoursTimer = useCallback(async () => {
//   if (!driverId) return false;
//   try {
//     console.log('🛑 Stopping working hours timer for driver:', driverId);
//     const response = await fetch(`${API_BASE}/drivers/working-hours/stop`, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ driverId })
//     });
//     const result = await response.json();
//     if (result.success) {
//       console.log('✅ Working hours timer stopped on server');
//       setWorkingHoursTimer(prev => ({ ...prev, active: false }));
//       return true;
//     }
//     return false;
//   } catch (error) {
//     console.error('❌ Failed to stop working hours timer:', error);
//     return false;
//   }
// }, [driverId]);

// // ========================================
// // ✅ NEW: CLIENT-SIDE TIMER INTERVAL
// // ========================================
// useEffect(() => {
//   let interval: NodeJS.Timeout;

//   // Run only if driver is online AND timer is active AND time remains
//   if (isDriverOnline && workingHoursTimer.active && workingHoursTimer.remainingSeconds > 0) {
    
//     interval = setInterval(() => {
//       setWorkingHoursTimer((prev) => {
//         const newSeconds = Math.max(0, prev.remainingSeconds - 1);
//         const newTime = formatTime(newSeconds);
        
//         // 🖨️ CONSOLE LOG PER SECOND (As requested)
//         console.log(`⏳ Working Hours: ${newTime} (${newSeconds}s remaining)`);

//         // 🛑 AUTO STOP CHECK
//         if (newSeconds === 0) {
//           clearInterval(interval);
//           console.log("🛑 Timer reached 0, triggering auto-stop...");
//           handleAutoStop({ message: "Working hours completed." });
//           return { ...prev, remainingSeconds: 0, formattedTime: "00:00:00", active: false };
//         }

//         return {
//           ...prev,
//           remainingSeconds: newSeconds,
//           formattedTime: newTime
//         };
//       });
//     }, 1000);
//   }

//   return () => {
//     if (interval) clearInterval(interval);
//   };
// }, [isDriverOnline, workingHoursTimer.active]);

// const handlePurchaseExtendedHours = useCallback(async () => {
//   setShowWorkingHoursWarning(false);
//   try {
//     const response = await fetch(`${API_BASE}/drivers/working-hours/extend`, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ driverId, additionalHours: 12 })
//     });
//     const result = await response.json();
//     if (result.success) {
//       Alert.alert('✅ Success', `₹100 deducted. 12 hours added.\nNew balance: ₹${result.newWalletBalance}`);
//       if (result.newWalletBalance) updateLocalWalletBalance(result.newWalletBalance);
//       fetchTimerStatus();
//     } else {
//       Alert.alert('❌ Failed', result.message || 'Could not purchase extended hours');
//     }
//   } catch (error) {
//     console.error('❌ Error purchasing extended hours:', error);
//     Alert.alert('Error', 'Failed to purchase extended hours');
//   }
// }, [driverId, fetchTimerStatus]);

// const handleSkipWarning = useCallback(async () => {
//   setShowWorkingHoursWarning(false);
// }, []);

// const handleWorkingHoursWarning = useCallback((data: any) => {
//   console.log('⚠️ Working hours warning received:', data);
//   setCurrentWarning({
//     number: parseInt(data.warningNumber || '1'),
//     message: data.message || '',
//     remainingTime: formatTime(parseInt(data.remainingSeconds || '0')),
//   });
//   setShowWorkingHoursWarning(true);
// }, []);

// const goOfflineNormally = useCallback(async () => {
//   onlineStatusChanging.current = true;
//   console.log('🔴 Going OFFLINE...');
//   await stopWorkingHoursTimer();
//   setIsDriverOnline(false);
//   setDriverStatus("offline");
//   stopBackgroundLocationTracking();
//   if (socket && socket.connected) {
//     socket.emit("driverOffline", { driverId });
//   }

//   // ✅ FIX: Update online status in driverInfo object
//   const driverInfoStr = await AsyncStorage.getItem("driverInfo");
//   if (driverInfoStr) {
//     try {
//       const driverInfoObj = JSON.parse(driverInfoStr);
//       driverInfoObj.onlineStatus = "offline";
//       await AsyncStorage.setItem("driverInfo", JSON.stringify(driverInfoObj));
//       console.log('📊 Updated driverInfo with offline status');
//     } catch (e) {
//       console.error("⚠️ Error updating driverInfo:", e);
//     }
//   }

//   console.log('🔴 Driver is now OFFLINE');
//   onlineStatusChanging.current = false;
// }, [driverId, socket, stopBackgroundLocationTracking, stopWorkingHoursTimer]);

// const handleAutoStop = useCallback((data: any) => {
//   console.log('🛑 Auto-stop received:', data);
//   Alert.alert(
//     '🛑 Working Hours Expired',
//     'Your working hours have ended. You have been automatically set to OFFLINE.',
//     [{ text: 'OK' }]
//   );
//   goOfflineNormally();
// }, [goOfflineNormally]);

// const handleManualOfflineRequest = useCallback(async () => {
//   if (onlineStatusChanging.current) return;

//   console.log('🔍 DEBUG - Timer State:', workingHoursTimer);
//   console.log('🔍 DEBUG - walletDeducted:', workingHoursTimer.walletDeducted);
//   console.log('🔍 DEBUG - timer active:', workingHoursTimer.active);

//   // Check if timer is active (which means ₹100 was deducted)
//   if (workingHoursTimer.active || workingHoursTimer.walletDeducted) {
//     // Show professional two-step modal (warning first, then verification)
//     console.log("Driver requested offline, showing professional warning modal.");
//     setOfflineStep('warning'); // Start with warning step
//     setShowOfflineConfirmation(true);
//   } else {
//     // Normal offline
//     await goOfflineNormally();
//   }
// }, [workingHoursTimer, goOfflineNormally]);

// const confirmOfflineWithVerification = useCallback(async () => {
//   const last4Digits = driverId.slice(-4);

//   if (driverIdConfirmation !== last4Digits) {
//     Alert.alert('❌ Incorrect', 'Driver ID verification failed. Please enter the last 4 digits correctly.');
//     return;
//   }

//   // Close modal and reset state
//   setShowOfflineConfirmation(false);
//   setDriverIdConfirmation('');
//   setOfflineStep('warning'); // Reset to warning step for next time

//   // Go offline
//   await goOfflineNormally();
// }, [driverId, driverIdConfirmation, goOfflineNormally]);

// const toggleOnlineStatus = useCallback(async () => {
//   if (isDriverOnline) {
//     await handleManualOfflineRequest();
//   } else {
//     if (!location) {
//       Alert.alert("Location Required", "Please enable location services to go online.");
//       return;
//     }

//     // ✅ FIX: Check if working hours timer is already active (prevent duplicate debit)
//     if (workingHoursTimer.active && workingHoursTimer.walletDeducted) {
//       console.log("⚠️ Working hours timer already active, just restoring ONLINE state");
//       setIsDriverOnline(true);
//       setDriverStatus("online");
//       startBackgroundLocationTracking();
//       if (socket && !socket.connected) {
//         socket.connect();
//       }

//       // Update online status in driverInfo
//       const driverInfoStr = await AsyncStorage.getItem("driverInfo");
//       if (driverInfoStr) {
//         try {
//           const driverInfoObj = JSON.parse(driverInfoStr);
//           driverInfoObj.onlineStatus = "online";
//           await AsyncStorage.setItem("driverInfo", JSON.stringify(driverInfoObj));
//         } catch (e) {
//           console.error("⚠️ Error updating driverInfo:", e);
//         }
//       }

//       console.log("🟢 Driver is now online (timer already running)");
//       return;
//     }

//     // ✅ CRITICAL FIX: Try to start timer, but allow going online even if it fails
//     // This prevents drivers from being stuck offline on some devices
//     const timerStarted = await startWorkingHoursTimer();

//     if (!timerStarted) {
//       console.warn("⚠️ Working hours timer failed to start, but allowing driver to go ONLINE anyway");
//       // Show a warning but don't block going online
//       Alert.alert(
//         "Notice",
//         "Could not connect to timer service, but you can still go ONLINE. Some features may be limited.",
//         [{ text: "Continue Online", style: "default" }]
//       );
//     }

//     // ✅ Go ONLINE regardless of timer status (failsafe)
//     setIsDriverOnline(true);
//     setDriverStatus("online");
//     startBackgroundLocationTracking();
//     if (socket && !socket.connected) {
//       socket.connect();
//     }

//     // ✅ FIX: Update online status in driverInfo object
//     const driverInfoStr = await AsyncStorage.getItem("driverInfo");
//     if (driverInfoStr) {
//       try {
//         const driverInfoObj = JSON.parse(driverInfoStr);
//         driverInfoObj.onlineStatus = "online";
//         await AsyncStorage.setItem("driverInfo", JSON.stringify(driverInfoObj));
//         console.log('📊 Updated driverInfo with online status');
//       } catch (e) {
//         console.error("⚠️ Error updating driverInfo:", e);
//       }
//     }

//     console.log(`🟢 Driver is now online (timer: ${timerStarted ? 'active' : 'failed'})`);
//   }
// }, [isDriverOnline, location, workingHoursTimer, startWorkingHoursTimer, handleManualOfflineRequest, startBackgroundLocationTracking, socket]);





//   // Load driver info and verify token on mount
//   useEffect(() => {

    

//     // In Screen1.tsx - Complete updated function
// const loadDriverInfo = async () => {
//   try {
//     console.log("🔍 Loading driver info from AsyncStorage...");
//     const storedDriverId = await AsyncStorage.getItem("driverId");
//     const storedDriverName = await AsyncStorage.getItem("driverName");
//     const storedVehicleType = await AsyncStorage.getItem("vehicleType"); // ✅ CRITICAL FIX: Match LoginScreen key
//     const token = await AsyncStorage.getItem("authToken");

//     // ✅ FIX: Get online status from driverInfo object (from backend)
//     const driverInfoStr = await AsyncStorage.getItem("driverInfo");
//     let savedOnlineStatus: string | null = null;
//     if (driverInfoStr) {
//       try {
//         const driverInfoObj = JSON.parse(driverInfoStr);
//         savedOnlineStatus = driverInfoObj.onlineStatus || null;
//         console.log(`📊 Driver online status from backend: ${savedOnlineStatus}`);
//       } catch (e) {
//         console.error("⚠️ Error parsing driverInfo:", e);
//       }
//     }

//     if (storedDriverId && storedDriverName && token) {
//       setDriverId(storedDriverId);
//       setDriverName(storedDriverName);
//       console.log("✅ Token found, skipping verification");

//       // ✅ FIX: Store vehicle type in LOWERCASE ONLY (CRITICAL - STRICT RULE)
//       if (storedVehicleType) {
//         console.log(`🚗 Driver vehicle type: ${storedVehicleType}`);
//         const normalizedType = storedVehicleType.toLowerCase(); // ✅ ALWAYS LOWERCASE
//         console.log(`🚗 Driver vehicle type loaded: ${normalizedType}`);
//         await AsyncStorage.setItem("vehicleType", normalizedType); // ✅ CRITICAL: Match LoginScreen key

//       } else {
//         // Default to 'taxi' if not set (already lowercase)
//         console.log("⚠️ No vehicle type found, defaulting to 'taxi'");
//         await AsyncStorage.setItem("vehicleType", "taxi"); // ✅ CRITICAL: Match LoginScreen key
//       }

//       // ✅ FIX: Fetch REAL online status and timer from backend
//       try {
//         console.log("🔄 Fetching current driver status from backend...");
//         const statusResponse = await fetch(`${API_BASE}/drivers/${storedDriverId}/status`, {
//           method: 'GET',
//           headers: {
//             'Content-Type': 'application/json',
//             'Authorization': `Bearer ${token}`
//           }
//         });

//         if (statusResponse.ok) {
//           const statusData = await statusResponse.json();
//           console.log("✅ Backend status received:", statusData);

//           if (statusData.success) {
//             const { isOnline, workingHours, walletBalance } = statusData;

//             // Update wallet balance in UI
//             if (walletBalance !== undefined) {
//               await updateLocalWalletBalance(walletBalance);
//             }

//             // Restore online/offline state
//             if (isOnline) {
//               console.log("🟢 Driver is ONLINE - restoring state");
//               setIsDriverOnline(true);
//               setDriverStatus("online");
//               startBackgroundLocationTracking();

//               // Restore working hours timer if active
//               if (workingHours && workingHours.active && workingHours.remainingSeconds > 0) {
//                 console.log(`⏱️ Restoring timer: ${workingHours.remainingSeconds}s remaining`);
//                 setWorkingHoursTimer({
//                   active: true,
//                   remainingSeconds: workingHours.remainingSeconds,
//                   formattedTime: formatTime(workingHours.remainingSeconds),
//                   warningsIssued: 0,
//                   walletDeducted: true, // Already debited
//                   totalHours: workingHours.totalHours || 12,
//                 });
//               }
//             } else {
//               console.log("🔴 Driver is OFFLINE");
//               setIsDriverOnline(false);
//               setDriverStatus("offline");
//             }
//           }
//         } else {
//           // Backend endpoint not available, fallback to local storage
//           console.log("⚠️ Backend status endpoint not available, using local data");
//           if (savedOnlineStatus === "online") {
//             console.log("🟢 Restoring ONLINE status from local data");
//             setIsDriverOnline(true);
//             setDriverStatus("online");
//             startBackgroundLocationTracking();
//           } else {
//             console.log("🔴 Driver was OFFLINE (local data)");
//           }
//         }
//       } catch (error) {
//         console.error("❌ Error fetching driver status:", error);
//         // Fallback to local storage
//         if (savedOnlineStatus === "online") {
//           console.log("🟢 Restoring ONLINE status from local data (fallback)");
//           setIsDriverOnline(true);
//           setDriverStatus("online");
//           startBackgroundLocationTracking();
//         }
//       }
      
//       // Try to restore ride state if there was an active ride
//       const rideRestored = await restoreRideState();
//       if (rideRestored) {
//         console.log("✅ Active ride restored from previous session");
//       }
    
//       if (!location) {
//         try {
//           const pos = await new Promise<Geolocation.GeoPosition>((resolve, reject) => {
//             Geolocation.getCurrentPosition(resolve, reject, {
//               enableHighAccuracy: true,
//               timeout: 15000,
//               maximumAge: 0
//             });
//           });
        
//           setLocation({
//             latitude: pos.coords.latitude,
//             longitude: pos.coords.longitude,
//           });
//           setLastCoord({
//             latitude: pos.coords.latitude,
//             longitude: pos.coords.longitude,
//           });
//         } catch (locationError) {
//           console.error("❌ Error getting location:", locationError);
//         }
//       }
//     } else {
//       console.log("❌ No driver info or token found, navigating to LoginScreen");
//       await AsyncStorage.clear();
//       navigation.replace("LoginScreen");
//     }
//   } catch (error) {
//     console.error("❌ Error loading driver info:", error);
//     await AsyncStorage.clear();
//     navigation.replace("LoginScreen");
//   }
// };



//     if (!driverId || !driverName) {
//       loadDriverInfo();
//     }
//   }, [driverId, driverName, navigation, restoreRideState]);
  
//   // Request user location when ride is accepted
//   useEffect(() => {
//     if (rideStatus === "accepted" && ride?.rideId && socket) {
//       console.log("📍 Requesting initial user location for accepted ride");
//       socket.emit("getUserDataForDriver", { rideId: ride.rideId });
      
//       const intervalId = setInterval(() => {
//         if (rideStatus === "accepted" || rideStatus === "started") {
//           socket.emit("getUserDataForDriver", { rideId: ride.rideId });
//         }
//       }, 10000);
      
//       return () => clearInterval(intervalId);
//     }
//   }, [rideStatus, ride?.rideId]);
  
//   // Optimized location saving
//   const saveLocationToDatabase = useCallback(
//     async (location: LocationType) => {
//       try {
//         locationUpdateCount.current++;
//         if (locationUpdateCount.current % 3 !== 0) { // Send every 3rd update
//           return;
//         }
       
//         // ✅ FIX: Get actual vehicle type from AsyncStorage, never use hardcoded "taxi"
//         const storedVehicleType = await AsyncStorage.getItem("vehicleType");
//         const actualVehicleType = (storedVehicleType || "taxi").toLowerCase(); // ✅ Always lowercase

//         const payload = {
//           driverId,
//           driverName: driverName || "Unknown Driver",
//           latitude: location.latitude,
//           longitude: location.longitude,
//           vehicleType: actualVehicleType, // ✅ Use actual vehicle type
//           status: driverStatus === "onRide" ? "onRide" : isDriverOnline ? "Live" : "offline",
//           rideId: driverStatus === "onRide" ? ride?.rideId : null,
//           timestamp: new Date().toISOString(),
//         };
        
//         const response = await fetch(`${API_BASE}/driver-location/update`, {
//           method: "POST",
//           headers: {
//             "Content-Type": "application/json",
//             Authorization: `Bearer ${await AsyncStorage.getItem("authToken")}`,
//           },
//           body: JSON.stringify(payload),
//         });
       
//         if (!response.ok) {
//           const errorText = await response.text();
//           console.error("❌ Failed to save location:", errorText);
//           return;
//         }
        
//         if (socket && socket.connected && isDriverOnline) {
//           socket.emit('driverLocationUpdate', {
//             driverId,
//             latitude: location.latitude,
//             longitude: location.longitude,
//             status: driverStatus === "onRide" ? "onRide" : "Live",
//             rideId: driverStatus === "onRide" ? ride?.rideId : null,
//           });
//         }
//       } catch (error) {
//         console.error("❌ Error saving location to DB:", error);
//       }
//     },
//     [driverId, driverName, driverStatus, ride?.rideId, isDriverOnline]
//   );
  
//   // ✅ FIX: Register driver with socket using actual vehicle type
//   useEffect(() => {
//     if (!isRegistered && driverId && location && isDriverOnline && socket) {
//       console.log("📝 Registering driver with socket:", driverId);

//       // ✅ Get actual vehicle type from AsyncStorage
//       AsyncStorage.getItem("vehicleType").then((storedType) => {
//         const actualVehicleType = (storedType || "taxi").toLowerCase(); // ✅ Always lowercase

//         socket.emit("registerDriver", {
//           driverId,
//           driverName,
//           latitude: location.latitude,
//           longitude: location.longitude,
//           vehicleType: actualVehicleType, // ✅ Use actual vehicle type
//         });

//         console.log(`✅ Driver registered: ${driverId} - ${actualVehicleType}`);
//         setIsRegistered(true);
//       });
//     }
//   }, [driverId, location, isRegistered, driverName, isDriverOnline]);
  
//   // Route fetching with real-time updates
//   const fetchRoute = useCallback(
//     async (origin: LocationType, destination: LocationType) => {
//       try {
//         console.log("🗺️ Fetching route between:", {
//           origin: { lat: origin.latitude, lng: origin.longitude },
//           destination: { lat: destination.latitude, lng: destination.longitude },
//         });
       
//         const url = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson`;
//         const response = await fetch(url);
//         const data = await response.json();
       
//         if (data.routes && data.routes.length > 0) {
//           const coords = data.routes[0].geometry.coordinates.map(
//             ([lng, lat]: number[]) => ({
//               latitude: lat,
//               longitude: lng,
//             })
//           );
//           console.log("✅ Route fetched, coordinates count:", coords.length);
//           return coords;
//         }
//       } catch (error) {
//         console.error("❌ Error fetching route:", error);
//         // Return a straight line route as fallback
//         return [origin, destination];
//       }
//     },
//     []
//   );
  
//   // Find nearest point on route
//   const findNearestPointOnRoute = useCallback(
//     (currentLocation: LocationType, routeCoords: LocationType[]) => {
//       if (!routeCoords || routeCoords.length === 0) return null;
     
//       let minDistance = Infinity;
//       let nearestIndex = 0;
     
//       for (let i = 0; i < routeCoords.length; i++) {
//         const distance = haversine(currentLocation, routeCoords[i]);
//         if (distance < minDistance) {
//           minDistance = distance;
//           nearestIndex = i;
//         }
//       }
     
//       return { index: nearestIndex, distance: minDistance };
//     },
//     []
//   );
  
//   // Update visible route as driver moves (Dynamic Polyline) - FIXED FOR POST-OTP
//   const updateVisibleRoute = useCallback(() => {
//     if (!location || !fullRouteCoords.length) return;
   
//     const nearestPoint = findNearestPointOnRoute(location, fullRouteCoords);
//     if (!nearestPoint) return;
   
//     // Always update the visible route when driver moves
//     const remainingRoute = fullRouteCoords.slice(nearestPoint.index);
  
//     if (remainingRoute.length > 0) {
//       // Add current location to make the route more accurate
//       const updatedRoute = [location, ...remainingRoute];
//       setVisibleRouteCoords(updatedRoute);
//       setNearestPointIndex(nearestPoint.index);
//     }
//   }, [location, fullRouteCoords, findNearestPointOnRoute]);
  
//   // Throttled route update
//   const throttledUpdateVisibleRoute = useCallback(() => {
//     if (routeUpdateThrottle.current) {
//       clearTimeout(routeUpdateThrottle.current);
//     }
   
//     routeUpdateThrottle.current = setTimeout(() => {
//       updateVisibleRoute();
//     }, 500);
//   }, [updateVisibleRoute]);
  
//   // Automatically update route as driver moves - FIXED FOR POST-OTP
//   useEffect(() => {
//     if (rideStatus === "started" && fullRouteCoords.length > 0) {
//       throttledUpdateVisibleRoute();
//     }
//   }, [location, rideStatus, fullRouteCoords, throttledUpdateVisibleRoute]);
  
//   // Update pickup route as driver moves
//   const updatePickupRoute = useCallback(async () => {
//     if (!location || !ride || rideStatus !== "accepted") return;
    
//     console.log("🗺️ Updating pickup route as driver moves");
    
//     try {
//       const pickupRoute = await fetchRoute(location, ride.pickup);
//       if (pickupRoute && pickupRoute.length > 0) {
//         setRide((prev) => {
//           if (!prev) return null;
//           console.log("✅ Updated pickup route with", pickupRoute.length, "points");
//           return { ...prev, routeCoords: pickupRoute };
//         });
//       }
//     } catch (error) {
//       console.error("❌ Error updating pickup route:", error);
//     }
//   }, [location, ride, rideStatus, fetchRoute]);
  




//   // In Screen1.tsx - Update the handleConnect function
// const handleConnect = () => {
//   if (!isMounted.current) return;
//   setSocketConnected(true);
  
//   if (location && driverId && isDriverOnline) {
//     AsyncStorage.getItem("vehicleType").then(vehicleType => {
//       const finalVehicleType = (vehicleType || "taxi").toLowerCase(); // ✅ Always lowercase

//       // Register driver with all necessary info
//       socket.emit("registerDriver", {
//         driverId,
//         driverName,
//         latitude: location.latitude,
//         longitude: location.longitude,
//         vehicleType: finalVehicleType, // ✅ Lowercase vehicle type
//         status: driverStatus // Include current status
//       });
//       setIsRegistered(true);

//       console.log(`✅ Driver registered: ${driverId} - ${finalVehicleType} - ${driverStatus}`);

//       // Start emitting location updates
//       startLocationUpdates();
//     });
//   }
// };

// // ✅ FIX: Add function to start location updates with actual vehicle type
// const startLocationUpdates = useCallback(async () => {
//   if (!isDriverOnline || !location || !socket) return;

//   // ✅ Get actual vehicle type
//   const storedType = await AsyncStorage.getItem("vehicleType");
//   const actualVehicleType = (storedType || "taxi").toLowerCase(); // ✅ Always lowercase

//   // Emit initial location
//   socket.emit("driverLocationUpdate", {
//     driverId,
//     latitude: location.latitude,
//     longitude: location.longitude,
//     status: driverStatus,
//     vehicleType: actualVehicleType // ✅ Use actual vehicle type
//   });

//   console.log(`📍 Started location updates for driver: ${driverId} - ${actualVehicleType}`);
// }, [isDriverOnline, location, driverId, driverStatus, socket]);



//   const acceptRide = async (rideData?: RideType | string) => {
//     // ✅ CRITICAL: Prevent multiple clicks
//     if (isAcceptingRide) {
//       console.log("⚠️ Already processing ride acceptance, ignoring duplicate click");
//       return;
//     }

//     // ✅ FIX: Correctly determine the ride ID and object
//     let currentRideId: string | undefined;
//     let currentRideObj: RideType | null = null;

//     if (typeof rideData === 'string') {
//       currentRideId = rideData;
//       currentRideObj = ride;
//     } else if (rideData && typeof rideData === 'object') {
//       currentRideId = rideData.rideId;
//       currentRideObj = rideData;
//     } else {
//       currentRideId = ride?.rideId;
//       currentRideObj = ride;
//     }

//     if (!currentRideId) {
//       Alert.alert("Error", "No ride ID available. Please try again.");
//       return;
//     }

//     if (!driverId) {
//       Alert.alert("Error", "Driver not properly registered.");
//       return;
//     }

//     // ✅ FIX: Check if socket exists before setting loading state
//     if (!socket) {
//       Alert.alert("Connection Error", "Socket not initialized. Please restart the app.");
//       return;
//     }

//     if (socket && !socket.connected) {
//       Alert.alert("Connection Error", "Reconnecting to server...");
//       socket.connect();
//       socket.once("connect", () => {
//         setTimeout(() => acceptRide(currentRideId), 1000);
//       });
//       return;
//     }

//     // ✅ Set accepting state to prevent duplicate clicks
//     setIsAcceptingRide(true);
//     setIsLoading(true);
//     console.log("✅ Accepting ride:", currentRideId);

//     // 🛑 REMOVED OPTIMISTIC UPDATE: Don't change status until server confirms
//     // This prevents the "Driver already on ride" race condition

//     // ✅ Safety timeout: Reset accepting state after 10 seconds if no response
//     const acceptTimeout = setTimeout(() => {
//       if (isAcceptingRide) {
//         console.warn("⚠️ Accept ride timeout - resetting state");
//         setIsAcceptingRide(false);
//         setIsLoading(false);
//       }
//     }, 10000);

//     // ✅ Retrieve driver phone number
//     const storedPhone = await AsyncStorage.getItem('phoneNumber');
//     const finalDriverPhone = driverProfile.phone || storedPhone || '';

//     if (socket) {
//       socket.emit(
//         "acceptRide",
//         {
//           rideId: currentRideId,
//           driverId: driverId,
//           driverName: driverName,
//           driverPhone: finalDriverPhone,
//           vehicleType: currentRideObj?.vehicleType || 'taxi', // ✅ Send vehicle type for validation
//         },
//         async (response: any) => {
//           clearTimeout(acceptTimeout); // ✅ Clear timeout on response
//           setIsLoading(false);

//           if (!isMounted.current) {
//             setIsAcceptingRide(false);
//             return;
//           }

//           if (response && response.success) {
//             console.log("✅ Ride accepted successfully:", currentRideId);
//             console.log("📦 Full backend response:", JSON.stringify(response, null, 2));

//             // ✅ NOW it is safe to update state
//             setRideStatus("accepted");
//             setDriverStatus("onRide");

//             try {
//               // ✅ CRITICAL FIX: Handle multiple possible response formats from backend
//               // Try different possible locations for pickup data
//               let pickupLat, pickupLng;

//               if (response.pickup && (response.pickup.lat || response.pickup.latitude)) {
//                 // Format 1: response.pickup.lat
//                 pickupLat = response.pickup.lat || response.pickup.latitude;
//                 pickupLng = response.pickup.lng || response.pickup.longitude;
//               } else if (response.ride && response.ride.pickup && (response.ride.pickup.lat || response.ride.pickup.latitude)) {
//                 // Format 1b: response.ride.pickup (Nested in ride object)
//                 pickupLat = response.ride.pickup.lat || response.ride.pickup.latitude;
//                 pickupLng = response.ride.pickup.lng || response.ride.pickup.longitude;
//               } else if (response.pickupLocation) {
//                 // Format 2: response.pickupLocation (might be stringified JSON or object)
//                 if (typeof response.pickupLocation === 'string') {
//                   try {
//                     const parsed = JSON.parse(response.pickupLocation);
//                     pickupLat = parsed.lat || parsed.latitude;
//                     pickupLng = parsed.lng || parsed.longitude;
//                   } catch (e) {
//                     console.error("Failed to parse pickupLocation string:", e);
//                   }
//                 } else {
//                   pickupLat = response.pickupLocation.lat || response.pickupLocation.latitude;
//                   pickupLng = response.pickupLocation.lng || response.pickupLocation.longitude;
//                 }
//               } else if (response.userData && response.userData.location) {
//                  // Format 3: response.userData.location
//                  pickupLat = response.userData.location.lat || response.userData.location.latitude;
//                  pickupLng = response.userData.location.lng || response.userData.location.longitude;
//               } else if (ride && (ride as any).pickupLocation) {
//                 // Format 4: Fallback to ride state if available
//                 pickupLat = (ride as any).pickupLocation.latitude;
//                 pickupLng = (ride as any).pickupLocation.longitude;
//               } else if (ride && ride.pickup) {
//                  // Format 5: Fallback to ride.pickup
//                  pickupLat = ride.pickup.latitude;
//                  pickupLng = ride.pickup.longitude;
//               }

//               // Validate we got the coordinates
//               if (!pickupLat || !pickupLng) {
//                 console.error("❌ Could not find pickup location in response:", response);
//                 throw new Error("Invalid response: Missing pickup location data. Please check backend response format.");
//               }

//               console.log(`✅ Extracted pickup location: lat=${pickupLat}, lng=${pickupLng}`);

//               // ✅ CRITICAL FIX: Extract passenger data from response directly
//               // Don't rely on 'ride' state which may be null or stale
              
//               // Helper to get nested properties safely
//               const pName = response.userData?.name || response.ride?.userName || response.userName || response.name || currentRideObj?.userName || ride?.userName || 'Passenger';
//               const pMobile = response.userData?.mobile || response.ride?.userMobile || response.userMobile || response.mobile || currentRideObj?.userMobile || ride?.userMobile || '';
//               const pId = response.userData?.userId || response.userId || response.ride?.userId || '';
//               const pRating = response.userData?.rating || response.userRating || response.rating || 4.8;

//               const passengerData: UserDataType = {
//                 userId: pId,
//                 name: pName,
//                 mobile: pMobile,
//                 location: {
//                   latitude: pickupLat,
//                   longitude: pickupLng,
//                 },
//                 rating: pRating,
//               };

//               setUserData(passengerData);
//               console.log("✅ Passenger data set from response:", passengerData);

//               const initialUserLocation = {
//                 latitude: pickupLat,
//                 longitude: pickupLng,
//               };

//               setUserLocation(initialUserLocation);

//               // Generate dynamic route from driver to pickup (GREEN ROUTE)
//               if (location) {
//                 try {
//                   const pickupRoute = await fetchRoute(location, initialUserLocation);
//                   if (pickupRoute) {
//                     setRide((prev) => {
//                       if (!prev) return null;
//                       console.log("✅ Driver to pickup route generated with", pickupRoute.length, "points");
//                       return { ...prev, routeCoords: pickupRoute };
//                     });
//                   }
//                 } catch (error) {
//                   console.error("❌ Error generating pickup route:", error);
//                 }

//                 animateToLocation(initialUserLocation, true);
//               }

//               // DEFAULT TO MAXIMIZED VIEW - Show rider details automatically when ride is accepted
//               setRiderDetailsVisible(true);
//               slideAnim.setValue(0);
//               fadeAnim.setValue(1);

//               socket.emit("driverAcceptedRide", {
//                 rideId: currentRideId,
//                 driverId: driverId,
//                 userId: response.userId,
//                 driverLocation: location,
//               });

//               setTimeout(() => {
//                 socket.emit("getUserDataForDriver", { rideId: currentRideId });
//               }, 1000);

//               // ✅ OPTIMIZATION: Removed explicit saveRideState() here.
//               // The useEffect on [rideStatus] will handle saving automatically.
//               // This prevents double-writes to AsyncStorage which causes UI freeze.
//             } catch (err) {
//               console.error("❌ Error in acceptRide processing:", err);
//               // ✅ Show error to user and reset state
//               Alert.alert(
//                 "Error Accepting Ride",
//                 "An error occurred while processing the ride. Please try again.",
//                 [{ text: "OK" }]
//               );
//               // Reset state on error
//               setRideStatus("idle");
//               setDriverStatus("online");
//               setUserData(null);
//               setUserLocation(null);
//             } finally {
//               // ✅ Ensure we always reset the accepting state
//               setIsAcceptingRide(false);
//             }
//           } else {
//             // ✅ Handle failure case
//             console.error("❌ Failed to accept ride:", response?.message || "Unknown error");
//             Alert.alert("Failed to Accept Ride", response?.message || "Please try again");
//             // Reset status on failure
//             setRideStatus("idle");
//             setDriverStatus("online");
//             setIsAcceptingRide(false);
//           }
//         }
//       );
//     } else {
//       // Fallback if socket check passed initially but socket is somehow null now
//       setIsAcceptingRide(false);
//       setIsLoading(false);
//     }
//   };
  

//   // Throttled pickup route update
//   const throttledUpdatePickupRoute = useCallback(() => {
//     if (routeUpdateThrottle.current) {
//       clearTimeout(routeUpdateThrottle.current);
//     }
   
//     routeUpdateThrottle.current = setTimeout(() => {
//       updatePickupRoute();
//     }, 2000);
//   }, [updatePickupRoute]);
  
//   // Update pickup route as driver moves
//   useEffect(() => {
//     if (rideStatus === "accepted" && location && ride) {
//       throttledUpdatePickupRoute();
//     }
//   }, [location, rideStatus, ride, throttledUpdatePickupRoute]);
  
//   // Update drop route as driver moves after OTP
//   const updateDropRoute = useCallback(async () => {
//     if (!location || !ride || rideStatus !== "started") return;
    
//     console.log("🗺️ Updating drop route as driver moves after OTP");
    
//     try {
//       const dropRoute = await fetchRoute(location, ride.drop);
//       if (dropRoute && dropRoute.length > 0) {
//         setFullRouteCoords(dropRoute);
//         setVisibleRouteCoords(dropRoute);
//         console.log("✅ Updated drop route with", dropRoute.length, "points");
//       }
//     } catch (error) {
//       console.error("❌ Error updating drop route:", error);
//     }
//   }, [location, ride, rideStatus, fetchRoute]);
  
//   // Throttled drop route update
//   const throttledUpdateDropRoute = useCallback(() => {
//     if (routeUpdateThrottle.current) {
//       clearTimeout(routeUpdateThrottle.current);
//     }
   
//     routeUpdateThrottle.current = setTimeout(() => {
//       updateDropRoute();
//     }, 3000); // Update every 3 seconds
//   }, [updateDropRoute]);
  
//   // Update drop route as driver moves
//   useEffect(() => {
//     if (rideStatus === "started" && location && ride) {
//       throttledUpdateDropRoute();
//     }
//   }, [location, rideStatus, ride, throttledUpdateDropRoute]);
  
//   // Smooth map animation
//   const animateToLocation = useCallback(
//     (targetLocation: LocationType, shouldIncludeUser: boolean = false) => {
//       if (!mapRef.current || mapAnimationInProgress.current) return;
     
//       mapAnimationInProgress.current = true;
//       let region = {
//         latitude: targetLocation.latitude,
//         longitude: targetLocation.longitude,
//         latitudeDelta: 0.01,
//         longitudeDelta: 0.01,
//       };
      
//       if (shouldIncludeUser && userLocation && location) {
//         const points = [location, userLocation, targetLocation];
//         const lats = points.map((p) => p.latitude);
//         const lngs = points.map((p) => p.longitude);
//         const minLat = Math.min(...lats);
//         const maxLat = Math.max(...lats);
//         const minLng = Math.min(...lngs);
//         const maxLng = Math.max(...lngs);
//         const midLat = (minLat + maxLat) / 2;
//         const midLng = (minLng + maxLng) / 2;
//         const latDelta = (maxLat - minLat) * 1.2;
//         const lngDelta = (maxLng - minLng) * 1.2;
       
//         region = {
//           latitude: midLat,
//           longitude: midLng,
//           latitudeDelta: Math.max(latDelta, 0.02),
//           longitudeDelta: Math.max(lngDelta, 0.02),
//         };
//       }
      
//       setMapRegion(region);
//       mapRef.current.animateToRegion(region, 1000);
     
//       setTimeout(() => {
//         mapAnimationInProgress.current = false;
//       }, 1000);
//     },
//     [userLocation, location]
//   );
  

//   // ✅ FIX: Accept startLocation as an argument
// const startNavigation = useCallback(async (startLocation: LocationType) => {
//   if (!ride?.drop || !startLocation) return;
//   console.log("🚀 Starting navigation from verified location to drop");

//   try {
//     // Use the passed startLocation directly
//     const routeCoords = await fetchRoute(startLocation, ride.drop);
    
//     if (routeCoords && routeCoords.length > 0) {
//       console.log("✅ Navigation route fetched successfully:", routeCoords.length, "points");

//       setFullRouteCoords(routeCoords);
//       setVisibleRouteCoords(routeCoords);

//       // Start periodic route re-fetching
//       if (navigationInterval.current) clearInterval(navigationInterval.current);
      
//       navigationInterval.current = setInterval(async () => {
//         if (rideStatus === "started" && location) {
//           console.log("🔄 Re-fetching optimized route from current location");
//           const updatedRoute = await fetchRoute(location, ride.drop);
//           if (updatedRoute && updatedRoute.length > 0) {
//             setFullRouteCoords(updatedRoute);
//             setVisibleRouteCoords(updatedRoute);
//           }
//         }
//       }, 10000); 

//       console.log("🗺️ Navigation started with real-time route updates");
//     }
//   } catch (error) {
//     console.error("❌ Error starting navigation:", error);
//   }
// }, [ride?.drop, fetchRoute, location, rideStatus]);
  
//   // Stop navigation
//   const stopNavigation = useCallback(() => {
//     console.log("🛑 Stopping navigation mode");
//     if (navigationInterval.current) {
//       clearInterval(navigationInterval.current);
//       navigationInterval.current = null;
//     }
//   }, []);
  
//   // Logout function
//   const handleLogout = async () => {
//     try {
//       console.log("🚪 Initiating logout for driver:", driverId);

//       // Check if driver is currently on a ride
//       if (ride && (rideStatus === "accepted" || rideStatus === "started" || rideStatus === "onTheWay")) {
//         Alert.alert(
//           "⚠️ Cannot Logout",
//           "You are currently on a ride, so you cannot log out now.\nPlease complete your ride before logging out.",
//           [{ text: "OK", style: "cancel" }]
//         );
//         return;
//       }

//       // Stop background tracking
//       stopBackgroundLocationTracking();

//       // Try to notify backend, but don't block logout if it fails
//       try {
//         await api.post("/drivers/logout");
//         console.log("✅ Backend logout successful");
//       } catch (backendErr) {
//         console.log("⚠️ Backend logout failed, but continuing with app logout:", backendErr);
//       }

//       // Clear local storage
//       await AsyncStorage.clear();
//       console.log("✅ AsyncStorage cleared");

//       // Disconnect socket
//       if (socket) {
//         socket.disconnect();
//         console.log("✅ Socket disconnected");
//       }

//       // Navigate to login screen
//       navigation.replace("LoginScreen");
//       console.log("🧭 Navigated to LoginScreen");
//     } catch (err) {
//       console.error("❌ Error during logout:", err);
//       Alert.alert("❌ Logout Error", "Failed to logout. Please try again.");
//     }
//   };
  
  
  
//   // Reject ride
//   const rejectRide = (rideId?: string) => {
//     // ✅ CRITICAL: Prevent multiple clicks
//     if (isRejectingRide) {
//       console.log("⚠️ Already processing ride rejection, ignoring duplicate click");
//       return;
//     }

//     const currentRideId = rideId || ride?.rideId;
//     if (!currentRideId) {
//       Alert.alert("Error", "No ride ID available to reject");
//       return;
//     }

//     if (!driverId) {
//       Alert.alert("Error", "Driver not properly registered");
//       return;
//     }

//     // ✅ Check socket connection
//     if (!socket || !socket.connected) {
//       Alert.alert("Connection Error", "Unable to reject ride. Please check your connection.");
//       return;
//     }

//     // ✅ Set rejecting state to prevent duplicate clicks
//     setIsRejectingRide(true);
//     console.log("✅ Rejecting ride:", currentRideId);

//     // Clean map data
//     clearMapData();

//     setRide(null);
//     setRideStatus("idle");
//     setDriverStatus("online");
//     setUserData(null);
//     setUserLocation(null);
//     hideRiderDetails();

//     socket.emit("rejectRide", {
//       rideId: currentRideId,
//       driverId,
//     });

//     Alert.alert("Ride Rejected ❌", "You rejected the ride");

//     // ✅ Reset rejecting state after a short delay
//     setTimeout(() => {
//       setIsRejectingRide(false);
//       console.log("✅ Ride rejection complete");
//     }, 1000);
//   };
  
//   // Clear all map data (markers, routes, polylines)
//   const clearMapData = useCallback(() => {
//     console.log("🧹 Clearing all map data");
//     setFullRouteCoords([]);
//     setVisibleRouteCoords([]);
//     setNearestPointIndex(0);
//     setUserLocation(null);
//     setTravelledKm(0);
//     setLastCoord(null);
//     distanceSinceOtp.current = 0;
//     lastLocationBeforeOtp.current = null;
//     // Clear OTP verification location
//     setOtpVerificationLocation(null);
   
//     // Reset map region to driver's current location
//     if (location && mapRef.current) {
//       mapRef.current.animateToRegion({
//         latitude: location.latitude,
//         longitude: location.longitude,
//         latitudeDelta: 0.01,
//         longitudeDelta: 0.01,
//       }, 1000);
//     }
//   }, [location]);
  

  
//     // Only hides the modal (Safe for Back Button)
//   const handleBillModalDismiss = useCallback(() => {
//     setShowBillModal(false);
//   }, []);

//   // Confirms the ride and clears data
//   const handleBillModalConfirm = useCallback(() => {
//     console.log("💰 Bill confirmed, finalizing ride...");
    
//     // Reset all ride states
//     setRide(null);
//     setUserData(null);
//     setOtpSharedTime(null);
//     setOtpVerificationLocation(null);
//     setRideStatus("idle");
//     setDriverStatus("online");
    
//     // Clean map
//     clearMapData();
    
//     // ✅ FIX: Restart background tracking to ensure "online" status (not "onRide") is broadcast
//     // This refreshes the closure in the location watcher so the User App sees you as "Available"
//     startBackgroundLocationTracking();
    
//     // Hide rider details (already hidden, but safe to call)
//     hideRiderDetails();
    
//     // Clear AsyncStorage
//     clearRideState();
    
//     // Close modal
//     setShowBillModal(false);
    
//     console.log("✅ Ride fully completed and cleaned up");
//   }, [clearMapData, clearRideState, hideRiderDetails, startBackgroundLocationTracking]);




  
//   const confirmOTP = async () => {
//   if (!ride) return;

//   if (!ride.otp) {
//     Alert.alert("Error", "OTP not yet received from server.");
//     return;
//   }

//   // Check OTP
//   if (enteredOtp === ride.otp) {
//     console.log("========================================");
//     console.log("✅ OTP MATCHED - Starting Ride");
//     console.log("========================================");

//     // 1. IMMEDIATE UI UPDATES
//     console.log("📝 Closing OTP modal");
//     setOtpModalVisible(false); // Close modal first
//     console.log("📝 Clearing entered OTP");
//     setEnteredOtp("");
//     console.log("📝 Setting rideStatus to 'started'");
//     setRideStatus("started"); // Change status immediately
//     console.log("✅ rideStatus updated to 'started'");
//     console.log("========================================");
    
//     // 2. LOGIC UPDATES
//     setTravelledKm(0);
//     distanceSinceOtp.current = 0;
    
//     // Use current location as the "Start" point
//     const startPoint = location || lastCoord; 
    
//     if (startPoint) {
//       lastLocationBeforeOtp.current = startPoint;
//       setOtpVerificationLocation(startPoint);
//       console.log("📍 OTP verification location stored:", startPoint);
      
//       // Start navigation immediately
//       if (ride.drop) {
//         startNavigation(startPoint); // Pass location directly
//         animateToLocation(ride.drop, true);
//       }
//     }

//     setOtpSharedTime(new Date());

//     // 3. SOCKET EMITS
//     if (socket) {
//       const timestamp = new Date().toISOString();
      
//       socket.emit("otpVerified", {
//         rideId: ride.rideId,
//         driverId: driverId,
//         userId: userData?.userId,
//         timestamp: timestamp,
//         driverLocation: startPoint
//       });

//       socket.emit("driverStartedRide", {
//         rideId: ride.rideId,
//         driverId: driverId,
//         userId: userData?.userId,
//         driverLocation: startPoint,
//         otpVerified: true,
//         timestamp: timestamp
//       });
      
//       // Force status update on server
//       socket.emit("rideStatusUpdate", {
//         rideId: ride.rideId,
//         status: "started",
//         otpVerified: true,
//         timestamp: timestamp
//       });
//     }

//     // 4. SAVE STATE - Delayed to ensure rideStatus update completes
//     console.log("⏳ Scheduling ride state save after status update...");
//     setTimeout(() => {
//       console.log("💾 Saving ride state with status: 'started'");
//       saveRideState();
//     }, 100);

//     // 5. SHOW SUCCESS MESSAGE (Alert disabled to prevent UI freeze)
//     console.log("✅ ========================================");
//     console.log("✅ RIDE STARTED SUCCESSFULLY");
//     console.log("✅ Navigation to drop location is active");
//     console.log("✅ ========================================");

//     // Show a brief toast-style message to user
//     Alert.alert(
//       "✅ Ride Started",
//       "Navigation to drop-off location is now active",
//       [{ text: "OK" }],
//       { cancelable: true }
//     );

//   } else {
//     Alert.alert("Invalid OTP", "The OTP you entered is incorrect. Please try again.");
//   }
// };
  

  



// const completeRide = useCallback(async () => {
//   console.log("========================================");
//   console.log("🏁 COMPLETE RIDE FUNCTION ENTRY");
//   console.log("========================================");

//   // ✅ FIX: Prevent multiple clicks
//   if (isCompletingRide) {
//     console.log("⏳ Already completing ride, ignoring duplicate click");
//     return;
//   }

//   if (rideStatus !== "started") {
//     console.error("❌ Cannot complete: Ride not started, status is", rideStatus);
//     Alert.alert("Cannot Complete", "Ride must be started to complete.");
//     return;
//   }

//   if (!ride) {
//     console.error("❌ Complete Ride Failed: No Ride Data");
//     Alert.alert("Error", "Ride data is missing.");
//     return;
//   }

//   if (!location) {
//     console.error("❌ Complete Ride Failed: No Current Location");
//     Alert.alert("Error", "Current location is missing. Please wait for GPS.");
//     return;
//   }

//   // ✅ FIX: Show immediate loading state
//   console.log("🔒 Setting isCompletingRide to TRUE");
//   setIsCompletingRide(true);
//   console.log("✅ isCompletingRide state set to TRUE");

//   // Calculate distance and fare
//   let startPoint = otpVerificationLocation || ride.pickup;
  
//   try {
//     const distance = haversine(startPoint, location) / 1000;
//     const finalDistance = Math.max(distance, 0.1); // Minimum 100 meters
    
//     // ✅ DYNAMIC FARE CALCULATION
//     // 1. Get the estimated distance and fare from the booking data
//     const estimatedDist = parseFloat(String(ride.distance || '0').replace(/[^0-9.]/g, ''));
//     const estimatedFare = parseFloat(String(ride.fare || '0'));
    
//     // 2. Derive the "Admin Price per Km" that was used for the estimate
//     // If estimate was ₹60 for 4km, rate is ₹15/km.
//     const derivedRatePerKm = (estimatedDist > 0 && estimatedFare > 0) 
//       ? (estimatedFare / estimatedDist) 
//       : 15; // Fallback to 15 if data is missing

//     // 3. Calculate Final Fare based on ACTUAL distance travelled
//     const finalFare = Math.round(finalDistance * derivedRatePerKm);

//     console.log(`💰 Fare Logic: Est Fare ₹${estimatedFare} / Est Dist ${estimatedDist}km = Rate ₹${derivedRatePerKm.toFixed(2)}/km`);
//     console.log(`💰 Final Calc: Actual ${finalDistance.toFixed(2)}km * ₹${derivedRatePerKm.toFixed(2)} = ₹${finalFare}`);

//     // ✅ FIX: IMMEDIATE UI UPDATE - Don't wait for server
//     console.log("📝 IMMEDIATELY setting rideStatus to 'completed'");
//     setRideStatus("completed");
//     setDriverStatus("online");

//     // Stop navigation
//     console.log("🛑 Stopping navigation");
//     stopNavigation();

//     // Hide rider details
//     console.log("👤 Hiding rider details");
//     hideRiderDetails();

//     // ✅ FIX: Stop background tracking immediately to prevent stale "onRide" updates
//     // This stops the User App from thinking the ride is still active due to location updates
//     stopBackgroundLocationTracking();

//     // Prepare and show bill IMMEDIATELY
//     const billData = {
//       distance: `${finalDistance.toFixed(2)} km`,
//       travelTime: `${Math.round(finalDistance * 10)} mins`,
//       charge: finalFare,
//         userName: userData?.name || ride?.userName || 'Customer',
//         userMobile: userData?.mobile || ride?.userMobile || 'N/A',
//       baseFare: finalFare,
//       timeCharge: 0,
//       tax: 0
//     };

//     console.log("💰 Preparing bill data:", billData);
//     setBillDetails(billData);
    
//     // ✅ FIX: Force modal visibility with slight delay to ensure UI updates first
//     setTimeout(() => {
//       console.log("🔔 Showing Bill Modal NOW");
//       setShowBillModal(true);
//     }, 100);

//     // ✅ FIX: Send completion to server ASYNCHRONOUSLY (don't wait)
//     const sendCompletionToServer = async () => {
//       try {
//         console.log("🔌 Socket status - Exists:", !!socket, "Connected:", socket?.connected);

//         if (socket && socket.connected) {
//           const payload = {
//             rideId: ride.rideId,
//             driverId: driverId,
//             userId: userData?.userId,
//             distance: finalDistance,
//             fare: finalFare,
//             actualPickup: startPoint,
//             actualDrop: location,
//             timestamp: new Date().toISOString()
//           };

//           console.log("📡 Sending ride completion to server (async)");
//           console.log("📦 Payload:", JSON.stringify(payload, null, 2));

//           // ✅ ADDED: Explicitly update ride status to completed via socket
//           // This helps the User App transition state if it missed the completion event
//           socket.emit("rideStatusUpdate", {
//             rideId: ride.rideId,
//             status: "completed",
//             timestamp: new Date().toISOString()
//           });

//           // Use a shorter timeout
//           socket.timeout(3000).emit("driverCompletedRide", payload, (err: any, response: any) => {
//             if (err) {
//               console.error("❌ Socket timeout or error:", err);
//               console.warn("⚠️ Server timeout or error, will retry via HTTP:", err);
//               // Try HTTP fallback
//               sendCompletionViaHTTP();
//             } else if (response && response.success) {
//               console.log("✅ Server acknowledged ride completion");
//               console.log("📦 Server response:", JSON.stringify(response, null, 2));
//             } else {
//               console.error("❌ Server response not successful");
//               console.log("📦 Full server response:", JSON.stringify(response, null, 2));
//               console.warn("⚠️ Server response not successful:", response);
//               // Try HTTP fallback as server didn't acknowledge properly
//               sendCompletionViaHTTP();
//             }
//           });
//         } else {
//           // Socket not connected, use HTTP
//           console.warn("⚠️ Socket not available or not connected, using HTTP fallback");
//           sendCompletionViaHTTP();
//         }
//       } catch (error) {
//         console.error("❌ Error in async server communication:", error);
//       }
//     };

//     const sendCompletionViaHTTP = async () => {
//       try {
//         console.log("📡 Trying HTTP API for ride completion...");
//         const response = await fetch(`${API_BASE}/api/rides/complete`, {
//           method: 'POST',
//           headers: {
//             'Content-Type': 'application/json',
//             Authorization: `Bearer ${await AsyncStorage.getItem("authToken")}`,
//           },
//           body: JSON.stringify({
//             rideId: ride.rideId,
//             driverId: driverId,
//             distance: finalDistance,
//             fare: finalFare
//           })
//         });
        
//         if (response.ok) {
//           console.log("✅ HTTP API confirmed ride completion");
//         } else {
//           console.warn("⚠️ HTTP API failed:", response.status);
//           // Store locally for later sync
//           await AsyncStorage.setItem('pendingRideCompletion', JSON.stringify({
//             rideId: ride.rideId,
//             driverId: driverId,
//             distance: finalDistance,
//             fare: finalFare,
//             timestamp: new Date().toISOString()
//           }));
//         }
//       } catch (apiError) {
//         console.error("❌ HTTP API error:", apiError);
//       }
//     };

//     // Start async server communication
//     sendCompletionToServer();

//     // Save state
//     console.log("💾 Saving ride state");
//     // await saveRideState(); // ✅ REMOVED: useEffect handles this when rideStatus changes to 'completed'
//     // This prevents double-save lag
//     console.log("✅ Ride state saved");

//     console.log("========================================");
//     console.log("✅ RIDE COMPLETION PROCESS FINISHED");
//     console.log("========================================");

//   } catch (error) {
//     console.log("========================================");
//     console.log("❌ ERROR IN COMPLETE RIDE");
//     console.log("========================================");
//     console.error("❌ Error:", error);
//     Alert.alert("Error", "Failed to complete ride. Please try again.");
//   } finally {
//     // Always reset loading state
//     console.log("🔓 FINALLY BLOCK - Resetting isCompletingRide to FALSE");
//     setIsCompletingRide(false);
//     console.log("✅ isCompletingRide reset to FALSE");
//     console.log("========================================");
//   }
// }, [
//   ride,
//   rideStatus,
//   driverStatus,
//   location,
//   otpVerificationLocation,
//   stopNavigation,
//   hideRiderDetails,
//   socket,
//   driverId,
//   userData,
//   haversine,
//   saveRideState,
//   isCompletingRide,
//   stopBackgroundLocationTracking
// ]);

//   // Handle verification modal close
//   const handleVerificationModalClose = () => {
//     setShowVerificationModal(false);
//   };
  
//   const parseFare = (fare: any): number => {
//     if (typeof fare === 'number') return fare;
//     if (typeof fare === 'string') {
//       // Remove currency symbols, commas, etc. and parse
//       const cleaned = fare.replace(/[^0-9.]/g, '');
//       const num = parseFloat(cleaned);
//       return isNaN(num) ? 0 : num;
//     }
//     return 0;
//   };

//   const handleRideRequest = (data: any) => {
//   if (!isMounted.current || !data?.rideId || !isDriverOnline) return;

//   console.log(`🚗 Received ride request for ${data.vehicleType}`);

//   AsyncStorage.getItem("vehicleType").then((driverVehicleType) => {
//     // ✅ FIX: Default to 'taxi' if null, convert BOTH to LOWERCASE for comparison (STRICT RULE)
//     const driverType = (driverVehicleType || "taxi").toLowerCase(); // ✅ ALWAYS LOWERCASE
//     const requestVehicleType = (data.vehicleType || "").toLowerCase(); // ✅ ALWAYS LOWERCASE

//     // ✅ STRICT: Only process if vehicle types match exactly
//     if (requestVehicleType && driverType && requestVehicleType !== driverType) {
//       console.log(`🚫 Ignoring ride request: Driver is ${driverType}, ride requires ${requestVehicleType}`);
//       return;
//     }
    
//     // Process the ride request
//     try {
//       // Parse pickup and drop locations if they're strings
//       let pickupLocation, dropLocation;
      
//       try {
//         if (typeof data.pickup === 'string') {
//           pickupLocation = JSON.parse(data.pickup);
//         } else {
//           pickupLocation = data.pickup;
//         }
        
//         if (typeof data.drop === 'string') {
//           dropLocation = JSON.parse(data.drop);
//         } else {
//           dropLocation = data.drop;
//         }
//       } catch (error) {
//         console.error('Error parsing location data:', error);
//         return;
//       }
      
//       const rideData: RideType = {
//         rideId: data.rideId,
//         RAID_ID: data.RAID_ID || "N/A",
//         otp: data.otp || "0000",
//         pickup: {
//           latitude: pickupLocation?.lat || pickupLocation?.latitude || 0,
//           longitude: pickupLocation?.lng || pickupLocation?.longitude || 0,
//           address: pickupLocation?.address || "Unknown location",
//         },
//         drop: {
//           latitude: dropLocation?.lat || dropLocation?.latitude || 0,
//           longitude: dropLocation?.lng || dropLocation?.longitude || 0,
//           address: dropLocation?.address || "Unknown location",
//         },
//         fare: parseFare(data.fare),
//         distance: data.distance || "0 km",
//         vehicleType: data.vehicleType,
//         userName: data.userName || "Customer",
//         userMobile: data.userMobile || "N/A",
//       };
      
//       setRide(rideData);
//       setRideStatus("onTheWay");
      
//       Alert.alert(
//         `🚖 New ${data.vehicleType?.toUpperCase()} Ride Request!`,
//         `📍 Pickup: ${rideData.pickup.address}\n🎯 Drop: ${rideData.drop.address}\n💰 Fare: ₹${rideData.fare}\n📏 Distance: ${rideData.distance}\n👤 Customer: ${rideData.userName}\n🚗 Vehicle: ${data.vehicleType}`,
//         [
//           {
//             text: "❌ Reject",
//             onPress: () => rejectRide(rideData.rideId),
//             style: "destructive",
//           },
//           {
//             text: "✅ Accept",
//             onPress: () => acceptRide(rideData), // Pass the full rideData object
//           },
//         ],
//         { cancelable: false }
//       );
//     } catch (error) {
//       console.error("❌ Error processing ride request:", error);
//       Alert.alert("Error", "Could not process ride request. Please try again.");
//     }
//   });
// };
  
//   // Show ride taken alert
//   const showRideTakenAlertMessage = useCallback(() => {
//     setShowRideTakenAlert(true);
    
//     // Clear any existing timeout
//     if (rideTakenAlertTimeout.current) {
//       clearTimeout(rideTakenAlertTimeout.current);
//     }
    
//     // Animate the progress bar
//     Animated.timing(alertProgress, {
//       toValue: 0,
//       duration: 7000, // 7 seconds
//       useNativeDriver: false,
//     }).start();
    
//     // Set new timeout to hide alert after 7 seconds
//     rideTakenAlertTimeout.current = setTimeout(() => {
//       setShowRideTakenAlert(false);
//       // Reset the progress bar for next time
//       alertProgress.setValue(1);
//     }, 7000);
//   }, [alertProgress]);
  

  
//     // Render professional maximized passenger details
//   const renderMaximizedPassengerDetails = () => {
//     if (!ride || !userData || !riderDetailsVisible) return null;

//     return (
//       <Animated.View 
//         style={[
//           styles.maximizedDetailsContainer,
//           {
//             transform: [{ translateY: slideAnim }],
//             opacity: fadeAnim
//           }
//         ]}
//       >
//         {/* Header with Branding and Down Arrow */}
//         <View style={styles.maximizedHeader}>
//           <View style={styles.brandingContainer}>
//             <Text style={styles.brandingText}>Webase branding</Text>
//           </View>
//           <TouchableOpacity onPress={hideRiderDetails} style={styles.minimizeButton}>
//             <MaterialIcons name="keyboard-arrow-down" size={28} color="#666" />
//           </TouchableOpacity>
//         </View>

//         {/* Content */}
//         <ScrollView style={styles.maximizedContent} showsVerticalScrollIndicator={false}>
//           {/* Contact Information */}
//           <View style={styles.contactSection}>
//             <View style={styles.contactRow}>
//               <MaterialIcons name="phone" size={20} color="#666" />
//               <Text style={styles.contactLabel}>Phone</Text>
//               <Text style={styles.contactValue}>{userData?.mobile || ride?.userMobile || "N/A"}</Text>
//             </View>
//           </View>

//           {/* Address Information */}
//           <View style={styles.addressSection}>
//             <View style={styles.addressRow}>
//               <MaterialIcons name="location-on" size={20} color="#666" />
//               <Text style={styles.addressLabel}>Pick-up location</Text>
//             </View>
//             <Text style={styles.addressText}>
//               {ride.pickup.address}
//             </Text>
            
//             <View style={[styles.addressRow, { marginTop: 16 }]}>
//               <MaterialIcons name="location-on" size={20} color="#666" />
//               <Text style={styles.addressLabel}>Drop-off location</Text>
//             </View>
//             <Text style={styles.addressText}>
//               {ride.drop.address}
//             </Text>
//           </View>

//           {/* Fare Information */}
//           <View style={styles.fareSection}>
//             <View style={styles.fareRow}>
//               <Text style={styles.fareLabel}>Estimated fare</Text>
//               <Text style={styles.fareAmount}>₹{ride.fare}</Text>
//             </View>
//           </View>
//         </ScrollView>

//         {/* ✅ FIX: Only show this button if ride is NOT started */}
//         {rideStatus === "accepted" && (
//           <TouchableOpacity 
//             style={styles.startRideButton}
//             onPress={() => setOtpModalVisible(true)}
//           >
//             <Text style={styles.startRideButtonText}>Enter OTP & Start Ride</Text>
//           </TouchableOpacity>
//         )}
//       </Animated.View>
//     );
//   };



//   // Render minimized booking bar (2 lines as specified)
//   const renderMinimizedBookingBar = () => {
//     if (!ride || !userData || riderDetailsVisible) return null;

//     return (
//       <View style={styles.minimizedBookingBarContainer}>
//         <View style={styles.minimizedBookingBar}>
//           {/* Line 1: Profile Image, Name, Maximize Arrow */}
//           <View style={styles.minimizedFirstRow}>
//             <View style={styles.minimizedProfileImage}>
//               <Text style={styles.minimizedProfileImageText}>
//                 {calculateInitials(userData.name)}
//               </Text>
//             </View>
//             <Text style={styles.minimizedProfileName} numberOfLines={1}>
//               {userData.name}
//             </Text>
//             <TouchableOpacity 
//               style={styles.minimizedExpandButton}
//               onPress={showRiderDetails}
//             >
//               <MaterialIcons name="keyboard-arrow-up" size={24} color="#666" />
//             </TouchableOpacity>
//           </View>

//           {/* Line 2: Phone Icon, Mobile Number, Call Button */}
//           <View style={styles.minimizedSecondRow}>
//             <View style={styles.minimizedMobileContainer}>
//               <MaterialIcons name="phone" size={16} color="#4CAF50" />
//               <Text style={styles.minimizedMobileText} numberOfLines={1}>
//                 {userData?.mobile || ride?.userMobile || "N/A"}
//               </Text>
//             </View>
//             <TouchableOpacity 
//               style={styles.minimizedCallButton}
//               onPress={handleCallPassenger}
//             >
//               <MaterialIcons name="call" size={20} color="#FFFFFF" />
//             </TouchableOpacity>
//           </View>
//         </View>
//       </View>
//     );
//   };

//   // Socket event listeners for ride taken alerts
//   useEffect(() => {
//     console.log("========================================");
//     console.log("🔧 SOCKET LISTENERS USEEFFECT RUNNING");
//     console.log("========================================");
//     console.log("📊 Socket status:");
//     console.log("  - socket exists:", !!socket);
//     console.log("  - socket connected:", socket?.connected);
//     console.log("  - socket id:", socket?.id);
//     console.log("========================================");

//     if (!socket) {
//       console.warn("⚠️ Socket not available, skipping socket event listeners");
//       return;
//     }
    

    

    
//     const handleUserLiveLocationUpdate = (data: any) => {
//       if (!isMounted.current) return;
     
//       if (data && typeof data.lat === "number" && typeof data.lng === "number") {
//         const newUserLocation = {
//           latitude: data.lat,
//           longitude: data.lng,
//         };
       
//         setUserLocation((prev) => {
//           if (
//             !prev ||
//             prev.latitude !== newUserLocation.latitude ||
//             prev.longitude !== newUserLocation.longitude
//           ) {
//             return newUserLocation;
//           }
//           return prev;
//         });
       
//         setUserData((prev) => {
//           if (prev) {
//             return { ...prev, location: newUserLocation };
//           }
//           return prev;
//         });
//       }
//     };
    
//     const handleUserDataForDriver = (data: any) => {
//       if (!isMounted.current) return;
     
//       if (data && data.userCurrentLocation) {
//         const userLiveLocation = {
//           latitude: data.userCurrentLocation.latitude,
//           longitude: data.userCurrentLocation.longitude,
//         };
       
//         setUserLocation(userLiveLocation);
       
//         if (userData && !userData.userId && data.userId) {
//           setUserData((prev) => (prev ? { ...prev, userId: data.userId } : null));
//         }
//       }
//     };
    
//     const handleRideOTP = (data: any) => {
//       if (!isMounted.current) return;
     
//       if (ride && ride.rideId === data.rideId) {
//         setRide((prev) => (prev ? { ...prev, otp: data.otp } : null));
//       }
//     };
    
//     const handleDisconnect = () => {
//       if (!isMounted.current) return;
//       setSocketConnected(false);
//       setIsRegistered(false);
     
//       if (ride) {
//         setUserData(null);
//         setUserLocation(null);
//         Alert.alert("Connection Lost", "Reconnecting to server...");
//       }
//     };
    
//     const handleConnectError = (error: Error) => {
//       if (!isMounted.current) return;
//       setSocketConnected(false);
//       setError("Failed to connect to server");
//     };
    
//     const handleRideCancelled = (data: any) => {
//       if (!isMounted.current) return;
     
//       if (ride && ride.rideId === data.rideId) {
//         stopNavigation();
       
//         socket.emit("driverRideCancelled", {
//           rideId: ride.rideId,
//           driverId: driverId,
//           userId: userData?.userId,
//         });
       
//         // Clean map after cancellation
//         clearMapData();
       
//         setRide(null);
//         setUserData(null);
//         setRideStatus("idle");
//         setDriverStatus("online");
//         hideRiderDetails();
        
//         // Clear ride state from AsyncStorage
//         clearRideState();
       
//         Alert.alert("Ride Cancelled", "The passenger cancelled the ride.");
//       }
//     };
    
//     const handleRideAlreadyAccepted = (data: any) => {
//       if (!isMounted.current) return;
      
//       console.log("⚠️ handleRideAlreadyAccepted:", data);

//       // ✅ FIX: If we have already accepted this ride, ignore this event
//       if (rideStatus === 'accepted' && ride?.rideId === data.rideId) {
//           console.log("✅ We already accepted this ride. Ignoring 'already accepted' event.");
//           return;
//       }
     
//       // If this driver had ride request, clean up
//       if (ride && ride.rideId === data.rideId) {
//         // Clean map
//         clearMapData();
       
//         setRide(null);
//         setUserData(null);
//         setRideStatus("idle");
//         setDriverStatus("online");
//         hideRiderDetails();
//       }
//     };
    
//     const handleRideTakenByDriver = (data: any) => {
//       if (!isMounted.current) return;
      
//       console.log("🔔 handleRideTakenByDriver:", data);

//       // ✅ FIX: Robust comparison (convert to string to be safe)
//       const eventDriverId = String(data.driverId || '');
//       const currentDriverId = String(driverId || '');
      
//       // Only show the alert if this driver is not the one who took the ride
//       if (eventDriverId !== currentDriverId) {
//         Alert.alert(
//           "Ride Already Taken",
//           data.message || "This ride has already been accepted by another driver. Please wait for the next ride request.",
//           [{ text: "OK" }]
//         );
        
//         // If this driver had the ride request, clean up
//         if (ride && ride.rideId === data.rideId) {
//           // Clean map
//           clearMapData();
         
//           setRide(null);
//           setUserData(null);
//           setRideStatus("idle");
//           setDriverStatus("online");
//           hideRiderDetails();
//         }
//       } else {
//         console.log("✅ Ride taken by THIS driver. Ignoring alert/reset.");
//       }
//     };
    
//     const handleRideStarted = (data: any) => {
//       if (!isMounted.current) return;

//       if (ride && ride.rideId === data.rideId) {
//         console.log("🎉 Ride started - verification modal DISABLED to prevent freeze");

//         // DISABLED: This modal was causing screen freeze after OTP verification
//         // setVerificationDetails({
//         //   pickup: ride.pickup.address || "Pickup location",
//         //   dropoff: ride.drop.address || "Dropoff location",
//         //   time: new Date().toLocaleTimeString(),
//         //   speed: currentSpeed,
//         //   distance: distanceSinceOtp.current,
//         // });

//         // setShowVerificationModal(true);
//         console.log("✅ Skipped verification modal - screen should not freeze now");
//       }
//     };
    
//     console.log("📡 Registering socket event listeners...");
//     socket.on("connect", handleConnect);
//     socket.on("newRideRequest", handleRideRequest);
//     socket.on("userLiveLocationUpdate", handleUserLiveLocationUpdate);
//     socket.on("userDataForDriver", handleUserDataForDriver);
//     socket.on("rideOTP", handleRideOTP);
//     socket.on("disconnect", handleDisconnect);
//     socket.on("connect_error", handleConnectError);
//     socket.on("rideCancelled", handleRideCancelled);
//     socket.on("rideAlreadyAccepted", handleRideAlreadyAccepted);
//     socket.on("rideTakenByDriver", handleRideTakenByDriver);
//     socket.on("rideStarted", handleRideStarted);
//     console.log("✅ All socket event listeners registered");

//     // Socket connection based on online status
//     if (isDriverOnline && !socket.connected) {
//       console.log("🔌 Driver is online but socket disconnected - connecting...");
//       socket.connect();
//     } else if (!isDriverOnline && socket.connected) {
//       console.log("🔌 Driver is offline but socket connected - disconnecting...");
//       socket.disconnect();
//     } else {
//       console.log("🔌 Socket connection state is correct for driver online status");
//     }

//     return () => {
//       console.log("========================================");
//       console.log("🧹 CLEANUP - Removing socket event listeners");
//       console.log("========================================");
//       socket.off("connect", handleConnect);
//       socket.off("newRideRequest", handleRideRequest);
//       socket.off("userLiveLocationUpdate", handleUserLiveLocationUpdate);
//       socket.off("userDataForDriver", handleUserDataForDriver);
//       socket.off("rideOTP", handleRideOTP);
//       socket.off("disconnect", handleDisconnect);
//       socket.off("connect_error", handleConnectError);
//       socket.off("rideCancelled", handleRideCancelled);
//       socket.off("rideAlreadyAccepted", handleRideAlreadyAccepted);
//       socket.off("rideTakenByDriver", handleRideTakenByDriver);
//       socket.off("rideStarted", handleRideStarted);
//       console.log("✅ All socket event listeners removed");
//       console.log("========================================");
//     };
//   }, [location, driverId, driverName, ride, rideStatus, userData, stopNavigation, currentSpeed, isDriverOnline, clearMapData, clearRideState]);
  
//   // Save ride state whenever it changes
//   useEffect(() => {
//     if (ride && (rideStatus === "accepted" || rideStatus === "started")) {
//       console.log("💾 useEffect triggering saveRideState - ride state changed");
//       saveRideState();
//     }
//   }, [ride, rideStatus, userData, travelledKm, otpVerificationLocation, riderDetailsVisible]);
//   // NOTE: saveRideState removed from deps to prevent infinite loop
  
//   // UI Rendering
//   if (error) {
//     return (
//       <View style={styles.errorContainer}>
//         <Text style={styles.errorText}>{error}</Text>
//         <TouchableOpacity
//           style={styles.retryButton}
//           onPress={() => setError(null)}
//         >
//           <Text style={styles.retryText}>Retry</Text>
//         </TouchableOpacity>
//       </View>
//     );
//   }
  
//   if (!location) {
//     return (
//       <View style={styles.loadingContainer}>
//         <ActivityIndicator size="large" color="#4caf50" />
//         <Text style={styles.loadingText}>Fetching your location...</Text>
//         <TouchableOpacity
//           style={styles.retryButton}
//           onPress={() => {
//             Geolocation.getCurrentPosition(
//               (pos) => {
//                 setLocation({
//                   latitude: pos.coords.latitude,
//                   longitude: pos.coords.longitude,
//                 });
//               },
//               (err) => {
//                 Alert.alert(
//                   "Location Error",
//                   "Could not get your location. Please check GPS settings."
//                 );
//               },
//               { enableHighAccuracy: true, timeout: 15000 }
//             );
//           }}
//         >
//           <Text style={styles.retryText}>Retry Location</Text>
//         </TouchableOpacity>
//       </View>
//     );
//   }
  
//   return (
//     <View style={styles.container}>
//       <MapView
//         ref={mapRef}
//         style={styles.map}
//         initialRegion={{
//           latitude: location.latitude,
//           longitude: location.longitude,
//           latitudeDelta: 0.027, // ✅ ~3km view (zoom constraint)
//           longitudeDelta: 0.027,
//         }}
//         showsUserLocation={true}  // ✅ ENABLE as fallback - will show blue dot if custom marker fails
//         showsMyLocationButton={true}
//         showsCompass={true}
//         showsScale={true}
//         zoomControlEnabled={true}
//         rotateEnabled={true}
//         scrollEnabled={true}
//         zoomEnabled={true}
//         pitchEnabled={true}  // ✅ Enable 3D tilt
//         minZoomLevel={11}  // ✅ ~30km max zoom out
//         maxZoomLevel={18}  // ✅ ~1km max zoom in (even closer than 3km for detail)
//         loadingEnabled={true}
//         loadingIndicatorColor="#4caf50"
//         region={mapRegion}
//       >
//         {/* ✅ Professional Blue Dot - Native smooth location tracking */}

//         {/* Pickup Marker with Blue Icon */}
//         {ride && rideStatus !== "started" && (
//           <Marker
//             coordinate={ride.pickup}
//             title="Pickup Location"
//             description={ride.pickup.address}
//             pinColor="blue"
//           >
//             <View style={styles.locationMarker}>
//               <MaterialIcons name="location-pin" size={32} color="#2196F3" />
//               <Text style={styles.markerLabel}>Pickup</Text>
//             </View>
//           </Marker>
//         )}
       
//         {/* Drop-off Marker with Red Icon */}
//         {ride && (
//           <Marker
//             coordinate={ride.drop}
//             title="Drop Location"
//             description={ride.drop.address}
//             pinColor="red"
//           >
//             <View style={styles.locationMarker}>
//               <MaterialIcons name="location-pin" size={32} color="#F44336" />
//               <Text style={styles.markerLabel}>Drop-off</Text>
//             </View>
//           </Marker>
//         )}
      
//         {/* ✅ TRAVELLED ROUTE (Grey/Faded) - Shows where driver has been */}
//         {rideStatus === "started" && travelledRoute.length > 1 && (
//           <Polyline
//             coordinates={travelledRoute}
//             strokeWidth={6}
//             strokeColor="rgba(158, 158, 158, 0.6)"
//             lineCap="round"
//             lineJoin="round"
//             lineDashPattern={[0]}
//           />
//         )}

//         {/* ✅ RED ROUTE - Dynamic remaining polyline after OTP with smooth fade */}
//         {rideStatus === "started" && visibleRouteCoords.length > 0 && (
//           <Polyline
//             coordinates={visibleRouteCoords}
//             strokeWidth={6}
//             strokeColor="#F44336"
//             lineCap="round"
//             lineJoin="round"
//           />
//         )}

//         {/* ✅ GREEN ROUTE - Dynamic polyline before OTP (driver to pickup) */}
//         {rideStatus === "accepted" && ride?.routeCoords?.length && (
//           <Polyline
//             coordinates={ride.routeCoords}
//             strokeWidth={5}
//             strokeColor="#4caf50"
//             lineCap="round"
//             lineJoin="round"
//           />
//         )}
      
//         {ride && (rideStatus === "accepted" || rideStatus === "started") && userLocation && (
//           <Marker
//             coordinate={userLocation}
//             title="User Live Location"
//             description={`${userData?.name || "User"} - Live Location`}
//             tracksViewChanges={false}
//           >
//             <View style={styles.blackDotMarker}>
//               <View style={styles.blackDotInner} />
//             </View>
//           </Marker>
//         )}
//       </MapView>

//       {/* Menu Button - Top Left */}
//       <TouchableOpacity
//         style={styles.menuButton}
//         onPress={() => navigation.navigate('Menu')}
//       >
//         <MaterialIcons name="menu" size={28} color="#fff" />
//       </TouchableOpacity>

//       {/* Logout Button - Top Right */}
//       <TouchableOpacity
//         style={styles.logoutButton}
//         onPress={handleLogout}
//       >
//         <MaterialIcons name="logout" size={24} color="#fff" />
//       </TouchableOpacity>

//       {/* Profile Modal */}
//       <Modal
//         visible={profileModalVisible}
//         transparent={true}
//         animationType="slide"
//         onRequestClose={() => setProfileModalVisible(false)}
//       >
//         <View style={styles.profileModalOverlay}>
//           <View style={styles.profileModalContainer}>
//             <View style={styles.profileModalHeader}>
//               <Text style={styles.profileModalTitle}>Driver Profile</Text>
//               <TouchableOpacity onPress={() => setProfileModalVisible(false)}>
//                 <MaterialIcons name="close" size={28} color="#333" />
//               </TouchableOpacity>
//             </View>

//             <ScrollView style={styles.profileModalContent}>
//               <View style={styles.profileAvatarContainer}>
//                 <View style={styles.profileAvatar}>
//                   <MaterialIcons name="person" size={60} color="#fff" />
//                 </View>
//                 <View style={styles.ratingContainer}>
//                   <FontAwesome name="star" size={16} color="#f39c12" />
//                   <Text style={styles.ratingText}>{driverProfile.rating.toFixed(1)}</Text>
//                 </View>
//               </View>

//               <View style={styles.profileInfoSection}>
//                 <View style={styles.profileInfoRow}>
//                   <MaterialIcons name="person" size={20} color="#7f8c8d" />
//                   <Text style={styles.profileInfoLabel}>Name</Text>
//                 </View>
//                 <Text style={styles.profileInfoValue}>{driverProfile.name || 'N/A'}</Text>
//               </View>

//               <View style={styles.profileInfoSection}>
//                 <View style={styles.profileInfoRow}>
//                   <MaterialIcons name="phone" size={20} color="#7f8c8d" />
//                   <Text style={styles.profileInfoLabel}>Phone</Text>
//                 </View>
//                 <Text style={styles.profileInfoValue}>{driverProfile.phone || 'N/A'}</Text>
//               </View>

//               <View style={styles.profileInfoSection}>
//                 <View style={styles.profileInfoRow}>
//                   <MaterialIcons name="directions-car" size={20} color="#7f8c8d" />
//                   <Text style={styles.profileInfoLabel}>Vehicle Number</Text>
//                 </View>
//                 <Text style={styles.profileInfoValue}>{driverProfile.vehicleNumber || 'N/A'}</Text>
//               </View>

//               <View style={styles.profileInfoSection}>
//                 <View style={styles.profileInfoRow}>
//                   <MaterialIcons name="category" size={20} color="#7f8c8d" />
//                   <Text style={styles.profileInfoLabel}>Vehicle Type</Text>
//                 </View>
//                 <Text style={styles.profileInfoValue}>{driverProfile.vehicleType || 'N/A'}</Text>
//               </View>
//             </ScrollView>
//           </View>
//         </View>
//       </Modal>

//       {/* Professional Maximized Passenger Details (Default View) */}
//       {renderMaximizedPassengerDetails()}
      
//       {/* Minimized Booking Bar (2 lines) */}
//       {renderMinimizedBookingBar()}

//       {/* Single Bottom Button - Changes based on ride status */}
   
// {ride && (rideStatus === "accepted" || rideStatus === "started") && (
//   <TouchableOpacity
//     style={[
//       styles.button,
//       rideStatus === "accepted" ? styles.startButton : styles.completeButton,
//       isCompletingRide && styles.buttonDisabled
//     ]}
//     onPress={() => {
//       console.log("========================================");
//       console.log("🎯 BUTTON PRESSED - Complete Ride Button");
//       console.log("========================================");
//       console.log("📊 Current State:");
//       console.log("  - rideStatus:", rideStatus);
//       console.log("  - isCompletingRide:", isCompletingRide);
//       console.log("  - ride exists:", !!ride);
//       console.log("  - rideId:", ride?.rideId);
//       console.log("  - location exists:", !!location);
//       console.log("  - socket exists:", !!socket);
//       console.log("  - socket connected:", socket?.connected);
//       console.log("  - socket id:", socket?.id);
//       console.log("  - socket has emit:", typeof socket?.emit === 'function');
//       console.log("========================================");

//       if (isCompletingRide) {
//         console.log("⏳ Already processing, ignoring click");
//         return;
//       }

//       if (rideStatus === "accepted") {
//         console.log("🚀 Opening OTP modal");
//         setOtpModalVisible(true);
//       } else if (rideStatus === "started") {
//         console.log("🏁 CALLING completeRide() function NOW");
//         console.log("⏰ Timestamp:", new Date().toISOString());
//         completeRide();
//         console.log("✅ completeRide() function called");
//       } else {
//         console.log("⚠️ Unexpected ride status:", rideStatus);
//       }
//     }}
//     disabled={isCompletingRide}
//     activeOpacity={0.7}
//   >
//     {isCompletingRide ? (
//       <ActivityIndicator size="small" color="#fff" />
//     ) : (
//       <MaterialIcons
//         name={rideStatus === "accepted" ? "play-arrow" : "flag"}
//         size={24}
//         color="#fff"
//       />
//     )}
//     <Text style={styles.btnText}>
//       {isCompletingRide
//         ? "Completing Ride..."
//         : rideStatus === "accepted"
//         ? "Enter OTP & Start Ride"
//         : `Complete Ride (${distanceSinceOtp.current.toFixed(2)} km)`}
//     </Text>
//   </TouchableOpacity>
// )}

//       {/* Ride Taken Alert */}
//       {showRideTakenAlert && (
//         <View style={styles.rideTakenAlertContainer}>
//           <View style={styles.rideTakenAlertContent}>
//             <Text style={styles.rideTakenAlertText}>
//               This ride is already taken by another driver — please wait.
//             </Text>
//             <View style={styles.alertProgressBar}>
//               <Animated.View 
//                 style={[
//                   styles.alertProgressFill,
//                   {
//                     width: '100%',
//                     transform: [{ scaleX: alertProgress }]
//                   }
//                 ]}
//               />
//             </View>
//           </View>
//         </View>
//       )}
      
//       {/* Online/Offline Toggle Button - MOVED TO BOTTOM RIGHT */}
//       {!ride && (
//         <View style={styles.onlineToggleContainer}>
//           <TouchableOpacity
//             style={[
//               styles.onlineToggleButton,
//               isDriverOnline ? styles.onlineButton : styles.offlineButton
//             ]}
//             onPress={toggleOnlineStatus}
//           >
//             <View style={styles.toggleContent}>
//               <View style={[
//                 styles.toggleIndicator,
//                 { backgroundColor: isDriverOnline ? "#4caf50" : "#f44336" }
//               ]} />
//               <Text style={styles.toggleButtonText}>
//                 {isDriverOnline ? "🟢 ONLINE" : "🔴 OFFLINE"}
//               </Text>
//             </View>
//             {backgroundTrackingActive && (
//               <Text style={styles.trackingText}>📍 Live tracking active</Text>
//             )}
//           </TouchableOpacity>
//         </View>
//       )}

//       {/* Working Hours Timer - Removed (only show in Menu screen) */}



//       {ride && rideStatus === "onTheWay" && (
//         <View style={styles.rideActions}>
//           <TouchableOpacity
//             style={[
//               styles.button,
//               styles.acceptButton,
//               (isAcceptingRide || isLoading) && styles.buttonDisabled
//             ]}
//             onPress={() => acceptRide()}
//             disabled={isAcceptingRide || isLoading}
//           >
//             {(isAcceptingRide || isLoading) ? (
//               <>
//                 <ActivityIndicator color="#fff" size="small" />
//                 <Text style={styles.btnText}>Accepting...</Text>
//               </>
//             ) : (
//               <>
//                 <MaterialIcons name="check-circle" size={24} color="#fff" />
//                 <Text style={styles.btnText}>Accept Ride</Text>
//               </>
//             )}
//           </TouchableOpacity>
//           <TouchableOpacity
//             style={[
//               styles.button,
//               styles.rejectButton,
//               (isRejectingRide || isAcceptingRide || isLoading) && styles.buttonDisabled
//             ]}
//             onPress={() => rejectRide()}
//             disabled={isRejectingRide || isAcceptingRide || isLoading}
//           >
//             {isRejectingRide ? (
//               <>
//                 <ActivityIndicator color="#fff" size="small" />
//                 <Text style={styles.btnText}>Rejecting...</Text>
//               </>
//             ) : (
//               <>
//                 <MaterialIcons name="cancel" size={24} color="#fff" />
//                 <Text style={styles.btnText}>Reject</Text>
//               </>
//             )}
//           </TouchableOpacity>
//         </View>
//       )}
      


      
//       {/* OTP Modal */}
//       <Modal visible={otpModalVisible} transparent animationType="slide">
//         <View style={styles.modalOverlay}>
//           <View style={styles.modalContainer}>
//             <View style={styles.modalHeader}>
//               <Text style={styles.modalTitle}>Enter OTP</Text>
//               <Text style={styles.modalSubtitle}>Please ask passenger for OTP to start the ride</Text>
//             </View>
//             <TextInput
//               placeholder="Enter 4-digit OTP"
//               value={enteredOtp}
//               onChangeText={setEnteredOtp}
//               keyboardType="numeric"
//               style={styles.otpInput}
//               maxLength={4}
//               autoFocus
//               placeholderTextColor="#999"
//             />
//             <View style={styles.modalButtons}>
//               <TouchableOpacity
//                 style={[styles.modalButton, styles.cancelModalButton]}
//                 onPress={() => setOtpModalVisible(false)}
//               >
//                 <Text style={styles.modalButtonText}>Cancel</Text>
//               </TouchableOpacity>
//               <TouchableOpacity
//                 style={[styles.modalButton, styles.confirmModalButton]}
//                 onPress={confirmOTP}
//               >
//                 <Text style={styles.modalButtonText}>Confirm OTP</Text>
//               </TouchableOpacity>
//             </View>
//           </View>
//         </View>
//       </Modal>
      
//       {/* Verification Modal */}
//       <Modal
//         animationType="slide"
//         transparent={true}
//         visible={showVerificationModal}
//         onRequestClose={handleVerificationModalClose}
//       >
        
//       </Modal>
      
//       {/* Bill Modal */}
//      <Modal
//         animationType="slide"
//         transparent={true}
//         visible={showBillModal}
//         onRequestClose={handleBillModalDismiss} // ✅ Changed: Just dismiss on Back button
//       >
//         <View style={styles.modalOverlay}>
//           <View style={styles.modalContainer}>
//             <View style={styles.modalHeader}>
//               <Text style={styles.modalTitle}>🏁 Ride Completed</Text>
//               <Text style={styles.modalSubtitle}>Thank you for the safe ride!</Text>
//             </View>

//             <View style={styles.billCard}>
//               {/* ... Bill Details ... */}
//               {/* Ensure you have the bill details view here exactly as it was */}
//                <View style={styles.billSection}>
//                 <Text style={styles.billSectionTitle}>Customer Details</Text>
//                 <View style={styles.billRow}>
//                   <Text style={styles.billLabel}>Name:</Text>
//                   <Text style={styles.billValue}>{billDetails.userName}</Text>
//                 </View>
//                 <View style={styles.billRow}>
//                   <Text style={styles.billLabel}>Mobile:</Text>
//                   <Text style={styles.billValue}>{billDetails.userMobile}</Text>
//                 </View>
//               </View>

//               <View style={styles.billSection}>
//                 <Text style={styles.billSectionTitle}>Trip Details</Text>
//                 <View style={styles.billRow}>
//                   <Text style={styles.billLabel}>Distance:</Text>
//                   <Text style={styles.billValue}>{billDetails.distance}</Text>
//                 </View>
//                 <View style={styles.billRow}>
//                   <Text style={styles.billLabel}>Time:</Text>
//                   <Text style={styles.billValue}>{billDetails.travelTime}</Text>
//                 </View>
//               </View>

//               <View style={styles.billSection}>
//                 <Text style={styles.billSectionTitle}>Fare Breakdown</Text>
//                 <View style={styles.billRow}>
//                   <Text style={styles.billLabel}>Distance Charge:</Text>
//                   <Text style={styles.billValue}>₹{billDetails.charge}</Text>
//                 </View>
//                 <View style={styles.billDivider} />
//                 <View style={styles.billRow}>
//                   <Text style={styles.billTotalLabel}>Total Amount:</Text>
//                   <Text style={styles.billTotalValue}>₹{billDetails.charge}</Text>
//                 </View>
//               </View>
//             </View>

//             <TouchableOpacity style={styles.confirmButton} onPress={handleBillModalConfirm}>
//               <Text style={styles.confirmButtonText}>Confirm & Close Ride</Text>
//             </TouchableOpacity>
//           </View>
//         </View>
//       </Modal>

//       {/* Working Hours Warning Modal */}
//       <Modal
//         visible={showWorkingHoursWarning}
//         transparent={true}
//         animationType="fade"
//         onRequestClose={() => setShowWorkingHoursWarning(false)}
//       >
//         <View style={styles.modalOverlay}>
//           <View style={styles.workingHoursWarningModal}>
//             <MaterialIcons name="warning" size={60} color="#f39c12" />
//             <Text style={styles.warningTitle}>
//               ⚠️ Warning {currentWarning.number}/3
//             </Text>
//             <Text style={styles.warningMessage}>
//               {currentWarning.message}
//             </Text>
//             <Text style={styles.warningRemainingTime}>
//               Time Remaining: {currentWarning.remainingTime}
//             </Text>
//             <View style={styles.warningButtons}>
//               <TouchableOpacity
//                 style={[styles.warningButton, styles.skipButton]}
//                 onPress={handleSkipWarning}
//               >
//                 <Text style={styles.buttonText}>Skip</Text>
//               </TouchableOpacity>
//               <TouchableOpacity
//                 style={[styles.warningButton, styles.continueButton]}
//                 onPress={handlePurchaseExtendedHours}
//               >
//                 <Text style={styles.buttonText}>Continue (₹100)</Text>
//               </TouchableOpacity>
//             </View>
//           </View>
//         </View>
//       </Modal>

//       {/* 🌟 PROFESSIONAL TWO-STEP OFFLINE CONFIRMATION MODAL 🌟 */}
//       <Modal
//         visible={showOfflineConfirmation}
//         transparent={true}
//         animationType="fade"
//         onRequestClose={() => setShowOfflineConfirmation(false)}
//       >
//         <View style={styles.ultraProfessionalOverlay}>
//           <View style={styles.ultraProfessionalModal}>

//             {/* Gradient Header with Large Icon */}
//             <View style={styles.ultraModalHeader}>
//               <View style={styles.ultraIconContainer}>
//                 <View style={styles.ultraIconPulse} />
//                 <View style={styles.ultraIconCircle}>
//                   <MaterialIcons name="warning-amber" size={56} color="#fff" />
//                 </View>
//               </View>
//             </View>

//             {/* Two-Step Professional Content */}
//             {offlineStep === 'warning' ? (
//               /* STEP 1: Warning Message with Yes/No */
//               <>
//                 <View style={styles.compactModalContent}>
//                   <Text style={styles.compactModalTitle}>⚠️ Wallet Already Debited</Text>

//                   <Text style={styles.warningDescriptionText}>
//                     ₹100 has already been debited from your wallet.
//                   </Text>

//                   <Text style={styles.warningDescriptionText}>
//                     If you go OFFLINE now, the amount will not be refunded.
//                   </Text>

//                   <Text style={styles.warningQuestionText}>
//                     Are you sure you want to go OFFLINE?
//                   </Text>
//                 </View>

//                 {/* Yes/No Buttons */}
//                 <View style={styles.compactButtonContainer}>
//                   <TouchableOpacity
//                     style={styles.compactCancelButton}
//                     onPress={() => {
//                       setShowOfflineConfirmation(false);
//                       setOfflineStep('warning');
//                     }}
//                     activeOpacity={0.8}
//                   >
//                     <Text style={styles.compactCancelText}>No</Text>
//                   </TouchableOpacity>

//                   <TouchableOpacity
//                     style={styles.compactConfirmButton}
//                     onPress={() => setOfflineStep('verification')}
//                     activeOpacity={0.8}
//                   >
//                     <Text style={styles.compactConfirmText}>Yes</Text>
//                   </TouchableOpacity>
//                 </View>
//               </>
//             ) : (
//               /* STEP 2: Driver ID Verification */
//               <>
//                 <View style={styles.compactModalContent}>
//                   <Text style={styles.compactModalTitle}>Verify Driver ID</Text>

//                   <Text style={styles.verificationDescriptionText}>
//                     Enter the last 4 digits of your Driver ID to confirm going offline
//                   </Text>

//                   {/* Verification Input */}
//                   <View style={styles.compactVerificationBox}>
//                     <TextInput
//                       style={styles.compactDriverIdInput}
//                       placeholder="••••"
//                       placeholderTextColor="#bdc3c7"
//                       value={driverIdConfirmation}
//                       onChangeText={setDriverIdConfirmation}
//                       keyboardType="number-pad"
//                       maxLength={4}
//                       autoFocus
//                     />
//                   </View>
//                 </View>

//                 {/* Back/Confirm Buttons */}
//                 <View style={styles.compactButtonContainer}>
//                   <TouchableOpacity
//                     style={styles.compactCancelButton}
//                     onPress={() => {
//                       setOfflineStep('warning');
//                       setDriverIdConfirmation('');
//                     }}
//                     activeOpacity={0.8}
//                   >
//                     <Text style={styles.compactCancelText}>Back</Text>
//                   </TouchableOpacity>

//                   <TouchableOpacity
//                     style={styles.compactConfirmButton}
//                     onPress={confirmOfflineWithVerification}
//                     activeOpacity={0.8}
//                   >
//                     <Text style={styles.compactConfirmText}>Confirm Offline</Text>
//                   </TouchableOpacity>
//                 </View>
//               </>
//             )}

//           </View>
//         </View>
//       </Modal>
//     </View>
//   );
// };

// export default DriverScreen;

// const styles = StyleSheet.create({
//   container: {
//     flex: 1,
//     backgroundColor: "#1a1a1a",
//   },
//   map: {
//     flex: 1,
//   },
//   loadingContainer: {
//     flex: 1,
//     justifyContent: "center",
//     alignItems: "center",
//     backgroundColor: "#ffffff",
//     padding: 20,
//   },
//   loadingText: {
//     marginTop: 16,
//     fontSize: 16,
//     color: "#666",
//     textAlign: "center",
//   },
//   // Location Marker Styles
//   locationMarker: {
//     alignItems: 'center',
//     justifyContent: 'center',
//   },
//   markerLabel: {
//     fontSize: 10,
//     fontWeight: 'bold',
//     color: '#333',
//     marginTop: -4,
//   },
//   // ✅ SMOOTH ANIMATED DRIVER MARKER STYLES
//   driverMarkerContainer: {
//     alignItems: 'center',
//     justifyContent: 'center',
//     width: 50,
//     height: 50,
//   },
//   driverMarker: {
//     alignItems: 'center',
//     justifyContent: 'center',
//     width: 40,
//     height: 40,
//     borderRadius: 20,
//     backgroundColor: '#4caf50',
//     borderWidth: 3,
//     borderColor: '#fff',
//     shadowColor: '#000',
//     shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.3,
//     shadowRadius: 4,
//     elevation: 5,
//   },
//   accuracyCircle: {
//     position: 'absolute',
//     width: 24,
//     height: 24,
//     borderRadius: 12,
//     backgroundColor: 'rgba(76, 175, 80, 0.15)',
//     borderWidth: 1.5,
//     borderColor: 'rgba(76, 175, 80, 0.4)',
//   },
//   // Professional Maximized Passenger Details (Screenshot Layout)
//   maximizedDetailsContainer: {
//     position: "absolute",
//     bottom: 0,
//     left: 0,
//     right: 0,
//     backgroundColor: "#FFFFFF",
//     borderTopLeftRadius: 24,
//     borderTopRightRadius: 24,
//     paddingHorizontal: 20,
//     paddingTop: 20,
//     paddingBottom: 30,
//     elevation: 16,
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: -4 },
//     shadowOpacity: 0.25,
//     shadowRadius: 12,
//     maxHeight: "80%", // Increased height to ensure it covers the bottom button
//   },
//   maximizedHeader: {
//     flexDirection: "row",
//     justifyContent: "space-between",
//     alignItems: "center",
//     marginBottom: 20,
//   },
//   brandingContainer: {
//     flexDirection: "row",
//     alignItems: "center",
//   },
//   brandingText: {
//     fontSize: 16,
//     fontWeight: "600",
//     color: "#333333",
//   },
//   minimizeButton: {
//     padding: 8,
//   },
//   maximizedContent: {
//     flex: 1,
//   },
//   contactSection: {
//     marginBottom: 20,
//   },
//   contactRow: {
//     flexDirection: "row",
//     alignItems: "center",
//     paddingVertical: 12,
//     backgroundColor: "#F8F9FA",
//     borderRadius: 12,
//     paddingHorizontal: 16,
//   },
//   contactLabel: {
//     fontSize: 14,
//     color: "#666666",
//     marginLeft: 12,
//     flex: 1,
//   },
//   contactValue: {
//     fontSize: 16,
//     fontWeight: "600",
//     color: "#333333",
//   },
//   addressSection: {
//     marginBottom: 20,
//   },
//   addressRow: {
//     flexDirection: "row",
//     alignItems: "center",
//     marginBottom: 8,
//   },
//   addressLabel: {
//     fontSize: 14,
//     color: "#666666",
//     marginLeft: 12,
//     fontWeight: "500",
//   },
//   addressText: {
//     fontSize: 16,
//     color: "#333333",
//     lineHeight: 24,
//     paddingHorizontal: 16,
//   },
//   fareSection: {
//     marginBottom: 20,
//   },
//   fareRow: {
//     flexDirection: "row",
//     justifyContent: "space-between",
//     alignItems: "center",
//     paddingVertical: 12,
//     backgroundColor: "#F8F9FA",
//     borderRadius: 12,
//     paddingHorizontal: 16,
//   },
//   fareLabel: {
//     fontSize: 16,
//     color: "#666666",
//     fontWeight: "500",
//   },
//   fareAmount: {
//     fontSize: 20,
//     fontWeight: "bold",
//     color: "#4CAF50",
//   },
//   startRideButton: {
//     backgroundColor: "#2196F3",
//     paddingVertical: 16,
//     borderRadius: 12,
//     alignItems: "center",
//     elevation: 6,
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: 4 },
//     shadowOpacity: 0.3,
//     shadowRadius: 8,
//   },
//   startRideButtonText: {
//     fontSize: 16,
//     fontWeight: "600",
//     color: "#FFFFFF",
//   },
//   // Minimized Booking Bar Styles (2 lines)
//   minimizedBookingBarContainer: {
//     position: "absolute",
//     bottom: 80,
//     left: 16,
//     right: 16,
//     zIndex: 11,
//   },
//   minimizedBookingBar: {
//     backgroundColor: "#FFFFFF",
//     borderRadius: 12,
//     padding: 16,
//     elevation: 8,
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: 4 },
//     shadowOpacity: 0.15,
//     shadowRadius: 8,
//   },
//   minimizedFirstRow: {
//     flexDirection: "row",
//     alignItems: "center",
//     marginBottom: 12,
//   },
//   minimizedProfileImage: {
//     width: 40,
//     height: 40,
//     borderRadius: 20,
//     backgroundColor: "#4CAF50",
//     justifyContent: "center",
//     alignItems: "center",
//     marginRight: 12,
//   },
//   minimizedProfileImageText: {
//     color: "#FFFFFF",
//     fontSize: 16,
//     fontWeight: "bold",
//   },
//   minimizedProfileName: {
//     fontSize: 16,
//     fontWeight: "bold",
//     color: "#333333",
//     flex: 1,
//   },
//   minimizedExpandButton: {
//     padding: 4,
//   },
//   minimizedSecondRow: {
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "space-between",
//   },
//   minimizedMobileContainer: {
//     flexDirection: "row",
//     alignItems: "center",
//     flex: 1,
//   },
//   minimizedMobileText: {
//     fontSize: 14,
//     color: "#333333",
//     marginLeft: 6,
//     flex: 1,
//   },
//   minimizedCallButton: {
//     width: 36,
//     height: 36,
//     borderRadius: 18,
//     backgroundColor: "#4CAF50",
//     justifyContent: "center",
//     alignItems: "center",
//     marginLeft: 8,
//   },
//   // Ride Taken Alert Styles
//   rideTakenAlertContainer: {
//     position: "absolute",
//     top: 50,
//     left: 16,
//     right: 16,
//     zIndex: 20,
//   },
//   rideTakenAlertContent: {
//     backgroundColor: "rgba(255, 152, 0, 0.9)",
//     padding: 16,
//     borderRadius: 8,
//     elevation: 4,
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.2,
//     shadowRadius: 4,
//   },
//   rideTakenAlertText: {
//     color: "#fff",
//     fontSize: 16,
//     fontWeight: "600",
//     textAlign: "center",
//   },
//   alertProgressBar: {
//     height: 4,
//     backgroundColor: "rgba(255, 255, 255, 0.3)",
//     borderRadius: 2,
//     marginTop: 8,
//     overflow: "hidden",
//   },
//   alertProgressFill: {
//     height: "100%",
//     backgroundColor: "#fff",
//     borderRadius: 2,
//   },
//   // Online/Offline Toggle Styles - CENTER TOP
//   onlineToggleContainer: {
//     position: "absolute",
//     top: 45,
//     left: 0,
//     right: 0,
//     alignItems: "center",
//     zIndex: 5,
//   },
//   onlineToggleButton: {
//     padding: 14,
//     borderRadius: 30,
//     elevation: 6,
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: 3 },
//     shadowOpacity: 0.3,
//     shadowRadius: 6,
//     width: 180,
//   },
//   onlineButton: {
//     backgroundColor: "#4caf50",
//   },
//   offlineButton: {
//     backgroundColor: "#f44336",
//   },
//   toggleContent: {
//     flexDirection: "row",
//     alignItems: "center",
//     justifyContent: "center",
//   },
//   toggleIndicator: {
//     width: 12,
//     height: 12,
//     borderRadius: 6,
//     marginRight: 10,
//   },
//   toggleButtonText: {
//     color: "#fff",
//     fontSize: 16,
//     fontWeight: "700",
//   },
//   trackingText: {
//     color: "#fff",
//     fontSize: 11,
//     marginTop: 4,
//     textAlign: "center",
//     fontWeight: "500",
//   },
//   statusContainer: {
//     position: "absolute",
//     top: Platform.OS === "ios" ? 50 : 40,
//     left: 16,
//     right: 16,
//     backgroundColor: "rgba(255, 255, 255, 0.95)",
//     padding: 12,
//     borderRadius: 12,
//     elevation: 4,
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.1,
//     shadowRadius: 4,
//   },
//   statusRow: {
//     flexDirection: "row",
//     alignItems: "center",
//     marginBottom: 4,
//   },
//   statusIndicator: {
//     width: 8,
//     height: 8,
//     borderRadius: 4,
//     marginRight: 6,
//   },
//   statusText: {
//     fontSize: 13,
//     fontWeight: "600",
//     marginRight: 16,
//     color: "#333",
//   },
//   userLocationText: {
//     fontSize: 11,
//     color: "#4caf50",
//     fontWeight: "500",
//     marginTop: 2,
//   },
//   distanceText: {
//     fontSize: 11,
//     color: "#ff9800",
//     fontWeight: "500",
//     marginTop: 2,
//   },
//   rideActions: {
//     position: "absolute",
//     bottom: 20,
//     left: 16,
//     right: 16,
//     flexDirection: "row",
//     justifyContent: "space-between",
//     gap: 12,
//   },
//   button: {
//     padding: 16,
//     borderRadius: 12,
//     alignItems: "center",
//     elevation: 3,
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.1,
//     shadowRadius: 4,
//     flexDirection: "row",
//     justifyContent: "center",
//     gap: 8,
//   },
//   acceptButton: {
//     backgroundColor: "#4caf50",
//     flex: 1,
//   },
//   rejectButton: {
//     backgroundColor: "#f44336",
//     flex: 1,
//   },





//   startButton: {
//     backgroundColor: "#2196f3",
//     position: "absolute",
//     bottom: 20,
//     left: 16,
//     right: 16,
//     elevation: 25, // ✅ INCREASED from 3
//     zIndex: 100,  // ✅ ADDED for iOS priority
//   },
//   completeButton: {
//     backgroundColor: "#ff9800",
//     position: "absolute",
//     bottom: 20,
//     left: 16,
//     right: 16,
//     elevation: 25, // ✅ INCREASED from 3
//     zIndex: 100,  // ✅ ADDED for iOS priority
//   },
//   buttonDisabled: {
//     backgroundColor: "#95a5a6",
//     opacity: 0.6,
//   },
//   logoutButton: {
//     backgroundColor: "#dc3545",
//     position: "absolute",
//     bottom: 20,
//     left: 16,
//     right: 16,
//     elevation: 25, // ✅ INCREASED from 3
//     zIndex: 100,  // ✅ ADDED for iOS priority
//   },
//   // startButton: {
//   //   backgroundColor: "#2196f3",
//   //   position: "absolute",
//   //   bottom: 20,
//   //   left: 16,
//   //   right: 16,
//   // },
//   // completeButton: {
//   //   backgroundColor: "#ff9800",
//   //   position: "absolute",
//   //   bottom: 20,
//   //   left: 16,
//   //   right: 16,
//   // },
//   // logoutButton: {
//   //   backgroundColor: "#dc3545",
//   //   position: "absolute",
//   //   bottom: 20,
//   //   left: 16,
//   //   right: 16,
//   // },










//   btnText: {
//     color: "#fff",
//     fontWeight: "600",
//     fontSize: 15,
//   },








//   // modalOverlay: {
//   //   flex: 1,
//   //   justifyContent: "center",
//   //   alignItems: "center",
//   //   backgroundColor: "rgba(0,0,0,0.7)",
//   //   padding: 20,
//   // },
//   // modalContainer: {
//   //   backgroundColor: "white",
//   //   padding: 24,
//   //   borderRadius: 20,
//   //   width: "100%",
//   //   elevation: 12,
//   //   shadowColor: "#000",
//   //   shadowOffset: { width: 0, height: 6 },
//   //   shadowOpacity: 0.3,
//   //   shadowRadius: 12,
//   // },


//   modalOverlay: {
//     flex: 1,
//     justifyContent: "center",
//     alignItems: "center",
//     backgroundColor: "rgba(0,0,0,0.7)",
//     padding: 20,
//     zIndex: 999, // ✅ ADD THIS: Force it to be the top-most layer
//   },
//   modalContainer: {
//     backgroundColor: "white",
//     padding: 24,
//     borderRadius: 20,
//     width: "100%",
//     elevation: 99, // ✅ INCREASED from 12: Must be higher than maximizedDetailsContainer (16)
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: 6 },
//     shadowOpacity: 0.3,
//     shadowRadius: 12,
//     zIndex: 1000, // ✅ ADD THIS
//   },












//   modalHeader: {
//     marginBottom: 24,
//   },
//   modalTitle: {
//     fontSize: 24,
//     fontWeight: "700",
//     textAlign: "center",
//     color: "#333",
//     marginBottom: 8,
//   },
//   modalSubtitle: {
//     fontSize: 14,
//     color: "#666",
//     textAlign: "center",
//     lineHeight: 20,
//   },
//   otpInput: {
//     borderWidth: 2,
//     borderColor: "#e0e0e0",
//     borderRadius: 12,
//     marginVertical: 16,
//     padding: 20,
//     fontSize: 20,
//     textAlign: "center",
//     fontWeight: "700",
//     backgroundColor: "#f8f9fa",
//     color: "#333",
//   },
//   modalButtons: {
//     flexDirection: "row",
//     marginTop: 8,
//     gap: 12,
//   },
//   modalButton: {
//     flex: 1,
//     padding: 16,
//     borderRadius: 12,
//     alignItems: "center",
//     elevation: 4,
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.1,
//     shadowRadius: 4,
//   },
//   cancelModalButton: {
//     backgroundColor: "#757575",
//   },
//   confirmModalButton: {
//     backgroundColor: "#4caf50",
//   },
//   modalButtonText: {
//     color: "#fff",
//     fontWeight: "600",
//     fontSize: 16,
//   },
//   billCard: {
//     backgroundColor: "#F8F9FA",
//     borderRadius: 16,
//     padding: 20,
//     marginBottom: 20,
//   },
//   billSection: {
//     marginBottom: 20,
//   },
//   billSectionTitle: {
//     fontSize: 16,
//     fontWeight: "bold",
//     color: "#333",
//     marginBottom: 12,
//   },
//   billRow: {
//     flexDirection: "row",
//     justifyContent: "space-between",
//     alignItems: "center",
//     marginBottom: 8,
//   },
//   billLabel: {
//     fontSize: 14,
//     color: "#666666",
//     fontWeight: "500",
//   },
//   billValue: {
//     fontSize: 14,
//     fontWeight: "bold",
//     color: "#333333",
//   },
//   billDivider: {
//     height: 1,
//     backgroundColor: "#DDDDDD",
//     marginVertical: 12,
//   },
//   billTotalLabel: {
//     fontSize: 16,
//     fontWeight: "bold",
//     color: "#333333",
//   },
//   billTotalValue: {
//     fontSize: 18,
//     fontWeight: "bold",
//     color: "#4CAF50",
//   },
//   confirmButton: {
//     backgroundColor: "#4CAF50",
//     paddingVertical: 16,
//     borderRadius: 12,
//     alignItems: "center",
//     elevation: 6,
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: 4 },
//     shadowOpacity: 0.3,
//     shadowRadius: 8,
//   },
//   confirmButtonText: {
//     fontSize: 16,
//     fontWeight: "600",
//     color: "#FFFFFF",
//   },
//   errorContainer: {
//     flex: 1,
//     justifyContent: "center",
//     alignItems: "center",
//     backgroundColor: "#ffffff",
//     padding: 20,
//   },
//   errorText: {
//     fontSize: 16,
//     color: "#f44336",
//     marginBottom: 20,
//     textAlign: "center",
//     lineHeight: 22,
//   },
//   retryButton: {
//     backgroundColor: "#4caf50",
//     paddingVertical: 12,
//     paddingHorizontal: 24,
//     borderRadius: 8,
//     elevation: 2,
//   },
//   retryText: {
//     color: "#fff",
//     fontWeight: "600",
//     fontSize: 15,
//   },
//   blackDotMarker: {
//     backgroundColor: "rgba(0, 0, 0, 0.9)",
//     width: 14,
//     height: 14,
//     borderRadius: 12,
//     justifyContent: "center",
//     alignItems: "center",
//     borderWidth: 3,
//     shadowColor: "#000",
//     shadowOffset: { width: 0, height: 3 },
//     shadowOpacity: 0.1,
//     shadowRadius: 4,
//   },
//   blackDotInner: {
//     backgroundColor: "#000000",
//     width: 12,
//     height: 12,
//     borderRadius: 6,
//   },
//   modalIconContainer: {
//     alignItems: "center",
//     marginBottom: 15,
//   },
//   modalMessage: {
//     fontSize: 16,
//     color: "#333",
//     textAlign: "center",
//     marginBottom: 20,
//   },
//   billDetailsContainer: {
//     width: "100%",
//     backgroundColor: "#F5F5F5",
//     borderRadius: 10,
//     padding: 15,
//     marginBottom: 15,
//   },
//   modalConfirmButton: {
//     backgroundColor: "#4CAF50",
//     paddingVertical: 12,
//     borderRadius: 10,
//     alignItems: "center",
//   },
//   modalConfirmButtonText: {
//     fontSize: 16,
//     fontWeight: "600",
//     color: "#FFFFFF",
//   },
//   // Top Navigation Buttons
//   menuButton: {
//     position: 'absolute',
//     top: 50,
//     left: 20,
//     width: 50,
//     height: 50,
//     borderRadius: 25,
//     backgroundColor: '#2ecc71',
//     justifyContent: 'center',
//     alignItems: 'center',
//     elevation: 5,
//     shadowColor: '#000',
//     shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.3,
//     shadowRadius: 4,
//     zIndex: 10,
//   },
//   logoutButton: {
//     position: 'absolute',
//     top: 50,
//     right: 20,
//     width: 50,
//     height: 50,
//     borderRadius: 25,
//     backgroundColor: '#e74c3c',
//     justifyContent: 'center',
//     alignItems: 'center',
//     elevation: 5,
//     shadowColor: '#000',
//     shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.3,
//     shadowRadius: 4,
//     zIndex: 10,
//   },
//   // Profile Modal Styles
//   profileModalOverlay: {
//     flex: 1,
//     backgroundColor: 'rgba(0, 0, 0, 0.5)',
//     justifyContent: 'flex-end',
//   },
//   profileModalContainer: {
//     backgroundColor: '#fff',
//     borderTopLeftRadius: 25,
//     borderTopRightRadius: 25,
//     maxHeight: '85%',
//     paddingBottom: 20,
//   },
//   profileModalHeader: {
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//     alignItems: 'center',
//     padding: 20,
//     borderBottomWidth: 1,
//     borderBottomColor: '#e0e0e0',
//   },
//   profileModalTitle: {
//     fontSize: 22,
//     fontWeight: '700',
//     color: '#2c3e50',
//   },
//   profileModalContent: {
//     paddingHorizontal: 20,
//     paddingTop: 20,
//   },
//   profileAvatarContainer: {
//     alignItems: 'center',
//     marginBottom: 30,
//   },
//   profileAvatar: {
//     width: 100,
//     height: 100,
//     borderRadius: 50,
//     backgroundColor: '#2ecc71',
//     justifyContent: 'center',
//     alignItems: 'center',
//     marginBottom: 12,
//     elevation: 4,
//     shadowColor: '#2ecc71',
//     shadowOffset: { width: 0, height: 4 },
//     shadowOpacity: 0.3,
//     shadowRadius: 8,
//   },
//   ratingContainer: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     backgroundColor: '#fff3cd',
//     paddingHorizontal: 12,
//     paddingVertical: 6,
//     borderRadius: 20,
//     elevation: 2,
//   },
//   ratingText: {
//     fontSize: 16,
//     fontWeight: '700',
//     color: '#856404',
//     marginLeft: 6,
//   },
//   profileInfoSection: {
//     backgroundColor: '#f8f9fa',
//     borderRadius: 16,
//     padding: 16,
//     marginBottom: 16,
//     borderWidth: 1,
//     borderColor: '#e9ecef',
//   },
//   profileInfoRow: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     marginBottom: 8,
//   },
//   profileInfoLabel: {
//     fontSize: 12,
//     color: '#7f8c8d',
//     fontWeight: '600',
//     textTransform: 'uppercase',
//     letterSpacing: 0.5,
//     marginLeft: 8,
//   },
//   profileInfoValue: {
//     fontSize: 16,
//     color: '#2c3e50',
//     fontWeight: '500',
//     marginTop: 4,
//   },

//   // ========================================
//   // 🌟 ULTRA PROFESSIONAL OFFLINE MODAL 🌟
//   // ========================================
//   ultraProfessionalOverlay: {
//     flex: 1,
//     backgroundColor: 'rgba(0, 0, 0, 0.85)',
//     justifyContent: 'center',
//     alignItems: 'center',
//     padding: 16,
//   },
//   ultraProfessionalModal: {
//     backgroundColor: '#ffffff',
//     borderRadius: 20,
//     width: '85%',
//     maxWidth: 340,
//     shadowColor: '#000',
//     shadowOffset: { width: 0, height: 10 },
//     shadowOpacity: 0.3,
//     shadowRadius: 20,
//     elevation: 15,
//     overflow: 'hidden',
//   },
//   ultraModalHeader: {
//     backgroundColor: '#e74c3c',
//     paddingTop: 24,
//     paddingBottom: 20,
//     alignItems: 'center',
//     position: 'relative',
//   },
//   ultraIconContainer: {
//     position: 'relative',
//     alignItems: 'center',
//     justifyContent: 'center',
//   },
//   ultraIconPulse: {
//     position: 'absolute',
//     width: 120,
//     height: 120,
//     borderRadius: 60,
//     backgroundColor: 'rgba(255, 255, 255, 0.15)',
//   },
//   ultraIconCircle: {
//     width: 100,
//     height: 100,
//     borderRadius: 50,
//     backgroundColor: 'rgba(255, 255, 255, 0.25)',
//     justifyContent: 'center',
//     alignItems: 'center',
//     borderWidth: 4,
//     borderColor: 'rgba(255, 255, 255, 0.4)',
//     shadowColor: '#000',
//     shadowOffset: { width: 0, height: 8 },
//     shadowOpacity: 0.3,
//     shadowRadius: 12,
//     elevation: 8,
//   },
//   ultraModalContent: {
//     padding: 24,
//   },
//   ultraModalTitle: {
//     fontSize: 26,
//     fontWeight: 'bold',
//     color: '#2c3e50',
//     textAlign: 'center',
//     marginBottom: 8,
//     letterSpacing: 0.5,
//   },
//   ultraModalSubtitle: {
//     fontSize: 14,
//     color: '#7f8c8d',
//     textAlign: 'center',
//     marginBottom: 20,
//   },
//   ultraDivider: {
//     height: 2,
//     backgroundColor: '#ecf0f1',
//     marginBottom: 20,
//     borderRadius: 1,
//   },
//   ultraAmountCard: {
//     backgroundColor: '#fff',
//     borderRadius: 16,
//     marginBottom: 16,
//     borderWidth: 2,
//     borderColor: '#e74c3c',
//     overflow: 'hidden',
//     shadowColor: '#e74c3c',
//     shadowOffset: { width: 0, height: 4 },
//     shadowOpacity: 0.2,
//     shadowRadius: 8,
//     elevation: 5,
//   },
//   ultraAmountHeader: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     backgroundColor: '#e74c3c',
//     paddingVertical: 14,
//     paddingHorizontal: 16,
//     gap: 10,
//   },
//   ultraAmountHeaderText: {
//     fontSize: 16,
//     fontWeight: 'bold',
//     color: '#fff',
//     letterSpacing: 0.5,
//   },
//   ultraAmountBody: {
//     padding: 16,
//     backgroundColor: '#fff',
//   },
//   ultraAmountRow: {
//     flexDirection: 'row',
//     justifyContent: 'space-between',
//     alignItems: 'center',
//     marginBottom: 12,
//   },
//   ultraAmountLabel: {
//     fontSize: 14,
//     color: '#7f8c8d',
//     fontWeight: '600',
//   },
//   ultraAmountValue: {
//     fontSize: 22,
//     fontWeight: 'bold',
//     color: '#e74c3c',
//     letterSpacing: 0.5,
//   },
//   ultraAmountInfo: {
//     fontSize: 14,
//     fontWeight: '600',
//     color: '#3498db',
//   },
//   ultraWarningCard: {
//     backgroundColor: '#fff9e6',
//     borderRadius: 14,
//     marginBottom: 16,
//     borderLeftWidth: 5,
//     borderLeftColor: '#f39c12',
//     overflow: 'hidden',
//     shadowColor: '#f39c12',
//     shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.15,
//     shadowRadius: 6,
//     elevation: 3,
//   },
//   ultraWarningHeader: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     paddingVertical: 12,
//     paddingHorizontal: 14,
//     backgroundColor: '#fef5e7',
//     gap: 10,
//   },
//   ultraWarningIconCircle: {
//     width: 28,
//     height: 28,
//     borderRadius: 14,
//     backgroundColor: '#f39c12',
//     justifyContent: 'center',
//     alignItems: 'center',
//   },
//   ultraWarningHeaderText: {
//     fontSize: 15,
//     fontWeight: 'bold',
//     color: '#e67e22',
//   },
//   ultraWarningBody: {
//     padding: 14,
//   },
//   ultraWarningPoint: {
//     flexDirection: 'row',
//     alignItems: 'flex-start',
//     marginBottom: 10,
//     gap: 10,
//   },
//   ultraWarningPointText: {
//     flex: 1,
//     fontSize: 13,
//     color: '#5d4e37',
//     lineHeight: 20,
//     fontWeight: '500',
//   },
//   ultraWarningPointTextGreen: {
//     flex: 1,
//     fontSize: 13,
//     color: '#27ae60',
//     lineHeight: 20,
//     fontWeight: '600',
//   },
//   ultraVerificationCard: {
//     backgroundColor: '#f0f8ff',
//     borderRadius: 14,
//     padding: 16,
//     borderWidth: 1,
//     borderColor: '#d6eaf8',
//   },
//   ultraVerificationHeader: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     marginBottom: 12,
//     gap: 8,
//   },
//   ultraVerificationTitle: {
//     fontSize: 15,
//     fontWeight: 'bold',
//     color: '#2980b9',
//   },
//   ultraVerificationLabel: {
//     fontSize: 13,
//     color: '#5d6d7e',
//     marginBottom: 12,
//     fontWeight: '500',
//   },
//   ultraInputContainer: {
//     flexDirection: 'row',
//     alignItems: 'center',
//     backgroundColor: '#fff',
//     borderRadius: 12,
//     borderWidth: 2,
//     borderColor: '#3498db',
//     paddingHorizontal: 14,
//     gap: 10,
//   },
//   ultraDriverIdInput: {
//     flex: 1,
//     paddingVertical: 14,
//     fontSize: 20,
//     fontWeight: 'bold',
//     letterSpacing: 4,
//     color: '#2c3e50',
//     textAlign: 'center',
//   },
//   ultraButtonContainer: {
//     flexDirection: 'row',
//     padding: 20,
//     gap: 12,
//     backgroundColor: '#f8f9fa',
//     borderTopWidth: 1,
//     borderTopColor: '#ecf0f1',
//   },
//   ultraCancelButton: {
//     flex: 1,
//     flexDirection: 'row',
//     alignItems: 'center',
//     justifyContent: 'center',
//     backgroundColor: '#ecf0f1',
//     paddingVertical: 16,
//     borderRadius: 14,
//     gap: 8,
//     borderWidth: 2,
//     borderColor: '#bdc3c7',
//     shadowColor: '#95a5a6',
//     shadowOffset: { width: 0, height: 3 },
//     shadowOpacity: 0.2,
//     shadowRadius: 4,
//     elevation: 3,
//   },
//   ultraCancelButtonText: {
//     fontSize: 16,
//     fontWeight: 'bold',
//     color: '#7f8c8d',
//     letterSpacing: 0.5,
//   },
//   ultraConfirmButton: {
//     flex: 1,
//     flexDirection: 'row',
//     alignItems: 'center',
//     justifyContent: 'center',
//     backgroundColor: '#e74c3c',
//     paddingVertical: 16,
//     borderRadius: 14,
//     gap: 8,
//     shadowColor: '#c0392b',
//     shadowOffset: { width: 0, height: 4 },
//     shadowOpacity: 0.3,
//     shadowRadius: 6,
//     elevation: 5,
//   },
//   ultraConfirmButtonText: {
//     fontSize: 16,
//     fontWeight: 'bold',
//     color: '#fff',
//     letterSpacing: 0.5,
//   },

//   // ========================================
//   // COMPACT MODAL STYLES (Medium Size, Two-Step)
//   // ========================================
//   compactModalContent: {
//     padding: 20,
//   },
//   compactModalTitle: {
//     fontSize: 22,
//     fontWeight: 'bold',
//     color: '#2c3e50',
//     textAlign: 'center',
//     marginBottom: 16,
//   },
//   warningDescriptionText: {
//     fontSize: 15,
//     color: '#555',
//     textAlign: 'center',
//     marginBottom: 12,
//     lineHeight: 22,
//   },
//   warningQuestionText: {
//     fontSize: 16,
//     fontWeight: '600',
//     color: '#e74c3c',
//     textAlign: 'center',
//     marginTop: 8,
//     marginBottom: 4,
//   },
//   verificationDescriptionText: {
//     fontSize: 14,
//     color: '#666',
//     textAlign: 'center',
//     marginBottom: 20,
//     lineHeight: 20,
//   },
//   compactVerificationBox: {
//     marginBottom: 4,
//   },
//   compactDriverIdInput: {
//     backgroundColor: '#f8f9fa',
//     borderWidth: 2,
//     borderColor: '#3498db',
//     borderRadius: 10,
//     paddingVertical: 14,
//     paddingHorizontal: 16,
//     fontSize: 20,
//     fontWeight: 'bold',
//     textAlign: 'center',
//     letterSpacing: 6,
//     color: '#2c3e50',
//   },
//   compactButtonContainer: {
//     flexDirection: 'row',
//     paddingHorizontal: 20,
//     paddingVertical: 16,
//     gap: 12,
//     backgroundColor: '#f8f9fa',
//     borderTopWidth: 1,
//     borderTopColor: '#e9ecef',
//   },
//   compactCancelButton: {
//     flex: 1,
//     backgroundColor: '#e9ecef',
//     paddingVertical: 14,
//     borderRadius: 10,
//     alignItems: 'center',
//     borderWidth: 1,
//     borderColor: '#ced4da',
//   },
//   compactCancelText: {
//     fontSize: 15,
//     fontWeight: '600',
//     color: '#6c757d',
//   },
//   compactConfirmButton: {
//     flex: 1,
//     backgroundColor: '#e74c3c',
//     paddingVertical: 14,
//     borderRadius: 10,
//     alignItems: 'center',
//   },
//   compactConfirmText: {
//     fontSize: 15,
//     fontWeight: '600',
//     color: '#fff',
//   },
// });







































































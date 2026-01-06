/**
 * @format
 */

import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, AndroidVisibility, EventType } from '@notifee/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from './App';
import { name as appName } from './app.json';

// ✅ CRITICAL: Background FCM Message Handler
// This runs even when app is killed/background
messaging().setBackgroundMessageHandler(async (remoteMessage) => {
  console.log('🔔 Background FCM Message received:', remoteMessage);

  try {
    const data = remoteMessage.data;

    // Check if this is a ride request
    if (data?.type === 'rideRequest' && data?.rideId) {
      console.log('🚗 Background: Ride request received:', data.rideId);

      // Store pending ride request for later processing
      await AsyncStorage.setItem('pendingRideRequest', JSON.stringify({
        ...data,
        receivedAt: new Date().toISOString(),
      }));

      // Create high-priority notification channel
      const channelId = await notifee.createChannel({
        id: 'ride_requests',
        name: 'Ride Requests',
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        sound: 'default',
        vibration: true,
        vibrationPattern: [300, 500, 300, 500],
      });

      // Display full-screen notification for ride request
      await notifee.displayNotification({
        title: '🚗 New Ride Request!',
        body: `Pickup: ${data.pickupLocation || 'Unknown'}\nDistance: ${data.distance || 'N/A'}`,
        data: {
          ...data,
          action: 'rideRequest',
        },
        android: {
          channelId,
          importance: AndroidImportance.HIGH,
          visibility: AndroidVisibility.PUBLIC,
          pressAction: {
            id: 'open_ride_request',
            launchActivity: 'default',
          },
          fullScreenAction: {
            id: 'full_screen_ride',
            launchActivity: 'default',
          },
          sound: 'default',
          vibrationPattern: [300, 500, 300, 500],
          autoCancel: false,
          ongoing: true, // Makes it persistent
          category: 'call', // High priority category
          actions: [
            {
              title: '✅ Accept',
              pressAction: {
                id: 'accept_ride',
              },
            },
            {
              title: '❌ Reject',
              pressAction: {
                id: 'reject_ride',
              },
            },
          ],
        },
      });

      console.log('✅ Background: Notification displayed for ride:', data.rideId);
    } else {
      // Handle other notification types
      const channelId = await notifee.createChannel({
        id: 'default',
        name: 'Default Notifications',
        importance: AndroidImportance.DEFAULT,
      });

      await notifee.displayNotification({
        title: remoteMessage.notification?.title || 'Notification',
        body: remoteMessage.notification?.body || '',
        data: remoteMessage.data,
        android: {
          channelId,
          sound: 'default',
          pressAction: {
            id: 'default',
          },
        },
      });
    }
  } catch (error) {
    console.error('❌ Error handling background FCM message:', error);
  }
});

// ✅ Handle notification interactions (background & foreground)
notifee.onBackgroundEvent(async ({ type, detail }) => {
  console.log('🔔 Notifee background event:', type, detail);

  try {
    if (type === EventType.PRESS) {
      console.log('📱 User tapped notification:', detail.notification);

      // Store that user wants to see ride request
      if (detail.notification?.data?.action === 'rideRequest') {
        await AsyncStorage.setItem('openRideRequest', 'true');
        await AsyncStorage.setItem('pendingRideRequest', JSON.stringify(detail.notification.data));
      }
    }

    if (type === EventType.ACTION_PRESS) {
      const { pressAction, notification } = detail;
      console.log('🔘 User pressed action:', pressAction?.id);

      if (pressAction?.id === 'accept_ride') {
        // Store acceptance intent
        await AsyncStorage.setItem('rideActionIntent', JSON.stringify({
          action: 'accept',
          rideId: notification?.data?.rideId,
          timestamp: new Date().toISOString(),
        }));

        // Dismiss notification
        if (notification?.id) {
          await notifee.cancelNotification(notification.id);
        }

        console.log('✅ Ride acceptance intent stored');
      } else if (pressAction?.id === 'reject_ride') {
        // Store rejection intent
        await AsyncStorage.setItem('rideActionIntent', JSON.stringify({
          action: 'reject',
          rideId: notification?.data?.rideId,
          timestamp: new Date().toISOString(),
        }));

        // Dismiss notification
        if (notification?.id) {
          await notifee.cancelNotification(notification.id);
        }

        console.log('✅ Ride rejection intent stored');
      }
    }
  } catch (error) {
    console.error('❌ Error handling notifee event:', error);
  }
});

// Register main app component
AppRegistry.registerComponent(appName, () => App);

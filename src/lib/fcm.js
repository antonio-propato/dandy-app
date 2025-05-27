// src/lib/fcm.js
import { getMessaging, getToken, onMessage } from 'firebase/messaging'
import { doc, updateDoc, arrayUnion, arrayRemove, getDoc } from 'firebase/firestore'
import { firestore } from './firebase'

const messaging = getMessaging()

// Your Firebase project's VAPID key - get this from Firebase Console > Project Settings > Cloud Messaging
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY

class FCMManager {
  constructor() {
    this.currentToken = null
    this.onMessageCallback = null
  }

  // Initialize FCM and request permission
  async initialize(userId) {
    try {
      // Check if notifications are supported
      if (!('Notification' in window)) {
        console.log('This browser does not support notifications')
        return false
      }

      // Check if service worker is supported
      if (!('serviceWorker' in navigator)) {
        console.log('Service Worker not supported')
        return false
      }

      // Register service worker
      await this.registerServiceWorker()

      // Request permission
      const permission = await this.requestPermission()
      if (permission !== 'granted') {
        console.log('Notification permission denied')
        return false
      }

      // Get FCM token
      const token = await this.getToken()
      if (token && userId) {
        await this.saveTokenToFirestore(userId, token)
      }

      // Listen for foreground messages
      this.setupForegroundMessageListener()

      return true
    } catch (error) {
      console.error('FCM initialization failed:', error)
      return false
    }
  }

  // Register service worker
  async registerServiceWorker() {
    try {
      const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js')
      console.log('Service Worker registered:', registration)
      return registration
    } catch (error) {
      console.error('Service Worker registration failed:', error)
      throw error
    }
  }

  // Request notification permission
  async requestPermission() {
    try {
      let permission = Notification.permission

      if (permission === 'default') {
        permission = await Notification.requestPermission()
      }

      return permission
    } catch (error) {
      console.error('Permission request failed:', error)
      return 'denied'
    }
  }

  // Get FCM token
  async getToken() {
    try {
      const token = await getToken(messaging, { vapidKey: VAPID_KEY })
      this.currentToken = token
      console.log('FCM Token:', token)
      return token
    } catch (error) {
      console.error('Failed to get FCM token:', error)
      return null
    }
  }

  // Save token to Firestore (and clean up old tokens)
  async saveTokenToFirestore(userId, token) {
    try {
      const userRef = doc(firestore, 'users', userId)

      // Get current user document to check existing tokens
      const userDoc = await getDoc(userRef)
      const userData = userDoc.data()
      const currentTokens = userData?.fcmTokens || []

      // Only add token if it doesn't already exist
      if (!currentTokens.includes(token)) {
        // Keep only the latest token (remove old ones)
        await updateDoc(userRef, {
          fcmTokens: [token], // Replace with single current token
          lastTokenUpdate: new Date().toISOString()
        })
        console.log('FCM token saved to Firestore (duplicates removed)')
      } else {
        console.log('FCM token already exists, no update needed')
      }
    } catch (error) {
      console.error('Failed to save FCM token:', error)
    }
  }

  // Remove token from Firestore (when user logs out)
  async removeTokenFromFirestore(userId, token) {
    try {
      const userRef = doc(firestore, 'users', userId)
      await updateDoc(userRef, {
        fcmTokens: arrayRemove(token)
      })
      console.log('FCM token removed from Firestore')
    } catch (error) {
      console.error('Failed to remove FCM token:', error)
    }
  }

  // Setup foreground message listener
  setupForegroundMessageListener() {
    onMessage(messaging, (payload) => {
      console.log('Foreground message received:', payload)

      // When app is in foreground, don't show system notification
      // to avoid duplicates with the service worker notification
      console.log('Message received while app is open - letting service worker handle notification')

      // If you have a custom callback (for in-app notifications), use it
      if (this.onMessageCallback) {
        this.onMessageCallback(payload)
      }

      // Don't call showForegroundNotification to avoid duplicates
    })
  }

  // Show notification when app is in foreground (DISABLED to prevent duplicates)
  showForegroundNotification(payload) {
    console.log('🔔 showForegroundNotification called - but disabled to prevent duplicates')

    // This method is now disabled to prevent duplicate notifications
    // The service worker will handle all notifications
    return
  }

  // Set custom message handler
  setOnMessageCallback(callback) {
    this.onMessageCallback = callback
  }

  // Clean up when user logs out
  async cleanup(userId) {
    if (this.currentToken && userId) {
      await this.removeTokenFromFirestore(userId, this.currentToken)
    }
    this.currentToken = null
    this.onMessageCallback = null
  }

  // Test notification method for debugging
  async testNotification() {
    console.log('🧪 Testing notification...')

    if (Notification.permission === 'granted') {
      try {
        const notification = new Notification('Test Notification', {
          body: 'This is a test notification from Dandy!',
          icon: '/images/favicon.png',
          tag: 'test'
        })

        notification.onshow = () => {
          console.log('✅ Test notification shown successfully')
        }

        notification.onerror = (error) => {
          console.error('❌ Test notification error:', error)
        }

        console.log('✅ Test notification created')
      } catch (error) {
        console.error('💥 Error creating test notification:', error)
      }
    } else {
      console.error('❌ Test notification failed - permission not granted:', Notification.permission)
    }
  }
}

// Export singleton instance
export const fcmManager = new FCMManager()

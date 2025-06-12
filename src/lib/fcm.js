// Clean FCM Manager - v4.0.0
import { getMessaging, getToken, onMessage } from 'firebase/messaging'
import { doc, updateDoc, getDoc, arrayUnion, arrayRemove } from 'firebase/firestore'
import { firestore } from './firebase'

const messaging = getMessaging()
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY

class FCMManager {
  constructor() {
    this.currentToken = null
    this.onMessageCallback = null
    this.isInitialized = false // Make sure this property exists
  }

  // Initialize FCM and request permission
  async initialize(userId) {
    if (this.isInitialized) {
      console.log('FCM already initialized')
      return true
    }

    try {
      console.log('🔥 Initializing FCM...')

      // Check browser support
      if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        console.log('❌ Browser does not support notifications or service workers')
        return false
      }

      // Register service worker
      await this.registerServiceWorker()

      // Request permission
      const permission = await this.requestPermission()
      if (permission !== 'granted') {
        console.log('❌ Notification permission denied')
        return false
      }

      // Get FCM token
      const token = await this.getToken()
      if (token && userId) {
        await this.saveTokenToFirestore(userId, token)
      }

      // Setup foreground message listener
      this.setupForegroundMessageListener()

      this.isInitialized = true
      console.log('✅ FCM initialized successfully')
      return true

    } catch (error) {
      console.error('💥 FCM initialization failed:', error)
      return false
    }
  }

  // Register service worker
  async registerServiceWorker() {
    try {
      const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
        scope: '/'
      })

      console.log('✅ Service Worker registered successfully')

      // Wait for service worker to be ready
      await navigator.serviceWorker.ready

      return registration
    } catch (error) {
      console.error('❌ Service Worker registration failed:', error)
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

      console.log(`🔔 Notification permission: ${permission}`)
      return permission
    } catch (error) {
      console.error('❌ Permission request failed:', error)
      return 'denied'
    }
  }

  // Get FCM token
  async getToken() {
    try {
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: await navigator.serviceWorker.ready
      })

      if (token) {
        this.currentToken = token
        console.log('✅ FCM Token retrieved')
        return token
      } else {
        console.log('❌ No FCM token available')
        return null
      }
    } catch (error) {
      console.error('❌ Failed to get FCM token:', error)
      return null
    }
  }

  // Save token to Firestore (clean implementation)
  async saveTokenToFirestore(userId, token) {
    try {
      const userRef = doc(firestore, 'users', userId)
      const userDoc = await getDoc(userRef)

      if (!userDoc.exists()) {
        console.error('❌ User document does not exist')
        return
      }

      const userData = userDoc.data()
      const currentTokens = userData.fcmTokens || []

      // Only update if token is not already present
      if (!currentTokens.includes(token)) {
        // Remove duplicate tokens and add the new one
        const uniqueTokens = [...new Set([...currentTokens, token])]

        // Keep only the latest 3 tokens per user (mobile + desktop + backup)
        const latestTokens = uniqueTokens.slice(-3)

        await updateDoc(userRef, {
          fcmTokens: latestTokens,
          lastTokenUpdate: new Date().toISOString()
        })

        console.log('✅ FCM token saved to Firestore')
      } else {
        console.log('ℹ️ FCM token already exists in Firestore')
      }
    } catch (error) {
      console.error('❌ Failed to save FCM token:', error)
    }
  }

  // Remove token from Firestore
  async removeTokenFromFirestore(userId) {
    if (!this.currentToken || !userId) return

    try {
      const userRef = doc(firestore, 'users', userId)
      await updateDoc(userRef, {
        fcmTokens: arrayRemove(this.currentToken),
        lastTokenUpdate: new Date().toISOString()
      })
      console.log('✅ FCM token removed from Firestore')
    } catch (error) {
      console.error('❌ Failed to remove FCM token:', error)
    }
  }

  // Setup foreground message listener
  setupForegroundMessageListener() {
    onMessage(messaging, (payload) => {
      console.log('🔔 Foreground message received:', payload)

      // When app is in foreground, we have two options:
      // 1. Let the service worker handle it (recommended to avoid duplicates)
      // 2. Show custom in-app notification

      // Option 1: Do nothing - let service worker handle
      console.log('ℹ️ App is in foreground - service worker will handle notification')

      // Option 2: Show custom in-app notification
      if (this.onMessageCallback) {
        this.onMessageCallback(payload)
      }

      // DON'T call showNotification here to avoid duplicates
    })
  }

  // Set custom message handler for in-app notifications
  setOnMessageCallback(callback) {
    this.onMessageCallback = callback
  }

  // Clean up when user logs out
  async cleanup(userId) {
    try {
      if (this.currentToken && userId) {
        await this.removeTokenFromFirestore(userId)
      }

      this.currentToken = null
      this.onMessageCallback = null
      this.isInitialized = false

      console.log('✅ FCM cleanup completed')
    } catch (error) {
      console.error('❌ FCM cleanup failed:', error)
    }
  }

  // Test notification (for debugging)
  async testNotification(title = 'Test Notification', body = 'This is a test from Dandy!') {
    if (Notification.permission !== 'granted') {
      console.error('❌ Notification permission not granted')
      return false
    }

    try {
      // Create a simple browser notification for testing
      const notification = new Notification(title, {
        body,
        icon: '/images/favicon.png',
        tag: 'test-notification'
      })

      notification.onclick = () => {
        console.log('🔔 Test notification clicked')
        notification.close()
      }

      console.log('✅ Test notification shown')
      return true
    } catch (error) {
      console.error('❌ Test notification failed:', error)
      return false
    }
  }

  // Get current permission status
  getPermissionStatus() {
    return Notification.permission
  }

  // Check if notifications are supported
  isSupported() {
    return 'Notification' in window && 'serviceWorker' in navigator
  }

  // Get current token (useful for debugging)
  getCurrentToken() {
    return this.currentToken
  }
}

// Export singleton instance
export const fcmManager = new FCMManager()

// Export class for testing
export { FCMManager }

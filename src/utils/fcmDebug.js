// FCM Debug Helper - Create as src/utils/fcmDebug.js
import { doc, updateDoc, getDoc } from 'firebase/firestore'
import { firestore } from '../lib/firebase'
import { fcmManager } from '../lib/fcm'

export class FCMDebugHelper {

  // Clean invalid tokens from user profile
  static async cleanUserTokens(userId) {
    try {
      console.log('🧹 Cleaning FCM tokens for user:', userId)

      const userRef = doc(firestore, 'users', userId)
      const userDoc = await getDoc(userRef)

      if (!userDoc.exists()) {
        console.error('❌ User not found')
        return false
      }

      const userData = userDoc.data()
      const currentTokens = userData.fcmTokens || []

      console.log('📋 Current tokens count:', currentTokens.length)

      // Clear all tokens
      await updateDoc(userRef, {
        fcmTokens: [],
        lastTokenCleanup: new Date().toISOString()
      })

      console.log('✅ All tokens cleared from user profile')
      return true

    } catch (error) {
      console.error('❌ Error cleaning tokens:', error)
      return false
    }
  }

  // Get fresh FCM token and save it
  static async refreshUserToken(userId) {
    try {
      console.log('🔄 Refreshing FCM token for user:', userId)

      // Clean old tokens first
      await this.cleanUserTokens(userId)

      // Initialize FCM and get new token
      const success = await fcmManager.initialize(userId)

      if (success) {
        console.log('✅ FCM token refreshed successfully')

        // Get the new token
        const newToken = fcmManager.getCurrentToken()
        console.log('🔑 New token obtained:', newToken ? 'Yes' : 'No')

        return true
      } else {
        console.log('❌ Failed to refresh FCM token')
        return false
      }

    } catch (error) {
      console.error('❌ Error refreshing token:', error)
      return false
    }
  }

  // Debug current FCM status
  static async debugFCMStatus(userId) {
    try {
      console.log('🔍 === FCM DEBUG STATUS ===')

      // Check browser support
      console.log('🌐 Browser support:')
      console.log('  - Notifications:', 'Notification' in window)
      console.log('  - Service Worker:', 'serviceWorker' in navigator)
      console.log('  - Permission:', Notification.permission)

      // Check service worker
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        console.log('🔧 Service Workers:', registrations.length)
        registrations.forEach((reg, i) => {
          console.log(`  ${i + 1}. ${reg.scope} - ${reg.active ? 'Active' : 'Inactive'}`)
        })
      }

      // Check user tokens in Firestore
      if (userId) {
        const userRef = doc(firestore, 'users', userId)
        const userDoc = await getDoc(userRef)

        if (userDoc.exists()) {
          const userData = userDoc.data()
          const tokens = userData.fcmTokens || []
          console.log('💾 Stored tokens:', tokens.length)
          tokens.forEach((token, i) => {
            console.log(`  ${i + 1}. ${token.substring(0, 20)}...`)
          })
        }
      }

      // Check FCM manager state
      console.log('🎯 FCM Manager:')
      console.log('  - Initialized:', fcmManager.isInitialized || false)
      console.log('  - Current token:', fcmManager.getCurrentToken() ? 'Present' : 'None')
      console.log('  - Supported:', fcmManager.isSupported())

      console.log('🔍 === END DEBUG ===')

    } catch (error) {
      console.error('❌ Debug error:', error)
    }
  }

  // Test browser notification (without FCM)
  static async testBrowserNotification() {
    try {
      console.log('🧪 Testing browser notification...')

      if (Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          console.log('❌ Permission not granted')
          return false
        }
      }

      const notification = new Notification('Test Notification 🧪', {
        body: 'This is a direct browser notification test',
        icon: '/images/favicon.png',
        tag: 'test-browser-notification'
      })

      notification.onclick = () => {
        console.log('🔔 Browser notification clicked')
        notification.close()
      }

      // Auto close after 5 seconds
      setTimeout(() => {
        notification.close()
      }, 5000)

      console.log('✅ Browser notification sent')
      return true

    } catch (error) {
      console.error('❌ Browser notification failed:', error)
      return false
    }
  }
}

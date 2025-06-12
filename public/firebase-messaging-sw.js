// Clean Firebase Messaging Service Worker - v4.0.0
console.log('🔥 Firebase Messaging SW - Clean Version 4.0.0')

importScripts('https://www.gstatic.com/firebasejs/11.6.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging-compat.js')

// Firebase configuration - these placeholders will be replaced during build
const firebaseConfig = {
  apiKey: "__VITE_FIREBASE_API_KEY__",
  authDomain: "__VITE_FIREBASE_AUTH_DOMAIN__",
  projectId: "__VITE_FIREBASE_PROJECT_ID__",
  storageBucket: "__VITE_FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__VITE_FIREBASE_MESSAGING_SENDER_ID__",
  appId: "__VITE_FIREBASE_APP_ID__",
  measurementId: "__VITE_FIREBASE_MEASUREMENT_ID__"
}

firebase.initializeApp(firebaseConfig)
const messaging = firebase.messaging()

// Handle background messages - SIMPLIFIED VERSION
messaging.onBackgroundMessage(async (payload) => {
  console.log('🔔 Background message received:', payload)

  const notificationTitle = payload.notification?.title || 'Dandy Notification'
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new notification',
    icon: '/images/favicon.png',
    badge: '/images/favicon.png',
    tag: 'dandy-notification', // Same tag = only one notification at a time
    data: {
      click_action: payload.data?.click_action || '/',
      ...payload.data
    },
    requireInteraction: false,
    silent: false,
    renotify: true // Show even if same tag exists
  }

  try {
    await self.registration.showNotification(notificationTitle, notificationOptions)
    console.log('✅ Notification displayed successfully')
  } catch (error) {
    console.error('❌ Error showing notification:', error)
  }
})

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('🔔 Notification clicked:', event)

  // Close the notification
  event.notification.close()

  // Don't open anything if dismiss action
  if (event.action === 'dismiss') {
    return
  }

  // Get the click action URL
  const clickAction = event.notification.data?.click_action || '/'
  const url = new URL(clickAction, self.location.origin).href

  // Handle the click
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if app is already open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          // Send message to the client about notification click
          client.postMessage({
            type: 'NOTIFICATION_CLICKED',
            data: event.notification.data,
            url: clickAction
          })
          return client.focus()
        }
      }

      // If app is not open, open it
      if (clients.openWindow) {
        return clients.openWindow(url)
      }
    })
  )
})

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  console.log('🔔 Notification closed:', event.notification.tag)
})

// Service worker activation
self.addEventListener('activate', (event) => {
  console.log('🔥 Service Worker activated')

  // Clean up old notifications on activation
  event.waitUntil(
    self.registration.getNotifications().then((notifications) => {
      notifications.forEach((notification) => {
        // Close old notifications that might be duplicates
        if (notification.tag === 'dandy-notification') {
          notification.close()
        }
      })
    })
  )
})

// Service worker installation
self.addEventListener('install', (event) => {
  console.log('🔥 Service Worker installed')
  self.skipWaiting() // Activate immediately
})

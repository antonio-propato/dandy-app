// public/firebase-messaging-sw.js
console.log('🔥 Service Worker FINAL VERSION - v3.0.0 - Force Single Notification')

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
};

firebase.initializeApp(firebaseConfig)

const messaging = firebase.messaging()

// Handle background messages
messaging.onBackgroundMessage(async (payload) => {
  console.log('🔥 FINAL VERSION - onBackgroundMessage called:', payload)

  // BRUTE FORCE: Close ALL existing Dandy notifications first
  try {
    const existingNotifications = await self.registration.getNotifications()
    console.log('🧹 Found existing notifications:', existingNotifications.length)

    existingNotifications.forEach(notification => {
      if (notification.tag && notification.tag.includes('dandy')) {
        console.log('🧹 Closing existing Dandy notification:', notification.tag)
        notification.close()
      }
    })
  } catch (error) {
    console.log('🧹 Could not close existing notifications:', error)
  }

  // Wait a moment to ensure old notifications are closed
  await new Promise(resolve => setTimeout(resolve, 100))

  const notificationTitle = payload.notification?.title || 'Dandy Notification'
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new notification from Dandy',
    icon: '/images/favicon.png',
    badge: '/images/favicon.png',
    tag: 'dandy-single', // Same tag for ALL notifications - forces replacement
    data: {
      click_action: payload.data?.click_action || '/',
      ...payload.data
    },
    requireInteraction: true,
    vibrate: [200, 100, 200],
    actions: [
      {
        action: 'view',
        title: 'View',
        icon: '/images/favicon.png'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ],
    renotify: true // Force show even with same tag
  }

  console.log('🔥 Showing THE ONE AND ONLY notification')
  await self.registration.showNotification(notificationTitle, notificationOptions)
  console.log('✅ Single notification shown successfully')
})

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('🔔 Notification clicked:', event)

  event.notification.close()

  if (event.action === 'dismiss') {
    return
  }

  // Get the click action URL
  const clickAction = event.notification.data?.click_action || '/'

  // Open the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if app is already open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({
            type: 'NOTIFICATION_CLICKED',
            data: event.notification.data
          })
          return client.focus()
        }
      }

      // If app is not open, open it
      if (clients.openWindow) {
        return clients.openWindow(clickAction)
      }
    })
  )
})

// public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/11.6.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging-compat.js')

// Firebase configuration - replace with your actual config
const firebaseConfig = {
  apiKey: "AIzaSyBLmtEPwiL_FknaD54iHaKQ89iT5Y63PQA",
  authDomain: "dandy-deda3.firebaseapp.com",
  projectId: "dandy-deda3",
  storageBucket: "dandy-deda3.firebasestorage.app",
  messagingSenderId: "529061966809",
  appId: "1:529061966809:web:f58caeb9dade40360f9fc8",
  measurementId: "G-01EF2C7NH7"
};

firebase.initializeApp(firebaseConfig)

const messaging = firebase.messaging()

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('Received background message:', payload)

  const notificationTitle = payload.notification?.title || 'Dandy Notification'
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new notification from Dandy',
    icon: '/images/favicon.png',
    badge: '/images/favicon.png',
    tag: payload.data?.type || 'general',
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
    ]
  }

  self.registration.showNotification(notificationTitle, notificationOptions)
})

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event)

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

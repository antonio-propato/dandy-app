// src/service-worker.js - FIXED VERSION
import { precacheAndRoute } from 'workbox-precaching'
import { clientsClaim    } from 'workbox-core'

// ——— Workbox setup ———
precacheAndRoute(self.__WB_MANIFEST)
self.skipWaiting()
clientsClaim()

// ——— Firebase Messaging ———
importScripts('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js')
importScripts('https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging.js')

const firebaseConfig = {
  apiKey:   "__VITE_FIREBASE_API_KEY__",
  authDomain: "__VITE_FIREBASE_AUTH_DOMAIN__",
  projectId: "__VITE_FIREBASE_PROJECT_ID__",
  storageBucket: "__VITE_FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__VITE_FIREBASE_MESSAGING_SENDER_ID__",
  appId:     "__VITE_FIREBASE_APP_ID__",
  measurementId: "__VITE_FIREBASE_MEASUREMENT_ID__"
}

firebase.initializeApp(firebaseConfig)
const messaging = firebase.messaging()

messaging.onBackgroundMessage(async payload => {
  console.log('🆕 onBackgroundMessage:', payload)

  // close any old notifications
  const old = await self.registration.getNotifications()
  old.forEach(n => n.close())
  await new Promise(r => setTimeout(r, 100))

  // AGGRESSIVE: Try to eliminate "from" completely
  const originalTitle = payload.notification?.title || ''
  const originalBody = payload.notification?.body || ''

  // Put everything in body, use "Dandy" as title
  let fullContent = ''
  if (originalTitle && originalBody) {
    fullContent = `${originalTitle}\n${originalBody}`
  } else if (originalTitle) {
    fullContent = originalTitle
  } else {
    fullContent = originalBody
  }

  const opts = {
    body: fullContent,
    icon: '/images/favicon.png',
    badge: '/images/favicon.png',
    tag: 'app-notification', // Generic tag
    renotify: true,
    requireInteraction: true,
    data: { click_action: payload.data?.click_action || '/', ...payload.data },
    vibrate: [200,100,200],
    actions: [
      { action: 'view', title: 'Open', icon: '/images/favicon.png' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  }

  // Try "Dandy" as title to move it to top
  await self.registration.showNotification("Dandy", opts)
})

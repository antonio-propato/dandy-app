// src/service-worker.js
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

  // close any old Dandy notifications
  const old = await self.registration.getNotifications()
  old.forEach(n => n.tag?.includes('dandy') && n.close())
  await new Promise(r => setTimeout(r, 100))

  // show the one-and-only notification
  const title = payload.notification?.title || 'Dandy Notification'
  const opts  = {
    body:    payload.notification?.body || '',
    icon:    '/images/favicon.png',
    badge:   '/images/favicon.png',
    tag:     'dandy-single',
    renotify: true,
    requireInteraction: true,
    data:    { click_action: payload.data?.click_action || '/', ...payload.data },
    vibrate: [200,100,200],
    actions: [
      { action: 'view',    title: 'View',    icon: '/images/favicon.png' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  }
  await self.registration.showNotification(title, opts)
})

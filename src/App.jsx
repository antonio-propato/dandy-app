// src/App.jsx
import React, { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import './App.css'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, firestore } from './lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import { fcmManager } from './lib/fcm' // Import FCM manager

// Components
import Nav from './components/Nav'
import ProtectedRoute from './components/ProtectedRoute'

// Pages
import Landing from './pages/Landing'
import Auth from './pages/Auth'
import Profile from './pages/Profile'
import Stamps from './pages/Stamps'
import Menu from './pages/Menu'
import Contacts from './pages/Contacts'
import Scan from './pages/Scan'
import SuperuserDashboard from './pages/SuperuserDashboard'
import ClientManagement from './pages/ClientManagement'
import MenuManagement from './pages/MenuManagement'
import NotificationPanel from './components/NotificationPanel'

function AnimatedRoutes({ user, userRole }) {
  const location = useLocation()
  console.log("AnimatedRoutes - Current user role:", userRole);
  console.log("AnimatedRoutes - Current path:", location.pathname);

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* Public Routes */}
        <Route path="/" element={<Landing />} />
        <Route path="/signin" element={<Auth mode="signin" />} />
        <Route path="/signup" element={<Auth mode="signup" />} />

        {/* Protected Customer Routes */}
        <Route
          path="/profile"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <>
                  {console.log("Profile route - User is superuser, redirecting to dashboard")}
                  <Navigate to="/superuser-dashboard" />
                </>
              ) : (
                <>
                  {console.log("Profile route - User is customer, showing Profile")}
                  <Profile />
                </>
              )}
            </ProtectedRoute>
          }
        />

        <Route
          path="/stamps"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <>
                  {console.log("Stamps route - User is superuser, redirecting to dashboard")}
                  <Navigate to="/superuser-dashboard" />
                </>
              ) : (
                <>
                  {console.log("Stamps route - User is customer, showing Stamps")}
                  <Stamps />
                </>
              )}
            </ProtectedRoute>
          }
        />

        <Route
          path="/menu"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <>
                  {console.log("Menu route - User is superuser, redirecting to dashboard")}
                  <Navigate to="/superuser-dashboard" />
                </>
              ) : (
                <>
                  {console.log("Menu route - User is customer, showing Menu")}
                  <Menu />
                </>
              )}
            </ProtectedRoute>
          }
        />

        <Route
          path="/contacts"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <>
                  {console.log("Contacts route - User is superuser, redirecting to dashboard")}
                  <Navigate to="/superuser-dashboard" />
                </>
              ) : (
                <>
                  {console.log("Contacts route - User is customer, showing Contacts")}
                  <Contacts />
                </>
              )}
            </ProtectedRoute>
          }
        />

        {/* Superuser Routes */}
        <Route
          path="/superuser-dashboard"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <>
                  {console.log("Dashboard route - User is superuser, showing Dashboard")}
                  <SuperuserDashboard />
                </>
              ) : (
                <>
                  {console.log("Dashboard route - User is customer, redirecting to Profile")}
                  <Navigate to="/profile" />
                </>
              )}
            </ProtectedRoute>
          }
        />

        <Route
          path="/scan"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <>
                  {console.log("Scan route - User is superuser, showing Scan")}
                  <Scan />
                </>
              ) : (
                <>
                  {console.log("Scan route - User is customer, redirecting to Profile")}
                  <Navigate to="/profile" />
                </>
              )}
            </ProtectedRoute>
          }
        />

        <Route
          path="/client-management"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <>
                  {console.log("Client Management route - User is superuser, showing ClientManagement")}
                  <ClientManagement />
                </>
              ) : (
                <>
                  {console.log("Client Management route - User is customer, redirecting to Profile")}
                  <Navigate to="/profile" />
                </>
              )}
            </ProtectedRoute>
          }
        />

        <Route
          path="/menu-management"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <>
                  {console.log("Menu Management route - User is superuser, showing MenuManagement")}
                  <MenuManagement />
                </>
              ) : (
                <>
                  {console.log("Menu Management route - User is customer, redirecting to Profile")}
                  <Navigate to="/profile" />
                </>
              )}
            </ProtectedRoute>
          }
        />

        {/* NEW: Notifications Route - Superuser Only */}
        <Route
          path="/notifications"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <>
                  {console.log("Notifications route - User is superuser, showing NotificationPanel")}
                  <NotificationPanel />
                </>
              ) : (
                <>
                  {console.log("Notifications route - User is customer, redirecting to Profile")}
                  <Navigate to="/profile" />
                </>
              )}
            </ProtectedRoute>
          }
        />

        {/* Fallback route */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </AnimatePresence>
  )
}

function App() {
  const [user, setUser] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    console.log("App - Setting up auth listener");

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log("Auth state changed - User:", currentUser ? currentUser.uid : "No user");
      setUser(currentUser)

      if (currentUser) {
        try {
          // Get user role
          console.log("Fetching user role from Firestore");
          const userDoc = await getDoc(doc(firestore, 'users', currentUser.uid))

          if (userDoc.exists()) {
            const role = userDoc.data().role || 'customer';
            console.log("User role from Firestore:", role);
            setUserRole(role)
          } else {
            console.log("User document doesn't exist, defaulting to customer role");
            setUserRole('customer') // Default role if document doesn't exist
          }
        } catch (error) {
          console.error('Error fetching user role:', error)
          console.log("Setting default 'customer' role due to error");
          setUserRole('customer') // Default role on error
        }
      } else {
        console.log("No user authenticated, clearing user role");
        setUserRole(null)
      }

      setLoading(false)
    })

    return () => {
      console.log("App - Cleaning up auth listener");
      unsubscribe()
    }
  }, [])

  // 🔔 FCM INITIALIZATION - New useEffect for push notifications
  useEffect(() => {
    const initializeFCM = async () => {
      if (user && user.uid && userRole) {
        console.log('🔔 Initializing FCM for user:', user.uid, 'Role:', userRole)

        try {
          const success = await fcmManager.initialize(user.uid)

          if (success) {
            console.log('✅ FCM initialized successfully!')
            console.log('🔔 Push notifications are now enabled')

            // Set up custom message handler for foreground notifications
            fcmManager.setOnMessageCallback((payload) => {
              console.log('📱 Foreground notification received:', payload)

              // Show custom notification in the app
              showCustomNotification(payload)
            })
          } else {
            console.log('❌ FCM initialization failed - notifications disabled')
          }
        } catch (error) {
          console.error('Error initializing FCM:', error)
        }
      }
    }

    // Only initialize FCM when we have both user and role
    if (!loading && user && userRole) {
      initializeFCM()
    }

    // Cleanup when user logs out
    return () => {
      if (user?.uid) {
        console.log('🔄 Cleaning up FCM for user logout')
        fcmManager.cleanup(user.uid)
      }
    }
  }, [user, userRole, loading])

  // 📱 Custom notification handler for foreground messages
  const showCustomNotification = (payload) => {
    console.log('Foreground message received - letting service worker handle notification:', payload)

    // Don't create notification here to avoid duplicates
    // The service worker will handle all notifications

    // Optional: You could show an in-app toast/banner here instead
    // showInAppToast(payload) // Custom in-app notification
  }

  // 🔔 Listen for service worker messages (notification clicks)
  useEffect(() => {
    const handleServiceWorkerMessage = (event) => {
      if (event.data?.type === 'NOTIFICATION_CLICKED') {
        console.log('📱 Notification clicked, navigating to:', event.data.data?.click_action)

        // Navigate to the specified page
        const clickAction = event.data.data?.click_action || '/'
        window.location.href = clickAction
      }
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage)

      return () => {
        navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage)
      }
    }
  }, [])

  // Log current state for debugging
  console.log("App rendering - User:", user ? "Authenticated" : "Not authenticated");
  console.log("App rendering - User role:", userRole);
  console.log("App rendering - Loading state:", loading);

  if (loading) {
    return (
      <div className="loading" style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontSize: '18px',
        color: '#666'
      }}>
        Loading...
      </div>
    )
  }

  return (
    <Router>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="min-h-screen bg-gray-50"
      >
        <AnimatedRoutes user={user} userRole={userRole} />
        <Nav userRole={userRole} />
      </motion.div>
    </Router>
  )
}

export default App

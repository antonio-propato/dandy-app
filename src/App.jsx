// src/App.jsx
import React, { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import './App.css'
import { onAuthStateChanged, applyActionCode, checkActionCode } from 'firebase/auth'
import { auth, firestore } from './lib/firebase'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { fcmManager } from './lib/fcm' // Import FCM manager

// 🔊 NEW: Import global beeping system
import { useGlobalOrderMonitor } from './hooks/useGlobalOrderMonitor'
import GlobalBeepIndicator from './components/GlobalBeepIndicator'

// 🛒 NEW: Import CartProvider
import { CartProvider } from './contexts/CartContext'

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
import CustomerNotifications from './pages/CustomerNotifications'
import RewardsLog from './pages/RewardsLog' // NEW: Rewards log page
import StampsLog from './pages/StampsLog' // NEW: Stamps log page
import OrdersLog from './pages/OrdersLog' // NEW: Orders log page

// 🛒 NEW: Import cart-related pages
import Basket from './pages/Basket'
// import Tables from './pages/Tables'
import Orders from './pages/Orders'
import OrderSuccess from './pages/OrderSuccess'

// 🔗 NEW: Email Verification Handler Component
function EmailVerificationHandler() {
  const location = useLocation()
  const [verificationStatus, setVerificationStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  useEffect(() => {
    const handleEmailVerification = async () => {
      console.log('🔗 Checking URL for email verification parameters')

      const urlParams = new URLSearchParams(location.search)
      const mode = urlParams.get('mode')
      const actionCode = urlParams.get('oobCode')

      console.log('URL params - mode:', mode, 'actionCode:', actionCode ? 'present' : 'missing')

      if (mode === 'verifyEmail' && actionCode) {
        console.log('📧 Processing email verification from URL')

        try {
          // Check if the action code is valid
          const info = await checkActionCode(auth, actionCode)
          console.log('✅ Action code is valid for:', info.data.email)

          // Apply the email verification
          await applyActionCode(auth, actionCode)
          console.log('✅ Email verification applied successfully')

          // Update the user's emailVerified status in Firestore
          if (auth.currentUser) {
            await auth.currentUser.reload()
            console.log('🔄 User reloaded, emailVerified:', auth.currentUser.emailVerified)

            // Update Firestore
            await updateDoc(doc(firestore, 'users', auth.currentUser.uid), {
              emailVerified: true,
              emailVerifiedAt: new Date().toISOString()
            })
            console.log('✅ Updated Firestore with verification status')
          }

          setVerificationStatus('success')
          setShowModal(true) // 🔄 NEW: Show modal instead of auto-redirecting

        } catch (error) {
          console.error('❌ Email verification failed:', error)
          let errorMessage = 'Verification failed'

          if (error.code === 'auth/invalid-action-code') {
            errorMessage = 'Invalid or expired verification link'
          } else if (error.code === 'auth/expired-action-code') {
            errorMessage = 'Verification link has expired'
          }

          setVerificationStatus('error')
          setShowModal(true) // 🔄 NEW: Show modal for errors too
        }
      }

      setLoading(false)
    }

    handleEmailVerification()
  }, [location])

  // 🔄 UPDATED: Handle modal close - smart navigation
  const handleModalClose = () => {
    setShowModal(false)

    console.log('📱 Modal closed. Attempting smart navigation...')

    // Try to close the window/tab if it was opened from an email link
    try {
      // Check if this window was opened by another window (popup/new tab from email)
      if (window.opener || window.history.length <= 1) {
        console.log('🔄 Attempting to close verification tab...')
        window.close()

        // If window.close() doesn't work (some browsers block it), redirect after a short delay
        setTimeout(() => {
          console.log('🔄 Window close failed, redirecting to main app...')
          window.location.href = window.location.origin + '/'
        }, 1000)
      } else {
        // If this is the main tab, redirect to authenticated area
        console.log('🔄 Redirecting to main app...')
        window.location.href = window.location.origin + '/'
      }
    } catch (error) {
      console.error('Error during navigation:', error)
      // Fallback: redirect to main app
      window.location.href = window.location.origin + '/'
    }
  }

  if (loading) {
    return (
      <div className="verification-handler">
        <div className="verification-content">
          <img src="/images/Dandy.jpeg" alt="Dandy Logo" style={{ width: '100px', marginBottom: '20px' }} />
          <h2>Verifica in corso...</h2>
          <p>Stiamo verificando il tuo account.</p>
        </div>
      </div>
    )
  }

  // 🔄 UPDATED: Show modal with improved styling and navigation
  if (showModal) {
    return (
      <div className="verification-handler">
        <div className="verification-modal-overlay">
          <div className="verification-modal">
            <img src="/images/Dandy.jpeg" alt="Dandy Logo" style={{ width: '80px', marginBottom: '20px' }} />

            {verificationStatus === 'success' ? (
              <>
                <h2>✅ Email Verificata!</h2>
                <p>Il tuo account è stato attivato con successo.</p>
              </>
            ) : (
              <>
                <h2>❌ Verifica Fallita</h2>
                <p>Il link di verifica non è valido o è scaduto.</p>
                <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '15px' }}>
                  Torna all'app e richiedi un nuovo link di verifica.
                </p>
              </>
            )}

            <button
              onClick={handleModalClose}
              style={{
                padding: '12px 24px',
                background: 'linear-gradient(97deg, #43221B, #43221bd3)',
                color: '#ECF0BA',
                border: '1px groove #ECF0BA',
                borderRadius: '8px',
                marginTop: '20px',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '16px',
                textTransform: 'uppercase'
              }}
            >
              {verificationStatus === 'success' ? 'Continua' : 'Torna all\'App'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}

function AnimatedRoutes({ user, userRole }) {
  const location = useLocation()
  console.log("AnimatedRoutes - Current user role:", userRole);
  console.log("AnimatedRoutes - Current path:", location.pathname);

  // 🔗 NEW: Check if this is an email verification URL
  const urlParams = new URLSearchParams(location.search)
  const mode = urlParams.get('mode')

  if (mode === 'verifyEmail') {
    console.log('📧 Email verification URL detected')
    return <EmailVerificationHandler />
  }

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

        {/* 🛒 NEW: Customer Cart Routes */}
        <Route
          path="/basket"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <>
                  {console.log("Basket route - User is superuser, redirecting to dashboard")}
                  <Navigate to="/superuser-dashboard" />
                </>
              ) : (
                <>
                  {console.log("Basket route - User is customer, showing Basket")}
                  <Basket />
                </>
              )}
            </ProtectedRoute>
          }
        />

        <Route
          path="/order-success"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <>
                  {console.log("Order Success route - User is superuser, redirecting to dashboard")}
                  <Navigate to="/superuser-dashboard" />
                </>
              ) : (
                <>
                  {console.log("Order Success route - User is customer, showing OrderSuccess")}
                  <OrderSuccess />
                </>
              )}
            </ProtectedRoute>
          }
        />

        {/* Customer Notifications Route */}
        <Route
          path="/notifications"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <>
                  {console.log("Notifications route - User is superuser, redirecting to dashboard")}
                  <Navigate to="/superuser-dashboard" />
                </>
              ) : (
                <>
                  {console.log("Notifications route - User is customer, showing CustomerNotifications")}
                  <CustomerNotifications />
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

        {/* 🛒 NEW: Superuser Cart Management Routes
        <Route
          path="/tables"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <>
                  {console.log("Tables route - User is superuser, showing Tables")}
                  <Tables />
                </>
              ) : (
                <>
                  {console.log("Tables route - User is customer, redirecting to Profile")}
                  <Navigate to="/profile" />
                </>
              )}
            </ProtectedRoute>
          }
        /> */}

        <Route
          path="/orders"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <>
                  {console.log("Orders route - User is superuser, showing Orders")}
                  <Orders />
                </>
              ) : (
                <>
                  {console.log("Orders route - User is customer, redirecting to Profile")}
                  <Navigate to="/profile" />
                </>
              )}
            </ProtectedRoute>
          }
        />

        {/* NEW: Superuser Rewards Log Route */}
        <Route
          path="/rewards-log"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <>
                  {console.log("Rewards Log route - User is superuser, showing RewardsLog")}
                  <RewardsLog />
                </>
              ) : (
                <>
                  {console.log("Rewards Log route - User is customer, redirecting to Profile")}
                  <Navigate to="/profile" />
                </>
              )}
            </ProtectedRoute>
          }
        />

        {/* NEW: Superuser Stamps Log Route */}
        <Route
          path="/stamps-log"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <>
                  {console.log("Stamps Log route - User is superuser, showing StampsLog")}
                  <StampsLog />
                </>
              ) : (
                <>
                  {console.log("Stamps Log route - User is customer, redirecting to Profile")}
                  <Navigate to="/profile" />
                </>
              )}
            </ProtectedRoute>
          }
        />

        {/* NEW: Superuser Orders Log Route */}
        <Route
          path="/orders-log"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <>
                  {console.log("Orders Log route - User is superuser, showing OrdersLog")}
                  <OrdersLog />
                </>
              ) : (
                <>
                  {console.log("Orders Log route - User is customer, redirecting to Profile")}
                  <Navigate to="/profile" />
                </>
              )}
            </ProtectedRoute>
          }
        />

        {/* Superuser Notifications Panel Route */}
        <Route
          path="/superuser-notifications"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <>
                  {console.log("Superuser Notifications route - User is superuser, showing NotificationPanel")}
                  <NotificationPanel />
                </>
              ) : (
                <>
                  {console.log("Superuser Notifications route - User is customer, redirecting to Profile")}
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
  const [keyboardVisible, setKeyboardVisible] = useState(false) // Track keyboard state

  // 🔊 NEW: Initialize global order monitoring for superusers
  const {
    pendingOrderCount,
    isBeeping,
    stopBeeping,
    startBeeping
  } = useGlobalOrderMonitor(userRole)

  // 📱 UNIVERSAL KEYBOARD & SCROLL HANDLING
  useEffect(() => {
    console.log('🔧 Setting up universal keyboard and scroll handling')

    // Set proper viewport for mobile
    const setViewportMeta = () => {
      let viewportMeta = document.querySelector('meta[name="viewport"]')
      if (!viewportMeta) {
        viewportMeta = document.createElement('meta')
        viewportMeta.name = 'viewport'
        document.head.appendChild(viewportMeta)
      }
      viewportMeta.content = 'width=device-width, initial-scale=1.0, user-scalable=yes, minimum-scale=1.0, maximum-scale=5.0'
    }

    // Handle keyboard visibility changes
    const handleKeyboardShow = () => {
      console.log('⌨️ Virtual keyboard shown')
      setKeyboardVisible(true)

      // Scroll focused input into view with delay
      setTimeout(() => {
        const activeElement = document.activeElement
        if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
          activeElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          })
        }
      }, 300)
    }

    const handleKeyboardHide = () => {
      console.log('⌨️ Virtual keyboard hidden')
      setKeyboardVisible(false)
    }

    // Method 1: Visual Viewport API (Modern browsers)
    if (window.visualViewport) {
      console.log('✅ Using Visual Viewport API for keyboard detection')

      const initialHeight = window.visualViewport.height

      const handleViewportChange = () => {
        const currentHeight = window.visualViewport.height
        const heightDifference = initialHeight - currentHeight

        if (heightDifference > 150) { // Keyboard likely visible
          handleKeyboardShow()
        } else {
          handleKeyboardHide()
        }
      }

      window.visualViewport.addEventListener('resize', handleViewportChange)

      return () => {
        window.visualViewport.removeEventListener('resize', handleViewportChange)
      }
    }

    // Method 2: Window resize fallback (Older browsers)
    else {
      console.log('⚠️ Using window resize fallback for keyboard detection')

      const initialHeight = window.innerHeight

      const handleWindowResize = () => {
        const currentHeight = window.innerHeight
        const heightDifference = initialHeight - currentHeight

        if (heightDifference > 150) {
          handleKeyboardShow()
        } else {
          handleKeyboardHide()
        }
      }

      // Set initial viewport
      setViewportMeta()

      window.addEventListener('resize', handleWindowResize)

      return () => {
        window.removeEventListener('resize', handleWindowResize)
      }
    }
  }, [])

  // 📱 Handle input focus events for better keyboard handling
  useEffect(() => {
    const handleFocusIn = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        console.log('🎯 Input focused:', e.target.type || e.target.tagName)

        // Add a small delay then scroll element into view
        setTimeout(() => {
          e.target.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          })
        }, 100)
      }
    }

    const handleFocusOut = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        console.log('🎯 Input unfocused')
      }
    }

    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('focusout', handleFocusOut)

    return () => {
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('focusout', handleFocusOut)
    }
  }, [])

  // 🔄 Prevent zoom on input focus (iOS Safari)
  useEffect(() => {
    const preventZoom = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        // Temporarily increase font size to prevent zoom
        const originalFontSize = e.target.style.fontSize
        e.target.style.fontSize = '16px'

        setTimeout(() => {
          e.target.style.fontSize = originalFontSize
        }, 100)
      }
    }

    document.addEventListener('touchstart', preventZoom)

    return () => {
      document.removeEventListener('touchstart', preventZoom)
    }
  }, [])

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

  // 🔊 Debug logging for beeping system
  useEffect(() => {
    if (userRole === 'superuser') {
      console.log('🔊 Global beeping status:', {
        pendingOrderCount,
        isBeeping,
        userRole
      })
    }
  }, [pendingOrderCount, isBeeping, userRole])

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
    // 🛒 NEW: Wrap entire app with CartProvider
    <CartProvider>
      <Router>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`min-h-screen bg-gray-50 ${keyboardVisible ? 'keyboard-visible' : ''}`}
          style={{
            // Dynamic styles for keyboard handling
            minHeight: keyboardVisible ? 'auto' : '100vh',
            paddingBottom: keyboardVisible ? '20px' : '0'
          }}
        >
          <AnimatedRoutes user={user} userRole={userRole} />
          <Nav userRole={userRole} />

          {/* 🔊 NEW: Global beep indicator for superusers */}
          <GlobalBeepIndicator
            pendingOrderCount={pendingOrderCount}
            isBeeping={isBeeping}
            stopBeeping={stopBeeping}
            userRole={userRole}
          />
        </motion.div>
      </Router>
    </CartProvider>
  )
}

export default App

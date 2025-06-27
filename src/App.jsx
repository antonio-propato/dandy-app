// src/App.jsx
import React, { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import './App.css'
import { onAuthStateChanged, applyActionCode, checkActionCode } from 'firebase/auth'
import { auth, firestore } from './lib/firebase'
import { doc, getDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { fcmManager } from './lib/fcm'
import QRCode from 'qrcode'

// 🔊 Import global beeping system
import { useGlobalOrderMonitor } from './hooks/useGlobalOrderMonitor'
import GlobalBeepIndicator from './components/GlobalBeepIndicator'

// 🛒 Import CartProvider
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
import RewardsLog from './pages/RewardsLog'
import StampsLog from './pages/StampsLog'
import OrdersLog from './pages/OrdersLog'

// 🛒 Cart-related pages
import Basket from './pages/Basket'
import Orders from './pages/Orders'
import OrderSuccess from './pages/OrderSuccess'

// 🔒 SECURITY: Email verification handler with input validation
function EmailVerificationHandler() {
  const location = useLocation()
  const [verificationStatus, setVerificationStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [attempts, setAttempts] = useState(0)

  // 🔒 SECURITY: Rate limiting for verification attempts
  const MAX_VERIFICATION_ATTEMPTS = 3
  const VERIFICATION_COOLDOWN = 300000 // 5 minutes

  useEffect(() => {
    const handleEmailVerification = async () => {
      // 🔒 SECURITY: Rate limiting check
      if (attempts >= MAX_VERIFICATION_ATTEMPTS) {
        console.warn('🔒 Too many verification attempts')
        setVerificationStatus('rate_limited')
        setShowModal(true)
        setLoading(false)
        return
      }

      const urlParams = new URLSearchParams(location.search)
      const mode = urlParams.get('mode')
      const actionCode = urlParams.get('oobCode')

      // 🔒 SECURITY: Input validation
      if (!mode || !actionCode) {
        setLoading(false)
        return
      }

      // 🔒 SECURITY: Validate input format
      if (typeof mode !== 'string' || typeof actionCode !== 'string') {
        setVerificationStatus('invalid_params')
        setShowModal(true)
        setLoading(false)
        return
      }

      // 🔒 SECURITY: Sanitize inputs
      const sanitizedMode = mode.replace(/[<>]/g, '')
      const sanitizedActionCode = actionCode.replace(/[<>]/g, '')

      if (sanitizedMode === 'verifyEmail' && sanitizedActionCode.length > 0) {
        setAttempts(prev => prev + 1)

        try {
          // Check if the action code is valid
          const info = await checkActionCode(auth, sanitizedActionCode)

          // Apply the email verification
          await applyActionCode(auth, sanitizedActionCode)

          // Update the user's emailVerified status in Firestore
          if (auth.currentUser) {
            await auth.currentUser.reload()

            // 🔒 SECURITY: Only update if user is authenticated
            if (auth.currentUser.emailVerified) {
              await updateDoc(doc(firestore, 'users', auth.currentUser.uid), {
                emailVerified: true,
                emailVerifiedAt: new Date().toISOString()
              })
            }
          }

          setVerificationStatus('success')
          setShowModal(true)

        } catch (error) {
          console.error('Email verification failed')
          let errorStatus = 'error'

          if (error.code === 'auth/invalid-action-code') {
            errorStatus = 'invalid_code'
          } else if (error.code === 'auth/expired-action-code') {
            errorStatus = 'expired_code'
          }

          setVerificationStatus(errorStatus)
          setShowModal(true)
        }
      }

      setLoading(false)
    }

    handleEmailVerification()
  }, [location, attempts])

  // 🔒 SECURITY: Safe navigation with timeout
  const handleModalClose = () => {
    setShowModal(false)

    try {
      // Set a timeout to prevent hanging
      const navigationTimeout = setTimeout(() => {
        window.location.href = window.location.origin + '/'
      }, 5000)

      if (window.opener || window.history.length <= 1) {
        window.close()
        clearTimeout(navigationTimeout)
      } else {
        clearTimeout(navigationTimeout)
        window.location.href = window.location.origin + '/'
      }
    } catch (error) {
      console.error('Navigation error')
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
            ) : verificationStatus === 'rate_limited' ? (
              <>
                <h2>⏱️ Troppi Tentativi</h2>
                <p>Troppi tentativi di verifica. Riprova tra qualche minuto.</p>
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

  // 🔒 SECURITY: Input validation for URL parameters
  const urlParams = new URLSearchParams(location.search)
  const mode = urlParams.get('mode')

  // 🔒 SECURITY: Sanitize mode parameter
  if (mode && typeof mode === 'string' && mode.replace(/[<>]/g, '') === 'verifyEmail') {
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
                <Navigate to="/superuser-dashboard" />
              ) : (
                <Profile />
              )}
            </ProtectedRoute>
          }
        />

        <Route
          path="/stamps"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <Navigate to="/superuser-dashboard" />
              ) : (
                <Stamps />
              )}
            </ProtectedRoute>
          }
        />

        <Route
          path="/menu"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <Navigate to="/superuser-dashboard" />
              ) : (
                <Menu />
              )}
            </ProtectedRoute>
          }
        />

        <Route
          path="/contacts"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <Navigate to="/superuser-dashboard" />
              ) : (
                <Contacts />
              )}
            </ProtectedRoute>
          }
        />

        <Route
          path="/basket"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <Navigate to="/superuser-dashboard" />
              ) : (
                <Basket />
              )}
            </ProtectedRoute>
          }
        />

        <Route
          path="/order-success"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <Navigate to="/superuser-dashboard" />
              ) : (
                <OrderSuccess />
              )}
            </ProtectedRoute>
          }
        />

        <Route
          path="/notifications"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <Navigate to="/superuser-dashboard" />
              ) : (
                <CustomerNotifications />
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
                <SuperuserDashboard />
              ) : (
                <Navigate to="/profile" />
              )}
            </ProtectedRoute>
          }
        />

        <Route
          path="/scan"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <Scan />
              ) : (
                <Navigate to="/profile" />
              )}
            </ProtectedRoute>
          }
        />

        <Route
          path="/client-management"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <ClientManagement />
              ) : (
                <Navigate to="/profile" />
              )}
            </ProtectedRoute>
          }
        />

        <Route
          path="/menu-management"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <MenuManagement />
              ) : (
                <Navigate to="/profile" />
              )}
            </ProtectedRoute>
          }
        />

        <Route
          path="/orders"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <Orders />
              ) : (
                <Navigate to="/profile" />
              )}
            </ProtectedRoute>
          }
        />

        <Route
          path="/rewards-log"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <RewardsLog />
              ) : (
                <Navigate to="/profile" />
              )}
            </ProtectedRoute>
          }
        />

        <Route
          path="/stamps-log"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <StampsLog />
              ) : (
                <Navigate to="/profile" />
              )}
            </ProtectedRoute>
          }
        />

        <Route
          path="/orders-log"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <OrdersLog />
              ) : (
                <Navigate to="/profile" />
              )}
            </ProtectedRoute>
          }
        />

        <Route
          path="/superuser-notifications"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? (
                <NotificationPanel />
              ) : (
                <Navigate to="/profile" />
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
  const [keyboardVisible, setKeyboardVisible] = useState(false)

  // 🔊 Initialize global order monitoring for superusers
  const {
    pendingOrderCount,
    isBeeping,
    stopBeeping,
    startBeeping
  } = useGlobalOrderMonitor(userRole)

  // 🔒 SECURITY: User document recovery function
  const createMissingUserDocument = async (user) => {
    try {
      const userDocRef = doc(firestore, 'users', user.uid)
      const userDoc = await getDoc(userDocRef)

      if (!userDoc.exists()) {
        // Generate QR code
        const qrData = `https://dandy.app/profile/${user.uid}`
        const qrCodeURL = await QRCode.toDataURL(qrData)

        // Check if superuser
        const isSuperUser = user.email === 'antonio@propato.co.uk'

        // Create user document
        const userDocData = {
          firstName: 'User', // Placeholder - user can update later
          lastName: 'Name',  // Placeholder - user can update later
          dob: '01/01',      // Placeholder - user can update later
          phone: '+39',      // Placeholder - user can update later
          email: user.email.toLowerCase(),
          qrCode: qrCodeURL,
          role: isSuperUser ? 'superuser' : 'customer',
          emailVerified: user.emailVerified,
          createdAt: serverTimestamp(),
          gdprConsent: {
            accepted: true,
            acceptedAt: new Date().toISOString(),
            version: '1.0',
            marketingConsent: true,
            pushNotificationConsent: true
          },
          // Flag to indicate this was a recovery creation
          isRecoveryAccount: true
        }

        await setDoc(userDocRef, userDocData)

        // Create stamps document for customers
        if (!isSuperUser) {
          const stampsRef = doc(firestore, 'stamps', user.uid)
          await setDoc(stampsRef, {
            stamps: [
              { date: new Date().toISOString() },
              { date: new Date().toISOString() }
            ],
            lifetimeStamps: 2,
            rewardsEarned: 0,
            availableRewards: 0,
            receivedFreeStamps: true,
            birthdayBonusYear: null,
          })
        }

        return true
      }

      return true
    } catch (error) {
      console.error('Error creating user document')
      return false
    }
  }

  // 📱 UNIVERSAL KEYBOARD & SCROLL HANDLING
  useEffect(() => {
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
      setKeyboardVisible(false)
    }

    // Method 1: Visual Viewport API (Modern browsers)
    if (window.visualViewport) {
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
        // Input unfocused
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

  // 🔒 SECURITY: Enhanced auth state listener with recovery
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser)

      if (currentUser) {
        try {
          // 🔒 SECURITY: Create missing user document if needed
          const documentCreated = await createMissingUserDocument(currentUser)

          if (!documentCreated) {
            console.error('Failed to create/verify user document')
            setUserRole('customer') // Fallback
            setLoading(false)
            return
          }

          // Get user role
          const userDoc = await getDoc(doc(firestore, 'users', currentUser.uid))

          if (userDoc.exists()) {
            const role = userDoc.data().role || 'customer'
            setUserRole(role)
          } else {
            setUserRole('customer') // Default role if document doesn't exist
          }
        } catch (error) {
          console.error('Error fetching user role')
          setUserRole('customer') // Default role on error
        }
      } else {
        setUserRole(null)
      }

      setLoading(false)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  // 🔔 FCM INITIALIZATION - Enhanced with error handling
  useEffect(() => {
    const initializeFCM = async () => {
      if (user && user.uid && userRole) {
        try {
          const success = await fcmManager.initialize(user.uid)

          if (success) {
            // Set up custom message handler for foreground notifications
            fcmManager.setOnMessageCallback((payload) => {
              // Show custom notification in the app
              showCustomNotification(payload)
            })
          }
        } catch (error) {
          console.error('Error initializing FCM')
          // FCM failure shouldn't block the app
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
        fcmManager.cleanup(user.uid)
      }
    }
  }, [user, userRole, loading])

  // 📱 Custom notification handler for foreground messages
  const showCustomNotification = (payload) => {
    // Don't create notification here to avoid duplicates
    // The service worker will handle all notifications
  }

  // 🔔 Listen for service worker messages (notification clicks)
  useEffect(() => {
    const handleServiceWorkerMessage = (event) => {
      if (event.data?.type === 'NOTIFICATION_CLICKED') {
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
    <CartProvider>
      <Router>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`min-h-screen bg-gray-50 ${keyboardVisible ? 'keyboard-visible' : ''}`}
          style={{
            minHeight: keyboardVisible ? 'auto' : '100vh',
            paddingBottom: keyboardVisible ? '20px' : '0'
          }}
        >
          <AnimatedRoutes user={user} userRole={userRole} />
          <Nav userRole={userRole} />

          {/* 🔊 Global beep indicator for superusers */}
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

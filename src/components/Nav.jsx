import React, { useState, useRef, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth, firestore } from '../lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import { fcmManager } from '../lib/fcm'
import './Nav.css'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBars, faQrcode, faChartLine, faSignOutAlt, faUsers, faUtensils, faBell } from '@fortawesome/free-solid-svg-icons'

export default function Nav({ showBurger = true, userRole }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [currentUserRole, setCurrentUserRole] = useState(userRole)
  const [loading, setLoading] = useState(true)

  const buttonRef = useRef(null)
  const flyoutRef = useRef(null)
  const overlayRef = useRef(null)

  const handleLogout = async () => {
    // Clean up FCM tokens before logout
    if (auth.currentUser) {
      await fcmManager.cleanup(auth.currentUser.uid)
    }
    await signOut(auth)
    navigate('/signin')
  }

  // Check user role when Auth state changes
  useEffect(() => {
    const checkUserRole = async () => {
      if (auth.currentUser) {
        try {
          const userDoc = await getDoc(doc(firestore, 'users', auth.currentUser.uid))
          if (userDoc.exists()) {
            const userData = userDoc.data()
            const role = userData.role || 'customer'
            setCurrentUserRole(role)

            // Initialize FCM for notifications if user has consent
            if (userData.gdprConsent?.pushNotificationConsent) {
              await fcmManager.initialize(auth.currentUser.uid)
            }
          }
        } catch (error) {
          console.error('Error fetching user role:', error)
        }
      } else {
        setCurrentUserRole(null)
      }
      setLoading(false)
    }

    checkUserRole()
  }, [auth.currentUser])

  // Use prop userRole if available, otherwise use state
  const effectiveUserRole = userRole || currentUserRole

  // Close if click or tap is outside both button and menu
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        flyoutRef.current &&
        !flyoutRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [])

  // Handle overlay click
  const handleOverlayClick = () => {
    setOpen(false)
  }

  if (['/', '/signin', '/signup'].includes(location.pathname) || loading) return null

  const isActive = (path) =>
    location.pathname === path ? 'nav-link active-link pulse-glow' : 'nav-link'

  return (
    <>
      {/* Overlay */}
      <div
        ref={overlayRef}
        className={`nav-overlay ${open ? 'open' : ''}`}
        onClick={handleOverlayClick}
      />

      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className={`burger-button ${showBurger ? 'visible' : 'hidden'}`}
      >
        <FontAwesomeIcon icon={faBars} className="burger-icon" />
      </button>

      <div ref={flyoutRef} className={`nav-flyout ${open ? 'open' : ''}`}>
        {effectiveUserRole === 'superuser' ? (
          // Superuser Navigation
          <>
            <Link
              to="/superuser-dashboard"
              onClick={() => setOpen(false)}
              className={isActive('/superuser-dashboard')}
            >
              <FontAwesomeIcon icon={faChartLine} className="nav-icon" />
              Dashboard
            </Link>
            <Link
              to="/scan"
              onClick={() => setOpen(false)}
              className={isActive('/scan')}
            >
              <FontAwesomeIcon icon={faQrcode} className="nav-icon" />
              Scan QR
            </Link>
            <Link
              to="/client-management"
              onClick={() => setOpen(false)}
              className={isActive('/client-management')}
            >
              <FontAwesomeIcon icon={faUsers} className="nav-icon" />
              Gestisci Clienti
            </Link>
            <Link
              to="/menu-management"
              onClick={() => setOpen(false)}
              className={isActive('/menu-management')}
            >
              <FontAwesomeIcon icon={faUtensils} className="nav-icon" />
              Gestisci Menu
            </Link>
            {/* NEW: Notifications Panel for Superuser */}
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className={isActive('/notifications')}
            >
              <FontAwesomeIcon icon={faBell} className="nav-icon" />
              Notifiche
            </Link>
          </>
        ) : (
          // Customer Navigation
          <>
            <Link to="/profile" onClick={() => setOpen(false)} className={isActive('/profile')}>Profilo</Link>
            <Link to="/stamps" onClick={() => setOpen(false)} className={isActive('/stamps')}>Timbri</Link>
            <Link to="/menu" onClick={() => setOpen(false)} className={isActive('/menu')}>Menu</Link>
            <Link to="/contacts" onClick={() => setOpen(false)} className={isActive('/contacts')}>Contatti</Link>
          </>
        )}

        <div className="nav-logout">
          <button onClick={handleLogout} className="nav-link logout-button">
            <FontAwesomeIcon icon={faSignOutAlt} className="nav-icon" />
            Log Out
          </button>
        </div>
      </div>
    </>
  )
}

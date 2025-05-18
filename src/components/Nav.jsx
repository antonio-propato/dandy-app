import React, { useState, useRef, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth, firestore } from '../lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import './Nav.css'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBars, faQrcode, faChartLine, faSignOutAlt } from '@fortawesome/free-solid-svg-icons'

export default function Nav() {
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [userRole, setUserRole] = useState(null)
  const [loading, setLoading] = useState(true)

  const buttonRef = useRef(null)
  const flyoutRef = useRef(null)

  const handleLogout = async () => {
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
            setUserRole(userDoc.data().role || 'customer')
          }
        } catch (error) {
          console.error('Error fetching user role:', error)
        }
      } else {
        setUserRole(null)
      }
      setLoading(false)
    }

    checkUserRole()
  }, [auth.currentUser])

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

  if (['/', '/signin', '/signup'].includes(location.pathname) || loading) return null

  const isActive = (path) =>
    location.pathname === path ? 'nav-link active-link pulse-glow' : 'nav-link'

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className="burger-button"
      >
        <FontAwesomeIcon icon={faBars} className="burger-icon" />
      </button>

      <div ref={flyoutRef} className={`nav-flyout ${open ? 'open' : ''}`}>
        {userRole === 'superuser' ? (
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
          </>
        ) : (
          // Customer Navigation
          <>
            <Link to="/profile" onClick={() => setOpen(false)} className={isActive('/profile')}>Profilo</Link>
            <Link to="/stamps" onClick={() => setOpen(false)} className={isActive('/stamps')}>Stampi</Link>
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

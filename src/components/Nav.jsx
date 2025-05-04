import React, { useState, useRef, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'
import './Nav.css'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBars } from '@fortawesome/free-solid-svg-icons'

export default function Nav() {
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const buttonRef = useRef(null)
  const flyoutRef = useRef(null)

  const handleLogout = async () => {
    await signOut(auth)
    navigate('/signin')
  }

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

  if (['/', '/signin', '/signup'].includes(location.pathname)) return null

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
        <Link to="/profile" onClick={() => setOpen(false)} className={isActive('/profile')}>Profilo</Link>
        <Link to="/stamps" onClick={() => setOpen(false)} className={isActive('/stamps')}>Stampi</Link>
        <Link to="/menu" onClick={() => setOpen(false)} className={isActive('/menu')}>Menu</Link>
        <Link to="/contacts" onClick={() => setOpen(false)} className={isActive('/contacts')}>Contatti</Link>

        <div className="nav-logout">
          <button onClick={handleLogout} className="nav-link logout-button">Log Out</button>
        </div>
      </div>
    </>
  )
}

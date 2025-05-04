import React, { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { Menu, X } from 'lucide-react'
import './Nav.css'

export default function Nav() {
  const location = useLocation()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const handleLogout = async () => {
    await signOut(auth)
    navigate('/signin')
  }

  if (['/', '/signin', '/signup'].includes(location.pathname)) return null

  const isActive = (path) =>
    location.pathname === path ? 'nav-link active-link pulse-glow' : 'nav-link'

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed top-4 left-4 z-50 p-2 bg-[#43221B] text-[#ECF0BA] rounded-full shadow-md"
      >
        <Menu size={24} />
      </button>

      {open && (
        <div className="fixed inset-0 z-40 bg-black bg-opacity-50" onClick={() => setOpen(false)} />
      )}

<div className={`nav-flyout ${open ? 'open' : ''}`}>
  <div className="nav-header">
    <span className="text-lg font-semibold text-[#ECF0BA]">Menu</span>
    <button onClick={() => setOpen(false)} className="text-white">
      <X size={20} />
    </button>
  </div>

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

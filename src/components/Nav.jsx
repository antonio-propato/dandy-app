// src/components/Nav.jsx
import React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'

export default function Nav() {
  const location = useLocation()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await signOut(auth)
    navigate('/signin')
  }

  // hide nav on landing/auth pages
  if (['/', '/signin', '/signup'].includes(location.pathname)) return null

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white shadow-md py-2 flex justify-around">
      <Link to="/profile" className="text-gray-700 hover:text-gray-900">Profile</Link>
      <Link to="/stamps" className="text-gray-700 hover:text-gray-900">Stamps</Link>
      <Link to="/menu" className="text-gray-700 hover:text-gray-900">Menu</Link>
      <Link to="/contacts" className="text-gray-700 hover:text-gray-900">Contacts</Link>
      <button onClick={handleLogout} className="text-red-500 hover:text-red-700">Logout</button>
    </nav>
  )
}

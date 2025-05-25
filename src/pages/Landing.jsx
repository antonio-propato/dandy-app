// src/pages/Landing.jsx
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import './Landing.css'

export default function Landing() {
  const [isMobile, setIsMobile] = useState(true)

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768)
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  if (!isMobile) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 px-4 text-center">
        <div className="bg-white p-6 rounded-xl shadow-md max-w-md">
          <h1 className="text-xl font-bold text-gray-800 mb-2">Solo su Mobile</h1>
          <p className="text-gray-600 text-sm">
            Questa app è disponibile solo su dispositivi mobili. Per favore aprila su uno smartphone.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="landing-wrapper">
      <div className="landing-overlay"></div>

      <div className="landing-card">
        <img
          src="/images/Dandy.jpeg"
          alt="Logo Dandy"
          className="landing-logo"
        />

        <div className="landing-buttons">
          <Link to="/signup" className="landing-button">
            REGISTRATI
          </Link>
          <Link to="/signin" className="landing-button">
            ACCEDI
          </Link>
        </div>
      </div>
    </div>
  )
}

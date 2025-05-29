// src/pages/Landing.jsx
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePWAInstall } from '../hooks/usePWAInstall'
import PWAInstallPrompt from '../components/PWAInstallPrompt'
import './Landing.css'

export default function Landing() {
  const [isMobile, setIsMobile] = useState(true)
  const { showInstallPrompt, isInstalled, isIOS, installPWA, dismissPrompt } = usePWAInstall()

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
      <div className="flex items-center justify-center min-h-screen bg-white px-4 text-center">
        <div className="bg-white p-6 rounded-xl shadow-md max-w-md">
          <h1 className="text-xl font-bold text-gray-800 mb-2">App disponibile solo su mobile</h1>
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

      {/* PWA Install Prompt - only shows when conditions are met */}
      {showInstallPrompt && !isInstalled && (
        <PWAInstallPrompt
          onInstall={installPWA}
          onDismiss={dismissPrompt}
          isIOS={isIOS}
        />
      )}
    </div>
  )
}

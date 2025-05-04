import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, useAnimation } from 'framer-motion'
import DandyLogo from '../assets/images/Dandy.jpeg'
import './Landing.css'

export default function Landing() {
  const [isMobile, setIsMobile] = useState(true)
  const controls = useAnimation()
  const [animationIndex, setAnimationIndex] = useState(0)
  const [lastTap, setLastTap] = useState(0)
  const [message, setMessage] = useState(null)

  const animations = [
    {
      scale: [1, 1.5, 0.7, 1.2, 1],
      rotate: [0, -5, 5, -3, 0],
      transition: { duration: 1, ease: 'easeOut' }
    },
    {
      y: [0, -400, 150, -120, 60, -30, 0],
      x: [0, 30, -25, 20, -10, 5, 0],
      transition: { duration: 1.8, ease: 'easeOut' }
    },
    {
      scale: [1, 1.3, 0.9, 1.05, 1],
      rotate: [0, 20, -20, 10, -10, 0],
      transition: { duration: 1, ease: 'easeInOut' }
    },
    {
      scale: [1, 2, 0.5, 1.5, 1],
      opacity: [1, 0.7, 1],
      transition: { duration: 1.2, ease: 'easeOut' }
    },
    {
      y: [0, -300, 100, -80, 40, -20, 0],
      x: [0, 20, -15, 10, -5, 0],
      transition: { duration: 1.5, ease: 'easeOut' }
    },
    {
      scale: [1, 1.6, 1.1, 1.4, 1],
      transition: { duration: 0.8, ease: 'easeOut' }
    },
  ]


  const messages = [
    'Un caffè Dandy al giorno toglie il medico di torno!',
    'Vieni al Dandy, ca t facim nu bel cafej!',
    'Tempo di una pausa caffè? Me’ e statt angour!',
  ]

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768)
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const handleLogoClick = () => {
    const now = Date.now()
    const DOUBLE_TAP_DELAY = 300

    if (now - lastTap < DOUBLE_TAP_DELAY) {
      const randomMessage = messages[Math.floor(Math.random() * messages.length)]
      setMessage(randomMessage)
      setTimeout(() => setMessage(null), 2000)

      if (navigator.vibrate) {
        navigator.vibrate([50, 30, 50])
      }
      return
    }

    setLastTap(now)

    const current = animations[animationIndex % animations.length]
    controls.start(current)
    setAnimationIndex(prev => prev + 1)

    if (navigator.vibrate) {
      navigator.vibrate(100)
    }
  }

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
    <motion.div
      className="landing-wrapper"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.5 }}
    >
      <div className="landing-overlay"></div>
      <div className="shine-effect"></div>


      <div className="landing-card">
        <motion.img
          src={DandyLogo}
          alt="Logo Dandy"
          className="landing-logo"
          animate={controls}
          onClick={handleLogoClick}
          whileTap={{ scale: 1.1 }}
          style={{
            cursor: 'pointer',
            transformOrigin: 'center',
          }}
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

      {message && (
        <div className="double-tap-message">
          {message}
        </div>
      )}
    </motion.div>
  )
}

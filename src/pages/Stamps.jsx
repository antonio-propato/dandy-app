import React, { useState, useEffect, useRef } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore'
import { auth, firestore } from '../lib/firebase'
import Nav from '../components/Nav'
import Confetti from 'react-confetti'
import './Stamps.css'

export default function Stamps() {
  const [user, setUser] = useState(null)
  const [stamps, setStamps] = useState([])
  const [loading, setLoading] = useState(true)
  const [showPopup, setShowPopup] = useState(false)
  const [popupMessage, setPopupMessage] = useState('')
  const [showConfetti, setShowConfetti] = useState(false)
  const [showRewardModal, setShowRewardModal] = useState(false)
  const [qrCode, setQrCode] = useState(null)
  const [winSize, setWinSize] = useState({ width: 0, height: 0 })
  const [tapCount, setTapCount] = useState(0)
  const logoRef = useRef(null)
  const cupsRef = useRef([])
  const popupRef = useRef(null)
  const modalRef = useRef(null)
  const totalSlots = 9

  // messages for double-tap
  const dandyMessages = [
    "Ha! Mi hai beccato!",
    "Dandy è il mio nome, caffè è il mio gioco!",
    "Caffè e sorrisi, la vita è bella!",
    "L'odore del caffè, vieni a sentirlo anche tu!",
  ]

  // Animation arrays
  const logoAnimations = ['logoBounce', 'logoRotate', 'logoFade', 'logoSlide', 'logoPop', 'logoSwing']

  // track window size for Confetti
  useEffect(() => {
    const updateSize = () => setWinSize({ width: window.innerWidth, height: window.innerHeight })
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  // fetch or initialize stamps doc
  const fetchStamps = async (uid) => {
    try {
      const stampsRef = doc(firestore, 'stamps', uid)
      const profileRef = doc(firestore, 'users', uid)
      const [sSnap, pSnap] = await Promise.all([
        getDoc(stampsRef),
        getDoc(profileRef)
      ])
      if (pSnap.exists()) {
        setQrCode(pSnap.data().qrCode)
      }
      if (sSnap.exists()) {
        const data = sSnap.data()
        setStamps(data.stamps || [])
        if (data.stamps?.length === totalSlots && !data.rewardClaimed) {
          setShowConfetti(true)
          setShowRewardModal(true)
        }
      } else {
        // new user → 2 free stamps
        const now = new Date().toISOString()
        const initial = [{ date: now }, { date: now }]
        await setDoc(stampsRef, { stamps: initial, rewardClaimed: false })
        setStamps(initial)
        setPopupMessage('Benvenuto! Hai ricevuto 2 timbri omaggio!')
        setShowPopup(true)
      }
    } catch (err) {
      console.error('fetchStamps error', err)
    } finally {
      setLoading(false)
    }
  }

  // auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u)
        fetchStamps(u.uid)
      } else {
        setUser(null)
        setStamps([])
        setLoading(false)
      }
    })
    return unsubscribe
  }, [])

  // add a new stamp
  const addStamp = async () => {
    if (!user) return
    try {
      const newStamp = { date: new Date().toISOString() }
      const updated = [...stamps, newStamp]
      const ref = doc(firestore, 'stamps', user.uid)
      const snap = await getDoc(ref)
      if (snap.exists()) {
        await updateDoc(ref, { stamps: updated })
      } else {
        await setDoc(ref, { stamps: updated, rewardClaimed: false })
      }
      setStamps(updated)
      if (updated.length === totalSlots) {
        setShowConfetti(true)
        setShowRewardModal(true)
      } else {
        setPopupMessage('Timbro aggiunto!')
        setShowPopup(true)
      }
    } catch (err) {
      console.error('addStamp error', err)
      alert('Errore: ' + err.message)
    }
  }

  // reset stamps after redeem
  const resetStamps = async () => {
    if (!user) return
    try {
      const ref = doc(firestore, 'stamps', user.uid)
      await updateDoc(ref, { stamps: [], rewardClaimed: true })
      setStamps([])
      setShowRewardModal(false)
      setShowConfetti(false)
      setPopupMessage('Caffè gratis riscattato! Inizia nuovi timbri.')
      setShowPopup(true)
    } catch (err) {
      console.error('resetStamps error', err)
    }
  }

  // For demo mode - allows adding stamps without authentication
  const addDemoStamp = () => {
    const newStamp = { date: new Date().toISOString() }
    const updated = [...stamps, newStamp]
    setStamps(updated)

    if (updated.length === totalSlots) {
      setShowConfetti(true)
      setShowRewardModal(true)
    } else {
      setPopupMessage('Timbro di demo aggiunto!')
      setShowPopup(true)
    }
  }

  // Enhanced logo animation function
  const animateLogo = () => {
    const logo = logoRef.current
    if (logo) {
      // Remove any existing animation classes
      logo.classList.remove('animate')

      // Force reflow to ensure animations restart
      void logo.offsetWidth

      // Randomly choose an animation
      const randomAnimation = logoAnimations[Math.floor(Math.random() * logoAnimations.length)]
      logo.style.animationName = randomAnimation
      logo.classList.add('animate')
    }
  }

  // Set up random logo animations on a timer
  useEffect(() => {
    if (!loading) {
      // Initial logo animation
      setTimeout(animateLogo, 2000)

      // Set up recurring random animations
      const interval = setInterval(() => {
        animateLogo()
      }, 5000 + Math.floor(Math.random() * 3000)) // Between 5-8 seconds

      return () => clearInterval(interval)
    }
  }, [loading])

  // Auto-close for popup notification only
  useEffect(() => {
    if (showPopup) {
      const timer = setTimeout(() => {
        setShowPopup(false)
      }, 3000)

      return () => clearTimeout(timer)
    }
  }, [showPopup])

  // REMOVED: Auto-close for reward modal - we want it to stay open until user closes it

  // handle logo taps for animation & double-tap message
  const handleLogoTap = () => {
    // Trigger a random animation
    animateLogo()

    setTapCount(count => {
      const next = count + 1
      if (next === 2) {
        const msg = dandyMessages[Math.floor(Math.random() * dandyMessages.length)]
        setPopupMessage(msg)
        setShowPopup(true)
      }
      setTimeout(() => setTapCount(0), 600)
      return next
    })
  }

  // Close reward modal
  const closeRewardModal = () => {
    setShowRewardModal(false)
    // Optionally stop confetti too
    setShowConfetti(false)
  }

  const formatDate = (d) => {
    const dt = new Date(d)
    return `${dt.getDate()}/${dt.getMonth()+1}/${dt.getFullYear()}`
  }

  if (loading) {
    return (
      <div className="stamps-wrapper">
        <Nav />
        <div className="loading">Caricamento...</div>
      </div>
    )
  }

  return (
    <div className="stamps-wrapper">
      <Nav />

      {showConfetti && (
        <Confetti
          width={winSize.width}
          height={winSize.height}
          colors={['#FFD700','#FFDF00','#F0E68C']}
          recycle={false}
          numberOfPieces={300}
        />
      )}

      <div className="logo-container">
        <img
          ref={logoRef}
          onClick={handleLogoTap}
          src="/images/Dandy.jpeg"
          alt="Dandy Logo"
          className="dandy-logo animate"
        />
      </div>

      <p className="stamps-subtitle">Raccogli 9 timbri per un caffè gratis!</p>

      <div className="stamps-container">
        <div className="stamps-grid">
          {Array.from({ length: totalSlots }).map((_, i) => (
            <div key={i} className={`stamp-box ${i < stamps.length ? 'filled' : ''}`}>
              {i < stamps.length && (
                <>
                  <div className="stamp-cup">
                    <img
                      src="/images/cup.jpg"
                      alt="Coffee Cup"
                      className="spinning-cup"
                      ref={el => cupsRef.current[i] = el}
                    />
                  </div>
                  <span className="stamp-date">{formatDate(stamps[i].date)}</span>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Demo buttons */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '20px' }}>
          {stamps.length < totalSlots && (
            <button onClick={user ? addStamp : addDemoStamp} className="add-stamp-button">
              {user ? '+ Aggiungi Timbro' : '+ Aggiungi Timbro (Demo)'}
            </button>
          )}

          {/* Test buttons for modals */}
          <button
            onClick={() => {
              setShowRewardModal(true);
              setShowConfetti(true);
            }}
            className="add-stamp-button"
            style={{ backgroundColor: '#616843' }}
          >
            Test Finestra Riscatto
          </button>
        </div>
      </div>

      {showPopup && (
        <div className="popup-notification" ref={popupRef}>
          <div className="popup-content">
            <p>{popupMessage}</p>
            <button onClick={() => setShowPopup(false)}>Chiudi</button>
          </div>
        </div>
      )}

      {showRewardModal && (
        <div className="reward-modal-overlay" ref={modalRef} onClick={(e) => {
          // Close modal when clicking outside the modal content
          if (e.target === modalRef.current) closeRewardModal();
        }}>
          <div className="reward-modal">
            {/* Add close button */}
            <button className="modal-close-btn" onClick={closeRewardModal}>&times;</button>

            <h2>Congratulazioni!</h2>
            <h3>Il tuo prossimo caffè è gratis!</h3>
            {qrCode && (
              <div className="qr-container">
                <img src={qrCode} alt="QR Code" className="reward-qr" />
              </div>
            )}
            <p>Mostra questo QR code al barista per riscattare.</p>
            <button onClick={resetStamps} className="redeem-button">Riscatta</button>
          </div>
        </div>
      )}
    </div>
  )
}

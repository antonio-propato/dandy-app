import React, { useState, useEffect, useRef } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { doc, getDoc, updateDoc, setDoc, onSnapshot } from 'firebase/firestore'
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
  const [showCongratulationsModal, setShowCongratulationsModal] = useState(false)
  const [showQRModal, setShowQRModal] = useState(false)
  const [qrCode, setQrCode] = useState(null)
  const [winSize, setWinSize] = useState({ width: 0, height: 0 })
  const [tapCount, setTapCount] = useState(0)
  const logoRef = useRef(null)
  const cupsRef = useRef([])
  const popupRef = useRef(null)
  const congratulationsModalRef = useRef(null)
  const qrModalRef = useRef(null)
  const totalSlots = 9
  const lastStampCountRef = useRef(0)

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
        lastStampCountRef.current = data.stamps?.length || 0

        // Show congratulations modal if user has exactly 9 stamps
        if (data.stamps?.length === totalSlots) {
          setShowConfetti(true)
          setShowCongratulationsModal(true)
        }
      } else {
        // new user → 2 free stamps
        const now = new Date().toISOString()
        const initial = [{ date: now }, { date: now }]
        await setDoc(stampsRef, { stamps: initial, rewardClaimed: false })
        setStamps(initial)
        lastStampCountRef.current = 2
        setPopupMessage('Benvenuto! Hai ricevuto 2 timbri omaggio!')
        setShowPopup(true)
      }
    } catch (err) {
      console.error('fetchStamps error', err)
    } finally {
      setLoading(false)
    }
  }

  // Set up real-time listener for stamps changes
  useEffect(() => {
    if (!user) return

    const stampsRef = doc(firestore, 'stamps', user.uid)
    const unsubscribe = onSnapshot(stampsRef, (docSnap) => {
      if (!docSnap.exists()) return

      const data = docSnap.data()
      const newStamps = data.stamps || []

      // Check if stamps were reset (redemption)
      if (lastStampCountRef.current === totalSlots && newStamps.length === 0) {
        // Stamps reset - user redeemed their free coffee
        setShowConfetti(false)
        setShowCongratulationsModal(false)
        setPopupMessage('Caffè gratis riscattato! Inizia nuovi timbri.')
        setShowPopup(true)
      }
      // Check if a new stamp was added
      else if (newStamps.length > lastStampCountRef.current) {
        // New stamp added!
        setPopupMessage('Congratulazioni, ecco il tuo nuovo timbro!')
        setShowPopup(true)

        // Apply highlight animation to the newest stamp
        setTimeout(() => {
          const newestStampIndex = newStamps.length - 1;
          if (cupsRef.current[newestStampIndex]) {
            cupsRef.current[newestStampIndex].classList.add('new-stamp-highlight');

            // Remove class after animation completes
            setTimeout(() => {
              if (cupsRef.current[newestStampIndex]) {
                cupsRef.current[newestStampIndex].classList.remove('new-stamp-highlight');
              }
            }, 1500);
          }
        }, 300);

        // Check if we've reached the reward threshold
        if (newStamps.length === totalSlots) {
          setShowConfetti(true)
          setShowCongratulationsModal(true)
        }
      }

      setStamps(newStamps)
      // Update the reference count
      lastStampCountRef.current = newStamps.length
    }, (error) => {
      console.error("Error in stamps listener:", error)
    })

    return () => unsubscribe()
  }, [user])

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

  // add a new stamp (this won't add a 10th stamp if we already have 9)
  const addStamp = async () => {
    if (!user) return

    // If we already have 9 stamps, don't add more
    if (stamps.length >= totalSlots) {
      setShowConfetti(true)
      setShowCongratulationsModal(true)
      return
    }

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

      // We don't need to setStamps here because the onSnapshot will update it
      // But we can show the popup message
      setPopupMessage('Timbro aggiunto!')
      setShowPopup(true)
    } catch (err) {
      console.error('addStamp error', err)
      alert('Errore: ' + err.message)
    }
  }

  // Close congratulations modal
  const closeCongratulationsModal = () => {
    setShowCongratulationsModal(false)
    setShowConfetti(false)
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

  // Toggle QR Modal
  const toggleQRModal = () => {
    setShowQRModal(!showQRModal)
  }

  // Close QR modal
  const closeQRModal = () => {
    setShowQRModal(false)
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

        {/* QR Code Button */}
        {qrCode && user && (
          <button onClick={toggleQRModal} className="qr-button">
            Mostra QR Code
          </button>
        )}
      </div>

      {/* QR Code Modal */}
      {showQRModal && qrCode && (
        <div className="qr-modal-overlay" ref={qrModalRef} onClick={(e) => {
          if (e.target === qrModalRef.current) closeQRModal();
        }}>
          <div className="qr-modal">
            <button className="modal-close-btn" onClick={closeQRModal}>&times;</button>
            <div className="qr-container">
              <img src={qrCode} alt="Il tuo QR Code personale" className="profile-qr" />
            </div>
          </div>
        </div>
      )}

      {showPopup && (
        <div className="popup-notification" ref={popupRef}>
          <div className="popup-content">
            <p>{popupMessage}</p>
            <button onClick={() => setShowPopup(false)}>Chiudi</button>
          </div>
        </div>
      )}

      {/* Congratulations Modal - tappable anywhere to close */}
      {showCongratulationsModal && (
        <div
          className="congratulations-modal-overlay"
          onClick={closeCongratulationsModal}
        >
          <div className="congratulations-modal">
            <h2>Congratulazioni!</h2>
            <h3>Goditi il tuo decimo caffè gratis!</h3>
            <p>Tocca per chiudere e mostra il tuo QR code al barista</p>
          </div>
        </div>
      )}
    </div>
  )
}

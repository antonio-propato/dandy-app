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

  // Show congratulations modal helper function
  const showRewardModal = () => {
    setShowConfetti(true)
    setShowCongratulationsModal(true)
  }

  // Reset stamps after reward is claimed
  const resetStamps = async () => {
    if (!user) return

    try {
      const stampsRef = doc(firestore, 'stamps', user.uid)
      await updateDoc(stampsRef, {
        stamps: [],
        rewardClaimed: true
      })

      setPopupMessage('Caffè gratis riscattato! Inizia nuovi timbri.')
      setShowPopup(true)
      setShowConfetti(false)
      setShowCongratulationsModal(false)

      // State will be updated by the onSnapshot listener
    } catch (err) {
      console.error('resetStamps error', err)
      alert('Errore durante il reset: ' + err.message)
    }
  }

  // Add Free Stamps to NEW users only - improved version
  const addFreeStampsForNewUser = async (userId) => {
    console.log('Checking if user should receive free welcome stamps:', userId);

    try {
      // Check if the user already has a stamps document
      const stampsRef = doc(firestore, 'stamps', userId);
      const snap = await getDoc(stampsRef);

      if (snap.exists()) {
        // Document exists, but check if it has 0 stamps (still could be a new user)
        const data = snap.data();
        const userStamps = data.stamps || [];

        if (userStamps.length === 0 && !data.receivedFreeStamps) {
          // User has a document with 0 stamps and hasn't received free stamps yet
          console.log('User has 0 stamps - adding 2 free welcome stamps');
          const now = new Date().toISOString();

          // Add 2 free stamps
          await updateDoc(stampsRef, {
            stamps: [{ date: now }, { date: now }],
            receivedFreeStamps: true
          });

          // Show welcome message
          setPopupMessage('Benvenuto! Hai ricevuto 2 timbri omaggio!');
          setShowPopup(true);
          return true;
        } else {
          // User already has stamps or has already received free stamps
          console.log('User already has stamps or has received free stamps before');
          return false;
        }
      } else {
        // This is a completely new user - create document with 2 free stamps
        console.log('NEW USER: Creating stamps document with 2 free welcome stamps');
        const now = new Date().toISOString();

        // Create the stamps document with 2 stamps and mark they've received free stamps
        await setDoc(stampsRef, {
          stamps: [{ date: now }, { date: now }],
          rewardClaimed: false,
          receivedFreeStamps: true
        });

        // Show welcome message
        setPopupMessage('Benvenuto! Hai ricevuto 2 timbri omaggio!');
        setShowPopup(true);
        return true;
      }
    } catch (error) {
      console.error('Failed to add free stamps for new user:', error);
      return false;
    }
  };

  // fetch or initialize stamps doc
  const fetchStamps = async (uid) => {
    if (!uid) {
      console.error('No user ID provided to fetchStamps');
      setLoading(false);
      return;
    }

    try {
      console.log('Fetching stamps for user:', uid);
      const stampsRef = doc(firestore, 'stamps', uid);
      const profileRef = doc(firestore, 'users', uid);

      // Get user profile for QR code
      const pSnap = await getDoc(profileRef);
      if (pSnap.exists()) {
        setQrCode(pSnap.data().qrCode);
      }

      // Get stamps document
      const stampsSnap = await getDoc(stampsRef);

      if (stampsSnap.exists()) {
        // Get stamps data
        const data = stampsSnap.data();
        const userStamps = data.stamps || [];
        console.log('User has', userStamps.length, 'stamps');

        // Update local state
        setStamps(userStamps);
        lastStampCountRef.current = userStamps.length;

        // Show congratulations modal if user has exactly 9 stamps
        if (userStamps.length === totalSlots) {
          showRewardModal();
        }
      } else {
        // This should never happen as we create the document in auth listener
        console.error('No stamps document found - this should not happen');
        setStamps([]);
      }
    } catch (err) {
      console.error('fetchStamps error:', err);
      // Fallback to empty array
      setStamps([]);
    } finally {
      setLoading(false);
    }
  };

  // Set up real-time listener for stamps changes
  useEffect(() => {
    if (!user) return

    console.log('Setting up stamps listener for user:', user.uid)

    const stampsRef = doc(firestore, 'stamps', user.uid)
    const unsubscribe = onSnapshot(stampsRef, async (docSnap) => {
      if (!docSnap.exists()) {
        console.log('Stamps document does not exist in listener')
        return
      }

      const data = docSnap.data()
      let newStamps = data.stamps || []
      console.log('Stamps update from Firestore:', newStamps.length, 'stamps')

      // Critical check: if stamps exceed totalSlots, reset them automatically
      if (newStamps.length > totalSlots) {
        console.log('Detected more than 9 stamps, resetting to 0')
        try {
          await updateDoc(stampsRef, {
            stamps: [],
            rewardClaimed: true
          })
          setPopupMessage('Caffè gratis riscattato! Inizia nuovi timbri.')
          setShowPopup(true)
          setShowConfetti(false)
          setShowCongratulationsModal(false)
          // The next update from Firebase will have 0 stamps
          return
        } catch (err) {
          console.error('Auto-reset error', err)
        }
      }

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
          showRewardModal()
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
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        console.log('User authenticated:', u.uid);
        setUser(u);

        // Check if this is a new user and give free stamps if needed
        await addFreeStampsForNewUser(u.uid);

        // Now fetch stamps (will include free ones for new users)
        fetchStamps(u.uid);
      } else {
        console.log('User signed out');
        setUser(null);
        setStamps([]);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  // add a new stamp
  const addStamp = async () => {
    if (!user) return

    try {
      // First check current stamps to see if reset is needed
      const stampsRef = doc(firestore, 'stamps', user.uid)
      const snap = await getDoc(stampsRef)

      if (snap.exists()) {
        const currentStamps = snap.data().stamps || []

        // If already at 9 stamps, reset instead of adding
        if (currentStamps.length >= totalSlots) {
          await updateDoc(stampsRef, {
            stamps: [],
            rewardClaimed: true
          })

          setPopupMessage('Caffè gratis riscattato! Inizia nuovi timbri.')
          setShowPopup(true)
          return
        }

        // Otherwise add a new stamp
        const newStamp = { date: new Date().toISOString() }
        const updated = [...currentStamps, newStamp]
        await updateDoc(stampsRef, { stamps: updated })
      } else {
        // Document doesn't exist - create with one stamp
        const newStamp = { date: new Date().toISOString() }
        await setDoc(stampsRef, {
          stamps: [newStamp],
          rewardClaimed: false
        })
      }

      // We don't need to setStamps here because the onSnapshot will update it
      setPopupMessage('Timbro aggiunto!')
      setShowPopup(true)
    } catch (err) {
      console.error('addStamp error', err)
      alert('Errore: ' + err.message)
    }
  }

  // Close congratulations modal without resetting (user wants to save it)
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

      {/* Congratulations Modal - only close button */}
      {showCongratulationsModal && (
        <div className="congratulations-modal-overlay">
          <div className="congratulations-modal">
            <h2>Congratulazioni!</h2>
            <h3>Goditi il tuo decimo caffè gratis!</h3>
            <p>Mostra questa schermata al barista</p>
            <div className="modal-buttons">
              <button onClick={closeCongratulationsModal} className="secondary-button">
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

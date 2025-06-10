import React, { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, firestore, functions } from '../lib/firebase';
import Nav from '../components/Nav';
import './Stamps.css';

export default function Stamps() {
  const [user, setUser] = useState(null);
  const [stamps, setStamps] = useState([]);
  const [displayStamps, setDisplayStamps] = useState([]); // For visual continuity
  const [lifetimeStats, setLifetimeStats] = useState({ lifetimeStamps: 0, rewardsEarned: 0, availableRewards: 0 });
  const [loading, setLoading] = useState(true);
  const [showPopup, setShowPopup] = useState(false);
  const [popupMessage, setPopupMessage] = useState('');
  const [showQRModal, setShowQRModal] = useState(false);
  const [showRewardModal, setShowRewardModal] = useState(false);
  const [showBirthdayModal, setShowBirthdayModal] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [qrCode, setQrCode] = useState(null);
  const [tapCount, setTapCount] = useState(0);
  const [isNewCycle, setIsNewCycle] = useState(false); // Track if we're starting a new cycle

  const logoRef = useRef(null);
  const cupsRef = useRef([]);
  const lastStampCountRef = useRef(0);
  const lastAvailableRewardsRef = useRef(0);

  const totalSlots = 9;
  const dandyMessages = ["Vuoi un caffe'? E stat angour 😁", "Tu si' bell com o cafe' Dandy!", "E' l'ora del Dandy!", "Un timbro in più, nu cafe' di chiu!", "Come me, non c'e' nessuuuuno!"];
  const logoAnimations = ['logoBounce', 'logoRotate', 'logoFade', 'logoSlide', 'logoPop', 'logoSwing'];

  // Initialize the Cloud Function
  const claimAndResetReward = httpsCallable(functions, 'claimAndResetReward');

  const claimReward = async () => {
    if (!user || lifetimeStats.availableRewards <= 0 || isClaiming) return;
    setIsClaiming(true);
    try {
      await claimAndResetReward();
      setPopupMessage('🎉 Premio riscattato! Goditi il tuo caffè!');
      setShowPopup(true);
      setShowRewardModal(false);
      // Keep displaying 9 stamps until next scan
      setIsNewCycle(true);
    } catch (error) {
      console.error('Error claiming reward:', error);
      alert(`Errore durante il riscatto: ${error.message}`);
    } finally {
      setIsClaiming(false);
    }
  };

  // Close QR modal smoothly
  const closeQRModal = () => {
    setShowQRModal(false);
  };

  useEffect(() => {
    if (!user) return;

    const stampsRef = doc(firestore, 'stamps', user.uid);
    const unsubscribe = onSnapshot(stampsRef, (docSnap) => {
      if (!docSnap.exists()) return;

      const data = docSnap.data();
      const newStamps = data.stamps || [];
      const prevStampCount = lastStampCountRef.current;
      const stampsAdded = newStamps.length - prevStampCount;
      const prevAvailableRewards = lastAvailableRewardsRef.current;
      const currentAvailableRewards = data.availableRewards || 0;

      // Handle new cycle logic
      if (isNewCycle && stampsAdded > 0) {
        setIsNewCycle(false);
        setDisplayStamps(newStamps);
      } else if (!isNewCycle) {
        setDisplayStamps(newStamps);
      }

      // --- NOTIFICATION LOGIC ---

      // 1. A reward was just earned (the grid is now full)
      if (prevStampCount < 9 && newStamps.length === 9) {
        // Close QR modal with a slight delay for smooth transition
        setTimeout(() => setShowQRModal(false), 150);

        setPopupMessage('🎉 Congratulazioni! Hai completato la raccolta!');
        setShowPopup(true);

        // Show reward modal after popup appears
        setTimeout(() => {
          setShowRewardModal(true);
        }, 800);

        // Animate the final stamp
        setTimeout(() => {
          const finalCup = cupsRef.current[8];
          if (finalCup) {
            finalCup.classList.add('new-stamp-highlight');
            setTimeout(() => finalCup.classList.remove('new-stamp-highlight'), 1500);
          }
        }, 300);
      }
      // 2. Birthday bonus was just added
      else if (stampsAdded === 2) {
        setTimeout(() => setShowQRModal(false), 150);

        // Show birthday modal after QR modal closes
        setTimeout(() => {
          setShowBirthdayModal(true);
        }, 300);

        setTimeout(() => {
          for (let i = 0; i < 2; i++) {
            const cupElement = cupsRef.current[newStamps.length - 1 - i];
            if (cupElement) {
              cupElement.classList.add('new-stamp-highlight');
              setTimeout(() => cupElement.classList.remove('new-stamp-highlight'), 1500);
            }
          }
        }, 500);
      }
      // 3. A single, normal stamp was added
      else if (stampsAdded === 1) {
        setTimeout(() => setShowQRModal(false), 150);

        setPopupMessage("Timbro aggiunto con successo!");
        setShowPopup(true);

        setTimeout(() => {
          const cupElement = cupsRef.current[newStamps.length - 1];
          if (cupElement) {
            cupElement.classList.add('new-stamp-highlight');
            setTimeout(() => cupElement.classList.remove('new-stamp-highlight'), 1500);
          }
        }, 300);
      }

      // Update lifetime stats
      setLifetimeStats({
        lifetimeStamps: data.lifetimeStamps || 0,
        rewardsEarned: data.rewardsEarned || 0,
        availableRewards: currentAvailableRewards,
      });

      setStamps(newStamps);
      lastStampCountRef.current = newStamps.length;
      lastAvailableRewardsRef.current = currentAvailableRewards;
    }, (error) => {
      console.error("Error in stamps listener:", error);
    });

    return () => unsubscribe();
  }, [user, isNewCycle]);

  useEffect(() => {
    const handleLogout = () => {
      sessionStorage.removeItem('welcome_popup_shown');
      setUser(null);
      setStamps([]);
      setDisplayStamps([]);
      setLifetimeStats({ lifetimeStamps: 0, rewardsEarned: 0, availableRewards: 0 });
      setLoading(false);
      setIsNewCycle(false);
    };

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setLoading(true);
      if (u) {
        setUser(u);
        const userRef = doc(firestore, 'users', u.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          setQrCode(userSnap.data().qrCode);
        }
        setLoading(false);
      } else {
        handleLogout();
      }
    });
    return unsubscribe;
  }, []);

  const handleLogoTap = () => {
    const logo = logoRef.current;
    if (logo) {
      logo.classList.remove('animate');
      void logo.offsetWidth;
      const randomAnimation = logoAnimations[Math.floor(Math.random() * logoAnimations.length)];
      logo.style.animationName = randomAnimation;
      logo.classList.add('animate');
    }
    setTapCount(count => {
      const next = count + 1;
      if (next === 2) {
        setPopupMessage(dandyMessages[Math.floor(Math.random() * dandyMessages.length)]);
        setShowPopup(true);
      }
      setTimeout(() => setTapCount(0), 600);
      return next;
    });
  };

  useEffect(() => {
    if (showPopup) {
      const timer = setTimeout(() => setShowPopup(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showPopup]);

  const formatDate = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    return `${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear()}`;
  };

  if (loading) {
    return <div className="stamps-wrapper"><Nav /><div className="loading">Caricamento...</div></div>;
  }

  // Use displayStamps for rendering to maintain visual continuity
  const stampsToDisplay = isNewCycle ? displayStamps : stamps;

  return (
    <div className="stamps-wrapper">
      <Nav />
      <div className="logo-container">
        <img ref={logoRef} onClick={handleLogoTap} src="/images/Dandy.jpeg" alt="Dandy Logo" className="dandy-logo animate" />
      </div>
      <p className="stamps-subtitle">Raccogli 9 timbri per un caffè gratis!</p>
      <div className="stamps-container">
        <div className="stamps-grid">
          {Array.from({ length: totalSlots }).map((_, i) => (
            <div key={i} className={`stamp-box ${i < stampsToDisplay.length ? 'filled' : ''} ${isNewCycle && i < stampsToDisplay.length ? 'old-cycle' : ''}`}>
              {i < stampsToDisplay.length && (
                <>
                  <div className="stamp-cup">
                    <img src="/images/cup.jpg" alt="Coffee Cup" className="spinning-cup" ref={el => cupsRef.current[i] = el} />
                  </div>
                  <span className="stamp-date">{formatDate(stampsToDisplay[i].date)}</span>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="stamp-counter">
          <p>Timbri attuali: <strong>{stamps.length}/{totalSlots}</strong></p>
          <p>Timbri totali: <strong>{lifetimeStats.lifetimeStamps}</strong></p>
          <p>Premi guadagnati: <strong>{lifetimeStats.rewardsEarned}</strong></p>
          {lifetimeStats.availableRewards > 0 && (
            <p style={{ color: '#FFD700', fontWeight: 'bold' }}>Premi disponibili: <strong>{lifetimeStats.availableRewards}</strong></p>
          )}
        </div>
        <div className="button-container">
          {qrCode && user && (
            <button onClick={() => setShowQRModal(true)} className="qr-button">
              Mostra QR Code
            </button>
          )}
          {lifetimeStats.availableRewards > 0 && (
            <button
              onClick={() => setShowRewardModal(true)}
              className={`reward-button ${lifetimeStats.availableRewards > 0 ? 'pulse' : ''}`}
            >
              Premi ({lifetimeStats.availableRewards})
            </button>
          )}
        </div>
      </div>

      {showQRModal && qrCode && (
        <div className="qr-modal-overlay" onClick={closeQRModal}>
          <div className="qr-modal-content" onClick={e => e.stopPropagation()}>
            <h3>Il tuo QR Code</h3>
            <img src={qrCode} alt="QR Code" className="qr-code-image" />
            <button onClick={closeQRModal} className="close-button">Chiudi</button>
          </div>
        </div>
      )}

      {showRewardModal && (
        <div className="reward-modal-overlay" onClick={() => setShowRewardModal(false)}>
          <div className="reward-modal-content" onClick={e => e.stopPropagation()}>
            <h3>🎉 Premio Disponibile! 🎉</h3>
            <p>Hai {lifetimeStats.availableRewards} premi{lifetimeStats.availableRewards > 1 ? '' : 'o'} da riscattare!</p>
            <button onClick={claimReward} className="claim-reward-button" disabled={isClaiming}>
              {isClaiming ? 'Riscattando...' : 'Riscatta Premio Ora'}
            </button>
            <button onClick={() => setShowRewardModal(false)} className="close-button" disabled={isClaiming}>Chiudi</button>
          </div>
        </div>
      )}

      {showBirthdayModal && (
        <div className="reward-modal-overlay" onClick={() => setShowBirthdayModal(false)}>
          <div className="reward-modal-content" onClick={e => e.stopPropagation()}>
            <h3>🎉 Tanti Auguri! 🎉</h3>
            <p>Hai ricevuto un timbro extra in regalo! ❤️</p>
            <button onClick={() => setShowBirthdayModal(false)} className="close-button">
              Grande!
            </button>
          </div>
        </div>
      )}

      {showPopup && <div className="popup-notification">{popupMessage}</div>}
    </div>
  );
}

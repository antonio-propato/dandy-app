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
  const [showWelcomeModal, setShowWelcomeModal] = useState(false); // NEW: Welcome modal for new users
  const [pendingBirthdayModal, setPendingBirthdayModal] = useState(false); // NEW: Queue birthday modal after reward modal
  const [qrCode, setQrCode] = useState(null);
  const [rewardQRCode, setRewardQRCode] = useState(null); // NEW: For reward QR
  const [generatingQR, setGeneratingQR] = useState(false); // NEW: Loading state for QR generation
  const [tapCount, setTapCount] = useState(0);
  const [isNewCycle, setIsNewCycle] = useState(false); // Track if we're starting a new cycle
  const [showingCompletedGrid, setShowingCompletedGrid] = useState(false); // Track if we're showing a completed 9-stamp grid

  const logoRef = useRef(null);
  const cupsRef = useRef([]);
  const lastStampCountRef = useRef(0);
  const lastAvailableRewardsRef = useRef(0);
  const lastLifetimeStampsRef = useRef(0);
  const lastBirthdayBonusRef = useRef(null); // FIXED: Track previous birthday bonus year

  const totalSlots = 9;
  const dandyMessages = ["Vuoi un caffe'? E stat angour 😁", "Tu si' bell com o cafe' Dandy!", "E' l'ora del Dandy!", "Un timbro in più, nu cafe' di chiu!", "Come me, non c'e' nessuuuuno!"];
  const logoAnimations = ['logoBounce', 'logoRotate', 'logoFade', 'logoSlide', 'logoPop', 'logoSwing'];

  // Initialize the Cloud Functions
  const generateRewardQR = httpsCallable(functions, 'generateRewardQR'); // NEW: Generate reward QR

  // NEW: Generate reward QR code
  const handleGenerateRewardQR = async () => {
    console.log('🔍 QR Generation Check:', {
      user: !!user,
      availableRewards: lifetimeStats.availableRewards,
      generatingQR: generatingQR
    });

    if (!user) {
      console.log('❌ No user found');
      return;
    }

    if (lifetimeStats.availableRewards <= 0) {
      console.log('❌ No available rewards:', lifetimeStats.availableRewards);
      return;
    }

    if (generatingQR) {
      console.log('❌ Already generating QR');
      return;
    }

    setGeneratingQR(true);
    try {
      console.log('🎁 Starting reward QR generation...');
      const result = await generateRewardQR();
      console.log('📱 QR Generation result:', result);

      if (result.data && result.data.success) {
        setRewardQRCode(result.data.qrCodeDataURL);
        console.log('✅ Reward QR generated successfully');
      } else {
        console.error('❌ QR generation failed - no success flag');
        throw new Error('Failed to generate reward QR - no success response');
      }
    } catch (error) {
      console.error('💥 Error generating reward QR:', error);
      setPopupMessage(`❌ Errore QR: ${error.message}`);
      setShowPopup(true);
    } finally {
      setGeneratingQR(false);
    }
  };

  // Close QR modal smoothly
  const closeQRModal = () => {
    setShowQRModal(false);
  };

  // NEW: Close reward modal and clear QR
  const closeRewardModal = () => {
    setShowRewardModal(false);
    setRewardQRCode(null);

    // Check if birthday modal should show after reward modal closes
    if (pendingBirthdayModal) {
      setPendingBirthdayModal(false);
      setTimeout(() => {
        setShowBirthdayModal(true);
      }, 200); // Small delay for smooth transition
    }
  };

  useEffect(() => {
    if (!user) return;

    const stampsRef = doc(firestore, 'stamps', user.uid);
    const unsubscribe = onSnapshot(stampsRef, (docSnap) => {
      if (!docSnap.exists()) return;

      const data = docSnap.data();
      const newStamps = data.stamps || [];
      const newLifetimeStamps = data.lifetimeStamps || 0;
      const currentAvailableRewards = data.availableRewards || 0;
      const receivedFreeStamps = data.receivedFreeStamps || false; // Check if user got signup bonus
      const birthdayBonusYear = data.birthdayBonusYear; // FIXED: Check for birthdayBonusYear instead

      const prevStampCount = lastStampCountRef.current;
      const prevAvailableRewards = lastAvailableRewardsRef.current;
      const prevLifetimeStamps = lastLifetimeStampsRef.current;
      const prevBirthdayBonusYear = lastBirthdayBonusRef.current; // FIXED: Track previous birthday bonus year

      const stampsAdded = newStamps.length - prevStampCount;
      const lifetimeStampsAdded = newLifetimeStamps - prevLifetimeStamps;
      const rewardEarned = currentAvailableRewards > prevAvailableRewards;
      const rewardRedeemed = currentAvailableRewards < prevAvailableRewards;

      // FIXED: Check if birthday bonus was JUST given by comparing years
      const currentYear = new Date().getFullYear();
      const birthdayBonusJustGiven = birthdayBonusYear === currentYear && birthdayBonusYear !== prevBirthdayBonusYear;

      // Handle new cycle and completed grid display logic
      if (showingCompletedGrid && lifetimeStampsAdded > 0) {
        // User scanned again after completing a grid - start new cycle
        setShowingCompletedGrid(false);
        setIsNewCycle(false);
        setDisplayStamps(newStamps);
      } else if (isNewCycle && newStamps.length > 0) {
        // User claimed reward and now has new stamps
        setIsNewCycle(false);
        setDisplayStamps(newStamps);
      } else if (!showingCompletedGrid && !isNewCycle) {
        // Normal case - just update display
        setDisplayStamps(newStamps);
      }
      // If showingCompletedGrid and no new stamps, keep current displayStamps

      // --- CLEANED UP NOTIFICATION LOGIC ---

      // 1. A reward was redeemed via QR scan (detected by decrease in availableRewards)
      if (rewardRedeemed) {
        console.log('🎁 Reward redeemed via QR - closing modal');
        setShowRewardModal(false);
        setRewardQRCode(null); // Clear the QR code
        setPopupMessage('🎉 Premio riscattato con successo!');
        setShowPopup(true);

        // If stamps were reset to 0, start new cycle
        if (newStamps.length === 0) {
          setIsNewCycle(true);
          setShowingCompletedGrid(false);
          setDisplayStamps([]);
        }
      }
      // 2. A reward was just earned (detected by increase in availableRewards)
      else if (rewardEarned) {
        // Close QR modal with a slight delay for smooth transition
        setTimeout(() => setShowQRModal(false), 150);

        // Check if there are stamps in the new cycle (e.g., birthday scan that gave 2 stamps)
        if (newStamps.length > 0) {
          // Show the new cycle stamps (e.g., birthday scan completed grid + started new cycle)
          setDisplayStamps(newStamps);
          setShowingCompletedGrid(false);
          setIsNewCycle(false);
        } else {
          // Normal grid completion - show completed 9-stamp grid
          const completedGrid = Array.from({ length: 9 }, (_, i) => ({
            date: new Date(Date.now() - (8 - i) * 1000).toISOString() // Create fake timestamps
          }));
          setDisplayStamps(completedGrid);
          setShowingCompletedGrid(true);
        }

        setPopupMessage('🎉 Congratulazioni! Hai completato la raccolta!');
        setShowPopup(true);

        // Check if birthday bonus was also given during this reward-earning scan
        if (birthdayBonusJustGiven) {
          setPendingBirthdayModal(true); // Queue birthday modal for after reward modal closes
        }

        // Show reward modal after popup appears
        setTimeout(() => {
          setShowRewardModal(true);
        }, 800);

        // Animate the appropriate stamp(s)
        setTimeout(() => {
          if (newStamps.length > 0) {
            // Highlight stamps in new cycle
            for (let i = 0; i < newStamps.length; i++) {
              const cupElement = cupsRef.current[i];
              if (cupElement) {
                cupElement.classList.add('new-stamp-highlight');
                setTimeout(() => cupElement.classList.remove('new-stamp-highlight'), 1500);
              }
            }
          } else {
            // Highlight the final stamp in completed grid
            const finalCup = cupsRef.current[8]; // Always the 9th position
            if (finalCup) {
              finalCup.classList.add('new-stamp-highlight');
              setTimeout(() => finalCup.classList.remove('new-stamp-highlight'), 1500);
            }
          }
        }, 300);
      }
      // 3. New user signup - WELCOME MODAL ONLY (no birthday mention ever)
      else if (receivedFreeStamps && prevLifetimeStamps === 0) {
        setTimeout(() => setShowQRModal(false), 150);

        // Show welcome modal for new users - NO birthday logic here
        setTimeout(() => {
          setShowWelcomeModal(true);
        }, 300);

        setTimeout(() => {
          // Highlight the 2 signup stamps only
          for (let i = 0; i < 2 && i < newStamps.length; i++) {
            const cupElement = cupsRef.current[newStamps.length - 1 - i];
            if (cupElement) {
              cupElement.classList.add('new-stamp-highlight');
              setTimeout(() => cupElement.classList.remove('new-stamp-highlight'), 1500);
            }
          }
        }, 500);
      }
      // 4. Birthday bonus during QR scan (FIXED: Proper birthday detection)
      else if (birthdayBonusJustGiven && prevLifetimeStamps > 0 && lifetimeStampsAdded > 0 && !rewardEarned) {
        console.log('🎂 Birthday bonus detected! Showing birthday modal...');
        setTimeout(() => setShowQRModal(false), 150);

        // Show birthday modal for existing users scanning on birthday
        setTimeout(() => {
          setShowBirthdayModal(true);
        }, 300);

        setTimeout(() => {
          // Highlight all new stamps from this scan (could be 1 normal + 1 birthday = 2 total)
          const stampsToHighlight = Math.min(lifetimeStampsAdded, newStamps.length);
          for (let i = 0; i < stampsToHighlight; i++) {
            const cupElement = cupsRef.current[newStamps.length - 1 - i];
            if (cupElement) {
              cupElement.classList.add('new-stamp-highlight');
              setTimeout(() => cupElement.classList.remove('new-stamp-highlight'), 1500);
            }
          }
        }, 500);
      }
      // 5. Normal stamp scan (no birthday JUST given, no reward earned)
      else if (lifetimeStampsAdded === 1 && !rewardEarned && !birthdayBonusJustGiven) {
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
        lifetimeStamps: newLifetimeStamps,
        rewardsEarned: data.rewardsEarned || 0,
        availableRewards: currentAvailableRewards,
      });

      setStamps(newStamps);
      lastStampCountRef.current = newStamps.length;
      lastAvailableRewardsRef.current = currentAvailableRewards;
      lastLifetimeStampsRef.current = newLifetimeStamps;
      lastBirthdayBonusRef.current = birthdayBonusYear; // FIXED: Track birthdayBonusYear instead

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
      setShowingCompletedGrid(false);
      setRewardQRCode(null);
      setShowWelcomeModal(false);
      setShowBirthdayModal(false);
      setPendingBirthdayModal(false); // NEW: Reset pending birthday modal
      // Reset refs on logout
      lastStampCountRef.current = 0;
      lastAvailableRewardsRef.current = 0;
      lastLifetimeStampsRef.current = 0;
      lastBirthdayBonusRef.current = null; // FIXED: Reset birthday bonus ref
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

  // NEW: Auto-generate QR when reward modal opens
  useEffect(() => {
    if (showRewardModal && lifetimeStats.availableRewards > 0 && !rewardQRCode && !generatingQR) {
      console.log('🎁 Auto-generating reward QR when modal opens...');
      handleGenerateRewardQR();
    }
  }, [showRewardModal, lifetimeStats.availableRewards]);

  const formatDate = (d) => {
    if (!d) return '';
    const dt = new Date(d);
    return `${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear()}`;
  };

  if (loading) {
    return <div className="stamps-wrapper"><Nav /><div className="loading">Caricamento...</div></div>;
  }

  // Use displayStamps for rendering to maintain visual continuity
  const stampsToDisplay = (isNewCycle || showingCompletedGrid) ? displayStamps : stamps;

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
        <div className="reward-modal-overlay" onClick={closeRewardModal}>
          <div className="reward-modal-content" onClick={e => e.stopPropagation()}>
            <h3>🎁 Congratulazioni!</h3>
            <p>Hai {lifetimeStats.availableRewards} premi{lifetimeStats.availableRewards > 1 ? '' : 'o'} da riscattare!</p>

            {/* NEW: Show reward QR code */}
            {rewardQRCode && (
              <div className="reward-qr-section">
                <img src={rewardQRCode} alt="Reward QR Code" className="qr-code-image" />
                <p style={{ fontSize: '0.9rem', color: '#555', marginTop: '0.5rem' }}>
                  Mostra questo QR al personale per riscattare il premio
                </p>
              </div>
            )}

            {/* Loading state for QR generation */}
            {generatingQR && (
              <div className="qr-loading">
                <p>Generazione QR in corso...</p>
                <div className="loader"></div>
              </div>
            )}

            {/* Manual QR generation button if auto-generation failed */}
            {!rewardQRCode && !generatingQR && (
              <button
                onClick={handleGenerateRewardQR}
                className="qr-button"
                style={{ margin: '0.5rem 0' }}
              >
                Genera QR Premio
              </button>
            )}

            <button onClick={closeRewardModal} className="close-button">
              Chiudi
            </button>
          </div>
        </div>
      )}

      {/* CLEAN WELCOME MODAL - No birthday mention ever */}
      {showWelcomeModal && (
        <div className="reward-modal-overlay" onClick={() => setShowWelcomeModal(false)}>
          <div className="reward-modal-content" onClick={e => e.stopPropagation()}>
            <h3>Benvenuto da Dandy!</h3>
            <p>Grazie per esserti iscritto! Hai ricevuto <strong>2 timbri gratuiti</strong> per iniziare! ☕️</p>
            <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.5rem' }}>
              Raccogline altri {9 - lifetimeStats.lifetimeStamps} per il tuo primo caffè gratis!
            </p>
            <button onClick={() => setShowWelcomeModal(false)} className="close-button">
              OK
            </button>
          </div>
        </div>
      )}

      {/* BIRTHDAY MODAL - Only during QR scans */}
      {showBirthdayModal && (
        <div className="reward-modal-overlay" onClick={() => setShowBirthdayModal(false)}>
          <div className="reward-modal-content" onClick={e => e.stopPropagation()}>
            <h3>🎉 Tanti Auguri! 🎉</h3>
            <p>È il tuo compleanno! Hai ricevuto <strong>1 timbro extra</strong> in regalo! 🎂❤️</p>
            <button onClick={() => setShowBirthdayModal(false)} className="close-button">
              Yay!
            </button>
          </div>
        </div>
      )}

      {showPopup && <div className="popup-notification">{popupMessage}</div>}
    </div>
  );
}

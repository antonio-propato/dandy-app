// src/components/PWAInstallPrompt.jsx - iOS Compatible with Real Screenshots
import React from 'react';

const RealSafariDemo = () => {
  const [step, setStep] = React.useState(0);

  // Real Safari screenshots - Fixed syntax
  const screenshots = [
    '/images/Landing-1.png',  // Share button in Safari toolbar
    '/images/Landing-2.png',  // Share menu full-screen with "Add to Home Screen"
    '/images/Landing-3.png'   // App installed on the home screen
  ];

  const stepTexts = [
    "1. Tocca 'Condividi'",
    "2. 'Aggiungi a Home Screen'",
    "3. App Installata!"
  ];

  React.useEffect(() => {
    const getStepDuration = (currentStep) => {
      if (currentStep === 0) return 3000; // 3 seconds to highlight share button
      if (currentStep === 1) return 3000; // 3 seconds to highlight "Add to Home Screen"
      if (currentStep === 2) return 3000; // 3 seconds to show success
      return 2500;
    };

    const timer = setTimeout(() => {
      setStep(prev => (prev + 1) % screenshots.length);
    }, getStepDuration(step));

    return () => clearTimeout(timer);
  }, [step, screenshots.length]);

  return (
    <div style={{
      width: '180px',
      height: '240px',
      position: 'relative',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    }}>
      {/* Real iPhone Demo */}
      <div style={{
        width: '140px',
        height: '200px',
        background: '#000',
        borderRadius: '28px',
        padding: '6px',
        position: 'relative',
        boxShadow: '0 8px 20px rgba(0,0,0,0.3)'
      }}>
        {/* Screen Container */}
        <div style={{
          width: '100%',
          height: '100%',
          borderRadius: '22px',
          position: 'relative',
          overflow: 'hidden',
          background: '#f0f0f0'
        }}>
          {/* Real Screenshot */}
          <img
            src={screenshots[step]}
            alt={`Safari Demo Step ${step + 1}`}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center',
              transition: 'all 0.5s ease',
              borderRadius: '22px'
            }}
            onError={(e) => {
              // Fallback if image doesn't load
              e.target.style.display = 'none';
              console.log('Image failed to load:', screenshots[step]);
            }}
          />

          {/* Loading Overlay */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.1)',
            opacity: 0,
            transition: 'opacity 0.3s ease',
            borderRadius: '22px'
          }} />

          {/* Pulsing Indicator for Share Button in Safari Toolbar - Landing-1 */}
          {step === 0 && (
            <div style={{
              position: 'absolute',
              bottom: '-5px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '26px',
              height: '26px',
              border: '2px solid #FF3B30',
              borderRadius: '50%',
              background: 'rgba(255, 59, 48, 0.25)',
              animation: 'megaPulse 1.2s infinite',
              zIndex: 10,
              boxShadow: '0 0 20px rgba(255, 59, 48, 0.6)'
            }} />
          )}

          {/* Improved highlight for "Add to Home Screen" in the menu - Landing-2 */}
          {step === 1 && (
            <div style={{
              position: 'absolute',
              bottom: '20px', // Position over "Add to Home Screen" text
              left: '1px',
              right: '1px',
              height: '28px',
              border: '3px solid #FF3B30',
              borderRadius: '15px',
              background: 'rgba(255, 59, 48, 0.2)',
              animation: 'ultraMegaPulse 1s infinite',
              zIndex: 10,
              boxShadow: '0 0 30px rgba(255, 59, 48, 1), inset 0 0 15px rgba(255, 59, 48, 0.3)'
            }} />
          )}

          {/* Success indicator for installed app - Landing-3 */}
          {step === 2 && (
            <>
              {/* Red highlight around the Dandy app icon */}
              <div style={{
                position: 'absolute',
                bottom: '55px', // Position over the Dandy app icon
                left: '33px',
                width: '32px',
                height: '32px',
                border: '2px solid #FF3B30',
                borderRadius: '8px',
                background: 'rgba(255, 59, 48, 0.2)',
                animation: 'ultraMegaPulse 1s infinite',
                zIndex: 10,
                boxShadow: '0 0 25px rgba(255, 59, 48, 0.8)'
              }} />

              {/* Green success checkmark - moved down */}
              <div style={{
                position: 'absolute',
                top: '85%', // Moved down from 50%
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '35px',
                height: '35px',
                border: '3px solid #34C759',
                borderRadius: '50%',
                background: 'rgba(52, 199, 89, 0.2)',
                animation: 'successPulse 1.5s infinite',
                zIndex: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                color: '#34C759',
                fontWeight: 'bold'
              }}>
                ✓
              </div>
            </>
          )}
        </div>
      </div>

      {/* Step Description */}
      <div style={{
        marginTop: '20px',
        textAlign: 'center',
        fontSize: '11px',
        fontWeight: '600',
        color: '#43221B',
        background: 'rgba(236, 240, 186, 0.3)',
        padding: '6px 12px',
        borderRadius: '12px',
        border: '1px solid rgba(67, 34, 27, 0.2)',
        minHeight: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.3s ease'
      }}>
        {stepTexts[step]}
      </div>

      {/* Progress Dots */}
      <div style={{
        display: 'flex',
        gap: '6px',
        marginTop: '8px',
        justifyContent: 'center'
      }}>
        {screenshots.map((_, index) => (
          <div
            key={index}
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: index === step ? '#43221B' : 'rgba(67, 34, 27, 0.3)',
              transition: 'all 0.3s ease',
              transform: index === step ? 'scale(1.3)' : 'scale(1)',
              boxShadow: index === step ? '0 0 8px rgba(67, 34, 27, 0.4)' : 'none'
            }}
          />
        ))}
      </div>

      {/* CSS Animations */}
      <style jsx>{`
        @keyframes pulseIndicator {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.2);
            opacity: 0.7;
          }
        }
        @keyframes megaPulse {
          0%, 100% {
            transform: translateX(-50%) scale(1);
            opacity: 1;
            border-width: 4px;
          }
          50% {
            transform: translateX(-50%) scale(1.15);
            opacity: 0.9;
            border-width: 6px;
            box-shadow: 0 0 30px rgba(255, 59, 48, 0.9);
          }
        }
        @keyframes ultraMegaPulse {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
            border-width: 5px;
            box-shadow: 0 0 30px rgba(255, 59, 48, 1), inset 0 0 15px rgba(255, 59, 48, 0.3);
          }
          50% {
            transform: scale(1.08);
            opacity: 0.95;
            border-width: 7px;
            box-shadow: 0 0 40px rgba(255, 59, 48, 1), 0 0 60px rgba(255, 59, 48, 0.7), inset 0 0 20px rgba(255, 59, 48, 0.5);
          }
        }
        @keyframes successPulse {
          0%, 100% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 1;
            border-width: 3px;
          }
          50% {
            transform: translate(-50%, -50%) scale(1.1);
            opacity: 0.9;
            border-width: 4px;
            box-shadow: 0 0 25px rgba(52, 199, 89, 0.8);
          }
        }
      `}</style>
    </div>
  );
};

const ShareIcon = () => (
  <img
    src="/images/Share.png"
    alt="Share button"
    style={{
      display: 'inline',
      verticalAlign: 'middle',
      margin: '0 3px',
      height: '18px',
      width: 'auto'
    }}
  />
);

const PWAInstallPrompt = ({ onInstall, onDismiss, isIOS }) => {
  return (
    <div className="pwa-install-overlay">
      <div className="pwa-install-modal">
        <div className="pwa-install-content">
          <div className="pwa-install-icon">
            {isIOS ? <RealSafariDemo /> : '📱'}
          </div>

          <h3 className="pwa-install-title">
            {isIOS
              ? "Aggiungi Dandy alla Home!"
              : "Installiamo l'app sul tuo telefone!"
            }
          </h3>

          <p className="pwa-install-description">
            {isIOS ? (
              <>
              </>
            ) : (
              "Aggiungi Dandy alla schermata principale per un accesso rapido e un'esperienza migliore."
            )}
          </p>

          <div className="pwa-install-buttons">
            {!isIOS && (
              <button
                className="pwa-install-btn pwa-install-btn-primary"
                onClick={onInstall}
              >
                Installa App
              </button>
            )}

            <button
              className="pwa-install-btn pwa-install-btn-secondary"
              onClick={onDismiss}
            >
              {isIOS ? "Ho capito!" : "Non ora"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PWAInstallPrompt;

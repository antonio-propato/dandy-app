// src/components/PWAInstallPrompt.jsx - iOS Compatible
import React from 'react';

const MiniIOSDemo = () => {
  const [step, setStep] = React.useState(0);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setStep(prev => (prev + 1) % 3);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      width: '130px',
      height: '180px',
      position: 'relative',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    }}>
      {/* Mini Phone */}
      <div style={{
        width: '90px',
        height: '160px',
        background: '#000',
        borderRadius: '20px',
        padding: '5px',
        position: 'relative'
      }}>
        {/* Screen */}
        <div style={{
          width: '100%',
          height: '100%',
          background: '#fff',
          borderRadius: '15px',
          position: 'relative',
          overflow: 'hidden'
        }}>
          {/* Notch */}
          <div style={{
            width: '30px',
            height: '5px',
            background: '#000',
            borderRadius: '0 0 5px 5px',
            position: 'absolute',
            top: '0',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10
          }}></div>

          {/* App Content with Dandy branding */}
          <div style={{
            position: 'absolute',
            top: '12px',
            left: '0',
            right: '0',
            bottom: '32px',
            background: 'linear-gradient(135deg, #8B4513 0%, #D2B48C 50%, #A0522D 100%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {/* Dandy Logo */}
            <div style={{
              width: '32px',
              height: '32px',
              background: 'linear-gradient(45deg, #8B4513 0%, #D2B48C 50%)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '14px',
              fontWeight: 'bold',
              marginBottom: '6px',
              border: '1px solid rgba(255,255,255,0.3)'
            }}>
              D
            </div>
            <div style={{
              color: 'white',
              fontSize: '8px',
              fontWeight: 'bold'
            }}>
              DANDY
            </div>
          </div>

          {/* Bottom Toolbar */}
          <div style={{
            position: 'absolute',
            bottom: '0',
            left: '0',
            right: '0',
            height: '32px',
            background: 'rgba(248,249,250,0.95)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-around',
            paddingBottom: '6px',
            boxSizing: 'border-box'
          }}>
            {/* Back Button */}
            <div style={{
              fontSize: '12px',
              color: '#007AFF'
            }}>←</div>

            {/* Share Button with VERY obvious highlighting */}
            <div style={{
              width: '20px',
              height: '20px',
              border: '2px solid #007AFF',
              borderRadius: '4px',
              position: 'relative',
              background: step === 0 ? '#8B4513' : 'transparent',
              transform: step === 0 ? 'scale(1.3)' : 'scale(1)',
              transition: 'all 0.3s ease',
              boxShadow: step === 0 ? '0 0 15px rgba(139, 69, 19, 0.8), 0 0 25px rgba(139, 69, 19, 0.4)' : 'none',
              animation: step === 0 ? 'pulseShare 1s infinite' : 'none'
            }}>
              {/* Share Icon Arrow */}
              <div style={{
                position: 'absolute',
                top: '-4px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '6px',
                height: '6px',
                borderTop: '2px solid ' + (step === 0 ? '#fff' : '#007AFF'),
                borderLeft: '2px solid ' + (step === 0 ? '#fff' : '#007AFF'),
                borderRight: '2px solid ' + (step === 0 ? '#fff' : '#007AFF'),
                borderBottom: 'none',
                transition: 'all 0.3s ease'
              }}></div>
            </div>

            {/* Menu Button */}
            <div style={{
              fontSize: '12px',
              color: '#007AFF'
            }}>⋯</div>
          </div>

          {/* Share Menu */}
          <div style={{
            position: 'absolute',
            bottom: step >= 1 ? '32px' : '-100px',
            left: '5px',
            right: '5px',
            height: '90px',
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(20px)',
            borderRadius: '15px 15px 0 0',
            transition: 'bottom 0.5s ease',
            padding: '8px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Apps Row */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-around',
              marginBottom: '10px'
            }}>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                fontSize: '5px'
              }}>
                <div style={{
                  width: '16px',
                  height: '16px',
                  background: '#007AFF',
                  borderRadius: '4px',
                  marginBottom: '3px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '8px'
                }}>📧</div>
                <span>Mail</span>
              </div>

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                fontSize: '5px'
              }}>
                <div style={{
                  width: '16px',
                  height: '16px',
                  background: '#34C759',
                  borderRadius: '4px',
                  marginBottom: '3px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '8px'
                }}>💬</div>
                <span>Messaggi</span>
              </div>

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                fontSize: '5px'
              }}>
                <div style={{
                  width: '16px',
                  height: '16px',
                  background: '#FF9500',
                  borderRadius: '4px',
                  marginBottom: '3px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '8px'
                }}>📋</div>
                <span>Copia</span>
              </div>
            </div>

            {/* Actions List */}
            <div style={{
              borderTop: '1px solid rgba(0,0,0,0.1)',
              paddingTop: '6px'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                padding: '4px',
                borderRadius: '8px',
                background: step === 2 ? 'rgba(139, 69, 19, 0.15)' : 'transparent',
                border: step === 2 ? '2px solid #8B4513' : 'none',
                transform: step === 2 ? 'scale(1.05)' : 'scale(1)',
                transition: 'all 0.4s ease',
                fontSize: '6px',
                boxShadow: step === 2 ? '0 0 10px rgba(139, 69, 19, 0.5)' : 'none',
                animation: step === 2 ? 'pulseAdd 1s infinite' : 'none'
              }}>
                <div style={{
                  width: '12px',
                  height: '12px',
                  background: step === 2 ? '#8B4513' : '#666',
                  borderRadius: '3px',
                  marginRight: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '6px',
                  transition: 'all 0.3s ease'
                }}>
                  📱
                </div>
                <span style={{
                  color: step === 2 ? '#8B4513' : '#333',
                  fontWeight: step === 2 ? 'bold' : 'normal',
                  transition: 'all 0.3s ease'
                }}>
                  Aggiungi alla schermata Home
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add CSS animations */}
      <style jsx>{`
        @keyframes pulseShare {
          0%, 100% { transform: scale(1.3); }
          50% { transform: scale(1.4); }
        }
        @keyframes pulseAdd {
          0%, 100% { transform: scale(1.05); }
          50% { transform: scale(1.08); }
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
            {isIOS ? <MiniIOSDemo /> : '📱'}
          </div>

          <h3 className="pwa-install-title">
            {isIOS
              ? "Aggiungi Dandy alla Home!"
              : "Installiamo l'app sul tuo telefono!"
            }
          </h3>

          <p className="pwa-install-description">
            {isIOS ? (
              <>
                Tocca su 'Condividi' <ShareIcon /> e poi 'Aggiungi alla schermata Home'.
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

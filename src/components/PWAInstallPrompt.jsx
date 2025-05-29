// src/components/PWAInstallPrompt.jsx - iOS Compatible
import React from 'react';

const PWAInstallPrompt = ({ onInstall, onDismiss, isIOS }) => {
  return (
    <div className="pwa-install-overlay">
      <div className="pwa-install-modal">
        <div className="pwa-install-content">
          <div className="pwa-install-icon">
            {isIOS ? '📱' : '📱'}
          </div>

          <h3 className="pwa-install-title">
            {isIOS
              ? "Aggiungi Dandy alla Home!"
              : "Installiamo l'app sul tuo telefono!"
            }
          </h3>

          <p className="pwa-install-description">
            {isIOS
              ? "Per installare l'app: tocca il pulsante Condividi (⬆️) in basso, poi seleziona 'Aggiungi alla schermata Home'."
              : "Aggiungi Dandy alla schermata principale per un accesso rapido e un'esperienza migliore."
            }
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

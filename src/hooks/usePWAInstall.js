// src/hooks/usePWAInstall.js - Final Production Version
import { useState, useEffect } from 'react';

export const usePWAInstall = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Detect iOS devices
    const detectIOS = () => {
      const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
                         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      setIsIOS(isIOSDevice);
      return isIOSDevice;
    };

    const iosDetected = detectIOS();

    // Check if PWA is already installed
    const checkIfInstalled = () => {
      if (window.matchMedia('(display-mode: standalone)').matches) {
        setIsInstalled(true);
        return true;
      }

      if (window.navigator.standalone === true) {
        setIsInstalled(true);
        return true;
      }

      return false;
    };

    // Don't show prompt if already installed
    if (checkIfInstalled()) {
      return;
    }

    // For iOS devices - show manual installation instructions
    if (iosDetected) {
      setTimeout(() => {
        setShowInstallPrompt(true);
      }, 3000); // Show after 3 seconds
      return;
    }

    // For Android/Chrome - use the beforeinstallprompt event
    const handleBeforeInstallPrompt = (e) => {
      console.log('PWA install prompt available');
      e.preventDefault();
      setDeferredPrompt(e);
      setTimeout(() => {
        setShowInstallPrompt(true);
      }, 3000);
    };

    const handleAppInstalled = () => {
      console.log('PWA successfully installed');
      setIsInstalled(true);
      setShowInstallPrompt(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const installPWA = async () => {
    // iOS - just dismiss the prompt (they need to manually add to home screen)
    if (isIOS) {
      setShowInstallPrompt(false);
      return;
    }

    // Android/Chrome - trigger the native install prompt
    if (!deferredPrompt) {
      setShowInstallPrompt(false);
      return;
    }

    try {
      const result = await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;

      if (choiceResult.outcome === 'accepted') {
        console.log('User installed the PWA');
      }

      setDeferredPrompt(null);
      setShowInstallPrompt(false);
    } catch (error) {
      console.error('Error during PWA installation:', error);
      setShowInstallPrompt(false);
    }
  };

  const dismissPrompt = () => {
    setShowInstallPrompt(false);
    // Don't show again for this session
    sessionStorage.setItem('pwa-install-dismissed', 'true');
  };

  // Check if user previously dismissed the prompt
  useEffect(() => {
    const dismissed = sessionStorage.getItem('pwa-install-dismissed');
    if (dismissed === 'true') {
      setShowInstallPrompt(false);
    }
  }, []);

  return {
    showInstallPrompt,
    isInstalled,
    isIOS,
    installPWA,
    dismissPrompt
  };
};

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { firestore, auth, functions } from '../lib/firebase';
import './Scan.css';

export default function Scan() {
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [customerInfo, setCustomerInfo] = useState(null);
  const [cameraPermission, setCameraPermission] = useState(null);
  const [availableCameras, setAvailableCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [processing, setProcessing] = useState(false);
  const scannerRef = useRef(null);
  const readerRef = useRef(null);

  // Initialize Cloud Function
  const processStampScan = httpsCallable(functions, 'processStampScan');

  // Scanner configuration
  const qrConfig = {
    fps: 15,
    qrbox: { width: 300, height: 300 },
    aspectRatio: 1.0,
    disableFlip: false,
    experimentalFeatures: {
      useBarCodeDetectorIfSupported: true
    }
  };

  // Check user permissions on component mount
  useEffect(() => {
    const checkSuperUser = async () => {
      if (!auth.currentUser) {
        navigate('/signin');
        return;
      }

      try {
        const userDoc = await getDoc(doc(firestore, 'users', auth.currentUser.uid));
        if (!userDoc.exists() || userDoc.data().role !== 'superuser') {
          // Not a superuser, redirect to profile
          navigate('/profile');
        }
      } catch (err) {
        console.error('Error checking user role:', err);
        navigate('/signin');
      }
    };

    checkSuperUser();
  }, [navigate]);

  // Clean up scanner when component unmounts
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        try {
          scannerRef.current.stop().catch(err => console.error("Error stopping scanner:", err));
        } catch (err) {
          console.error("Error in cleanup:", err);
        }
      }
    };
  }, []);

  // Get available cameras
  const getAvailableCameras = async () => {
    try {
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length) {
        setAvailableCameras(devices);
        // Try to find a back camera first (environment facing)
        const backCamera = devices.find(
          device => device.label && device.label.toLowerCase().includes('back')
        );
        setSelectedCamera(backCamera ? backCamera.id : devices[0].id);
        return true;
      } else {
        setError('No cameras found on your device.');
        return false;
      }
    } catch (err) {
      console.error('Error getting cameras:', err);
      setError('Failed to access cameras: ' + err.message);
      return false;
    }
  };

  // Check camera permissions
  const checkCameraPermission = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ video: true });
      setCameraPermission(true);

      // After permission granted, get available cameras
      return await getAvailableCameras();
    } catch (err) {
      console.error('Camera permission error:', err);
      setCameraPermission(false);
      setError('Camera access denied. Please grant camera permissions and try again.');
      return false;
    }
  };

  // Handle camera selection change
  const handleCameraChange = (e) => {
    setSelectedCamera(e.target.value);
  };

  // Process QR scan using Cloud Function
  const processQRScan = async (decodedText) => {
    setProcessing(true);

    try {
      console.log("QR code detected:", decodedText);

      // Extract user ID from QR code URL
      let userId;
      if (decodedText.includes('/profile/')) {
        userId = decodedText.split('/profile/')[1];
      } else {
        // If it's not a URL, try to use the entire code as userId
        userId = decodedText;
      }

      if (!userId) {
        throw new Error('Invalid QR code format');
      }

      // Remove any trailing slashes or query parameters
      userId = userId.split('?')[0].split('#')[0].replace(/\/$/, '');
      console.log("Extracted User ID:", userId);

      // Get user info for display
      const userDoc = await getDoc(doc(firestore, 'users', userId));
      if (!userDoc.exists()) {
        throw new Error(`User not found for ID: ${userId}`);
      }

      const userData = userDoc.data();
      console.log("User data:", userData);

      // Call Cloud Function to process the stamp scan
      console.log("Calling processStampScan Cloud Function...");
      const result = await processStampScan({ scannedUserId: userId });

      if (result.data.success) {
        const {
          message,
          stampsAdded,
          birthdayBonus,
          rewardEarned,
          currentStamps
        } = result.data;

        console.log("Cloud Function result:", result.data);

        // Set customer info for display
        setCustomerInfo({
          name: `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || 'Unknown',
          email: userData.email || 'No email',
          message: message,
          stampsAdded: stampsAdded,
          birthdayBonus: birthdayBonus,
          rewardEarned: rewardEarned,
          currentStamps: currentStamps,
          newStampCount: rewardEarned ? 0 : currentStamps,
          stampsReset: rewardEarned
        });

        setSuccess(true);
        setResult(decodedText);

        // Show special effects for birthday or reward
        if (birthdayBonus) {
          console.log("🎉 Birthday bonus activated!");
        }

        if (rewardEarned) {
          console.log("🎁 Reward earned - stamps reset!");
        }

      } else {
        throw new Error('Cloud Function returned unsuccessful result');
      }

    } catch (error) {
      console.error('Error processing QR scan:', error);
      setError(`Failed to process scan: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  // Start QR scanner
  const startScanner = async () => {
    // First check camera permissions
    const hasPermission = await checkCameraPermission();
    if (!hasPermission) {
      return;
    }

    // Set states
    setScanning(true);
    setResult(null);
    setError(null);
    setSuccess(false);
    setCustomerInfo(null);
    setProcessing(false);

    // Small delay to ensure React has rendered the reader element
    setTimeout(() => {
      initializeScanner();
    }, 100);
  };

  // Initialize scanner in a separate function
  const initializeScanner = () => {
    try {
      // Create a new scanner instance using the ref
      if (!readerRef.current) {
        setError("Scanner element not found. This may be a rendering issue.");
        setScanning(false);
        return;
      }

      // Create a new scanner instance
      const html5QrCode = new Html5Qrcode("reader");
      scannerRef.current = html5QrCode;

      // Use the selected camera or fallback to environment facing
      const cameraConfig = selectedCamera ?
        { deviceId: selectedCamera } :
        { facingMode: "environment" };

      html5QrCode.start(
        cameraConfig,
        qrConfig,
        async (decodedText) => {
          // QR code detected - stop scanner and process
          try {
            await html5QrCode.stop();
            scannerRef.current = null;
            setScanning(false);

            // Process the QR scan using Cloud Function
            await processQRScan(decodedText);

          } catch (err) {
            console.error('Error stopping scanner or processing scan:', err);
            setError(err.message);
            setScanning(false);
          }
        },
        (errorMessage) => {
          // Just log the error, don't set state for transient errors
          console.log('QR scanning in progress:', errorMessage);
        }
      ).catch(err => {
        console.error('Error starting scanner:', err);
        setError(`Scanner initialization failed: ${err.message}`);
        setScanning(false);
      });
    } catch (err) {
      console.error('Error starting scanner:', err);
      setError(`Failed to start scanner: ${err.message || 'Unknown error'}. Please try again.`);
      setScanning(false);
    }
  };

  // Cancel scanning
  const cancelScanning = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch (err) {
        console.error("Error stopping scanner:", err);
      }
    }
    setScanning(false);
    setProcessing(false);
  };

  return (
    <div className="scan-container">
      <h1>QR Code Scanner</h1>

      {!scanning && !result && !processing && (
        <>
          <button className="scan-button" onClick={startScanner}>
            Avvia Scanner
          </button>

          {availableCameras.length > 1 && (
            <div className="camera-selector">
              <label htmlFor="camera-select">Scegli fotocamera:</label>
              <select
                id="camera-select"
                value={selectedCamera || ''}
                onChange={handleCameraChange}
              >
                {availableCameras.map(camera => (
                  <option key={camera.id} value={camera.id}>
                    {camera.label || `Camera ${camera.id}`}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      {scanning && (
        <div className="scanner-container">
          <div
            id="reader"
            ref={readerRef}
            style={{
              width: '100%',
              maxWidth: '500px',
              height: '400px',
              margin: '0 auto',
              border: '1px solid #ddd'
            }}
          ></div>
          <p className="scanning-instruction">Posiziona il QR code dentro il quadrato</p>
          <button className="cancel-button" onClick={cancelScanning}>
            Annulla
          </button>
        </div>
      )}

      {processing && (
        <div className="processing-message">
          <p>Elaborazione in corso...</p>
          <div className="loader"></div>
        </div>
      )}

      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button className="retry-button" onClick={startScanner}>
            Riprova
          </button>
          {cameraPermission === false && (
            <p>
              Controlla le impostazioni del browser e assicurati che l'accesso alla fotocamera
              sia consentito per questo sito web.
            </p>
          )}
        </div>
      )}

      {success && customerInfo && (
        <div className="success-message">
          <h2>
            {customerInfo.stampsReset
              ? '🎁 Premio Riscattato!'
              : customerInfo.birthdayBonus
                ? '🎉 Timbri Aggiunti - Buon Compleanno!'
                : '✅ Timbro Aggiunto con Successo!'}
          </h2>
          <div className="customer-info">
            <p><strong>Cliente:</strong> {customerInfo.name}</p>
            <p><strong>Email:</strong> {customerInfo.email}</p>
            <p><strong>Messaggio:</strong> {customerInfo.message}</p>

            {customerInfo.birthdayBonus && (
              <p style={{color: '#ff6b6b', fontWeight: 'bold'}}>
                🎂 Bonus compleanno: +{customerInfo.stampsAdded} timbri!
              </p>
            )}

            {customerInfo.stampsReset ? (
              <p><strong>Timbri resettati:</strong> Inizia nuova raccolta</p>
            ) : (
              <p><strong>Timbri Attuali:</strong> {customerInfo.newStampCount}/9</p>
            )}
          </div>
          <button className="scan-again-button" onClick={startScanner}>
            Scansiona Altro
          </button>
        </div>
      )}

      <div className="nav-buttons">
        <button className="back-button" onClick={() => navigate('/superuser-dashboard')}>
          Torna alla Dashboard
        </button>
      </div>
    </div>
  );
}

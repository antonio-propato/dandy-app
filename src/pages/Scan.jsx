import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { doc, getDoc, updateDoc, arrayUnion, Timestamp, setDoc } from 'firebase/firestore';
import { firestore, auth } from '../lib/firebase';
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
  const scannerRef = useRef(null);
  const readerRef = useRef(null);

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
          // QR code detected
          try {
            console.log("QR code detected:", decodedText);
            await html5QrCode.stop();
            scannerRef.current = null;
            setScanning(false);
            setResult(decodedText);

            // Extract user ID from QR code URL
            // Support different URL formats
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
            console.log("Current authenticated user:", auth.currentUser?.uid);

            // Check Firestore permissions first
            try {
              // First check if we can read the user document
              console.log("Checking user document access...");
              const userDoc = await getDoc(doc(firestore, 'users', userId));
              if (!userDoc.exists()) {
                throw new Error(`User not found for ID: ${userId}`);
              }

              const userData = userDoc.data();
              console.log("Successfully read user document:", userData);

              setCustomerInfo({
                name: `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || 'Unknown',
                email: userData.email || 'No email'
              });

              // Then check if we can read the stamps document
              console.log("Checking stamps document access...");
              const stampsRef = doc(firestore, 'stamps', userId);
              const stampsDoc = await getDoc(stampsRef);
              console.log("Stamps doc exists:", stampsDoc.exists());
              console.log("Stamps data:", stampsDoc.exists() ? stampsDoc.data() : null);

              // Now attempt to add the stamp
              const now = new Date().toISOString();

              if (stampsDoc.exists()) {
                console.log("Updating existing stamps document...");
                const currentStamps = stampsDoc.data().stamps || [];
                const updatedStamps = [...currentStamps, { date: now }];

                await updateDoc(stampsRef, {
                  stamps: updatedStamps
                });
                console.log("Successfully updated stamps!");
              } else {
                console.log("Creating new stamps document...");
                await setDoc(stampsRef, {
                  stamps: [{ date: now }],
                  rewardClaimed: false
                });
                console.log("Successfully created stamps document!");
              }

              setSuccess(true);
            } catch (firestoreErr) {
              console.error('Firestore error:', firestoreErr);
              throw new Error(`Failed to add stamp: ${firestoreErr.message}`);
            }
          } catch (err) {
            console.error('Error processing QR code:', err);
            setError(err.message);
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
  };

  return (
    <div className="scan-container">
      <h1>Scan Customer QR Code</h1>

      {!scanning && !result && (
        <>
          <button className="scan-button" onClick={startScanner}>
            Start Scanner
          </button>

          {availableCameras.length > 1 && (
            <div className="camera-selector">
              <label htmlFor="camera-select">Choose camera:</label>
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
          <p className="scanning-instruction">Position the QR code within the square</p>
          <button className="cancel-button" onClick={cancelScanning}>
            Cancel
          </button>
        </div>
      )}

      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button className="retry-button" onClick={startScanner}>
            Try Again
          </button>
          {cameraPermission === false && (
            <p>
              Please check your browser settings and ensure camera access is
              allowed for this website.
            </p>
          )}
        </div>
      )}

      {success && customerInfo && (
        <div className="success-message">
          <h2>Stamp Added Successfully!</h2>
          <div className="customer-info">
            <p><strong>Customer:</strong> {customerInfo.name}</p>
            <p><strong>Email:</strong> {customerInfo.email}</p>
          </div>
          <button className="scan-again-button" onClick={startScanner}>
            Scan Another
          </button>
        </div>
      )}

      <div className="nav-buttons">
        <button className="back-button" onClick={() => navigate('/superuser-dashboard')}>
          Dashboard
        </button>
        <button className="logout-button" onClick={() => {
          auth.signOut();
          navigate('/signin');
        }}>
          Logout
        </button>
      </div>
    </div>
  );
}

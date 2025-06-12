import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
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

  // Today's stamps log state
  const [todayStamps, setTodayStamps] = useState([]);
  const [todayStampsCount, setTodayStampsCount] = useState(0);
  const [loadingTodayStamps, setLoadingTodayStamps] = useState(false);

  const scannerRef = useRef(null);
  const readerRef = useRef(null);

  // Initialize Cloud Functions
  const processStampScan = httpsCallable(functions, 'processStampScan');
  const redeemRewardQR = httpsCallable(functions, 'redeemRewardQR');

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
          navigate('/profile');
        } else {
          await loadTodayStamps();
        }
      } catch (err) {
        console.error('Error checking user role:', err);
        navigate('/signin');
      }
    };

    checkSuperUser();
  }, [navigate]);

  // Load today's stamps log
  const loadTodayStamps = async () => {
    setLoadingTodayStamps(true);

    try {
      // Calculate today's date range (midnight to midnight)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Get all stamps documents
      const stampsSnapshot = await getDocs(collection(firestore, 'stamps'));

      const todayStampsActivity = [];
      let stampsCount = 0;

      // Process each stamps document
      for (const stampDoc of stampsSnapshot.docs) {
        const stampsData = stampDoc.data();
        const userId = stampDoc.id;

        // Count today's stamps - check stamps created today
        if (stampsData.stamps && Array.isArray(stampsData.stamps)) {
          stampsData.stamps.forEach(stamp => {
            const stampDate = new Date(stamp.date);
            if (stampDate >= today && stampDate < tomorrow) {
              stampsCount++;

              // Add to today's stamps log
              todayStampsActivity.push({
                userId,
                timestamp: stampDate,
                date: stamp.date,
                addedBy: stamp.addedBy || 'unknown',
                addedByUser: stamp.addedByUser || null,
                addedByName: stamp.addedByName || null
              });
            }
          });
        }
      }

      // Sort by timestamp (newest first)
      todayStampsActivity.sort((a, b) => b.timestamp - a.timestamp);

      // Enrich with user names
      const enrichedTodayStamps = await Promise.all(
        todayStampsActivity.map(async (activity) => {
          try {
            // Get customer info
            const userDoc = await getDoc(doc(firestore, 'users', activity.userId));
            const customerName = userDoc.exists()
              ? `${userDoc.data().firstName} ${userDoc.data().lastName}`
              : 'Utente Sconosciuto';

            // Determine who added the stamp
            let addedByText = '';
            if (activity.addedByName) {
              addedByText = activity.addedByName;
            } else if (activity.addedByUser && activity.addedBy === 'manual') {
              try {
                const staffDoc = await getDoc(doc(firestore, 'users', activity.addedByUser));
                if (staffDoc.exists()) {
                  const staffData = staffDoc.data();
                  addedByText = `${staffData.firstName} ${staffData.lastName}`;
                } else {
                  addedByText = 'Staff';
                }
              } catch (err) {
                addedByText = 'Staff';
              }
            } else if (activity.addedBy === 'qr') {
              addedByText = 'QR Scan';
            } else if (activity.addedBy === 'manual') {
              addedByText = 'Staff';
            } else {
              addedByText = 'Sistema';
            }

            return {
              ...activity,
              userName: customerName,
              addedByText: addedByText
            };
          } catch (err) {
            console.error('Error fetching today activity details:', err);
            return {
              ...activity,
              userName: 'Utente Sconosciuto',
              addedByText: 'Sistema'
            };
          }
        })
      );

      setTodayStamps(enrichedTodayStamps);
      setTodayStampsCount(stampsCount);

    } catch (error) {
      console.error('Error loading today stamps:', error);
    } finally {
      setLoadingTodayStamps(false);
    }
  };

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

// Update the processRewardQRScan function in your Scan.js component:

// Complete the processRewardQRScan function in your Scan.js:

const processRewardQRScan = async (decodedText) => {
  try {
    console.log("Reward QR code detected:", decodedText);

    const result = await redeemRewardQR({ qrCode: decodedText });

    if (result.data.success) {
      const {
        message,
        customerName,
        customerEmail,
        remainingRewards
      } = result.data;

      console.log("Reward QR redeemed successfully:", result.data);

      setCustomerInfo({
        name: customerName,
        email: customerEmail,
        message: message,
        rewardRedeemed: true,
        remainingRewards: remainingRewards,
        stampsReset: true
      });

      setSuccess(true);
      setResult(decodedText);

      console.log("🎁 Reward successfully redeemed via QR!");
      await loadTodayStamps();

    } else {
      throw new Error('Cloud Function returned unsuccessful result for reward QR');
    }

  } catch (error) {
    console.error('Error processing reward QR scan:', error);

    // Enhanced error handling with specific Italian messages and emojis
    let errorMessage = error.message;

    // Check for specific QR validation errors and add appropriate emoji/styling
    if (errorMessage.includes('già stato utilizzato')) {
      errorMessage = `🔄 ${errorMessage}`;
    } else if (errorMessage.includes('non è valido')) {
      errorMessage = `⚠️ ${errorMessage}`;
    } else if (errorMessage.includes('scaduto')) {
      errorMessage = `⏰ ${errorMessage}`;
    } else {
      // Fallback for other errors
      errorMessage = `❌ Errore durante il riscatto: ${errorMessage}`;
    }

    throw new Error(errorMessage);
  }
};

  // Process regular stamp QR scan using Cloud Function
  const processStampQRScan = async (decodedText) => {
    try {
      console.log("Regular stamp QR code detected:", decodedText);

      let userId;
      if (decodedText.includes('/profile/')) {
        userId = decodedText.split('/profile/')[1];
      } else {
        userId = decodedText;
      }

      if (!userId) {
        throw new Error('Invalid QR code format');
      }

      userId = userId.split('?')[0].split('#')[0].replace(/\/$/, '');
      console.log("Extracted User ID:", userId);

      const userDoc = await getDoc(doc(firestore, 'users', userId));
      if (!userDoc.exists()) {
        throw new Error(`User not found for ID: ${userId}`);
      }

      const userData = userDoc.data();
      console.log("User data:", userData);

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

        setCustomerInfo({
          name: `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || 'Unknown',
          email: userData.email || 'No email',
          message: message,
          stampsAdded: stampsAdded,
          birthdayBonus: birthdayBonus,
          rewardEarned: rewardEarned,
          currentStamps: currentStamps,
          newStampCount: rewardEarned ? 0 : currentStamps,
          stampsReset: rewardEarned,
          rewardRedeemed: false
        });

        setSuccess(true);
        setResult(decodedText);

        if (birthdayBonus) {
          console.log("🎉 Birthday bonus activated!");
        }

        if (rewardEarned) {
          console.log("🎁 Reward earned - stamps reset!");
        }

        await loadTodayStamps();

      } else {
        throw new Error('Cloud Function returned unsuccessful result');
      }

    } catch (error) {
      console.error('Error processing stamp QR scan:', error);
      throw new Error(`Failed to process stamp scan: ${error.message}`);
    }
  };

  // Main QR processing function - determines QR type and routes accordingly
  const processQRScan = async (decodedText) => {
    setProcessing(true);

    try {
      if (decodedText.startsWith('reward://dandy-app/')) {
        console.log("🎁 Detected reward QR code");
        await processRewardQRScan(decodedText);
      } else {
        console.log("📋 Detected regular stamp QR code");
        await processStampQRScan(decodedText);
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
    const hasPermission = await checkCameraPermission();
    if (!hasPermission) {
      return;
    }

    setScanning(true);
    setResult(null);
    setError(null);
    setSuccess(false);
    setCustomerInfo(null);
    setProcessing(false);

    setTimeout(() => {
      initializeScanner();
    }, 100);
  };

  // Initialize scanner in a separate function
  const initializeScanner = () => {
    try {
      if (!readerRef.current) {
        setError("Scanner element not found. This may be a rendering issue.");
        setScanning(false);
        return;
      }

      const html5QrCode = new Html5Qrcode("reader");
      scannerRef.current = html5QrCode;

      const cameraConfig = selectedCamera ?
        { deviceId: selectedCamera } :
        { facingMode: "environment" };

      html5QrCode.start(
        cameraConfig,
        qrConfig,
        async (decodedText) => {
          try {
            await html5QrCode.stop();
            scannerRef.current = null;
            setScanning(false);

            await processQRScan(decodedText);

          } catch (err) {
            console.error('Error stopping scanner or processing scan:', err);
            setError(err.message);
            setScanning(false);
          }
        },
        (errorMessage) => {
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

  // Format time for compact display
  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('it-IT', {
      hour: '2-digit',
      minute: '2-digit'
    });
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
            {customerInfo.rewardRedeemed
              ? '🎁 Premio Riscattato con Successo!'
              : customerInfo.stampsReset
                ? '🎁 Premio Riscattato!'
                : customerInfo.birthdayBonus
                  ? '🎉 Timbri Aggiunti - Buon Compleanno!'
                  : '✅ Timbro Aggiunto con Successo!'}
          </h2>
          <div className="customer-info">
            <p><strong>Cliente:</strong> {customerInfo.name}</p>
            <p><strong>Email:</strong> {customerInfo.email}</p>
            <p><strong>Messaggio:</strong> {customerInfo.message}</p>

            {customerInfo.rewardRedeemed && (
              <>
                <p style={{color: '#ff6b6b', fontWeight: 'bold'}}>
                  🎁 Premio riscattato tramite QR!
                </p>
                {customerInfo.remainingRewards !== undefined && (
                  <p><strong>Premi rimanenti:</strong> {customerInfo.remainingRewards}</p>
                )}
              </>
            )}

            {customerInfo.birthdayBonus && !customerInfo.rewardRedeemed && (
              <p style={{color: '#ff6b6b', fontWeight: 'bold'}}>
                🎂 Bonus compleanno: +{customerInfo.stampsAdded} timbri!
              </p>
            )}

            {!customerInfo.rewardRedeemed && (
              <>
                {customerInfo.stampsReset ? (
                  <p><strong>Timbri resettati:</strong> Inizia nuova raccolta</p>
                ) : (
                  <p><strong>Timbri Attuali:</strong> {customerInfo.newStampCount}/9</p>
                )}
              </>
            )}
          </div>
          <button className="scan-again-button" onClick={startScanner}>
            Scansiona Altro
          </button>
        </div>
      )}

      {/* Refresh button outside the section */}
      <div className="refresh-container">
        <button
          className="refresh-today-button"
          onClick={loadTodayStamps}
          disabled={loadingTodayStamps}
        >
          {loadingTodayStamps ? (
            <div className="mini-loader"></div>
          ) : (
            ''
          )}
          Aggiorna
        </button>
      </div>

      {/* Compact Today's Stamps Log Section */}
      <div className="todays-stamps-section">
        <div className="section-header">
          <h2>Timbri di Oggi</h2>
          <div className="today-counter">
            <span className="count-badge">{todayStampsCount}</span>
          </div>
        </div>

        <div className="compact-log-list">
          {loadingTodayStamps ? (
            <div className="loading-today">
              <p>Caricamento...</p>
            </div>
          ) : todayStamps.length > 0 ? (
            todayStamps.map((stamp, index) => (
              <div className="compact-log-item" key={index}>
                <div className="log-time">{formatTime(stamp.date)}</div>
                <div className="log-customer">{stamp.userName}</div>
                <div className="log-addedby">{stamp.addedByText}</div>
              </div>
            ))
          ) : (
            <div className="no-stamps-today">
              <p>Nessun timbro oggi</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

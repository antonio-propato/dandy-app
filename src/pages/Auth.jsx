import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth, firestore } from '../lib/firebase';
import { doc, setDoc, getDoc, query, collection, where, getDocs, serverTimestamp } from 'firebase/firestore';
import QRCode from 'qrcode';
import PrivacyPolicy from './PrivacyPolicy';
import './Auth.css';

// Security: Define constants outside component to prevent recreation
const VERIFICATION_POLL_INTERVAL = 3000;
const MAX_SUBMISSION_ATTEMPTS = 5;
const SUBMISSION_COOLDOWN = 30000; // 30 seconds

// Utility function to capitalize names properly
const capitalizeName = (name) => {
  if (!name) return '';
  // Security: Sanitize input to prevent XSS
  const sanitized = name.replace(/[<>]/g, '');
  return sanitized
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// Get time-based greeting using user's local timezone
const getTimeBasedGreeting = () => {
  const now = new Date();
  const hour = now.getHours();

  if (hour >= 5 && hour < 12) {
    return 'Buongiorno!';
  } else if (hour >= 12 && hour < 18) {
    return 'Buon Pomeriggio!';
  } else {
    return 'Buonasera!';
  }
};

// Updated validation function for dropdown picker
const validateCompleanno = (dob) => {
  if (!dob || dob.length < 5) return false;

  const [day, month] = dob.split('/');

  // Basic validation - day between 1-31, month between 1-12
  const dayNum = parseInt(day, 10);
  const monthNum = parseInt(month, 10);

  if (dayNum < 1 || dayNum > 31 || monthNum < 1 || monthNum > 12) {
    return false;
  }

  // More sophisticated validation for days per month
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (dayNum > daysInMonth[monthNum - 1]) {
    return false;
  }

  return true;
};

const validateMobile = (phone, countryCode) => {
  const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
  if (countryCode === '+39') {
    return /^3\d{9}$/.test(cleanPhone);
  }
  return /^\d{7,15}$/.test(cleanPhone);
};

// Enhanced email validation function with more strict rules
const validateEmail = (email) => {
  if (!email || !email.trim()) return false;

  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  // Basic format check
  if (!emailRegex.test(email.trim())) {
    return false;
  }

  // Additional checks for common invalid patterns
  const cleanEmail = email.trim().toLowerCase();

  // Check for invalid TLDs that are too short or suspicious
  const parts = cleanEmail.split('@');
  if (parts.length !== 2) return false;

  const [localPart, domain] = parts;

  // Local part checks
  if (localPart.length === 0 || localPart.length > 64) return false;
  if (localPart.startsWith('.') || localPart.endsWith('.')) return false;
  if (localPart.includes('..')) return false;

  // Domain checks
  if (domain.length === 0 || domain.length > 253) return false;
  if (domain.startsWith('.') || domain.endsWith('.')) return false;
  if (domain.includes('..')) return false;

  // Check for suspicious/invalid domains
  const domainParts = domain.split('.');
  if (domainParts.length < 2) return false;

  // Check TLD is at least 2 characters and not suspicious
  const tld = domainParts[domainParts.length - 1];
  if (tld.length < 2) return false;

  // Block obvious fake domains
  const suspiciousPatterns = [
    /^[a-z]{1,2}\.[a-z]{1,2}$/, // Like "gm.gm", "ab.cd"
    /test\./i,
    /fake\./i,
    /invalid\./i
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(domain)) {
      return false;
    }
  }

  return true;
};

// Security: Rate limiting for database checks
let emailCheckCache = new Map();
let phoneCheckCache = new Map();
const CACHE_DURATION = 60000; // 1 minute

const checkEmailExists = async (email) => {
  try {
    const normalizedEmail = email.toLowerCase();
    const now = Date.now();

    // Check cache first
    if (emailCheckCache.has(normalizedEmail)) {
      const { result, timestamp } = emailCheckCache.get(normalizedEmail);
      if (now - timestamp < CACHE_DURATION) {
        return result;
      }
    }

    const q = query(collection(firestore, 'users'), where('email', '==', normalizedEmail));
    const querySnapshot = await getDocs(q);
    const exists = !querySnapshot.empty;

    // Cache result
    emailCheckCache.set(normalizedEmail, { result: exists, timestamp: now });

    return exists;
  } catch (error) {
    // Security: Don't log sensitive information
    console.error('Database check failed');
    return false;
  }
};

const checkPhoneExists = async (phone) => {
  try {
    const now = Date.now();

    // Check cache first
    if (phoneCheckCache.has(phone)) {
      const { result, timestamp } = phoneCheckCache.get(phone);
      if (now - timestamp < CACHE_DURATION) {
        return result;
      }
    }

    const q = query(collection(firestore, 'users'), where('phone', '==', phone));
    const querySnapshot = await getDocs(q);
    const exists = !querySnapshot.empty;

    // Cache result
    phoneCheckCache.set(phone, { result: exists, timestamp: now });

    return exists;
  } catch (error) {
    // Security: Don't log sensitive information
    console.error('Database check failed');
    return false;
  }
};

export default function Auth({ mode = 'signin' }) {
  const navigate = useNavigate();
  const errorRef = useRef(null);
  const verificationIntervalRef = useRef(null);
  const mountedRef = useRef(true);

  // Security: Separate sensitive and non-sensitive state
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    dob: '',
    countryCode: '+39',
    phone: '',
    email: '',
    password: '',
  });

  const [securityState, setSecurityState] = useState({
    submissionAttempts: 0,
    lastSubmissionTime: 0,
    isBlocked: false
  });

  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [gdprAccepted, setGdprAccepted] = useState(true);
  const [showGdprWarning, setShowGdprWarning] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [emailVerificationSent, setEmailVerificationSent] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const [pollingForVerification, setPollingForVerification] = useState(false);

  // Security: Clear sensitive data on unmount
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      // Clear sensitive form data
      setForm(prev => ({
        ...prev,
        password: '',
        email: '',
        phone: ''
      }));

      // Clear intervals
      if (verificationIntervalRef.current) {
        clearInterval(verificationIntervalRef.current);
        verificationIntervalRef.current = null;
      }

      // Clear caches
      emailCheckCache.clear();
      phoneCheckCache.clear();
    };
  }, []);

  // Security: Scroll to error with safety check
  useEffect(() => {
    if (error && errorRef.current && mountedRef.current) {
      const timeoutId = setTimeout(() => {
        if (mountedRef.current && errorRef.current) {
          errorRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        }
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [error]);

  // Generate day options (1-31)
  const dayOptions = Array.from({ length: 31 }, (_, i) => {
    const day = i + 1;
    return (
      <option key={day} value={day.toString().padStart(2, '0')}>
        {day}
      </option>
    );
  });

  // Generate month options (1-12) with Italian month names
  const monthOptions = [
    { value: '01', label: 'Gennaio' },
    { value: '02', label: 'Febbraio' },
    { value: '03', label: 'Marzo' },
    { value: '04', label: 'Aprile' },
    { value: '05', label: 'Maggio' },
    { value: '06', label: 'Giugno' },
    { value: '07', label: 'Luglio' },
    { value: '08', label: 'Agosto' },
    { value: '09', label: 'Settembre' },
    { value: '10', label: 'Ottobre' },
    { value: '11', label: 'Novembre' },
    { value: '12', label: 'Dicembre' }
  ].map(month => (
    <option key={month.value} value={month.value}>
      {month.label}
    </option>
  ));

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';
    const orientationMeta = document.querySelector('meta[name="viewport"]');
    if (orientationMeta) {
      const currentContent = orientationMeta.content;
      orientationMeta.setAttribute('data-original-content', currentContent);
      orientationMeta.content = 'width=device-width, initial-scale=1.0, user-scalable=no';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
      if (orientationMeta) {
        const originalContent = orientationMeta.getAttribute('data-original-content');
        if (originalContent) {
          orientationMeta.content = originalContent;
          orientationMeta.removeAttribute('data-original-content');
        }
      }
    };
  }, []);

  // Security: Secure email verification polling with proper cleanup
  const startVerificationPolling = useCallback(() => {
    if (!mountedRef.current || verificationIntervalRef.current) return;

    setPollingForVerification(true);

    verificationIntervalRef.current = setInterval(async () => {
      try {
        if (!mountedRef.current || !auth.currentUser) {
          if (verificationIntervalRef.current) {
            clearInterval(verificationIntervalRef.current);
            verificationIntervalRef.current = null;
          }
          return;
        }

        await auth.currentUser.reload();

        if (auth.currentUser.emailVerified) {
          // Clear polling
          if (verificationIntervalRef.current) {
            clearInterval(verificationIntervalRef.current);
            verificationIntervalRef.current = null;
          }

          if (!mountedRef.current) return;

          setPollingForVerification(false);

          // Update Firestore with verification status
          try {
            await setDoc(doc(firestore, 'users', auth.currentUser.uid), {
              emailVerified: true,
              emailVerifiedAt: new Date().toISOString()
            }, { merge: true });
          } catch (firestoreError) {
            // Continue even if Firestore update fails
          }

          // Get user role and redirect appropriately
          try {
            const userDoc = await getDoc(doc(firestore, 'users', auth.currentUser.uid));
            const userData = userDoc.data();

            if (mountedRef.current) {
              if (userData && userData.role === 'superuser') {
                navigate('/scan');
              } else {
                navigate('/profile');
              }
            }
          } catch (roleError) {
            if (mountedRef.current) {
              navigate('/profile');
            }
          }
        }
      } catch (error) {
        // Silently handle errors during polling
        if (verificationIntervalRef.current) {
          clearInterval(verificationIntervalRef.current);
          verificationIntervalRef.current = null;
        }
      }
    }, VERIFICATION_POLL_INTERVAL);
  }, [navigate]);

  useEffect(() => {
    if (emailVerificationSent) {
      startVerificationPolling();
    }

    return () => {
      if (verificationIntervalRef.current) {
        clearInterval(verificationIntervalRef.current);
        verificationIntervalRef.current = null;
      }
    };
  }, [emailVerificationSent, startVerificationPolling]);

  // Security: Rate limiting check
  const checkRateLimit = () => {
    const now = Date.now();
    const { submissionAttempts, lastSubmissionTime } = securityState;

    if (submissionAttempts >= MAX_SUBMISSION_ATTEMPTS) {
      if (now - lastSubmissionTime < SUBMISSION_COOLDOWN) {
        return false;
      } else {
        // Reset attempts after cooldown
        setSecurityState({
          submissionAttempts: 0,
          lastSubmissionTime: 0,
          isBlocked: false
        });
      }
    }

    return true;
  };

  // Security: Sanitize input changes
  const handleChange = e => {
    const { name, value } = e.target;

    // Security: Sanitize input to prevent XSS
    const sanitizedValue = value.replace(/[<>]/g, '');

    setForm({ ...form, [name]: sanitizedValue });

    // Clear validation errors as user types
    if (validationErrors[name]) {
      setValidationErrors({ ...validationErrors, [name]: null });
    }
  };

  // Handler for DOB picker changes
  const handleDobPickerChange = (type, value) => {
    const dobParts = form.dob ? form.dob.split('/') : ['', ''];
    const [currentDay, currentMonth] = dobParts;

    let newDay = type === 'day' ? value : (currentDay || '');
    let newMonth = type === 'month' ? value : (currentMonth || '');

    const newDob = newDay && newMonth ? `${newDay}/${newMonth}` : (newDay || newMonth ? `${newDay || ''}/${newMonth || ''}` : '');
    setForm({ ...form, dob: newDob });

    if (validationErrors.dob) {
      setValidationErrors({ ...validationErrors, dob: null });
    }
  };

  const handleGdprChange = (e) => {
    setGdprAccepted(e.target.checked);
    if (e.target.checked) {
      setShowGdprWarning(false);
    }
    if (e.target.checked && error) {
      setError(null);
    }
  };

  const validateForm = async () => {
    const errors = {};
    if (mode === 'signup') {
      // Email format validation
      if (!validateEmail(form.email)) {
        errors.email = 'Inserisci un indirizzo email valido';
      }

      // Date of birth validation
      if (!validateCompleanno(form.dob)) {
        errors.dob = 'Seleziona giorno e mese di nascita';
      }

      // Phone validation
      if (!validateMobile(form.phone, form.countryCode)) {
        if (form.countryCode === '+39') {
          errors.phone = 'Numero di cellulare non valido. Deve iniziare con 3 e avere 10 cifre';
        } else {
          errors.phone = 'Numero di cellulare non valido';
        }
      }

      // Only check database if email format is valid
      if (!errors.email) {
        const emailExists = await checkEmailExists(form.email);
        if (emailExists) {
          // Security: Generic error message to prevent email enumeration
          errors.email = 'Indirizzo email non disponibile';
        }
      }

      // Only check phone database if phone format is valid
      if (!errors.phone) {
        const fullPhone = `${form.countryCode}${form.phone}`;
        const phoneExists = await checkPhoneExists(fullPhone);
        if (phoneExists) {
          errors.phone = 'Numero di cellulare non disponibile';
        }
      }
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!resetEmail) {
      setError('Inserisci il tuo indirizzo email');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await sendPasswordResetEmail(auth, resetEmail);
      setResetMessage('Email di reset inviata! Controlla la tua casella di posta.');
      setError(null);
    } catch (err) {
      // Security: Generic error message
      setError('Si è verificato un errore. Riprova più tardi.');
      setResetMessage('');
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
    setError(null);
    try {
      await sendEmailVerification(auth.currentUser);
      setResetMessage('Email di verifica inviata nuovamente!');
    } catch (err) {
      setError('Si è verificato un errore. Riprova più tardi.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setError(null);

    // Security: Rate limiting
    if (!checkRateLimit()) {
      setError('Troppi tentativi. Riprova tra qualche minuto.');
      return;
    }

    // Check GDPR consent for signup
    if (mode === 'signup' && !gdprAccepted) {
      setShowGdprWarning(true);
      return;
    }

    setLoading(true);

    // Update rate limiting
    setSecurityState(prev => ({
      submissionAttempts: prev.submissionAttempts + 1,
      lastSubmissionTime: Date.now(),
      isBlocked: prev.submissionAttempts + 1 >= MAX_SUBMISSION_ATTEMPTS
    }));

    // Validate form for both signup and signin
    const isValid = await validateForm();
    if (!isValid) {
      setLoading(false);
      return;
    }

    try {
      const { email, password, firstName, lastName, dob, countryCode, phone } = form;
      let userCred;

      if (mode === 'signup') {
        userCred = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCred.user;

        const actionCodeSettings = {
          url: `${window.location.origin}/`,
          handleCodeInApp: true
        };

        await sendEmailVerification(user, actionCodeSettings);

        const qrData = `https://dandy.app/profile/${user.uid}`;
        const qrCodeURL = await QRCode.toDataURL(qrData);
        const isSuperUser = email === 'antonio@propato.co.uk';

        const userRef = doc(firestore, "users", user.uid);
        const stampsRef = doc(firestore, "stamps", user.uid);

        const userDocData = {
          firstName: capitalizeName(firstName),
          lastName: capitalizeName(lastName),
          dob,
          phone: `${countryCode}${phone}`,
          email: email.toLowerCase(),
          qrCode: qrCodeURL,
          role: isSuperUser ? 'superuser' : 'customer',
          emailVerified: false,
          createdAt: serverTimestamp(),
          gdprConsent: {
            accepted: true,
            acceptedAt: new Date().toISOString(),
            version: '1.0',
            marketingConsent: true,
            pushNotificationConsent: true
          }
        };

        const userDocPromise = setDoc(userRef, userDocData);
        let stampsDocPromise = Promise.resolve();

        if (!isSuperUser) {
          stampsDocPromise = setDoc(stampsRef, {
            stamps: [
              { date: new Date().toISOString() },
              { date: new Date().toISOString() }
            ],
            lifetimeStamps: 2,
            rewardsEarned: 0,
            availableRewards: 0,
            receivedFreeStamps: true,
            birthdayBonusYear: null,
          });
        }

        await Promise.all([userDocPromise, stampsDocPromise]);

        // Security: Clear sensitive data before showing verification
        setForm(prev => ({ ...prev, password: '' }));
        setEmailVerificationSent(true);

      } else {
        userCred = await signInWithEmailAndPassword(auth, email, password);
        if (!userCred.user.emailVerified) {
          setError('Email non verificata. Controlla la tua casella di posta e clicca sul link di verifica.');
          setLoading(false);
          return;
        }

        // Security: Clear password after successful signin
        setForm(prev => ({ ...prev, password: '' }));

        const userDoc = await getDoc(doc(firestore, 'users', userCred.user.uid));
        const userData = userDoc.data();
        if (userData && userData.role === 'superuser') {
          navigate('/scan');
        } else {
          navigate('/profile');
        }
      }
    } catch (err) {
      // Security: Generic error messages to prevent information disclosure
      if (err.code === 'auth/email-already-in-use') {
        setError('Si è verificato un errore durante la registrazione.');
      } else if (err.code === 'auth/weak-password') {
        setError('La password deve essere di almeno 6 caratteri.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Indirizzo email non valido.');
      } else if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('Credenziali non valide.');
      } else {
        setError('Si è verificato un errore. Riprova.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGdprWarningContinue = () => {
    setShowGdprWarning(false);
    setGdprAccepted(true);
    setError(null);
  };

  // Parse current DOB for display
  const [currentDay, currentMonth] = form.dob ? form.dob.split('/') : ['', ''];

  // Security: Mask email for verification screen
  const maskedEmail = form.email
    ? form.email.replace(/(.{2})(.*)(@.*)/, '$1***$3')
    : '';

  // Email verification screen with enhanced security
  if (emailVerificationSent) {
    return (
      <div className="auth-wrapper">
        <div className="auth-overlay"></div>
        <div className="auth-card">
          <img
            src="/images/Dandy.jpeg"
            alt="Dandy Logo"
            className="auth-logo"
          />
          <div className="auth-verification-message">
            <h2>Verifica la tua Email</h2>
            <p>
              Abbiamo inviato un link di verifica a<br />
              <strong>{maskedEmail}</strong>
            </p>
            <p>
              Clicca sul link nell'email per attivare il tuo account.
            </p>
            {pollingForVerification && (
              <p style={{ fontSize: '0.9rem', color: '#FFD700', marginTop: '1rem' }}>
                In attesa della verifica...
              </p>
            )}
            <div className="auth-verification-buttons">
              <button
                className="auth-resend-btn"
                onClick={handleResendVerification}
                disabled={loading}
              >
                {loading ? 'Invio...' : 'Invia di nuovo'}
              </button>
              <button
                className="auth-continue-btn"
                onClick={() => {
                  if (verificationIntervalRef.current) {
                    clearInterval(verificationIntervalRef.current);
                    verificationIntervalRef.current = null;
                  }
                  setEmailVerificationSent(false);
                  setPollingForVerification(false);
                  navigate('/signin');
                }}
              >
                Continua
              </button>
            </div>
            {resetMessage && <div className="auth-success">{resetMessage}</div>}
            {error && <div className="auth-error">{error}</div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-overlay"></div>
      <div className={`auth-card ${mode === 'signin' ? 'auth-card-signin' : ''}`}>
        <img
          src="/images/Dandy.jpeg"
          alt="Dandy Logo"
          className={`auth-logo ${mode === 'signin' ? 'auth-logo-signin' : ''}`}
        />
        {mode === 'signin' && <h2 className="auth-title">{getTimeBasedGreeting()}</h2>}

        {error && <div ref={errorRef} className="auth-error">{error}</div>}
        {resetMessage && <div className="auth-success">{resetMessage}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'signup' && (
            <>
              <div className="auth-form-group">
                <label>Nome</label>
                <input type="text" name="firstName" value={form.firstName} onChange={handleChange} required />
              </div>
              <div className="auth-form-group">
                <label>Cognome</label>
                <input type="text" name="lastName" value={form.lastName} onChange={handleChange} required />
              </div>
              <div className="auth-form-group">
                <label>Compleanno</label>
                <div className="auth-dob-picker">
                  <select
                    value={currentDay}
                    onChange={(e) => handleDobPickerChange('day', e.target.value)}
                    required
                    className={validationErrors.dob ? 'auth-input-error' : ''}
                  >
                    <option value="">Giorno</option>
                    {dayOptions}
                  </select>
                  <select
                    value={currentMonth}
                    onChange={(e) => handleDobPickerChange('month', e.target.value)}
                    required
                    className={validationErrors.dob ? 'auth-input-error' : ''}
                  >
                    <option value="">Mese</option>
                    {monthOptions}
                  </select>
                </div>
                {validationErrors.dob && (<div className="auth-field-error">{validationErrors.dob}</div>)}
              </div>
              <div className="auth-form-group phone">
                <label>Cellulare</label>
                <div className="auth-phone-fields">
                  <input type="text" name="countryCode" value={form.countryCode} onChange={handleChange} required className="auth-phone-code" />
                  <input type="tel" name="phone" value={form.phone} onChange={handleChange} required placeholder="3123456789" className={validationErrors.phone ? 'auth-input-error' : ''} />
                </div>
                {validationErrors.phone && (<div className="auth-field-error">{validationErrors.phone}</div>)}
              </div>
            </>
          )}
          <div className="auth-form-group">
            <label>Email</label>
            <input type="email" name="email" value={form.email} onChange={handleChange} required className={validationErrors.email ? 'auth-input-error' : ''} />
            {validationErrors.email && (<div className="auth-field-error">{validationErrors.email}</div>)}
          </div>
          <div className="auth-form-group">
            <label>Password</label>
            <input type="password" name="password" value={form.password} onChange={handleChange} required minLength="6" />
          </div>
          {mode === 'signin' && (
            <div className="auth-forgot-password">
              <button type="button" className="auth-forgot-link" onClick={() => setShowForgotPassword(true)}>
                Hai dimenticato la tua password?
              </button>
            </div>
          )}
          {mode === 'signup' && (
            <div className="auth-gdpr-section">
              <div className="auth-gdpr-checkbox">
                <input
                  type="checkbox"
                  id="gdpr-consent"
                  checked={gdprAccepted}
                  onChange={handleGdprChange}
                />
                <label htmlFor="gdpr-consent" className="auth-gdpr-label">
                  Accetto l'{' '}
                  <span className="auth-privacy-link" onClick={() => setShowPrivacyPolicy(true)}>Informativa Privacy</span>
                  {' '}e acconsento al trattamento dei miei dati personali per finalità di marketing, notifiche push e comunicazioni promozionali.
                </label>
              </div>
            </div>
          )}
          <div className="auth-button-container">
            <button
              type="submit"
              disabled={loading || securityState.isBlocked}
              className={`auth-button ${mode === 'signup' ? 'auth-button-signup' : 'auth-button-signin'}`}
            >
              {loading ? 'Attendere...' : mode === 'signup' ? 'CONFERMA' : 'ACCEDI'}
            </button>
          </div>
        </form>
      </div>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="auth-modal-overlay">
          <div className="auth-forgot-modal">
            <div className="auth-modal-header">
              <h3>Reset Password</h3>
              <button
                className="auth-modal-close"
                onClick={() => {
                  setShowForgotPassword(false);
                  setResetEmail('');
                  setResetMessage('');
                  setError(null);
                }}
              >
                ×
              </button>
            </div>
            <div className="auth-modal-content">
              <p>Inserisci il tuo indirizzo email per ricevere le istruzioni per resettare la password.</p>
              <form onSubmit={handleForgotPassword}>
                <div className="auth-form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value.replace(/[<>]/g, ''))}
                    required
                    placeholder="Il tuo indirizzo email"
                  />
                </div>
                <div className="auth-modal-buttons">
                  <button type="submit" className="auth-reset-btn" disabled={loading}>
                    {loading ? 'Invio...' : 'Invia Reset'}
                  </button>
                  <button
                    type="button"
                    className="auth-cancel-btn"
                    onClick={() => {
                      setShowForgotPassword(false);
                      setResetEmail('');
                      setResetMessage('');
                      setError(null);
                    }}
                  >
                    Annulla
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* GDPR Warning Modal */}
      {showGdprWarning && (
        <div className="auth-modal-overlay">
          <div className="auth-gdpr-warning-modal">
            <h3>Consenso Richiesto</h3>
            <p>
              È necessario accettare l'Informativa Privacy e acconsentire al trattamento dei dati personali per poter procedere con la registrazione.
            </p>
            <p>
              Senza questo consenso non è possibile creare un account.
            </p>
            <div className="auth-modal-buttons">
              <button
                className="auth-gdpr-continue-btn"
                onClick={handleGdprWarningContinue}
              >
                Accetto e Continua
              </button>
              <button
                className="auth-gdpr-cancel-btn"
                onClick={() => {
                  setShowGdprWarning(false);
                  setGdprAccepted(false);
                }}
              >
                Annulla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Privacy Policy Modal */}
      {showPrivacyPolicy && (
        <PrivacyPolicy onClose={() => setShowPrivacyPolicy(false)} />
      )}
    </div>
  );
}

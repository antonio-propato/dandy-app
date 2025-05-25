import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  multiFactor,
  RecaptchaVerifier,
} from 'firebase/auth'
import { auth, firestore } from '../lib/firebase'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import QRCode from 'qrcode'
import PrivacyPolicy from './PrivacyPolicy'
import './Auth.css'

// Utility function to capitalize names properly
const capitalizeName = (name) => {
  if (!name) return ''
  return name
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export default function Auth({ mode = 'signin' }) {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    dob: '',
    countryCode: '+39',
    phone: '',
    email: '',
    password: '',
  })
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [gdprAccepted, setGdprAccepted] = useState(true)
  const [showGdprWarning, setShowGdprWarning] = useState(false)
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetMessage, setResetMessage] = useState('')

  // MFA States
  const [showMfaVerification, setShowMfaVerification] = useState(false)
  const [mfaCode, setMfaCode] = useState('')
  const [mfaResolver, setMfaResolver] = useState(null)
  const [recaptchaVerifier, setRecaptchaVerifier] = useState(null)

  const handleChange = e => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleGdprChange = (e) => {
    setGdprAccepted(e.target.checked)
    if (e.target.checked) {
      setShowGdprWarning(false)
    }
  }

  // Initialize reCAPTCHA verifier
  const initializeRecaptcha = () => {
    if (!recaptchaVerifier) {
      const verifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
        callback: (response) => {
          // reCAPTCHA solved
        }
      })
      setRecaptchaVerifier(verifier)
      return verifier
    }
    return recaptchaVerifier
  }

  // Handle MFA verification
  const handleMfaVerification = async (e) => {
    e.preventDefault()
    if (!mfaCode || !mfaResolver) return

    setLoading(true)
    setError(null)

    try {
      const phoneCredential = PhoneAuthProvider.credential(
        mfaResolver.hints[0].uid,
        mfaCode
      )
      const multiFactorAssertion = PhoneMultiFactorGenerator.assertion(phoneCredential)

      const userCredential = await mfaResolver.resolveSignIn(multiFactorAssertion)

      // Check if superuser and redirect accordingly
      const userDoc = await getDoc(doc(firestore, 'users', userCredential.user.uid))
      const userData = userDoc.data()

      if (userData && userData.role === 'superuser') {
        navigate('/scan')
      } else {
        navigate('/profile')
      }

      setShowMfaVerification(false)
    } catch (err) {
      setError('Codice di verifica non valido. Riprova.')
      console.error('MFA verification error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    if (!resetEmail) {
      setError('Inserisci il tuo indirizzo email')
      return
    }

    setLoading(true)
    setError(null)

    try {
      await sendPasswordResetEmail(auth, resetEmail)
      setResetMessage('Email di reset inviata! Controlla la tua casella di posta.')
      setError(null)
    } catch (err) {
      setError('Errore nell\'invio dell\'email di reset. Verifica che l\'email sia corretta.')
      setResetMessage('')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async e => {
    e.preventDefault()
    setError(null)

    // Check GDPR consent for signup
    if (mode === 'signup' && !gdprAccepted) {
      setShowGdprWarning(true)
      return
    }

    setLoading(true)

    try {
      const { email, password, firstName, lastName, dob, countryCode, phone } = form
      let userCred

      if (mode === 'signup') {
        // 1️⃣ Create the Auth user
        userCred = await createUserWithEmailAndPassword(auth, email, password)

        // 2️⃣ Generate QR code for their profile link
        const qrData = `https://dandy.app/profile/${userCred.user.uid}`
        const qrCodeURL = await QRCode.toDataURL(qrData)

        // Determine if this is a superuser account
        const isSuperUser = email === 'antonio@propato.co.uk'

        // 3️⃣ Save user profile under "users/{uid}" with GDPR consent
        await setDoc(doc(firestore, 'users', userCred.user.uid), {
          firstName: capitalizeName(firstName),
          lastName: capitalizeName(lastName),
          dob,
          phone: `${countryCode}${phone}`,
          email: email.toLowerCase(),
          qrCode: qrCodeURL,
          role: isSuperUser ? 'superuser' : 'customer',
          gdprConsent: {
            accepted: true,
            acceptedAt: new Date().toISOString(),
            version: '1.0',
            marketingConsent: true,
            pushNotificationConsent: true
          }
        })

        // 4️⃣ Initialize stamps doc under "stamps/{uid}"
        if (!isSuperUser) {
          await setDoc(doc(firestore, 'stamps', userCred.user.uid), {
            stamps: [],
            rewardClaimed: false,
            lifetimeStamps: 0,
            rewardsEarned: 0
          })
        }

        // For signup, redirect directly (MFA is typically set up after initial signup)
        navigate('/profile')
      } else {
        // Sign-in flow with MFA support
        try {
          userCred = await signInWithEmailAndPassword(auth, email, password)

          // Check if this is a superuser account
          const userDoc = await getDoc(doc(firestore, 'users', userCred.user.uid))
          const userData = userDoc.data()

          if (userData && userData.role === 'superuser') {
            navigate('/scan')
          } else {
            navigate('/profile')
          }
        } catch (err) {
          // Check if this is an MFA error
          if (err.code === 'auth/multi-factor-auth-required') {
            const resolver = err.resolver
            setMfaResolver(resolver)

            // Initialize reCAPTCHA and send SMS
            const verifier = initializeRecaptcha()
            const phoneInfoOptions = {
              multiFactorHint: resolver.hints[0],
              session: resolver.session
            }

            const phoneAuthProvider = new PhoneAuthProvider(auth)
            const verificationId = await phoneAuthProvider.verifyPhoneNumber(phoneInfoOptions, verifier)

            setShowMfaVerification(true)
            setError(null)
          } else {
            throw err // Re-throw if it's not an MFA error
          }
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleGdprWarningContinue = async () => {
    setGdprAccepted(true)
    setShowGdprWarning(false)
    setLoading(true)

    try {
      const { email, password, firstName, lastName, dob, countryCode, phone } = form

      // Create the Auth user
      const userCred = await createUserWithEmailAndPassword(auth, email, password)

      // Generate QR code for their profile link
      const qrData = `https://dandy.app/profile/${userCred.user.uid}`
      const qrCodeURL = await QRCode.toDataURL(qrData)

      // Determine if this is a superuser account
      const isSuperUser = email === 'antonio@propato.co.uk'

      // Save user profile under "users/{uid}" with GDPR consent
      await setDoc(doc(firestore, 'users', userCred.user.uid), {
        firstName: capitalizeName(firstName),
        lastName: capitalizeName(lastName),
        dob,
        phone: `${countryCode}${phone}`,
        email: email.toLowerCase(),
        qrCode: qrCodeURL,
        role: isSuperUser ? 'superuser' : 'customer',
        gdprConsent: {
          accepted: true,
          acceptedAt: new Date().toISOString(),
          version: '1.0',
          marketingConsent: true,
          pushNotificationConsent: true
        }
      })

      // Initialize stamps doc under "stamps/{uid}"
      if (!isSuperUser) {
        await setDoc(doc(firestore, 'stamps', userCred.user.uid), {
          stamps: [],
          rewardClaimed: false,
          lifetimeStamps: 0,
          rewardsEarned: 0
        })
      }

      // Redirect to profile
      navigate('/profile')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-overlay"></div>
      {/* Hidden reCAPTCHA container */}
      <div id="recaptcha-container"></div>

      <div className={`auth-card ${mode === 'signin' ? 'auth-card-signin' : ''}`}>
        <img
          src="/images/Dandy.jpeg"
          alt="Dandy Logo"
          className={`auth-logo ${mode === 'signin' ? 'auth-logo-signin' : ''}`}
        />

        {mode === 'signin' && <h2 className="auth-title">Bentornato</h2>}

        {error && <div className="auth-error">{error}</div>}
        {resetMessage && <div className="auth-success">{resetMessage}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'signup' && (
            <>
              <div className="auth-form-group">
                <label>Nome</label>
                <input
                  type="text"
                  name="firstName"
                  value={form.firstName}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="auth-form-group">
                <label>Cognome</label>
                <input
                  type="text"
                  name="lastName"
                  value={form.lastName}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="auth-form-group">
                <label>Compleanno</label>
                <input
                  type="text"
                  name="dob"
                  placeholder="gg/mm"
                  value={form.dob}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="auth-form-group phone">
                <label>Cellulare</label>
                <div className="auth-phone-fields">
                  <input
                    type="text"
                    name="countryCode"
                    value={form.countryCode}
                    onChange={handleChange}
                    required
                    className="auth-phone-code"
                  />
                  <input
                    type="tel"
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    required
                    placeholder="123456789"
                  />
                </div>
              </div>
            </>
          )}

          <div className="auth-form-group">
            <label>Email</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="auth-form-group">
            <label>Password</label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
            />
          </div>

          {/* Forgot Password Link - Only show on signin */}
          {mode === 'signin' && (
            <div className="auth-forgot-password">
              <button
                type="button"
                className="auth-forgot-link"
                onClick={() => setShowForgotPassword(true)}
              >
                Hai dimenticato la tua password?
              </button>
            </div>
          )}

          {/* GDPR Checkbox for signup only */}
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
                  <span
                    className="auth-privacy-link"
                    onClick={() => setShowPrivacyPolicy(true)}
                  >
                    Informativa Privacy
                  </span>
                  {' '}e acconsento al trattamento dei miei dati personali per finalità di marketing, notifiche push e comunicazioni promozionali.
                </label>
              </div>
            </div>
          )}

          <div className="auth-button-container">
            <button
              type="submit"
              disabled={loading}
              className={`auth-button ${mode === 'signup' ? 'auth-button-signup' : 'auth-button-signin'}`}
            >
              {loading ? 'Attendere...' : mode === 'signup' ? 'CONFERMA' : 'ACCEDI'}
            </button>
          </div>
        </form>
      </div>

      {/* MFA Verification Modal */}
      {showMfaVerification && (
        <div className="auth-modal-overlay">
          <div className="auth-mfa-modal">
            <div className="auth-modal-header">
              <h3>Verifica SMS</h3>
            </div>
            <div className="auth-modal-content">
              <p>Abbiamo inviato un codice di verifica al tuo telefono. Inserisci il codice qui sotto.</p>
              <form onSubmit={handleMfaVerification}>
                <div className="auth-form-group">
                  <label>Codice di Verifica</label>
                  <input
                    type="text"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    required
                    placeholder="123456"
                    maxLength="6"
                  />
                </div>
                <div className="auth-modal-buttons">
                  <button
                    type="submit"
                    className="auth-verify-btn"
                    disabled={loading}
                  >
                    {loading ? 'Verifica...' : 'Verifica'}
                  </button>
                  <button
                    type="button"
                    className="auth-cancel-btn"
                    onClick={() => {
                      setShowMfaVerification(false)
                      setMfaCode('')
                      setMfaResolver(null)
                      setError(null)
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

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="auth-modal-overlay">
          <div className="auth-forgot-modal">
            <div className="auth-modal-header">
              <h3>Reset Password</h3>
              <button
                className="auth-modal-close"
                onClick={() => {
                  setShowForgotPassword(false)
                  setResetEmail('')
                  setResetMessage('')
                  setError(null)
                }}
              >
                ×
              </button>
            </div>
            <div className="auth-modal-content">
              <p>Inserisci il tuo indirizzo email per ricevere il link di reset della password.</p>
              <form onSubmit={handleForgotPassword}>
                <div className="auth-form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    required
                    placeholder="La tua email"
                  />
                </div>
                <div className="auth-modal-buttons">
                  <button
                    type="submit"
                    className="auth-reset-btn"
                    disabled={loading}
                  >
                    {loading ? 'Invio...' : 'Invia Reset'}
                  </button>
                  <button
                    type="button"
                    className="auth-cancel-btn"
                    onClick={() => {
                      setShowForgotPassword(false)
                      setResetEmail('')
                      setResetMessage('')
                      setError(null)
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
            <h3>Consenso Privacy Richiesto</h3>
            <p>
              Per procedere con la registrazione è necessario accettare l'informativa privacy
              e acconsentire al trattamento dei dati personali per finalità di marketing e notifiche push.
            </p>
            <p>
              Cliccando "Continua" accetti automaticamente questi termini.
            </p>
            <div className="auth-modal-buttons">
              <button
                className="auth-gdpr-continue-btn"
                onClick={handleGdprWarningContinue}
              >
                Continua
              </button>
              <button
                className="auth-gdpr-cancel-btn"
                onClick={() => setShowGdprWarning(false)}
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
  )
}

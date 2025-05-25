import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
} from 'firebase/auth'
import { auth, firestore } from '../lib/firebase'
import { doc, setDoc, getDoc, query, collection, where, getDocs } from 'firebase/firestore'
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

// Get time-based greeting using user's local timezone
const getTimeBasedGreeting = () => {
  const now = new Date()
  const hour = now.getHours() // Uses user's local time automatically

  if (hour >= 5 && hour < 12) {
    return 'Buongiorno!'
  } else if (hour >= 12 && hour < 18) {
    return 'Buon Pomeriggio!'
  } else {
    return 'Buonasera!'
  }
}

// Validation functions
const validateCompleanno = (dob) => {
  const regex = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])$/
  return regex.test(dob)
}

const validateMobile = (phone, countryCode) => {
  // Remove spaces and special characters
  const cleanPhone = phone.replace(/[\s\-\(\)]/g, '')

  // Italian mobile validation for +39
  if (countryCode === '+39') {
    // Italian mobile: 10 digits starting with 3
    return /^3\d{9}$/.test(cleanPhone)
  }

  // Basic validation for other countries (7-15 digits)
  return /^\d{7,15}$/.test(cleanPhone)
}

const checkEmailExists = async (email) => {
  try {
    const q = query(collection(firestore, 'users'), where('email', '==', email.toLowerCase()))
    const querySnapshot = await getDocs(q)
    return !querySnapshot.empty
  } catch (error) {
    console.error('Error checking email:', error)
    return false
  }
}

const checkPhoneExists = async (phone) => {
  try {
    const q = query(collection(firestore, 'users'), where('phone', '==', phone))
    const querySnapshot = await getDocs(q)
    return !querySnapshot.empty
  } catch (error) {
    console.error('Error checking phone:', error)
    return false
  }
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
  const [emailVerificationSent, setEmailVerificationSent] = useState(false)
  const [justCreatedUser, setJustCreatedUser] = useState(null)
  const [validationErrors, setValidationErrors] = useState({})

  // Auto-check email verification status with proper role-based redirect
  useEffect(() => {
    let intervalId

    if (emailVerificationSent && justCreatedUser) {
      intervalId = setInterval(async () => {
        try {
          await justCreatedUser.reload()
          if (justCreatedUser.emailVerified) {
            // Update Firestore with verification status
            await setDoc(doc(firestore, 'users', justCreatedUser.uid), {
              emailVerified: true
            }, { merge: true })

            // Check user role and redirect appropriately
            const userDoc = await getDoc(doc(firestore, 'users', justCreatedUser.uid))
            const userData = userDoc.data()

            clearInterval(intervalId)

            // Redirect based on role
            if (userData && userData.role === 'superuser') {
              navigate('/scan')  // Superuser goes to scan page
            } else {
              navigate('/profile')  // Regular users go to profile
            }
          }
        } catch (error) {
          console.error('Error checking verification status:', error)
        }
      }, 3000) // Check every 3 seconds
    }

    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [emailVerificationSent, justCreatedUser, navigate])

  useEffect(() => {
    // Lock the page when component mounts
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.width = '100%'
    document.body.style.height = '100%'

    // Add meta tag for orientation lock (if not already present)
    const orientationMeta = document.querySelector('meta[name="viewport"]')
    if (orientationMeta) {
      const currentContent = orientationMeta.content
      // Store original viewport content to restore later
      orientationMeta.setAttribute('data-original-content', currentContent)
      orientationMeta.content = 'width=device-width, initial-scale=1.0, user-scalable=no'
    }

    // Cleanup when component unmounts
    return () => {
      document.body.style.overflow = ''
      document.body.style.position = ''
      document.body.style.width = ''
      document.body.style.height = ''

      // Restore original viewport settings
      const orientationMeta = document.querySelector('meta[name="viewport"]')
      if (orientationMeta) {
        const originalContent = orientationMeta.getAttribute('data-original-content')
        if (originalContent) {
          orientationMeta.content = originalContent
          orientationMeta.removeAttribute('data-original-content')
        }
      }
    }
  }, [])

  const handleChange = e => {
    const { name, value } = e.target
    setForm({ ...form, [name]: value })

    // Clear validation error when user starts typing
    if (validationErrors[name]) {
      setValidationErrors({ ...validationErrors, [name]: null })
    }
  }

  const handleDobChange = (e) => {
    let value = e.target.value.replace(/\D/g, '') // Remove non-digits

    // Format as DD/MM
    if (value.length >= 3) {
      value = value.slice(0, 2) + '/' + value.slice(2, 4)
    }

    setForm({ ...form, dob: value })

    // Clear validation error
    if (validationErrors.dob) {
      setValidationErrors({ ...validationErrors, dob: null })
    }
  }

  const handleGdprChange = (e) => {
    setGdprAccepted(e.target.checked)
    if (e.target.checked) {
      setShowGdprWarning(false)
    }
  }

  const validateForm = async () => {
    const errors = {}

    if (mode === 'signup') {
      // Validate compleanno
      if (!validateCompleanno(form.dob)) {
        errors.dob = 'Formato compleanno non valido. Usa GG/MM (es: 15/03)'
      }

      // Validate mobile
      if (!validateMobile(form.phone, form.countryCode)) {
        if (form.countryCode === '+39') {
          errors.phone = 'Numero di cellulare non valido. Deve iniziare con 3 e avere 10 cifre'
        } else {
          errors.phone = 'Numero di cellulare non valido'
        }
      }

      // Check email uniqueness
      const emailExists = await checkEmailExists(form.email)
      if (emailExists) {
        errors.email = 'Questa email è già registrata'
      }

      // Check phone uniqueness
      const fullPhone = `${form.countryCode}${form.phone}`
      const phoneExists = await checkPhoneExists(fullPhone)
      if (phoneExists) {
        errors.phone = 'Questo numero di cellulare è già registrato'
      }
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
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

  const handleResendVerification = async () => {
    if (!justCreatedUser) return

    setLoading(true)
    setError(null)

    try {
      await sendEmailVerification(justCreatedUser)
      setResetMessage('Email di verifica inviata nuovamente!')
    } catch (err) {
      setError('Errore nell\'invio dell\'email di verifica.')
    } finally {
      setLoading(false)
    }
  }

  const handleCheckVerification = async () => {
    if (!justCreatedUser) return

    setLoading(true)
    setError(null)

    try {
      // Reload user to get latest emailVerified status
      await justCreatedUser.reload()

      if (justCreatedUser.emailVerified) {
        // Update Firestore with verification status
        await setDoc(doc(firestore, 'users', justCreatedUser.uid), {
          emailVerified: true
        }, { merge: true })

        // Check user role and redirect appropriately
        const userDoc = await getDoc(doc(firestore, 'users', justCreatedUser.uid))
        const userData = userDoc.data()

        // Redirect based on role
        if (userData && userData.role === 'superuser') {
          navigate('/scan')  // Superuser goes to scan page
        } else {
          navigate('/profile')  // Regular users go to profile
        }
      } else {
        setError('Email non ancora verificata. Controlla la tua casella di posta e clicca sul link.')
      }
    } catch (err) {
      setError('Errore durante la verifica. Riprova.')
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

    // Validate form for signup
    if (mode === 'signup') {
      const isValid = await validateForm()
      if (!isValid) {
        setLoading(false)
        return
      }
    }

    try {
      const { email, password, firstName, lastName, dob, countryCode, phone } = form
      let userCred

      if (mode === 'signup') {
        // 1️⃣ Create the Auth user
        userCred = await createUserWithEmailAndPassword(auth, email, password)

        // 2️⃣ Send email verification immediately
        await sendEmailVerification(userCred.user)

        // 3️⃣ Generate QR code for their profile link
        const qrData = `https://dandy.app/profile/${userCred.user.uid}`
        const qrCodeURL = await QRCode.toDataURL(qrData)

        // Determine if this is a superuser account
        const isSuperUser = email === 'antonio@propato.co.uk'

        // 4️⃣ Save user profile under "users/{uid}" with GDPR consent
        await setDoc(doc(firestore, 'users', userCred.user.uid), {
          firstName: capitalizeName(firstName),
          lastName: capitalizeName(lastName),
          dob,
          phone: `${countryCode}${phone}`,
          email: email.toLowerCase(),
          qrCode: qrCodeURL,
          role: isSuperUser ? 'superuser' : 'customer',
          emailVerified: false,
          createdAt: new Date().toISOString(),
          gdprConsent: {
            accepted: true,
            acceptedAt: new Date().toISOString(),
            version: '1.0',
            marketingConsent: true,
            pushNotificationConsent: true
          }
        })

        // 5️⃣ Initialize stamps doc under "stamps/{uid}" - ONLY for customers
        if (!isSuperUser) {
          await setDoc(doc(firestore, 'stamps', userCred.user.uid), {
            stamps: [],
            rewardClaimed: false,
            lifetimeStamps: 0,
            rewardsEarned: 0
          })
        }

        // Store user and show verification screen
        setJustCreatedUser(userCred.user)
        setEmailVerificationSent(true)
        setLoading(false)
        return
      } else {
        // Sign-in flow
        userCred = await signInWithEmailAndPassword(auth, email, password)

        // Check email verification status
        if (!userCred.user.emailVerified) {
          setError('Email non verificata. Controlla la tua casella di posta e clicca sul link di verifica.')
          setLoading(false)
          return
        }

        // Check if this is a superuser account
        const userDoc = await getDoc(doc(firestore, 'users', userCred.user.uid))
        const userData = userDoc.data()

        if (userData && userData.role === 'superuser') {
          navigate('/scan')
        } else {
          navigate('/profile')
        }
      }
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        setError('Questa email è già registrata. Prova ad accedere invece.')
      } else if (err.code === 'auth/weak-password') {
        setError('La password deve essere di almeno 6 caratteri.')
      } else if (err.code === 'auth/invalid-email') {
        setError('Indirizzo email non valido.')
      } else if (err.code === 'auth/user-not-found') {
        setError('Account non trovato. Verifica email e password.')
      } else if (err.code === 'auth/wrong-password') {
        setError('Password non corretta.')
      } else {
        setError(err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleGdprWarningContinue = async () => {
    setGdprAccepted(true)
    setShowGdprWarning(false)
    // Trigger the normal submit flow
    handleSubmit({ preventDefault: () => {} })
  }

  // Show email verification screen after signup
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
              <strong>{form.email}</strong>
            </p>
            <p>
              Clicca sul link nell'email per attivare il tuo account.
              La verifica avverrà automaticamente.
            </p>
            <div className="auth-verification-buttons">
              <button
                className="auth-continue-btn"
                onClick={handleCheckVerification}
                disabled={loading}
              >
                {loading ? 'Verifica...' : 'Continua'}
              </button>
              <button
                className="auth-resend-btn"
                onClick={handleResendVerification}
                disabled={loading}
              >
                {loading ? 'Invio...' : 'Invia di nuovo'}
              </button>
            </div>
            {resetMessage && <div className="auth-success">{resetMessage}</div>}
            {error && <div className="auth-error">{error}</div>}
          </div>
        </div>
      </div>
    )
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
                  placeholder="15/03"
                  value={form.dob}
                  onChange={handleDobChange}
                  maxLength="5"
                  required
                  className={validationErrors.dob ? 'auth-input-error' : ''}
                />
                {validationErrors.dob && (
                  <div className="auth-field-error">{validationErrors.dob}</div>
                )}
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
                    placeholder="3123456789"
                    className={validationErrors.phone ? 'auth-input-error' : ''}
                  />
                </div>
                {validationErrors.phone && (
                  <div className="auth-field-error">{validationErrors.phone}</div>
                )}
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
              className={validationErrors.email ? 'auth-input-error' : ''}
            />
            {validationErrors.email && (
              <div className="auth-field-error">{validationErrors.email}</div>
            )}
          </div>

          <div className="auth-form-group">
            <label>Password</label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
              minLength="6"
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

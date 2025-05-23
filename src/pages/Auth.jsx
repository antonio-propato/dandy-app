import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
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

  const handleChange = e => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleGdprChange = (e) => {
    setGdprAccepted(e.target.checked)
    if (e.target.checked) {
      setShowGdprWarning(false)
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
          email: email.toLowerCase(), // Also ensure email is lowercase
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
      } else {
        // Sign-in flow
        userCred = await signInWithEmailAndPassword(auth, email, password)

        // Check if this is a superuser account
        const userDoc = await getDoc(doc(firestore, 'users', userCred.user.uid))
        const userData = userDoc.data()

        if (userData && userData.role === 'superuser') {
          navigate('/scan')
          return
        }
      }

      // Redirect regular users to profile
      navigate('/profile')
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
        email: email.toLowerCase(), // Also ensure email is lowercase
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

      <div className={`auth-card ${mode === 'signin' ? 'auth-card-signin' : ''}`}>
        <img
          src="/images/Dandy.jpeg"
          alt="Dandy Logo"
          className={`auth-logo ${mode === 'signin' ? 'auth-logo-signin' : ''}`}
        />

        {mode === 'signin' && <h2 className="auth-title">Bentornato</h2>}

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'signup' && (
            <>
              <div className="form-group">
                <label>Nome</label>
                <input
                  type="text"
                  name="firstName"
                  value={form.firstName}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>Cognome</label>
                <input
                  type="text"
                  name="lastName"
                  value={form.lastName}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
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

              <div className="form-group phone">
                <label>Cellulare</label>
                <div className="phone-fields">
                  <input
                    type="text"
                    name="countryCode"
                    value={form.countryCode}
                    onChange={handleChange}
                    required
                    className="code"
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

          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
            />
          </div>

          {/* GDPR Checkbox for signup only */}
          {mode === 'signup' && (
            <div className="gdpr-section">
              <div className="gdpr-checkbox">
                <input
                  type="checkbox"
                  id="gdpr-consent"
                  checked={gdprAccepted}
                  onChange={handleGdprChange}
                />
                <label htmlFor="gdpr-consent" className="gdpr-label">
                  Accetto l'{' '}
                  <span
                    className="privacy-link"
                    onClick={() => setShowPrivacyPolicy(true)}
                  >
                    Informativa Privacy
                  </span>
                  {' '}e acconsento al trattamento dei miei dati personali per finalità di marketing, notifiche push e comunicazioni promozionali.
                </label>
              </div>
            </div>
          )}

          <div style={{ marginTop: mode === 'signin' ? '1.5rem' : '1.5rem' }}>
            <button
              type="submit"
              disabled={loading}
              className="auth-button"
            >
              {loading ? 'Attendere...' : mode === 'signup' ? 'CONFERMA' : 'ACCEDI'}
            </button>
          </div>
        </form>
      </div>

      {/* GDPR Warning Modal */}
      {showGdprWarning && (
        <div className="modal-overlay">
          <div className="gdpr-warning-modal">
            <h3>Consenso Privacy Richiesto</h3>
            <p>
              Per procedere con la registrazione è necessario accettare l'informativa privacy
              e acconsentire al trattamento dei dati personali per finalità di marketing e notifiche push.
            </p>
            <p>
              Cliccando "Continua" accetti automaticamente questi termini.
            </p>
            <div className="modal-buttons">
              <button
                className="gdpr-continue-btn"
                onClick={handleGdprWarningContinue}
              >
                Continua
              </button>
              <button
                className="gdpr-cancel-btn"
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

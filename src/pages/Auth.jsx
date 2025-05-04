import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth'
import { auth, firestore } from '../lib/firebase'
import { doc, setDoc } from 'firebase/firestore'
import QRCode from 'qrcode' // ✅ This is the line you need
import './Auth.css'


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

  const handleChange = e => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async e => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      let userCred
      const { email, password, firstName, lastName, dob, countryCode, phone } = form

      if (mode === 'signup') {
        userCred = await createUserWithEmailAndPassword(auth, email, password)

        const qrData = `https://dandy.app/profile/${userCred.user.uid}`
        const qrCodeURL = await QRCode.toDataURL(qrData) // ✅ This generates the QR

        await setDoc(doc(firestore, 'users', userCred.user.uid), {
          firstName,
          lastName,
          dob,
          phone: `${countryCode}${phone}`,
          email,
          qrCode: qrCodeURL, // ✅ Save it to Firestore
        })
        console.log(qrCodeURL)
      } else {
        userCred = await signInWithEmailAndPassword(auth, email, password)
      }

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

        {mode === 'signin' && (
          <h2 className="auth-title">Bentornato</h2>
        )}

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

          <div style={{ marginTop: mode === 'signin' ? '1.5rem' : '2.5rem' }}>
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
    </div>
  )
}

// File: src/pages/Profile.jsx
import React, { useState, useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, firestore } from '../lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import Nav from '../components/Nav'
import Legno from '/images/Legno.png'
import './Profile.css'

export default function Profile() {
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async user => {
      if (user) {
        const docRef = doc(firestore, 'users', user.uid)
        const docSnap = await getDoc(docRef)
        if (docSnap.exists()) setProfile(docSnap.data())
      }
    })
    return unsubscribe
  }, [])

  if (!profile) return <div className="loading">Caricamento profilo...</div>

  // Format phone as international: prepend + if missing, split code/number
  const rawPhone = profile.phone.startsWith('+') ? profile.phone : `+${profile.phone}`
  const [countryCode, ...numberParts] = rawPhone.split(' ')
  const phoneNumber = numberParts.join(' ')

  return (
    <div className="profile-wrapper" style={{ backgroundImage: `url(${Legno})` }}>
      <div className="profile-overlay"></div>
      <Nav />

      <div className="profile-card">
        <div className="profile-content">
          <h1 className="profile-name">
            {profile.firstName} {profile.lastName}
          </h1>
          <p><strong>Compleanno:</strong> {profile.dob}</p>
          <p className="profile-phone">
            <strong>Telefono:</strong>
            <span className="phone-code">{countryCode}</span>
            <span className="phone-number">{phoneNumber}</span>
          </p>
          <p><strong>Email:</strong> {profile.email}</p>

          {profile.qrCode && (
            <div className="qr-section">
              {/* <p>Il tuo QR code:</p> */}
              <img src={profile.qrCode} alt="QR Code" className="qr-image" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

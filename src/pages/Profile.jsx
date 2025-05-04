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

  if (!profile) return <div>Caricamento profilo...</div>

  return (
    <div className="profile-wrapper" style={{ backgroundImage: `url(${Legno})` }}>
      <div className="profile-overlay"></div>

      <Nav />

      <div className="profile-content">
        <h1>
          {profile.firstName} {profile.lastName}
        </h1>
        <p>Compleanno: {profile.dob}</p>
        <p>Telefono: {profile.phone}</p>
        <p>Email: {profile.email}</p>

        {profile.qrCode && (
          <div className="qr-section">
            <p>Il tuo QR code personale:</p>
            <img src={profile.qrCode} alt="QR Code" className="qr-image" />
          </div>
        )}
      </div>
    </div>
  )
}

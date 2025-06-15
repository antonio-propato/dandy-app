// File: src/pages/Profile.jsx
import React, { useState, useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, firestore } from '../lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import Nav from '../components/Nav'
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

  // Function to determine name length class
  const getNameLengthClass = (firstName, lastName) => {
    const fullName = `${firstName} ${lastName}`
    const nameLength = fullName.length

    if (nameLength > 25) {
      return 'very-long'
    } else if (nameLength > 18) {
      return 'long-name'
    }
    return ''
  }

  if (!profile) {
    return (
      <div
        className="profile-wrapper"
        style={{ backgroundImage: `url('/images/Legno.png')` }}
      >
        <div className="profile-overlay" />
        <div className="loading">Caricamento profilo...</div>
      </div>
    )
  }

  // Format phone as international: prepend + if missing, split code/number
  const rawPhone = profile.phone.startsWith('+') ? profile.phone : `+${profile.phone}`
  const [countryCode, ...numberParts] = rawPhone.split(' ')
  const phoneNumber = numberParts.join(' ')

  // Get appropriate CSS class for name length
  const nameClass = getNameLengthClass(profile.firstName, profile.lastName)

  return (
    <div
      className="profile-wrapper"
      style={{ backgroundImage: `url('/images/Legno.png')` }}
    >
      <div className="profile-overlay" />
      <Nav />

      <div className="profile-card">
        {/* Diamond-bling shine lives inside the card */}
        <div className="shine-effect" />

        <div className="profile-content">
          <h1 className={`profile-name ${nameClass}`}>
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
              <img src={profile.qrCode} alt="QR Code" className="qr-image" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

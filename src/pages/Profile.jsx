// src/pages/Profile.jsx
import React, { useState, useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, firestore } from '../lib/firebase'
import { doc, getDoc } from 'firebase/firestore'

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

  if (!profile) return <div>Loading profile...</div>

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">{profile.firstName} {profile.lastName}</h1>
      <p>Date of Birth: {profile.dob}</p>
      <p>Phone: {profile.phone}</p>
      <p>Email: {profile.email}</p>
    </div>
  )
}

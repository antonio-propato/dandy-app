import React, { useState, useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, firestore } from '../lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import Nav from '../components/Nav'
import Legno from '/images/Legno.png'

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
    <div
      className="min-h-screen w-full bg-cover bg-center relative"
      style={{ backgroundImage: `url(${Legno})` }}
    >
      <div className="absolute inset-0 bg-black bg-opacity-40 z-0"></div>

      <div className="relative z-10 p-6 max-w-lg mx-auto text-white">
        <Nav />
        <h1 className="text-3xl font-bold text-[#ECF0BA] mb-4">
          {profile.firstName} {profile.lastName}
        </h1>
        <p className="mb-2 text-[#ECF0BA]">Compleanno: {profile.dob}</p>
        <p className="mb-2 text-[#ECF0BA]">Telefono: {profile.phone}</p>
        <p className="mb-4 text-[#ECF0BA]">Email: {profile.email}</p>

        {profile.qrCode && (
          <div className="mt-6 text-center">
            <p className="text-[#ECF0BA] mb-2">Il tuo QR code personale:</p>
            <img src={profile.qrCode} alt="QR Code" className="w-40 h-40 mx-auto rounded-xl border border-[#ECF0BA]" />
          </div>
        )}
      </div>
    </div>
  )
}

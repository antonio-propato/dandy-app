// src/components/ProtectedRoute.jsx
import React, { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { firestore } from '../lib/firebase'

export default function ProtectedRoute({ user, children, requireSuperuser = false }) {
  const [userRole, setUserRole] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkUserRole = async () => {
      if (user) {
        try {
          const userDoc = await getDoc(doc(firestore, 'users', user.uid))
          if (userDoc.exists()) {
            setUserRole(userDoc.data().role || 'customer')
          }
        } catch (error) {
          console.error('Error fetching user role:', error)
        }
      }
      setLoading(false)
    }

    checkUserRole()
  }, [user])

  if (!user) {
    return <Navigate to="/signin" replace />
  }

  if (loading) {
    return <div>Loading...</div>
  }

  if (requireSuperuser && userRole !== 'superuser') {
    return <Navigate to="/profile" replace />
  }

  return children
}

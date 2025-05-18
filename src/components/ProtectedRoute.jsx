// src/components/ProtectedRoute.jsx
import React from 'react'
import { Navigate } from 'react-router-dom'

export default function ProtectedRoute({ user, children }) {
  console.log("ProtectedRoute - User:", user ? "Authenticated" : "Not authenticated");

  // Only check if user is authenticated - role checking is done in App.jsx
  if (!user) {
    console.log("ProtectedRoute - No user, redirecting to signin");
    return <Navigate to="/signin" replace />
  }

  console.log("ProtectedRoute - User authenticated, rendering children");
  return children
}

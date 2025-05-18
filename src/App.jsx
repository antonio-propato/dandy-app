// src/App.jsx
import React, { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import './App.css'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, firestore } from './lib/firebase'
import { doc, getDoc } from 'firebase/firestore'

// Components
import Nav from './components/Nav'
import ProtectedRoute from './components/ProtectedRoute'

// Pages
import Landing from './pages/Landing'
import Auth from './pages/Auth'
import Profile from './pages/Profile'
import Stamps from './pages/Stamps'
import Menu from './pages/Menu'
import Contacts from './pages/Contacts'
import Scan from './pages/Scan'
import SuperuserDashboard from './pages/SuperuserDashboard'

function AnimatedRoutes({ user, userRole }) {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* Public Routes */}
        <Route path="/" element={<Landing />} />
        <Route path="/signin" element={<Auth mode="signin" />} />
        <Route path="/signup" element={<Auth mode="signup" />} />



        {/* Protected Customer Routes */}
        <Route
          path="/profile"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? <Navigate to="/superuser-dashboard" /> : <Profile />}
            </ProtectedRoute>
          }
        />
        <Route
          path="/stamps"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? <Navigate to="/superuser-dashboard" /> : <Stamps />}
            </ProtectedRoute>
          }
        />
        <Route
          path="/menu"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? <Navigate to="/superuser-dashboard" /> : <Menu />}
            </ProtectedRoute>
          }
        />
        <Route
          path="/contacts"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? <Navigate to="/superuser-dashboard" /> : <Contacts />}
            </ProtectedRoute>
          }
        />

        {/* Superuser Routes */}
        <Route
          path="/superuser-dashboard"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? <SuperuserDashboard /> : <Navigate to="/profile" />}
            </ProtectedRoute>
          }
        />
        <Route
          path="/scan"
          element={
            <ProtectedRoute user={user}>
              {userRole === 'superuser' ? <Scan /> : <Navigate to="/profile" />}
            </ProtectedRoute>
          }
        />

        {/* Fallback route */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </AnimatePresence>
  )
}

function App() {
  const [user, setUser] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser)

      if (currentUser) {
        try {
          // Get user role
          const userDoc = await getDoc(doc(firestore, 'users', currentUser.uid))
          if (userDoc.exists()) {
            setUserRole(userDoc.data().role || 'customer')
          }
        } catch (error) {
          console.error('Error fetching user role:', error)
        }
      } else {
        setUserRole(null)
      }

      setLoading(false)
    })
    return () => unsubscribe()
  }, [])

  if (loading) {
    return <div className="loading">Loading...</div>
  }

  return (
    <Router>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="min-h-screen bg-gray-50"
      >
        <AnimatedRoutes user={user} userRole={userRole} />
        <Nav userRole={userRole} />
      </motion.div>
    </Router>
  )
}

export default App

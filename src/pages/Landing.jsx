// src/pages/Landing.jsx
import React from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'

export default function Landing() {
  return (
    <motion.div
      className="flex flex-col items-center justify-center min-h-screen bg-gray-50 px-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5 }}
    >
      <h1 className="text-4xl font-extrabold text-gray-900 mb-6">
        Welcome to Dandy Coffee
      </h1>
      <p className="text-lg text-gray-700 mb-8 text-center max-w-md">
        Discover and collect beautiful coffee stamps from around the world.
      </p>

      {/* Primary Sign Up button */}
      <Link
        to="/signup"
        className="w-full max-w-xs text-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg shadow-md transition"
      >
        Sign Up
      </Link>

      {/* Secondary Sign In link */}
      <Link
        to="/signin"
        className="mt-4 text-sm text-blue-600 hover:underline"
      >
        Already have an account? Sign In
      </Link>
    </motion.div>
  )
}

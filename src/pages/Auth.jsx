// src/pages/Auth.jsx
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth'
import { auth, firestore } from '../lib/firebase'
import { doc, setDoc } from 'firebase/firestore'

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
        await setDoc(doc(firestore, 'users', userCred.user.uid), {
          firstName,
          lastName,
          dob,
          phone: `${countryCode}${phone}`,
          email,
        })
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
    <div className="flex items-center justify-center min-h-screen bg-gray-50 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md bg-white p-8 rounded-lg shadow">
        <h2 className="text-2xl font-bold mb-6">
          {mode === 'signup' ? 'Create Account' : 'Welcome Back'}
        </h2>

        {error && <div className="mb-4 text-red-600">{error}</div>}

        {mode === 'signup' && (
          <>
            {/* First & Last Name */}
            <div className="mb-4">
              <label className="block text-gray-700">NOME</label>
              <input
                type="text"
                name="firstName"
                value={form.firstName}
                onChange={handleChange}
                required
                className="w-full mt-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring"
              />
            </div>
            <div className="mb-4">
              <label className="block text-gray-700">COGNOME</label>
              <input
                type="text"
                name="lastName"
                value={form.lastName}
                onChange={handleChange}
                required
                className="w-full mt-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring"
              />
            </div>

            {/* Date of Birth */}
            <div className="mb-4">
              <label className="block text-gray-700">DATA DI NASCITA</label>
              <input
                type="date"
                name="dob"
                value={form.dob}
                onChange={handleChange}
                required
                className="w-full mt-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring"
              />
            </div>

            {/* Phone with Country Code */}
            <div className="mb-4">
              <label className="block text-gray-700">CELL</label>
              <div className="flex items-center space-x-2 mt-1">
                <input
                  type="text"
                  name="countryCode"
                  value={form.countryCode}
                  onChange={handleChange}
                  required
                  className="flex-none w-12 max-w-[3rem] px-1 py-2 border rounded-lg focus:outline-none focus:ring text-center"
                />
                <input
                  type="tel"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  required
                  placeholder="123-456-7890"
                  className="flex-1 min-w-0 px-3 py-2 border rounded-lg focus:outline-none focus:ring"
                />
              </div>
            </div>
          </>
        )}

        {/* Email */}
        <div className="mb-4">
          <label className="block text-gray-700">Email</label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            required
            className="w-full mt-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring"
          />
        </div>

        {/* Password */}
        <div className="mb-6">
          <label className="block text-gray-700">Password</label>
          <input
            type="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            required
            className="w-full mt-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
        >
          {loading ? 'Please wait...' : mode === 'signup' ? 'CONFERMA' : 'ACCEDI'}
        </button>
      </form>
    </div>
  )
}

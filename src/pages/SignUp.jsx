import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Legno from '../assets/images/Legno.png'

export default function SignUp() {
  const [form, setForm] = useState({ email: '', password: '' })
  const navigate = useNavigate()

  const handleChange = e => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async e => {
    e.preventDefault()
    // TODO: Sign-up logic
    navigate('/profile')
  }

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center bg-cover bg-center relative"
      style={{ backgroundImage: `url(${Legno})` }}
    >
      <div className="absolute inset-0 bg-black bg-opacity-40 z-0"></div>

      <div className="relative z-10 bg-white bg-opacity-90 backdrop-blur-md rounded-2xl p-6 w-11/12 max-w-md text-center shadow-xl">
        <h1 className="text-2xl font-bold text-[#43221B] mb-6">CREA UN ACCOUNT</h1>

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div>
            <label className="text-sm font-semibold text-[#43221B]">Email</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              className="mt-1 w-full rounded-lg p-3 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#ECF0BA]"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-[#43221B]">Password</label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
              className="mt-1 w-full rounded-lg p-3 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#ECF0BA]"
            />
          </div>

          <button
            type="submit"
            className="bg-gradient-to-r from-[#43221B] to-[#43221bd3] text-[#ECF0BA] font-semibold py-3 px-6 rounded-lg w-full border border-[#ECF0BA] hover:brightness-110 transition"
          >
            REGISTRATI
          </button>
        </form>

        <p className="mt-6 text-sm text-gray-800 text-center">
          Hai già un account?{' '}
          <Link to="/auth" className="text-[#43221B] font-semibold hover:underline">
            ACCEDI
          </Link>
        </p>
      </div>
    </div>
  )
}

<div className="bg-red-500 text-white p-4">Test</div>

import React from 'react'
import Nav from '../components/Nav' // ⬅️ Make sure this path is correct
import './Stamps.css'

export default function Stamps() {
  const totalStamps = 5
  const slots = Array.from({ length: 9 })

  return (
    <div className="stamps-wrapper">
      <Nav /> {}

      <h1 className="stamps-title">Stamps Collected</h1>

      <div className="stamps-container">
        <div className="stamps-grid">
          {slots.map((_, idx) => (
            <div key={idx} className="stamp-box">
              {idx < totalStamps ? '🟫' : ''}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

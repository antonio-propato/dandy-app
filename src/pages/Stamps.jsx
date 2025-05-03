import React from 'react'

export default function Stamps() {
  const totalStamps = 5
  const slots = Array.from({ length: 9 })

  return (
    <div className="p-6 w-full">
      <h1 className="text-2xl font-bold mb-6">Stamps Collected</h1>

      <div className="bg-white p-4 rounded-lg shadow-md max-w-2xl mx-auto">
        <div className="grid grid-cols-3 gap-6 justify-items-center">
          {slots.map((_, idx) => (
            <div
              key={idx}
              className="bg-gray-100 border border-gray-300 rounded-xl flex items-center justify-center text-4xl"
              style={{ width: '100px', height: '100px' }} // force size
            >
              {idx < totalStamps ? '🟫' : ''}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

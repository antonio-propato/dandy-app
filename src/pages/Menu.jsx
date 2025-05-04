import React from 'react'
import Nav from '../components/Nav'
import './Menu.css'
import Legno from '/images/Couch.jpg'

export default function Menu() {
  const items = {
    Caffetteria: [
      { name: 'Espresso', price: '€0.90' },
      { name: 'Doppio Espresso', price: '€1.00' },
      { name: "Caffè Orzo", price: '€1.20' },
      { name: 'Latte Macchiato', price: '€1.50' },
      { name: 'Cioccolata Calda', price: '€2.00' },
      { name: 'Tè Verde', price: '€1.50' },
      { name: 'Tè Nero', price: '€1.50' },
      { name: 'Tè alla Pesca', price: '€1.50' },
      { name: 'Tè al Limone', price: '€1.50' },
      { name: 'Cappuccino', price: '€1.50' }
    ],
    Cornetteria: [
      { name: 'Vuoto', price: '€1.00' },
      { name: 'Vegano', price: '€1.20' },
      { name: 'Crema', price: '€1.50' },
      { name: 'Marmellata', price: '€1.50' },
      { name: 'Cioccolato', price: '€1.50' },
      { name: 'Pistacchio', price: '€1.50' }
    ],
    Alcolici: [
      { name: 'Birra', price: '€1.50' },
      { name: 'Aperol Spritz', price: '€5.00' },
      { name: 'Negroni', price: '€5.00' },
      { name: 'Gin Tonic', price: '€5.00' },
      { name: 'Rum Cola', price: '€5.00' },
      { name: 'Mojito', price: '€5.00' },
      { name: 'Bellini', price: '€5.00' },
      { name: 'Bloody Mary', price: '€5.00' },
      { name: 'Shot Rum', price: '€3.00/€5.00' },
      { name: 'Shot Vodka', price: '€3.00/€5.00' },
      { name: 'Shot Gin', price: '€3.00/€5.00' },
      { name: 'Shot Tequila', price: '€3.00/€5.00' }
    ]
  }

  return (
    <div
      className="menu-wrapper"
      style={{
        backgroundImage: `url(${Legno})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        minHeight: '100vh',
        padding: '2rem'
      }}
    >
      <Nav />

      <div className="menu-content">
        {Object.entries(items).map(([category, entries]) => (
          <div key={category} className="menu-section">
            <h2 className="menu-category">{category}</h2>
            <ul className="menu-list">
              {entries.map((item, idx) => (
                <li key={idx} className="menu-item">
                  <span>{item.name}</span>
                  <span>{item.price}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

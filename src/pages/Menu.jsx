import React, { useState, useEffect } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { firestore } from '../lib/firebase'
import Nav from '../components/Nav'
import './Menu.css'
import Legno from '/images/Couch.jpg'

export default function Menu() {
  const [items, setItems] = useState({})
  const [categoryOrder, setCategoryOrder] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showBurger, setShowBurger] = useState(true)
  const [scrollTimeout, setScrollTimeout] = useState(null)

  useEffect(() => {
    fetchMenuData()
  }, [])

  useEffect(() => {
    const handleScroll = () => {
      // Hide burger on scroll
      setShowBurger(false)

      // Clear existing timeout
      if (scrollTimeout) {
        clearTimeout(scrollTimeout)
      }

      // Set new timeout to show burger after scroll stops
      const newTimeout = setTimeout(() => {
        setShowBurger(true)
      }, 1500) // Show burger 1.5 seconds after scrolling stops

      setScrollTimeout(newTimeout)
    }

    window.addEventListener('scroll', handleScroll)

    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (scrollTimeout) {
        clearTimeout(scrollTimeout)
      }
    }
  }, [scrollTimeout])

  const fetchMenuData = async () => {
    try {
      console.log('Fetching menu data from Firestore...')
      const menuDoc = await getDoc(doc(firestore, 'settings', 'menu'))

      if (menuDoc.exists()) {
        console.log('Menu document exists, data:', menuDoc.data())
        const data = menuDoc.data()
        const menuData = data.items
        const order = data.categoryOrder || Object.keys(menuData || {})

        if (menuData) {
          setItems(menuData)
          setCategoryOrder(order)
          console.log('Menu items set successfully')
        } else {
          console.log('No items field found, using default menu')
          const defaultMenu = getDefaultMenu()
          setItems(defaultMenu)
          setCategoryOrder(Object.keys(defaultMenu))
        }
      } else {
        console.log('Menu document does not exist, using default menu')
        const defaultMenu = getDefaultMenu()
        setItems(defaultMenu)
        setCategoryOrder(Object.keys(defaultMenu))
      }
      setError(null) // Clear any previous errors
    } catch (error) {
      console.error('Error fetching menu data:', error)
      console.log('Falling back to default menu due to error')
      // Instead of showing error, use default menu as fallback
      const defaultMenu = getDefaultMenu()
      setItems(defaultMenu)
      setCategoryOrder(Object.keys(defaultMenu))
      setError(null) // Don't show error, just use default
    } finally {
      setLoading(false)
    }
  }

  const getDefaultMenu = () => {
    return {
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
  }

  if (loading) {
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
        <Nav showBurger={showBurger} />
        <div className="menu-content">
          <div className="menu-loading">
            <p>Caricamento menu...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
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
        <Nav showBurger={showBurger} />
        <div className="menu-content">
          <div className="menu-error">
            <p>{error}</p>
            <button onClick={fetchMenuData} className="retry-button">
              Riprova
            </button>
          </div>
        </div>
      </div>
    )
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
      <Nav showBurger={showBurger} />

      <div className="menu-content">
        {categoryOrder.map((category) => (
          items[category] && items[category].length > 0 && (
            <div key={category} className="menu-section">
              <h2 className="menu-category">{category}</h2>
              <ul className="menu-list">
                {items[category].map((item, idx) => (
                  <li key={idx} className="menu-item">
                    <span>{item.name}</span>
                    <span>{item.price}</span>
                  </li>
                ))}
              </ul>
            </div>
          )
        ))}
      </div>
    </div>
  )
}

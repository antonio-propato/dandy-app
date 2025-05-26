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
  const [lastFetch, setLastFetch] = useState(null)

  useEffect(() => {
    fetchMenuData()
  }, [])

  // Auto-refresh menu data every 30 seconds to catch updates
  useEffect(() => {
    const interval = setInterval(() => {
      // Only fetch if the page is visible and it's been more than 10 seconds since last fetch
      if (!document.hidden && (!lastFetch || Date.now() - lastFetch > 10000)) {
        fetchMenuData(true) // Silent refresh
      }
    }, 30000)

    return () => clearInterval(interval)
  }, [lastFetch])

  // Listen for page focus to refresh menu
  useEffect(() => {
    const handleFocus = () => {
      // Refresh when user returns to the page
      if (!lastFetch || Date.now() - lastFetch > 5000) {
        fetchMenuData(true)
      }
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [lastFetch])

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

  const fetchMenuData = async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true)
        setError(null)
      }

      console.log('Fetching menu data from Firestore...')
      const menuDoc = await getDoc(doc(firestore, 'settings', 'menu'))
      setLastFetch(Date.now())

      if (menuDoc.exists()) {
        console.log('Menu document exists, data:', menuDoc.data())
        const data = menuDoc.data()
        const menuData = data.items
        const order = data.categoryOrder || Object.keys(menuData || {})

        if (menuData && Object.keys(menuData).length > 0) {
          setItems(menuData)
          setCategoryOrder(order)
          console.log('Menu items set successfully:', Object.keys(menuData))
          setError(null)
        } else {
          console.log('No items found in document')
          setItems({})
          setCategoryOrder([])
          if (!silent) {
            setError('Menu non ancora configurato. Configura il menu dalla sezione gestione.')
          }
        }
      } else {
        console.log('Menu document does not exist')
        setItems({})
        setCategoryOrder([])
        if (!silent) {
          setError('Menu non ancora configurato. Configura il menu dalla sezione gestione.')
        }
      }
    } catch (error) {
      console.error('Error fetching menu data:', error)

      // Keep existing data if we have it, otherwise show empty
      if (Object.keys(items).length === 0) {
        console.log('No existing data and fetch failed')
        setItems({})
        setCategoryOrder([])
      }

      // Show error only if not silent
      if (!silent) {
        setError('Errore nel caricamento del menu. Verifica la connessione.')
      }
      console.log('Keeping existing menu data due to fetch error')
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }



  // Manual refresh function
  const handleRefresh = () => {
    fetchMenuData()
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
        {error && (
          <div className="menu-error-banner">
            <p>{error}</p>
            <button onClick={handleRefresh} className="refresh-button">
              Aggiorna
            </button>
          </div>
        )}

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

        {Object.keys(items).length === 0 && !loading && (
          <div className="menu-empty">
            <p>Menu non ancora configurato.</p>
            <p>Vai alla sezione "Gestione Menu" per aggiungere categorie e elementi.</p>
            <button onClick={handleRefresh} className="retry-button">
              Ricarica Menu
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

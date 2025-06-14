import React, { useState, useEffect } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { firestore } from '../lib/firebase'
import { useCart } from '../contexts/CartContext'
import Nav from '../components/Nav'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faShoppingBasket, faMinus } from '@fortawesome/free-solid-svg-icons'
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
  const [lastClickTime, setLastClickTime] = useState(0)

  const navigate = useNavigate()
  const { cart, getTotalItems, getTotalPrice, getItemCount, addItem, updateQuantity } = useCart()

  useEffect(() => {
    fetchMenuData()
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden && (!lastFetch || Date.now() - lastFetch > 10000)) {
        fetchMenuData(true)
      }
    }, 30000)
    return () => clearInterval(interval)
  }, [lastFetch])

  useEffect(() => {
    const handleFocus = () => {
      if (!lastFetch || Date.now() - lastFetch > 5000) {
        fetchMenuData(true)
      }
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [lastFetch])

  useEffect(() => {
    const handleScroll = () => {
      setShowBurger(false)
      if (scrollTimeout) clearTimeout(scrollTimeout)
      const newTimeout = setTimeout(() => setShowBurger(true), 1500)
      setScrollTimeout(newTimeout)
    }

    window.addEventListener('scroll', handleScroll)
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (scrollTimeout) clearTimeout(scrollTimeout)
    }
  }, [scrollTimeout])

  const fetchMenuData = async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true)
        setError(null)
      }

      const menuDoc = await getDoc(doc(firestore, 'settings', 'menu'))
      setLastFetch(Date.now())

      if (menuDoc.exists()) {
        const data = menuDoc.data()
        const menuData = data.items
        const order = data.categoryOrder || Object.keys(menuData || {})

        if (menuData && Object.keys(menuData).length > 0) {
          setItems(menuData)
          setCategoryOrder(order)
          setError(null)
        } else {
          setItems({})
          setCategoryOrder([])
          if (!silent) {
            setError('Menu non ancora configurato. Configura il menu dalla sezione gestione.')
          }
        }
      } else {
        setItems({})
        setCategoryOrder([])
        if (!silent) {
          setError('Menu non ancora configurato. Configura il menu dalla sezione gestione.')
        }
      }
    } catch (error) {
      console.error('Error fetching menu data:', error)
      if (Object.keys(items).length === 0) {
        setItems({})
        setCategoryOrder([])
      }
      if (!silent) {
        setError('Errore nel caricamento del menu. Verifica la connessione.')
      }
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }

  const handleItemClick = (item, category) => {
    const now = Date.now()
    if (now - lastClickTime < 300) return
    setLastClickTime(now)

    const existingCartItem = cart.items.find(cartItem =>
      cartItem.name === item.name && cartItem.category === category
    )

    if (existingCartItem) {
      updateQuantity(existingCartItem.id, existingCartItem.quantity + 1)
    } else {
      addItem(item, category)
    }
  }

  const handleRemoveFromCart = (e, item, category) => {
    e.stopPropagation()
    const cartItem = cart.items.find(cartItem =>
      cartItem.name === item.name && cartItem.category === category
    )
    if (cartItem) {
      updateQuantity(cartItem.id, cartItem.quantity - 1)
    }
  }

  const handleBasketClick = () => navigate('/basket')
  const handleRefresh = () => fetchMenuData()

  const totalItems = getTotalItems()
  const totalPrice = getTotalPrice()

  return (
    <div
      className="menu-wrapper"
      style={{
        backgroundImage: `url(${Legno})`,
      }}
    >
      <Nav showBurger={showBurger} />

      {totalItems > 0 && (
        <button className="basket-icon-button" onClick={handleBasketClick}>
          <FontAwesomeIcon icon={faShoppingBasket} />
          <div className="basket-info">
            <span className="basket-count">{totalItems}</span>
            <span className="basket-total">€{totalPrice.toFixed(2)}</span>
          </div>
        </button>
      )}

      <div className="menu-content">
        {loading ? (
          <div className="menu-loading">
            <p>Caricamento menu...</p>
          </div>
        ) : (
          <>
            {error && (
              <div className="menu-error-banner">
                <p>{error}</p>
                <button onClick={handleRefresh} className="refresh-button">Aggiorna</button>
              </div>
            )}


{categoryOrder.map((category) =>
  items[category] ? (
    <div key={category} className="menu-section">
      <h2 className="menu-category">{category}</h2>
      {items[category].length > 0 ? (
        <ul className="menu-list">
          {items[category].map((item, idx) => {
            const itemCount = getItemCount(item.name, category)
            return (
              <li key={idx} className="menu-item" onClick={() => handleItemClick(item, category)}>
                <div className="menu-item-left">
                  {itemCount > 0 && <span className="item-count">{itemCount}</span>}
                  <span className="menu-item-name">{item.name}</span>
                </div>
                <div className="menu-item-right">
                  <span className="menu-item-price">{item.price}</span>
                  <div className="menu-item-actions">
                    {itemCount > 0 && (
                      <button
                        className="minus-btn"
                        onClick={(e) => handleRemoveFromCart(e, item, category)}
                        aria-label={`Remove ${item.name} from cart`}
                      >
                        <FontAwesomeIcon icon={faMinus} />
                      </button>
                    )}
                    <button
                      className="plus-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleItemClick(item, category)
                      }}
                      aria-label={`Add ${item.name} to cart`}
                    >
                      +
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="empty-category">
          <p>Categoria vuota - aggiungi elementi dalla gestione menu</p>
        </div>
      )}
    </div>
  ) : null
)}

            {Object.keys(items).length === 0 && !loading && (
              <div className="menu-empty">
                <p>Menu non ancora configurato.</p>
                <p>Vai alla sezione "Gestione Menu" per aggiungere categorie e elementi.</p>
                <button onClick={handleRefresh} className="retry-button">
                  Ricarica Menu
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

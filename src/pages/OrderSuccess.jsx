import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, firestore } from '../lib/firebase'
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore'
import Nav from '../components/Nav'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCheckCircle,
  faHome,
  faUtensils,
  faEnvelope,
  faStar,
  faHashtag,
  faMapMarkerAlt,
  faCreditCard
} from '@fortawesome/free-solid-svg-icons'
import './OrderSuccess.css'

export default function OrderSuccess() {
  const navigate = useNavigate()
  const location = useLocation()
  const [lastOrder, setLastOrder] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Fetch the user's most recent confirmed order
    const fetchLastOrder = async () => {
      if (auth.currentUser) {
        try {
          const ordersQuery = query(
            collection(firestore, 'orders'),
            where('userId', '==', auth.currentUser.uid),
            where('status', '==', 'confirmed'),
            orderBy('timestamp', 'desc'),
            limit(1)
          )

          const querySnapshot = await getDocs(ordersQuery)
          if (!querySnapshot.empty) {
            const orderDoc = querySnapshot.docs[0]
            const orderData = {
              id: orderDoc.id,
              ...orderDoc.data(),
              timestamp: orderDoc.data().timestamp?.toDate()
            }
            setLastOrder(orderData)
            console.log('📦 Last confirmed order:', orderData)
          }
        } catch (error) {
          console.error('Error fetching last order:', error)
        }
      }
      setLoading(false)
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        fetchLastOrder()
      } else {
        navigate('/signin')
      }
    })

    return unsubscribe
  }, [navigate])

  useEffect(() => {
    // Optional: Auto-redirect to menu after a delay
    const timer = setTimeout(() => {
      // Uncomment if you want auto-redirect
      // navigate('/menu')
    }, 15000) // 15 seconds

    return () => clearTimeout(timer)
  }, [navigate])

  const handleContinueToMenu = () => {
    navigate('/menu')
  }

  const handleGoHome = () => {
    navigate('/profile')
  }

  const formatOrderType = (order) => {
    if (order.orderType === 'tavolo') {
      return `Al Tavolo ${order.tableNumber}`
    } else if (order.orderType === 'consegna') {
      return 'Consegna a domicilio'
    }
    return 'N/A'
  }

  const formatPaymentMethod = (method) => {
    switch (method) {
      case 'pay-at-till':
        return 'Paga alla Cassa'
      case 'pay-now':
        return 'Pagamento Online'
      default:
        return method || 'N/A'
    }
  }

  if (loading) {
    return (
      <div className="order-success-container">
        <Nav />
        <div className="success-content">
          <div className="success-card">
            <div className="success-icon">
              <FontAwesomeIcon icon={faCheckCircle} />
            </div>
            <h1 className="success-title">Caricamento...</h1>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="order-success-container">
      <Nav />

      <div className="success-content">
        <div className="success-card">
          <div className="success-icon">
            <FontAwesomeIcon icon={faCheckCircle} />
          </div>

          <h1 className="success-title">Ordine Confermato!</h1>

          {lastOrder && (
            <div className="order-details">
              <div className="order-number-display">
                <FontAwesomeIcon icon={faHashtag} />
                <span>Ordine #{lastOrder.orderNumber}</span>
              </div>

              <div className="order-summary-grid">
                <div className="summary-detail">
                  <FontAwesomeIcon icon={faMapMarkerAlt} />
                  <span>{formatOrderType(lastOrder)}</span>
                </div>

                <div className="summary-detail">
                  <FontAwesomeIcon icon={faCreditCard} />
                  <span>{formatPaymentMethod(lastOrder.paymentMethod)}</span>
                </div>

                <div className="summary-detail total">
                  <strong>Totale: €{lastOrder.totalPrice?.toFixed(2)}</strong>
                </div>
              </div>
            </div>
          )}

          <div className="success-details">
            <div className="detail-item">
              <FontAwesomeIcon icon={faEnvelope} />
              <span>Email di conferma inviata</span>
            </div>

            <div className="detail-item">
              <FontAwesomeIcon icon={faStar} />
              <span>Le tue preferenze sono state salvate</span>
            </div>
          </div>

          <div className="order-info">
            <h3>Cosa Succede Ora?</h3>
            <ul className="next-steps">
              <li>Il tuo ordine è stato confermato dal locale</li>
              <li>Riceverai una notifica quando sarà pronto</li>
              {lastOrder?.paymentMethod === 'pay-at-till' && (
                <li>Potrai pagare al momento del ritiro</li>
              )}
              {lastOrder?.orderType === 'consegna' && (
                <li>Ti contatteremo per confermare la consegna</li>
              )}
              <li>Controlla i tuoi timbri per guadagnare ricompense!</li>
            </ul>
          </div>

          <div className="success-actions">
            <button
              onClick={handleContinueToMenu}
              className="primary-btn"
            >
              <FontAwesomeIcon icon={faUtensils} />
              Continua a Ordinare
            </button>

            <button
              onClick={handleGoHome}
              className="secondary-btn"
            >
              <FontAwesomeIcon icon={faHome} />
              Vai al Profilo
            </button>
          </div>

          <div className="thank-you">
            <p>Grazie per aver scelto il nostro servizio!</p>
            <p className="subtitle">Ti aspettiamo presto di nuovo</p>
          </div>
        </div>

        <div className="celebration-animation">
          <div className="confetti"></div>
          <div className="confetti"></div>
          <div className="confetti"></div>
          <div className="confetti"></div>
          <div className="confetti"></div>
        </div>
      </div>
    </div>
  )
}

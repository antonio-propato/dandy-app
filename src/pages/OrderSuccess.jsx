import { useEffect, useState } from 'react'
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
          // Now we can use the efficient query with the Firebase index
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
            console.log('📦 Order number:', orderData?.orderNumber)
          } else {
            console.log('📦 No confirmed orders found')
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
      <div className="order-success-wrapper" style={{ backgroundImage: `url('/images/Legno.png')` }}>
        <div className="order-success-overlay" />
        <Nav />
        <div className="order-success-card">
          <div className="order-success-shine" />
          <div className="order-success-content">
            <div className="order-success-loading">Caricamento...</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="order-success-wrapper" style={{ backgroundImage: `url('/images/Legno.png')` }}>
      <div className="order-success-overlay" />
      <Nav />

      <div className="order-success-card">
        <div className="order-success-shine" />

        <div className="order-success-content">
          <div className="order-success-icon">
            <FontAwesomeIcon icon={faCheckCircle} />
          </div>

          <h1 className="order-success-title">Ordine Confermato!</h1>

          {/* Always show order number section, with fallback if no data */}
          <div className="order-success-number">
            <FontAwesomeIcon icon={faHashtag} />
            <span>
              {lastOrder?.orderNumber
                ? `Ordine #${lastOrder.orderNumber}`
                : 'Ordine #[Numero non disponibile]'
              }
            </span>
          </div>

          {/* Success Message */}
          <div className="order-success-message">
            <h3>Il tuo ordine è stato confermato!</h3>
            <p>Riceverai una notifica quando sarà pronto.</p>
          </div>

          {lastOrder && (
            <div className="order-success-details-section">
              <div className="order-success-summary">
                <div className="order-success-summary-detail">
                  <span className="detail-label">Consegna:</span>
                  <span className="detail-value">{formatOrderType(lastOrder)}</span>
                </div>

                <div className="order-success-summary-detail">
                  <span className="detail-label">Totale:</span>
                  <span className="detail-value">€{lastOrder.totalPrice?.toFixed(2)}</span>
                </div>

                <div className="order-success-summary-detail">
                  <span className="detail-label">Pagamento:</span>
                  <span className="detail-value">{formatPaymentMethod(lastOrder.paymentMethod)}</span>
                </div>

                <div className="order-success-summary-detail">
                  <span className="detail-label">Stato:</span>
                  <span className="detail-value" style={{color: '#28a745'}}>Confermato</span>
                </div>
              </div>
            </div>
          )}

          <div className="order-success-actions">
            <button
              onClick={handleContinueToMenu}
              className="order-success-primary-btn"
            >
              <FontAwesomeIcon icon={faUtensils} />
              Continua a Ordinare
            </button>

            <button
              onClick={handleGoHome}
              className="order-success-secondary-btn"
            >
              <FontAwesomeIcon icon={faHome} />
              Vai al Profilo
            </button>
          </div>

          <div className="order-success-thanks">
            <p>Grazie per aver scelto il nostro servizio!</p>
            <p className="order-success-subtitle">Ti aspettiamo presto di nuovo</p>
          </div>
        </div>
      </div>
    </div>
  )
}

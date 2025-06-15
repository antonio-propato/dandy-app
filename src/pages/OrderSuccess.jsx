import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, firestore, functions } from '../lib/firebase'
import { collection, query, where, orderBy, limit, getDocs, doc, getDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import Nav from '../components/Nav'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCheckCircle,
  faHome,
  faUtensils,
  faBell,
  faStar,
  faHashtag,
  faMapMarkerAlt,
  faCreditCard,
  faSpinner,
  faExclamationTriangle
} from '@fortawesome/free-solid-svg-icons'
import './OrderSuccess.css'

export default function OrderSuccess() {
  const navigate = useNavigate()
  const location = useLocation()
  const [lastOrder, setLastOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [userData, setUserData] = useState(null)

  // Notification sending states
  const [notificationStatus, setNotificationStatus] = useState('idle') // 'idle', 'sending', 'sent', 'failed'
  const [notificationError, setNotificationError] = useState(null)

  // Cloud Function
  const sendOrderConfirmationNotification = httpsCallable(functions, 'sendOrderConfirmationNotification')

  useEffect(() => {
    // Fetch the user's most recent confirmed order and user data
const fetchOrderAndUserData = async () => {
  if (auth.currentUser) {
    try {
      // Fetch user data
      let fetchedUserData = null
      const userDoc = await getDoc(doc(firestore, 'users', auth.currentUser.uid))
      if (userDoc.exists()) {
        fetchedUserData = userDoc.data()
        setUserData(fetchedUserData)
        console.log('👤 User data loaded:', fetchedUserData)
      }

      // Fetch last order (existing code)
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

        // Send confirmation notification if we have both order and user data
        if (fetchedUserData && orderData) {
          await handleSendConfirmationNotification(orderData, fetchedUserData)
        }
      } else {
        console.log('📦 No confirmed orders found')
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    }
  }
  setLoading(false)
}

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        fetchOrderAndUserData()
      } else {
        navigate('/signin')
      }
    })

    return unsubscribe
  }, [navigate])

  // Handle sending confirmation notification
  const handleSendConfirmationNotification = async (orderData, userInfo) => {
    try {
      setNotificationStatus('sending')
      setNotificationError(null)

      console.log('🔔 Sending confirmation notification...')

      const result = await sendOrderConfirmationNotification({
        orderId: orderData.id,
        userId: auth.currentUser.uid
      })

      if (result.data.success) {
        setNotificationStatus('sent')
        console.log('✅ Confirmation notification sent successfully')
      } else {
        setNotificationStatus('failed')
        setNotificationError('Failed to send notification')
        console.error('❌ Failed to send confirmation notification')
      }
    } catch (error) {
      setNotificationStatus('failed')
      setNotificationError(error.message)
      console.error('❌ Error sending confirmation notification:', error)
    }
  }

  // Retry sending notification
  const retryNotification = async () => {
    if (lastOrder && userData) {
      await handleSendConfirmationNotification(lastOrder, userData)
    }
  }

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

  const handleViewNotifications = () => {
    navigate('/notifications')
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
        return 'Contanti'
      case 'pay-now':
        return 'Online'
      default:
        return method || 'N/A'
    }
  }

  const formatTimbro = (order) => {
    const orderType = formatOrderType(order)
    return orderType.includes('Al Tavolo') ? 'Disponibile' : 'Non Disponibile'
  }

  // Notification status component
  const NotificationStatusIndicator = () => {
    switch (notificationStatus) {
      case 'sending':
        return (
          <div className="notification-status sending">
            <FontAwesomeIcon icon={faSpinner} spin />
            <span>Creazione notifica...</span>
          </div>
        )
      case 'sent':
        return (
          <div className="notification-status sent">
            <FontAwesomeIcon icon={faBell} />
            <div className="notification-sent-content">
              <button
                className="view-notifications-btn"
                onClick={handleViewNotifications}
              >
                Riepilogo Ordine
              </button>
            </div>
          </div>
        )
      case 'failed':
        return (
          <div className="notification-status failed">
            <FontAwesomeIcon icon={faExclamationTriangle} />
            <div className="notification-error-content">
              <span>Errore nella creazione della notifica</span>
              <button
                className="retry-notification-btn"
                onClick={retryNotification}
                disabled={notificationStatus === 'sending'}
              >
                Riprova
              </button>
            </div>
          </div>
        )
      default:
        return null
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
                ? `Ordine ${lastOrder.orderNumber.startsWith('#') ? lastOrder.orderNumber : '#' + lastOrder.orderNumber}`
                : 'Ordine #[Numero non disponibile]'
              }
            </span>
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

                <div className="order-success-summary-detail">
                  <span className="detail-label">Timbri:</span>
                  <span className="detail-value">{formatTimbro(lastOrder)}</span>
                </div>
              </div>
            </div>
          )}



          {/* Notification Status Indicator */}
          <NotificationStatusIndicator />

          <div className="order-success-thanks">
            <p>Grazie per aver scelto il nostro servizio!</p>
          </div>

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


        </div>
      </div>
    </div>
  )
}

import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection,
  query,
  orderBy,
  limit,
  where,
  onSnapshot,
  doc,
  updateDoc,
  getDocs,
  serverTimestamp
} from 'firebase/firestore'
import { firestore } from '../lib/firebase'
import Nav from '../components/Nav'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faSearch,
  faQrcode,
  faCheck,
  faSpinner,
  faClock,
  faUser,
  faHashtag,
  faMapMarkerAlt,
  faUtensils,
  faExclamationTriangle,
  faEuroSign,
  faCreditCard,
  faCalendarAlt,
  faVolumeUp,
  faVolumeMute,
  faTimes
} from '@fortawesome/free-solid-svg-icons'
import './Orders.css'

export default function Orders() {
  const navigate = useNavigate()
  const [todayOrders, setTodayOrders] = useState([])
  const [olderOrders, setOlderOrders] = useState([])
  const [filteredTodayOrders, setFilteredTodayOrders] = useState([])
  const [filteredOlderOrders, setFilteredOlderOrders] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [userOrderCounts, setUserOrderCounts] = useState({})
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [processingOrders, setProcessingOrders] = useState(new Set()) // Track which orders are being processed
  const audioRef = useRef(null)

  useEffect(() => {
    const unsubscribeToday = setupTodayOrdersListener()
    const unsubscribeOlder = setupOlderOrdersListener()

    return () => {
      unsubscribeToday()
      unsubscribeOlder()
    }
  }, [])

  useEffect(() => {
    fetchUserOrderCounts()
  }, [])

  useEffect(() => {
    // Filter orders based on search term
    filterOrders(searchTerm)
  }, [searchTerm, todayOrders, olderOrders])

  const setupTodayOrdersListener = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const todayQuery = query(
      collection(firestore, 'orders'),
      where('timestamp', '>=', today),
      orderBy('timestamp', 'desc'),
      limit(50) // Increased limit to see more orders
    )

    return onSnapshot(todayQuery, (snapshot) => {
      const orders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate()
      }))

      // Sort by timestamp descending, with pending orders first
      orders.sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1
        if (b.status === 'pending' && a.status !== 'pending') return 1
        return (b.timestamp || new Date(0)).getTime() - (a.timestamp || new Date(0)).getTime()
      })

      setTodayOrders(orders)
      if (loading) setLoading(false)

      // Log orders for debugging
      console.log('📦 Today\'s orders updated:', orders.length, 'Pending:', orders.filter(o => o.status === 'pending').length)
    }, (error) => {
      console.error('❌ Error setting up today orders listener:', error)
      if (loading) setLoading(false)
    })
  }

  const setupOlderOrdersListener = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const olderQuery = query(
      collection(firestore, 'orders'),
      where('timestamp', '<', today),
      orderBy('timestamp', 'desc'),
      limit(100) // Increased limit
    )

    return onSnapshot(olderQuery, (snapshot) => {
      const orders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate()
      }))
      setOlderOrders(orders)

      // Log orders for debugging
      console.log('📦 Older orders updated:', orders.length)
    }, (error) => {
      console.error('❌ Error setting up older orders listener:', error)
    })
  }

  const fetchUserOrderCounts = async () => {
    try {
      const ordersQuery = query(collection(firestore, 'orders'))
      const snapshot = await getDocs(ordersQuery)
      const counts = {}

      snapshot.docs.forEach(doc => {
        const order = doc.data()
        const userId = order.userId
        if (userId) {
          counts[userId] = (counts[userId] || 0) + 1
        }
      })

      setUserOrderCounts(counts)
      console.log('📊 User order counts:', counts)
    } catch (error) {
      console.error('Error fetching user order counts:', error)
    }
  }

  const filterOrders = (term) => {
    const searchLower = term.toLowerCase()

    const filterFn = (order) => {
      return (
        order.userName?.toLowerCase().includes(searchLower) ||
        order.userEmail?.toLowerCase().includes(searchLower) ||
        order.deliveryInfo?.telefono?.includes(searchLower) ||
        order.deliveryInfo?.phone?.includes(searchLower) ||
        order.orderNumber?.toLowerCase().includes(searchLower)
      )
    }

    setFilteredTodayOrders(term ? todayOrders.filter(filterFn) : todayOrders)
    setFilteredOlderOrders(term ? olderOrders.filter(filterFn) : olderOrders)
  }

  const playNotificationSound = () => {
    if (audioRef.current && soundEnabled) {
      // Create a simple beep sound
      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)()
        const oscillator = audioContext.createOscillator()
        const gainNode = audioContext.createGain()

        oscillator.connect(gainNode)
        gainNode.connect(audioContext.destination)

        oscillator.frequency.value = 800
        oscillator.type = 'square'

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5)

        oscillator.start(audioContext.currentTime)
        oscillator.stop(audioContext.currentTime + 0.5)

        console.log('🔊 New order notification sound played')
      } catch (error) {
        console.log('🔇 Audio context not available:', error)
      }
    }
  }

  const confirmOrder = async (orderId) => {
    try {
      console.log('✅ Confirming order:', orderId)

      // Add to processing set to prevent double-clicks
      setProcessingOrders(prev => new Set([...prev, orderId]))

      await updateDoc(doc(firestore, 'orders', orderId), {
        status: 'confirmed',
        confirmedAt: serverTimestamp(),
        confirmedBy: 'superuser'
      })

      console.log('✅ Order confirmed successfully')

      // Visual feedback
      const orderElement = document.querySelector(`[data-order-id="${orderId}"]`)
      if (orderElement) {
        orderElement.style.backgroundColor = '#d4edda'
        orderElement.style.transform = 'scale(1.02)'
        setTimeout(() => {
          orderElement.style.backgroundColor = ''
          orderElement.style.transform = ''
        }, 2000)
      }

    } catch (error) {
      console.error('❌ Error confirming order:', error)
      alert('Errore nella conferma dell\'ordine. Riprova.')
    } finally {
      // Remove from processing set
      setProcessingOrders(prev => {
        const newSet = new Set(prev)
        newSet.delete(orderId)
        return newSet
      })
    }
  }

  const cancelOrder = async (orderId) => {
    if (!window.confirm('Sei sicuro di voler cancellare questo ordine?')) {
      return
    }

    try {
      console.log('❌ Cancelling order:', orderId)

      // Add to processing set to prevent double-clicks
      setProcessingOrders(prev => new Set([...prev, orderId]))

      await updateDoc(doc(firestore, 'orders', orderId), {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
        cancelledBy: 'superuser'
      })

      console.log('❌ Order cancelled successfully')

      // Visual feedback
      const orderElement = document.querySelector(`[data-order-id="${orderId}"]`)
      if (orderElement) {
        orderElement.style.backgroundColor = '#f8d7da'
        orderElement.style.transform = 'scale(1.02)'
        setTimeout(() => {
          orderElement.style.backgroundColor = ''
          orderElement.style.transform = ''
        }, 2000)
      }

    } catch (error) {
      console.error('❌ Error cancelling order:', error)
      alert('Errore nella cancellazione dell\'ordine. Riprova.')
    } finally {
      // Remove from processing set
      setProcessingOrders(prev => {
        const newSet = new Set(prev)
        newSet.delete(orderId)
        return newSet
      })
    }
  }

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A'
    return timestamp.toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatOrderItems = (items) => {
    if (!items || items.length === 0) return 'Nessun articolo'
    return items.map(item => `${item.quantity}x ${item.name}`).join(', ')
  }

  const getPaymentMethodDisplay = (method) => {
    switch (method) {
      case 'pay-at-till':
        return 'Paga alla Cassa'
      case 'pay-now':
        return 'Pagamento Online'
      case 'card':
        return 'Carta'
      case 'cash':
        return 'Contanti'
      default:
        return method || 'N/A'
    }
  }

  const getStatusDisplay = (status) => {
    switch (status) {
      case 'pending':
        return 'In Attesa'
      case 'confirmed':
        return 'Confermato'
      case 'cancelled':
        return 'Cancellato'
      default:
        return status || 'N/A'
    }
  }

  const formatLocationInfo = (order) => {
    if (order.orderType === 'tavolo') {
      return `Tavolo ${order.tableNumber || 'N/A'}`
    } else if (order.orderType === 'consegna' && order.deliveryInfo) {
      const delivery = order.deliveryInfo
      return (
        <div className="delivery-info">
          <div className="delivery-name">
            {delivery.nome} {delivery.cognome}
          </div>
          <div className="delivery-address">
            {delivery.indirizzo} {delivery.civico}, {delivery.citta} {delivery.provincia} {delivery.cap}
          </div>
          <div className="delivery-phone">
            {delivery.telefono}
          </div>
          {delivery.compagnia && (
            <div className="delivery-company">
              {delivery.compagnia}
            </div>
          )}
        </div>
      )
    }
    return 'N/A'
  }

  const OrderRow = ({ order, isPending }) => {
    const isProcessing = processingOrders.has(order.id)

    return (
      <tr
        className={`order-row ${isPending ? 'pending-order' : order.status === 'cancelled' ? 'cancelled-order' : 'confirmed-order'}`}
        data-order-id={order.id}
      >
        <td className="timestamp-cell">
          <FontAwesomeIcon icon={faCalendarAlt} />
          {formatTimestamp(order.timestamp)}
        </td>
        <td className="order-number-cell">
          <FontAwesomeIcon icon={faHashtag} />
          {order.orderNumber}
        </td>
        <td className="user-cell">
          <FontAwesomeIcon icon={faUser} />
          <div>
            <div className="user-name">{order.userName || 'N/A'}</div>
            <div className="user-email">{order.userEmail || 'N/A'}</div>
          </div>
        </td>
        <td className="order-count-cell">
          {userOrderCounts[order.userId] || 1}
        </td>
        <td className="location-cell">
          <FontAwesomeIcon icon={faMapMarkerAlt} />
          {formatLocationInfo(order)}
        </td>
        <td className="items-cell">
          <FontAwesomeIcon icon={faUtensils} />
          <div className="order-items">
            {formatOrderItems(order.items)}
          </div>
        </td>
        <td className="notes-cell">
          {order.notes && order.notes.trim() && (
            <div>
              <FontAwesomeIcon icon={faExclamationTriangle} />
              <div className="order-notes">{order.notes}</div>
            </div>
          )}
        </td>
        <td className="price-cell">
          <FontAwesomeIcon icon={faEuroSign} />
          €{order.totalPrice?.toFixed(2) || '0.00'}
        </td>
        <td className="payment-cell">
          <FontAwesomeIcon icon={faCreditCard} />
          {getPaymentMethodDisplay(order.paymentMethod)}
        </td>
        <td className="status-cell">
          {isPending ? (
            <div className="status-pending">
              <FontAwesomeIcon icon={faClock} className="pulse" />
              {getStatusDisplay(order.status)}
            </div>
          ) : order.status === 'cancelled' ? (
            <div className="status-cancelled">
              <FontAwesomeIcon icon={faTimes} />
              {getStatusDisplay(order.status)}
            </div>
          ) : (
            <div className="status-confirmed">
              <FontAwesomeIcon icon={faCheck} />
              {getStatusDisplay(order.status)}
            </div>
          )}
        </td>
        <td className="actions-cell">
          {isPending && (
            <div className="order-actions">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  confirmOrder(order.id)
                }}
                disabled={isProcessing}
                className="action-btn confirm-btn"
                title="Conferma ordine"
              >
                {isProcessing ? (
                  <FontAwesomeIcon icon={faSpinner} spin />
                ) : (
                  <FontAwesomeIcon icon={faCheck} />
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  cancelOrder(order.id)
                }}
                disabled={isProcessing}
                className="action-btn cancel-btn"
                title="Cancella ordine"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
          )}
        </td>
      </tr>
    )
  }

  if (loading) {
    return (
      <div className="orders-container">
        <Nav />
        <div className="orders-loading">
          <FontAwesomeIcon icon={faSpinner} spin />
          <p>Caricamento ordini...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="orders-container">
      <Nav />

      <div className="orders-header">
        <div className="header-top">
          <h1>Gestione Ordini</h1>
          <div className="header-actions">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`sound-toggle ${soundEnabled ? 'enabled' : 'disabled'}`}
              title={soundEnabled ? 'Disabilita suoni' : 'Abilita suoni'}
            >
              <FontAwesomeIcon icon={soundEnabled ? faVolumeUp : faVolumeMute} />
            </button>
            <button
              onClick={() => navigate('/scan')}
              className="scan-btn"
            >
              <FontAwesomeIcon icon={faQrcode} />
              Scan
            </button>
          </div>
        </div>

        <div className="search-bar">
          <FontAwesomeIcon icon={faSearch} className="search-icon" />
          <input
            type="text"
            placeholder="Cerca per nome, email, telefono, numero ordine..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
      </div>

      <div className="orders-content">
        {/* Today's Orders Table */}
        <div className="orders-section">
          <h2>
            Ordini di Oggi
            <span className="order-count">
              ({filteredTodayOrders.length}/{todayOrders.length})
            </span>
            {filteredTodayOrders.filter(order => order.status === 'pending').length > 0 && (
              <span className="pending-indicator">
                <FontAwesomeIcon icon={faClock} className="pulse" />
                {filteredTodayOrders.filter(order => order.status === 'pending').length} in attesa
              </span>
            )}
          </h2>

          <div className="table-container">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Data/Ora</th>
                  <th>N. Ordine</th>
                  <th>Cliente</th>
                  <th>Ordini Totali</th>
                  <th>Posizione</th>
                  <th>Articoli</th>
                  <th>Note</th>
                  <th>Totale</th>
                  <th>Pagamento</th>
                  <th>Stato</th>
                  <th>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {filteredTodayOrders.length === 0 ? (
                  <tr>
                    <td colSpan="11" className="no-orders">
                      {searchTerm ? 'Nessun ordine trovato' : 'Nessun ordine oggi'}
                    </td>
                  </tr>
                ) : (
                  filteredTodayOrders.map(order => (
                    <OrderRow
                      key={order.id}
                      order={order}
                      isPending={order.status === 'pending'}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Older Orders Table */}
        <div className="orders-section">
          <h2>
            Ordini Precedenti
            <span className="order-count">
              ({filteredOlderOrders.length}/{olderOrders.length})
            </span>
          </h2>

          <div className="table-container">
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Data/Ora</th>
                  <th>N. Ordine</th>
                  <th>Cliente</th>
                  <th>Ordini Totali</th>
                  <th>Posizione</th>
                  <th>Articoli</th>
                  <th>Note</th>
                  <th>Totale</th>
                  <th>Pagamento</th>
                  <th>Stato</th>
                  <th>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {filteredOlderOrders.length === 0 ? (
                  <tr>
                    <td colSpan="11" className="no-orders">
                      {searchTerm ? 'Nessun ordine trovato' : 'Nessun ordine precedente'}
                    </td>
                  </tr>
                ) : (
                  filteredOlderOrders.map(order => (
                    <OrderRow
                      key={order.id}
                      order={order}
                      isPending={false}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="orders-footer">
        <div className="legend">
          <div className="legend-item">
            <FontAwesomeIcon icon={faClock} className="pulse" />
            <span>Clicca su "Conferma" per approvare un ordine in attesa</span>
          </div>
          <div className="legend-item">
            <FontAwesomeIcon icon={faCheck} />
            <span>Ordine confermato</span>
          </div>
          <div className="legend-item">
            <FontAwesomeIcon icon={faTimes} />
            <span>Ordine cancellato</span>
          </div>
        </div>
      </div>

      {/* Debug info for development */}
      {process.env.NODE_ENV === 'development' && (
        <div style={{
          position: 'fixed',
          bottom: '10px',
          right: '10px',
          background: 'rgba(0,0,0,0.8)',
          color: 'white',
          padding: '10px',
          borderRadius: '5px',
          fontSize: '12px',
          maxWidth: '300px'
        }}>
          <div>Today's Orders: {todayOrders.length}</div>
          <div>Pending Orders: {todayOrders.filter(o => o.status === 'pending').length}</div>
          <div>Confirmed Orders: {todayOrders.filter(o => o.status === 'confirmed').length}</div>
          <div>Cancelled Orders: {todayOrders.filter(o => o.status === 'cancelled').length}</div>
          <div>Sound Enabled: {soundEnabled ? 'Yes' : 'No'}</div>
        </div>
      )}
    </div>
  )
}

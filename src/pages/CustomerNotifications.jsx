import React, { useState, useEffect, useRef } from 'react'
import { auth, firestore } from '../lib/firebase'
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore'
import { motion, AnimatePresence } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faBell,
  faEnvelope,
  faEnvelopeOpen,
  faCalendar,
  faTrash,
  faShoppingCart,
  faMapMarkerAlt,
  faCreditCard,
  faUtensils,
  faChevronDown,
  faChevronUp,
  faHashtag,
  faCheckCircle,
  faTimes,
  faStamp
} from '@fortawesome/free-solid-svg-icons'
import './CustomerNotifications.css'

// Modal component for detailed order view
const OrderDetailsModal = ({ notification }) => {
  const orderDetails = notification.data
  const orderNumber = notification.data?.orderNumber

  if (!orderDetails || !orderDetails.items) {
    return (
      <div className="order-modal-no-details">
        <p>Dettagli ordine non disponibili</p>
      </div>
    )
  }

  const formatOrderType = (details) => {
    if (!details) return 'N/A'
    if (details.orderType === 'tavolo') {
      return `Al Tavolo ${details.tableNumber || ''}`
    } else if (details.orderType === 'consegna') {
      return 'Consegna a domicilio'
    }
    return 'Ritiro'
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

  const formatTimbro = (details) => {
    const orderType = formatOrderType(details)
    return orderType.includes('Al Tavolo') ? 'Si' : 'No'
  }

  // Check if order is cancelled
  const isCancelled = orderDetails.status === 'cancelled'

  return (
    <div className="order-modal-details">
      <div className={`order-modal-summary ${isCancelled ? 'cancelled' : ''}`}>
        <div className="order-modal-summary-header">
          <div className="order-modal-number">
            <span>#{orderNumber}</span>
            {isCancelled && <span className="cancelled-badge">CANCELLATO</span>}
          </div>
          <div className={`order-modal-total ${isCancelled ? 'cancelled' : ''}`}>
            <span>€{orderDetails.totalPrice?.toFixed(2)}</span>
          </div>
        </div>

        <div className="order-modal-info-grid">
          <div className="order-modal-info-item">
            <FontAwesomeIcon icon={faMapMarkerAlt} className="info-icon" />
            <div className="info-content">
              <span className="info-label">Tipo Ordine</span>
              <span className="info-value">{formatOrderType(orderDetails)}</span>
            </div>
          </div>

          <div className="order-modal-info-item">
            <FontAwesomeIcon icon={faCreditCard} className="info-icon" />
            <div className="info-content">
              <span className="info-label">Pagamento</span>
              <span className="info-value">{formatPaymentMethod(orderDetails.paymentMethod)}</span>
            </div>
          </div>

          <div className="order-modal-info-item">
            <FontAwesomeIcon icon={faStamp} className="info-icon" />
            <div className="info-content">
              <span className="info-label">Timbro</span>
              <span className="info-value">{isCancelled ? 'No' : formatTimbro(orderDetails)}</span>
            </div>
          </div>

          <div className="order-modal-info-item">
            <FontAwesomeIcon icon={faCheckCircle} className={`info-icon ${isCancelled ? 'cancelled' : ''}`} />
            <div className="info-content">
              <span className="info-label">Stato</span>
              <span className={`info-value ${isCancelled ? 'cancelled' : ''}`}>
                {isCancelled ? 'Cancellato' : 'Confermato'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {orderDetails.items && orderDetails.items.length > 0 && (
        <div className="order-modal-items">
          <h4 className="order-modal-section-title">
            <FontAwesomeIcon icon={faUtensils} />
            Articoli Ordinati ({orderDetails.items.length})
          </h4>
          <div className="order-modal-items-list">
            {orderDetails.items.map((item, index) => (
              <div key={index} className="order-modal-item">
                <div className="order-modal-item-info">
                  <span className="item-quantity">{item.quantity}x</span>
                  <span className="item-name">{item.name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {orderDetails.notes && (
        <div className="order-modal-notes">
          <h4 className="order-modal-section-title">
            <FontAwesomeIcon icon={faEnvelope} />
            Note Speciali
          </h4>
          <div className="order-modal-notes-content">
            <p>{orderDetails.notes}</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CustomerNotifications() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')
  const [swipeState, setSwipeState] = useState({})
  const [expandedNotifications, setExpandedNotifications] = useState({})
  const [selectedNotification, setSelectedNotification] = useState(null)

  const touchStart = useRef({})

  // Check if notification is an order confirmation
  const isOrderConfirmation = (notification) => {
    try {
      return notification.data?.type === 'order_confirmation' ||
             notification.type === 'order_confirmation' ||
             notification.data?.orderNumber ||
             notification.orderNumber ||
             (notification.title && notification.title.toLowerCase().includes('ordine')) ||
             (notification.title && notification.title.toLowerCase().includes('confermato'))
    } catch (error) {
      console.error('Error checking order confirmation:', error)
      return false
    }
  }

  // Check if notification is a cancelled order
  const isCancelledOrder = (notification) => {
    try {
      return (notification.data?.status === 'cancelled') ||
             (notification.status === 'cancelled') ||
             (notification.data?.type === 'order_cancelled') ||
             (notification.type === 'order_cancelled') ||
             (notification.title && notification.title.toLowerCase().includes('cancellato')) ||
             (notification.title && notification.title.toLowerCase().includes('cancelled'))
    } catch (error) {
      console.error('Error checking cancelled order:', error)
      return false
    }
  }

  useEffect(() => {
    console.log('🔔 CustomerNotifications component mounted')

    if (!auth.currentUser) {
      console.log('❌ No authenticated user found')
      setLoading(false)
      return
    }

    const currentUserId = auth.currentUser.uid
    console.log('🔔 Setting up notifications listener for user:', currentUserId)

    try {
      const notificationsRef = collection(firestore, 'notifications')
      const q = query(
        notificationsRef,
        where('userId', '==', currentUserId),
        orderBy('createdAt', 'desc')
      )

      console.log('🔔 Query created, setting up snapshot listener...')

      const unsubscribe = onSnapshot(q, (snapshot) => {
        console.log('🔔 Snapshot received, docs count:', snapshot.docs.length)

        const notificationsList = snapshot.docs.map(doc => {
          const data = doc.data()
          return {
            id: doc.id,
            ...data
          }
        })

        console.log('🔔 Processed notifications:', notificationsList.length)
        if (notificationsList.length > 0) {
          console.log('🔔 Sample notification details:', {
            id: notificationsList[0].id,
            title: notificationsList[0].title,
            body: notificationsList[0].body,
            type: notificationsList[0].type,
            data: notificationsList[0].data,
            createdAt: notificationsList[0].createdAt,
            read: notificationsList[0].read
          })

          // Check if it's detected as an order or cancelled order
          const isOrder = isOrderConfirmation(notificationsList[0])
          const isCancelled = isCancelledOrder(notificationsList[0])
          console.log('🔔 Is this notification an order?', isOrder)
          console.log('🔔 Is this notification a cancelled order?', isCancelled)
        }

        setNotifications(notificationsList)
        setLoading(false)
      }, (error) => {
        console.error('❌ Error fetching notifications:', error)
        setLoading(false)
      })

      return () => {
        console.log('🔔 Cleaning up notifications listener')
        unsubscribe()
      }
    } catch (error) {
      console.error('❌ Error setting up notifications listener:', error)
      setLoading(false)
    }
  }, [])

  const filteredNotifications = notifications
    .filter(notification => {
      if (filter === 'unread') return !notification.read
      if (filter === 'read') return notification.read
      return true
    })
    .sort((a, b) => {
      const aTime = new Date(a.createdAt)
      const bTime = new Date(b.createdAt)
      return sortBy === 'newest' ? bTime - aTime : aTime - bTime
    })

  console.log('🔔 Filtered notifications count:', filteredNotifications.length)
  console.log('🔔 Current filter:', filter)
  if (filteredNotifications.length > 0) {
    console.log('🔔 First filtered notification:', {
      title: filteredNotifications[0].title,
      read: filteredNotifications[0].read
    })
  }

  const handleTouchStart = (e, notificationId) => {
    touchStart.current[notificationId] = {
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
      time: Date.now()
    }
    const newSwipeState = { ...swipeState }
    newSwipeState[notificationId] = { type: 'starting', offset: 0 }
    setSwipeState(newSwipeState)
  }

  const handleTouchMove = (e, notificationId) => {
    if (!touchStart.current[notificationId]) return

    const currentX = e.targetTouches[0].clientX
    const currentY = e.targetTouches[0].clientY
    const diffX = touchStart.current[notificationId].x - currentX
    const diffY = Math.abs(touchStart.current[notificationId].y - currentY)

    if (diffY < 100) {
      e.preventDefault()
      const newSwipeState = { ...swipeState }
      if (diffX > 0) {
        const offset = Math.max(0, diffX)
        newSwipeState[notificationId] = {
          type: offset > 80 ? 'delete-ready' : 'swiping',
          offset: offset
        }
      } else {
        newSwipeState[notificationId] = { type: 'idle', offset: 0 }
      }
      setSwipeState(newSwipeState)
    }
  }

  const handleTouchEnd = (e, notificationId) => {
    if (!touchStart.current[notificationId]) return

    const endX = e.changedTouches[0].clientX
    const endY = e.changedTouches[0].clientY
    const diffX = touchStart.current[notificationId].x - endX
    const diffY = Math.abs(touchStart.current[notificationId].y - endY)
    const timeDiff = Date.now() - touchStart.current[notificationId].time

    if (diffX > 80 && timeDiff < 800 && diffY < 100) {
      deleteNotification(notificationId)
    } else {
      const newSwipeState = { ...swipeState }
      newSwipeState[notificationId] = { type: 'snapping-back', offset: 0 }
      setSwipeState(newSwipeState)

      setTimeout(() => {
        const cleanState = { ...swipeState }
        delete cleanState[notificationId]
        setSwipeState(cleanState)
      }, 300)
    }

    delete touchStart.current[notificationId]
  }

  const handleEnvelopeClick = async (e, notificationId, currentReadStatus) => {
    e.stopPropagation()

    const notification = notifications.find(n => n.id === notificationId)
    const notificationRef = doc(firestore, 'notifications', notificationId)

    await updateDoc(notificationRef, { read: !currentReadStatus })

    if (isOrderConfirmation(notification) || isCancelledOrder(notification)) {
      setSelectedNotification(notification)
    } else {
      setExpandedNotifications(prev => ({ ...prev, [notificationId]: !prev[notificationId] }))
    }
  }

  const handleNotificationClick = (notificationId, currentReadStatus) => {
    const notification = notifications.find(n => n.id === notificationId)

    if (isOrderConfirmation(notification) || isCancelledOrder(notification)) {
      setSelectedNotification(notification)
    } else {
      setExpandedNotifications(prev => ({ ...prev, [notificationId]: !prev[notificationId] }))
    }

    if (!currentReadStatus) {
      const notificationRef = doc(firestore, 'notifications', notificationId)
      updateDoc(notificationRef, { read: true })
    }
  }

  const deleteNotification = async (notificationId) => {
    try {
      await deleteDoc(doc(firestore, 'notifications', notificationId))
    } catch (error) {
      console.error('Error deleting notification:', error)
    }
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInMinutes = Math.floor(Math.abs(now - date) / (1000 * 60))

    if (diffInMinutes < 60) {
      return `${diffInMinutes}m fa`
    } else if (diffInMinutes < 1440) {
      return `${Math.floor(diffInMinutes / 60)}h fa`
    } else {
      return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
    }
  }

  const formatFullDateTime = (dateString) => {
    const date = new Date(dateString)
    if (isNaN(date)) return 'Data non valida'
    return date.toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getNotificationIcon = (notification) => {
    if (isOrderConfirmation(notification) || isCancelledOrder(notification)) return faShoppingCart
    return faBell
  }

  console.log('🔔 Rendering CustomerNotifications, loading:', loading, 'notifications:', notifications.length)

  if (loading) {
    return (
      <div className="notifications-loading">
        <div className="global-loading-spinner"></div>
        <p>Caricamento notifiche...</p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="notifications-page"
    >
      {selectedNotification && (
        <div className="notification-modal-overlay" onClick={() => setSelectedNotification(null)}>
          <div className="notification-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="notification-modal-close" onClick={() => setSelectedNotification(null)}>
              <FontAwesomeIcon icon={faTimes} />
            </button>
            <div className="notification-modal-header">
              <h3>Dettagli Ordine</h3>
              <div className="notification-modal-time">
                <FontAwesomeIcon icon={faCalendar} style={{ marginRight: '6px' }}/>
                {formatDate(selectedNotification.createdAt)}
              </div>
            </div>
            <OrderDetailsModal notification={selectedNotification} />
          </div>
        </div>
      )}

      <div className="notifications-header">
         <div className="notifications-title-section">
          <h1 className="notifications-title">
            <FontAwesomeIcon icon={faBell} className="notifications-title-icon" />
            Le tue Notifiche
          </h1>
          <div className="notifications-stats">
            <span className="notifications-stat">
              {notifications.filter(n => !n.read).length} non lette • {notifications.length} totali
            </span>
          </div>
        </div>
        <div className="notifications-controls">
          <div className="notifications-filters">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="notifications-filter-select"
            >
              <option value="all">Tutte</option>
              <option value="unread">Non lette</option>
              <option value="read">Lette</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="notifications-sort-select"
            >
              <option value="newest">Più recenti</option>
              <option value="oldest">Più vecchie</option>
            </select>
          </div>
        </div>
      </div>

      <div className="notifications-list">
        {filteredNotifications.length === 0 ? (
          <div className="notifications-empty">
            <FontAwesomeIcon icon={faBell} className="notifications-empty-icon" />
            <h3>Nessuna notifica</h3>
            <p>
              {filter === 'unread'
                ? 'Non hai notifiche non lette'
                : filter === 'read'
                ? 'Non hai notifiche lette'
                : 'Non hai ancora ricevuto notifiche'}
            </p>
          </div>
        ) : (
          <AnimatePresence>
            {filteredNotifications.map((notification) => {
              const swipeInfo = swipeState[notification.id] || { type: 'idle', offset: 0 }
              const isOrder = isOrderConfirmation(notification)
              const isCancelled = isCancelledOrder(notification)
              const orderDetails = notification.data
              const isExpanded = expandedNotifications[notification.id]

              return (
                <motion.div
                  key={notification.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{
                    x: "-110%",
                    opacity: 0,
                    transition: { duration: 0.4, ease: "easeIn" }
                  }}
                  className={`notification-wrapper ${swipeInfo.type}`}
                >
                  <div className="notification-delete-area">
                    <FontAwesomeIcon icon={faTrash} />
                  </div>
                  <div
                    className={`notification-item ${!notification.read ? 'unread' : ''} ${isOrder && !notification.read && !isCancelled ? 'unread-order' : ''} ${isCancelled && !notification.read ? 'unread-cancelled' : ''} ${swipeInfo.type}`}
                    style={{
                      transform: `translateX(-${swipeInfo.offset}px)`
                    }}
                    onClick={() => handleNotificationClick(notification.id, notification.read)}
                    onTouchStart={(e) => handleTouchStart(e, notification.id)}
                    onTouchMove={(e) => handleTouchMove(e, notification.id)}
                    onTouchEnd={(e) => handleTouchEnd(e, notification.id)}
                  >
                    <div className="notification-content-compact">
                      <div className="notification-main-content">
                        <div
                          className="notification-icon"
                          onClick={(e) => handleEnvelopeClick(e, notification.id, notification.read)}
                        >
                          <FontAwesomeIcon
                            icon={notification.read ? faEnvelopeOpen : getNotificationIcon(notification)}
                            className={`notification-status-icon ${!notification.read ? 'unread' : ''} ${isCancelled ? 'cancelled' : ''}`}
                          />
                          {/* Red cross overlay for cancelled orders */}
                          {isCancelled && (
                            <FontAwesomeIcon
                              icon={faTimes}
                              className="notification-cancel-overlay"
                            />
                          )}
                        </div>
                        <div className="notification-text-content">
                          {(isOrder || isCancelled) && orderDetails ? (
                            <>
                              <h3 className="notification-title">
                                {formatFullDateTime(notification.createdAt)}
                              </h3>
                              <p className={`notification-body-preview ${isCancelled ? 'cancelled' : ''}`} style={{ marginTop: '4px', fontWeight: '600', color: isCancelled ? '#ef4444' : '#fff' }}>
                                Ordine #{orderDetails.orderNumber} {isCancelled ? '• CANCELLATO' : ''}
                              </p>
                            </>
                          ) : (
                            <>
                              <h3 className="notification-title">{notification.title}</h3>
                              <p className="notification-body-preview">{notification.body}</p>
                            </>
                          )}
                        </div>
                        <div className="notification-meta-right">
                          <span className="notification-time">
                            <FontAwesomeIcon icon={faCalendar} />
                            {formatDate(notification.createdAt)}
                          </span>
                          {!isOrder && !isCancelled && (
                            <FontAwesomeIcon
                              icon={isExpanded ? faChevronUp : faChevronDown}
                              className="notification-expand-icon"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                    {!notification.read && (
                      <div className={`notification-unread-indicator ${isCancelled ? 'cancelled' : ''}`}></div>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        )}
      </div>
    </motion.div>
  )
}

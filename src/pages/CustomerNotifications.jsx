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
  faTrash
} from '@fortawesome/free-solid-svg-icons'
import './CustomerNotifications.css'

export default function CustomerNotifications() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all, unread, read
  const [sortBy, setSortBy] = useState('newest') // newest, oldest
  const [swipeState, setSwipeState] = useState({})

  // Touch/swipe handling
  const touchStart = useRef({})

  // Fetch notifications from Firestore
  useEffect(() => {
    // ... (This entire useEffect block remains unchanged)
    console.log('🔔 CustomerNotifications useEffect triggered')

    if (!auth.currentUser) {
      console.log('❌ No authenticated user, skipping notifications fetch')
      return
    }

    const currentUserId = auth.currentUser.uid
    console.log('🔔 Fetching notifications for user:', currentUserId)
    console.log('🔔 User ID to copy for Firestore:', `"${currentUserId}"`)

    const notificationsRef = collection(firestore, 'notifications')

    const tryIndexedQuery = () => {
      console.log('🔔 Trying indexed query (userId + orderBy)')
      const q = query(
        notificationsRef,
        where('userId', '==', currentUserId),
        orderBy('createdAt', 'desc')
      )

      return onSnapshot(q, (snapshot) => {
        console.log('✅ Indexed query successful! Documents found:', snapshot.docs.length)

        if (snapshot.docs.length === 0) {
          console.log('🔍 No notifications found for this user.')
          console.log('📝 To add a test notification:')
          console.log('1. Go to Firebase Console → Firestore → notifications collection')
          console.log('2. Edit your existing document or create a new one')
          console.log(`3. Set userId field to: ${currentUserId}`)
          console.log('4. Refresh this page')
        }

        const notificationsList = snapshot.docs.map(doc => {
          console.log('📄 Document:', doc.id, doc.data())
          return {
            id: doc.id,
            ...doc.data()
          }
        })

        setNotifications(notificationsList)
        setLoading(false)
      }, (error) => {
        console.error('❌ Error with indexed query, trying fallback:', error)
        return trySimpleQuery()
      })
    }

    const trySimpleQuery = () => {
      console.log('🔔 Trying simple query (userId only)')
      const q = query(
        notificationsRef,
        where('userId', '==', currentUserId)
      )

      return onSnapshot(q, (snapshot) => {
        console.log('✅ Simple query successful! Documents found:', snapshot.docs.length)
        const notificationsList = snapshot.docs.map(doc => {
          console.log('📄 Document:', doc.id, doc.data())
          return {
            id: doc.id,
            ...doc.data()
          }
        })

        notificationsList.sort((a, b) => {
          const aTime = new Date(a.createdAt || 0)
          const bTime = new Date(b.createdAt || 0)
          return bTime - aTime
        })

        console.log('🔔 Final notifications list:', notificationsList)
        setNotifications(notificationsList)
        setLoading(false)
      }, (error) => {
        console.error('❌ Error fetching notifications:', error)
        setLoading(false)
      })
    }

    const unsubscribe = tryIndexedQuery()

    return () => {
      console.log('🧹 Cleaning up notifications listener')
      unsubscribe()
    }
  }, [])

  // Filter and sort notifications
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

  // Touch event handlers for swipe
  const handleTouchStart = (e, notificationId) => {
    // ... (This function remains unchanged)
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
    // ... (This function remains unchanged)
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

  // <-- MODIFICATION #1: The `handleTouchEnd` logic is updated
  const handleTouchEnd = (e, notificationId) => {
    if (!touchStart.current[notificationId]) return

    const endX = e.changedTouches[0].clientX
    const endY = e.changedTouches[0].clientY
    const diffX = touchStart.current[notificationId].x - endX
    const diffY = Math.abs(touchStart.current[notificationId].y - endY)
    const timeDiff = Date.now() - touchStart.current[notificationId].time

    // Check if the swipe was intentional for deletion
    if (diffX > 80 && timeDiff < 800 && diffY < 100) {
      // If it's a delete swipe, just call deleteNotification.
      // AnimatePresence will handle the exit animation from its current state.
      console.log('Deleting notification:', notificationId)
      deleteNotification(notificationId)
    } else {
      // If it wasn't a delete swipe, snap it back to the start.
      const newSwipeState = { ...swipeState }
      newSwipeState[notificationId] = { type: 'snapping-back', offset: 0 }
      setSwipeState(newSwipeState)

      // Clean up the state after the snap-back animation
      setTimeout(() => {
        const cleanState = { ...swipeState }
        delete cleanState[notificationId]
        setSwipeState(cleanState)
      }, 300)
    }

    // Always clear the touch start data
    delete touchStart.current[notificationId]
  }

  // Toggle read/unread status
  const toggleReadStatus = async (e, notificationId, currentReadStatus) => {
    // ... (This function remains unchanged)
    e.stopPropagation()

    try {
      const notificationRef = doc(firestore, 'notifications', notificationId)
      const newReadStatus = !currentReadStatus

      await updateDoc(notificationRef, {
        read: newReadStatus,
        readAt: newReadStatus ? new Date().toISOString() : null
      })
    } catch (error) {
      console.error('Error toggling notification read status:', error)
    }
  }

  // Handle notification click
  const handleNotificationClick = (notificationId, currentReadStatus) => {
    // ... (This function remains unchanged)
    const fakeEvent = { stopPropagation: () => {} }
    toggleReadStatus(fakeEvent, notificationId, currentReadStatus)
  }

  // Delete notification
  const deleteNotification = async (notificationId) => {
    // ... (This function remains unchanged)
    try {
      await deleteDoc(doc(firestore, 'notifications', notificationId))
    } catch (error) {
      console.error('Error deleting notification:', error)
    }
  }

  // Format date for display
  const formatDate = (dateString) => {
    // ... (This function remains unchanged)
    const date = new Date(dateString)
    const now = new Date()
    const diffInHours = Math.abs(now - date) / (1000 * 60 * 60)

    if (diffInHours < 1) {
      const diffInMinutes = Math.abs(now - date) / (1000 * 60)
      return `${Math.floor(diffInMinutes)}m fa`
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h fa`
    } else {
      return date.toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    }
  }

  // Get notification stats
  const unreadCount = notifications.filter(n => !n.read).length
  const totalCount = notifications.length

  if (loading) {
    return (
      <div className="notifications-loading">
        <div className="global-loading-spinner"></div>
        <p className="global-loading-text">Caricamento notifiche...</p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="notifications-page"
    >
      {/* Header, Controls etc. remain the same */}
      <div className="notifications-header">
        <div className="notifications-title-section">
          <h1 className="notifications-title">
            <FontAwesomeIcon icon={faBell} className="notifications-title-icon" />
            Le tue Notifiche
          </h1>
          <div className="notifications-stats">
            <span className="notifications-stat">
              {unreadCount} non lette • {totalCount} totali
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

      {/* Notifications List */}
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

              return (
                <motion.div
                  key={notification.id}
                  layout // Helps with smooth reordering if list changes
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  // <-- MODIFICATION #2: The `exit` animation is now a full slide-left
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
                    className={`notification-item ${!notification.read ? 'unread' : ''} ${swipeInfo.type}`}
                    style={{
                      transform: `translateX(-${swipeInfo.offset}px)`
                    }}
                    onClick={() => handleNotificationClick(notification.id, notification.read)}
                    onTouchStart={(e) => handleTouchStart(e, notification.id)}
                    onTouchMove={(e) => handleTouchMove(e, notification.id)}
                    onTouchEnd={(e) => handleTouchEnd(e, notification.id)}
                  >
                    <div
                      className="notification-icon"
                      onClick={(e) => toggleReadStatus(e, notification.id, notification.read)}
                    >
                      <FontAwesomeIcon
                        icon={notification.read ? faEnvelopeOpen : faEnvelope}
                        className={`notification-status-icon ${!notification.read ? 'unread' : ''}`}
                      />
                    </div>

                    <div className="notification-content">
                      <div className="notification-header">
                        <h3 className="notification-title">
                          {notification.title || 'Dandy Notification'}
                        </h3>
                        <span className="notification-time">
                          <FontAwesomeIcon icon={faCalendar} />
                          {formatDate(notification.createdAt)}
                        </span>
                      </div>
                      <p className="notification-body">
                        {notification.body || notification.message}
                      </p>
                    </div>

                    {!notification.read && (
                      <div className="notification-unread-indicator"></div>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Footer info */}
      {notifications.length > 0 && (
        <div className="notifications-footer">
          <p className="notifications-footer-text">
            Le notifiche vengono conservate per 30 giorni
          </p>
        </div>
      )}
    </motion.div>
  )
}

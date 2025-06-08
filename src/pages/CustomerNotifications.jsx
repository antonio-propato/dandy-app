// src/pages/CustomerNotifications.jsx
import React, { useState, useEffect } from 'react'
import { auth, firestore } from '../lib/firebase'
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore'
import { motion, AnimatePresence } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faBell,
  faEnvelope,
  faEnvelopeOpen,
  faTrash,
  faFilter,
  faCalendar,
  faExclamationCircle,
  faCheckCircle,
  faRefresh
} from '@fortawesome/free-solid-svg-icons'
import './CustomerNotifications.css'

export default function CustomerNotifications() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all') // all, unread, read
  const [sortBy, setSortBy] = useState('newest') // newest, oldest
  const [selectedNotifications, setSelectedNotifications] = useState(new Set())
  const [showBulkActions, setShowBulkActions] = useState(false)

  // Fetch notifications from Firestore
  useEffect(() => {
    console.log('🔔 CustomerNotifications useEffect triggered')

    if (!auth.currentUser) {
      console.log('❌ No authenticated user, skipping notifications fetch')
      return
    }

    const currentUserId = auth.currentUser.uid
    console.log('🔔 Fetching notifications for user:', currentUserId)
    console.log('🔔 User ID to copy for Firestore:', `"${currentUserId}"`)

    const notificationsRef = collection(firestore, 'notifications')

    // Try the indexed query first, fallback to simple query if index doesn't exist
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
        // If indexed query fails, try simple query without orderBy
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

        // Sort in memory if we can't sort in the query
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

    // Start with indexed query
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

  // Mark notification as read
  const markAsRead = async (notificationId) => {
    try {
      const notificationRef = doc(firestore, 'notifications', notificationId)
      await updateDoc(notificationRef, {
        read: true,
        readAt: new Date().toISOString()
      })
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }

  // Delete notification
  const deleteNotification = async (notificationId) => {
    try {
      await deleteDoc(doc(firestore, 'notifications', notificationId))
    } catch (error) {
      console.error('Error deleting notification:', error)
    }
  }

  // Toggle notification selection for bulk actions
  const toggleNotificationSelection = (notificationId) => {
    const newSelected = new Set(selectedNotifications)
    if (newSelected.has(notificationId)) {
      newSelected.delete(notificationId)
    } else {
      newSelected.add(notificationId)
    }
    setSelectedNotifications(newSelected)
    setShowBulkActions(newSelected.size > 0)
  }

  // Select all visible notifications
  const selectAllVisible = () => {
    const allVisibleIds = new Set(filteredNotifications.map(n => n.id))
    setSelectedNotifications(allVisibleIds)
    setShowBulkActions(allVisibleIds.size > 0)
  }

  // Clear all selections
  const clearSelection = () => {
    setSelectedNotifications(new Set())
    setShowBulkActions(false)
  }

  // Bulk mark as read
  const bulkMarkAsRead = async () => {
    const promises = Array.from(selectedNotifications).map(async (id) => {
      const notificationRef = doc(firestore, 'notifications', id)
      return updateDoc(notificationRef, {
        read: true,
        readAt: new Date().toISOString()
      })
    })

    try {
      await Promise.all(promises)
      clearSelection()
    } catch (error) {
      console.error('Error bulk marking as read:', error)
    }
  }

  // Bulk delete
  const bulkDelete = async () => {
    if (!confirm(`Sei sicuro di voler eliminare ${selectedNotifications.size} notifiche?`)) {
      return
    }

    const promises = Array.from(selectedNotifications).map(id =>
      deleteDoc(doc(firestore, 'notifications', id))
    )

    try {
      await Promise.all(promises)
      clearSelection()
    } catch (error) {
      console.error('Error bulk deleting:', error)
    }
  }

  // Format date for display
  const formatDate = (dateString) => {
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
      {/* Header */}
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

        {/* Controls */}
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

          {filteredNotifications.length > 0 && (
            <div className="notifications-bulk-controls">
              <button
                onClick={selectAllVisible}
                className="notifications-select-all-btn"
              >
                Seleziona tutti
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bulk Actions Bar */}
      <AnimatePresence>
        {showBulkActions && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="notifications-bulk-actions"
          >
            <div className="notifications-bulk-info">
              {selectedNotifications.size} notifiche selezionate
            </div>
            <div className="notifications-bulk-buttons">
              <button onClick={bulkMarkAsRead} className="notifications-bulk-read-btn">
                <FontAwesomeIcon icon={faCheckCircle} />
                Segna come lette
              </button>
              <button onClick={bulkDelete} className="notifications-bulk-delete-btn">
                <FontAwesomeIcon icon={faTrash} />
                Elimina
              </button>
              <button onClick={clearSelection} className="notifications-bulk-cancel-btn">
                Annulla
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
            {filteredNotifications.map((notification) => (
              <motion.div
                key={notification.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className={`notification-item ${!notification.read ? 'unread' : ''} ${
                  selectedNotifications.has(notification.id) ? 'selected' : ''
                }`}
                onClick={() => !notification.read && markAsRead(notification.id)}
              >
                <div className="notification-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedNotifications.has(notification.id)}
                    onChange={() => toggleNotificationSelection(notification.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>

                <div className="notification-icon">
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

                  {notification.data && (
                    <div className="notification-metadata">
                      {notification.data.click_action && (
                        <span className="notification-action">
                          Tocca per aprire: {notification.data.click_action}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="notification-actions">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteNotification(notification.id)
                    }}
                    className="notification-delete-btn"
                    title="Elimina notifica"
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </div>

                {!notification.read && (
                  <div className="notification-unread-indicator"></div>
                )}
              </motion.div>
            ))}
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

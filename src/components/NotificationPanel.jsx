// Updated NotificationPanel.jsx with proper FCM integration
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Bell, Send, Calendar, Users, Gift, Star, Clock, CheckCircle, AlertTriangle, Loader2, Trash2, Edit, Bug } from 'lucide-react'
import { collection, getDocs, addDoc, query, where, orderBy, limit, updateDoc, doc, writeBatch, deleteDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { firestore, functions, auth } from '../lib/firebase'
import { FCMDebugHelper } from '../utils/fcmDebug'
import { fcmManager } from '../lib/fcm'
import './NotificationPanel.css'

export default function NotificationPanel() {
  const [activeTab, setActiveTab] = useState('immediate') // Start with debug tab to fix tokens
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [userStats, setUserStats] = useState({ total: 0, withTokens: 0 })
  const [notificationHistory, setNotificationHistory] = useState([])
  const [automatedRules, setAutomatedRules] = useState([])
  const [refreshing, setRefreshing] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState({})

  // Cloud Functions
  const sendPushNotification = httpsCallable(functions, 'sendPushNotification')
  const testNotification = httpsCallable(functions, 'testNotification')

  // Immediate notification state
  const [immediateForm, setImmediateForm] = useState({
    title: '',
    body: '',
    target: 'all',
    clickAction: '/profile'
  })

  // Automated notification state
  const [automatedForm, setAutomatedForm] = useState({
    type: 'birthday',
    title: 'Buon Compleanno! 🎉',
    body: 'Tanti auguri da tutto il team Dandy! Oggi è il tuo giorno speciale e riceverai un timbro extra con la tua prima scansione!',
    clickAction: '/profile',
    enabled: true
  })

  // Memoized template configurations
  const notificationTemplates = useMemo(() => ({
    birthday: {
      title: 'Buon Compleanno! 🎉',
      body: 'Tanti auguri da tutto il team Dandy! Oggi è il tuo giorno speciale e riceverai un timbro extra con la tua prima scansione!',
      emoji: '🎂',
      color: '#ff6b6b'
    },
    stamp_milestone: {
      title: 'Quasi al traguardo! ⭐',
      body: 'Ti mancano solo pochi timbri per ottenere il tuo caffè gratuito!',
      emoji: '⭐',
      color: '#feca57'
    },
    reward_available: {
      title: 'Hai un caffè gratis! 🎁',
      body: 'Hai raggiunto 9 timbri! Vieni a ritirare il tuo caffè gratuito.',
      emoji: '🎁',
      color: '#48dbfb'
    },
    inactive_user: {
      title: 'Ci Manchi! 😢',
      body: 'Non ti vediamo da un po\'... Vieni a trovarci per un caffè speciale!',
      emoji: '💔',
      color: '#ff9ff3'
    },
    special_offer: {
      title: 'Offerta Speciale! 🔥',
      body: 'Solo oggi: 20% di sconto su tutti i caffè! Non perdere questa occasione.',
      emoji: '🔥',
      color: '#ff6348'
    },
    new_menu_item: {
      title: 'Novità nel Menu! ✨',
      body: 'Scopri la nostra nuova creazione! Vieni ad assaggiarla oggi stesso.',
      emoji: '✨',
      color: '#2ed573'
    }
  }), [])

  // Load data on component mount
  useEffect(() => {
    loadAllData()
  }, [])

  const loadAllData = useCallback(async () => {
    setRefreshing(true)
    try {
      await Promise.all([
        loadUserStats(),
        loadNotificationHistory(),
        loadAutomatedRules()
      ])
    } catch (error) {
      console.error('Error loading data:', error)
      setMessage('❌ Errore nel caricamento dei dati')
    } finally {
      setRefreshing(false)
    }
  }, [])

  const loadUserStats = useCallback(async () => {
    try {
      const usersSnapshot = await getDocs(collection(firestore, 'users'))
      const users = usersSnapshot.docs.map(doc => doc.data())

      const total = users.filter(u => u.role !== 'superuser').length
      const withTokens = users.filter(u => u.role !== 'superuser' && u.fcmTokens?.length > 0).length

      setUserStats({ total, withTokens })
    } catch (error) {
      console.error('Error loading user stats:', error)
    }
  }, [])

  const loadNotificationHistory = useCallback(async () => {
    try {
      const q = query(
        collection(firestore, 'adminNotifications'),
        orderBy('createdAt', 'desc'),
        limit(50)
      )
      const snapshot = await getDocs(q)
      const notifications = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      setNotificationHistory(notifications)
    } catch (error) {
      console.error('Error loading notification history:', error)
    }
  }, [])

  const loadAutomatedRules = useCallback(async () => {
    try {
      const snapshot = await getDocs(collection(firestore, 'automatedNotifications'))
      const rules = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      setAutomatedRules(rules)
    } catch (error) {
      console.error('Error loading automated rules:', error)
    }
  }, [])

  // UPDATED: Send immediate notification using Cloud Function
  const sendImmediateNotification = useCallback(async () => {
    if (!immediateForm.title?.trim() || !immediateForm.body?.trim()) {
      setMessage('❌ Titolo e messaggio sono richiesti')
      return
    }

    setLoading(true)
    try {
      console.log('📱 Sending push notification via Cloud Function...')

      // Call the Cloud Function
      const result = await sendPushNotification({
        title: immediateForm.title.trim(),
        body: immediateForm.body.trim(),
        target: immediateForm.target,
        clickAction: immediateForm.clickAction,
        data: {
          type: 'admin_broadcast',
          priority: 'normal'
        }
      })

      console.log('✅ Push notification result:', result.data)

      // Create admin tracking record
      const now = new Date().toISOString()
      await addDoc(collection(firestore, 'adminNotifications'), {
        type: 'immediate',
        title: immediateForm.title.trim(),
        body: immediateForm.body.trim(),
        target: immediateForm.target,
        clickAction: immediateForm.clickAction,
        targetCount: result.data.targetCount || 0,
        successCount: result.data.successCount || 0,
        failedCount: result.data.failedCount || 0,
        createdAt: now,
        status: 'delivered'
      })

      // Show success message
      const successMsg = result.data.targetCount > 0
        ? `✅ Notifica inviata con successo a ${result.data.successCount} utenti!`
        : '⚠️ Nessun utente trovato per i criteri selezionati'

      setMessage(successMsg)

      // Reset form
      setImmediateForm({
        title: '',
        body: '',
        target: 'all',
        clickAction: '/profile'
      })

      // Reload history
      await loadNotificationHistory()

    } catch (error) {
      console.error('💥 Error sending notification:', error)
      const errorMsg = error.message || 'Errore sconosciuto'
      setMessage(`❌ Errore nell'invio: ${errorMsg}`)
    } finally {
      setLoading(false)
    }
  }, [immediateForm, loadNotificationHistory, sendPushNotification])

  // Test notification function
  const sendTestNotification = useCallback(async () => {
    try {
      setLoading(true)
      console.log('🧪 Sending test notification...')

      const result = await testNotification({
        title: 'Test Dandy 🧪',
        body: 'Questa è una notifica di test dal pannello admin!'
      })

      console.log('✅ Test result:', result.data)
      setMessage(`✅ ${result.data.message}`)

    } catch (error) {
      console.error('❌ Test notification failed:', error)
      setMessage(`❌ Test fallito: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }, [testNotification])

  // Debug functions
  const debugFCM = useCallback(async () => {
    const currentUser = auth.currentUser
    if (currentUser) {
      await FCMDebugHelper.debugFCMStatus(currentUser.uid)
    }
  }, [])

  const cleanTokens = useCallback(async () => {
    try {
      setLoading(true)
      const currentUser = auth.currentUser
      if (!currentUser) {
        setMessage('❌ User not logged in')
        return
      }

      const success = await FCMDebugHelper.cleanUserTokens(currentUser.uid)
      if (success) {
        setMessage('✅ Token puliti con successo! Ora ricarica la pagina.')
      } else {
        setMessage('❌ Errore nella pulizia dei token')
      }
    } catch (error) {
      console.error('❌ Clean tokens error:', error)
      setMessage('❌ Errore nella pulizia dei token')
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshTokens = useCallback(async () => {
    try {
      setLoading(true)
      const currentUser = auth.currentUser
      if (!currentUser) {
        setMessage('❌ User not logged in')
        return
      }

      const success = await FCMDebugHelper.refreshUserToken(currentUser.uid)
      if (success) {
        setMessage('✅ Token aggiornati! Ora prova a inviare una notifica di test.')
        await loadUserStats() // Refresh stats
      } else {
        setMessage('❌ Errore nell\'aggiornamento dei token')
      }
    } catch (error) {
      console.error('❌ Refresh tokens error:', error)
      setMessage('❌ Errore nell\'aggiornamento dei token')
    } finally {
      setLoading(false)
    }
  }, [loadUserStats])

  const testBrowserNotification = useCallback(async () => {
    const success = await FCMDebugHelper.testBrowserNotification()
    if (success) {
      setMessage('✅ Notifica browser inviata! Controlla se è apparsa.')
    } else {
      setMessage('❌ Notifica browser fallita. Controlla i permessi.')
    }
  }, [])

  const saveAutomatedRule = useCallback(async () => {
    if (!automatedForm.title?.trim() || !automatedForm.body?.trim()) {
      setMessage('❌ Titolo e messaggio sono richiesti')
      return
    }

    setLoading(true)
    try {
      await addDoc(collection(firestore, 'automatedNotifications'), {
        ...automatedForm,
        title: automatedForm.title.trim(),
        body: automatedForm.body.trim(),
        createdAt: new Date().toISOString(),
        lastTriggered: null,
        totalSent: 0
      })

      setMessage('✅ Regola automatica salvata con successo!')
      setAutomatedForm({
        type: 'birthday',
        title: 'Buon Compleanno! 🎉',
        body: 'Tanti auguri da tutto il team Dandy! Oggi è il tuo giorno speciale e riceverai un timbro extra con la tua prima scansione!',
        clickAction: '/profile',
        enabled: true
      })
      await loadAutomatedRules()
    } catch (error) {
      console.error('Error saving automated rule:', error)
      setMessage('❌ Errore nel salvataggio della regola automatica')
    } finally {
      setLoading(false)
    }
  }, [automatedForm, loadAutomatedRules])

  const toggleAutomatedRule = useCallback(async (ruleId, currentStatus) => {
    try {
      await updateDoc(doc(firestore, 'automatedNotifications', ruleId), {
        enabled: !currentStatus
      })
      await loadAutomatedRules()
      setMessage(`✅ Regola ${!currentStatus ? 'abilitata' : 'disabilitata'} con successo`)
    } catch (error) {
      console.error('Error toggling rule:', error)
      setMessage('❌ Errore nell\'aggiornamento della regola')
    }
  }, [loadAutomatedRules])

  const deleteAutomatedRule = useCallback(async (ruleId) => {
    if (!window.confirm('Sei sicuro di voler eliminare questa regola?')) return

    setDeleteLoading(prev => ({ ...prev, [ruleId]: true }))
    try {
      await deleteDoc(doc(firestore, 'automatedNotifications', ruleId))
      await loadAutomatedRules()
      setMessage('✅ Regola eliminata con successo')
    } catch (error) {
      console.error('Error deleting rule:', error)
      setMessage('❌ Errore nell\'eliminazione della regola')
    } finally {
      setDeleteLoading(prev => ({ ...prev, [ruleId]: false }))
    }
  }, [loadAutomatedRules])

  const getTargetDescription = useCallback((target) => {
    const descriptions = {
      all: 'Tutti gli utenti',
      customers: 'Solo clienti',
      birthday_today: 'Compleanni di oggi',
      inactive_users: 'Utenti inattivi',
      reward_eligible: 'Utenti con 9 timbri'
    }
    return descriptions[target] || target
  }, [])

  const getEstimatedReach = useCallback((target) => {
    switch (target) {
      case 'all':
        return `${userStats.withTokens} utenti`
      case 'customers':
        return `${Math.max(0, userStats.withTokens - 1)} utenti`
      case 'birthday_today':
        return 'Utenti compleanno oggi'
      case 'inactive_users':
        return 'Utenti inattivi (30+ giorni)'
      case 'reward_eligible':
        return 'Utenti con 9 timbri (caffè gratuito)'
      default:
        return 'Sconosciuto'
    }
  }, [userStats.withTokens])

  const handleTemplateChange = useCallback((templateType) => {
    const template = notificationTemplates[templateType]
    if (template) {
      setAutomatedForm(prev => ({
        ...prev,
        type: templateType,
        title: template.title,
        body: template.body
      }))
    }
  }, [notificationTemplates])

  const quickActionHandlers = useMemo(() => ({
    birthday: () => {
      setActiveTab('immediate')
      setImmediateForm({
        title: 'Buon Compleanno! 🎉',
        body: 'Tanti auguri da tutto il team Dandy! Oggi è il tuo giorno speciale e riceverai un timbro extra con la tua prima scansione!',
        target: 'birthday_today',
        clickAction: '/profile'
      })
    },
    milestone: () => {
      setActiveTab('immediate')
      setImmediateForm({
        title: 'Hai un caffè gratis! 🎁',
        body: 'Hai raggiunto 9 timbri! Vieni a ritirare il tuo caffè gratuito.',
        target: 'reward_eligible',
        clickAction: '/stamps'
      })
    },
    inactive: () => {
      setActiveTab('immediate')
      setImmediateForm({
        title: 'Ci Manchi! 😢',
        body: 'Non ti vediamo da un po\'... Torna per un caffè speciale con il 20% di sconto!',
        target: 'inactive_users',
        clickAction: '/menu'
      })
    }
  }), [])

  // Clear message after 5 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 5000)
      return () => clearTimeout(timer)
    }
  }, [message])

  // Generate random stats for demo (replace with real data)
  const quickStats = useMemo(() => ({
    birthdays: Math.floor(Math.random() * 5),
    nearReward: Math.floor(Math.random() * 10),
    inactive: Math.floor(Math.random() * 15)
  }), [])

  return (
    <div className="notification-panel">
      <div className="notification-container">
        {/* Header */}
        <div className="notification-header">
          <div className="notification-header-content">
            <div>
              <h1 className="notification-title">
                <Bell className="notification-title-icon" />
                Pannello Notifiche
                {refreshing && <Loader2 className="notification-loading-icon" size={24} />}
              </h1>
              <p className="notification-subtitle">Gestisci le notifiche push per i tuoi clienti</p>
            </div>
            <div className="notification-stats">
              <div className="stats-label">Utenti Totali</div>
              <div className="stats-number">{userStats.total}</div>
              <div className="stats-sub">{userStats.withTokens} con notifiche abilitate</div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  onClick={loadAllData}
                  className="notification-refresh-btn"
                  disabled={refreshing}
                >
                  {refreshing ? <Loader2 size={16} className="spin" /> : ''} Aggiorna
                </button>
                <button
                  onClick={sendTestNotification}
                  className="notification-refresh-btn"
                  disabled={loading}
                  style={{ background: 'rgba(40, 167, 69, 0.1)', borderColor: 'rgba(40, 167, 69, 0.3)', color: '#28a745' }}
                >
                  {loading ? <Loader2 size={16} className="spin" /> : '🧪'} Test
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Status Message */}
        {message && (
          <div className={`notification-message ${
            message.includes('❌') || message.includes('Errore') ? 'error' :
            message.includes('⚠️') ? 'warning' : 'success'
          }`}>
            <div className="notification-message-content">
              {message}
              <button
                onClick={() => setMessage('')}
                className="notification-message-close"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="notification-card">
          <div className="notification-tabs">
            <nav className="notification-tabs-nav">
              {[
                // { id: 'debug', label: 'Debug FCM', icon: Bug },
                { id: 'immediate', label: 'Invia Ora', icon: Send },
                { id: 'automated', label: 'Regole Automatiche', icon: Clock },
                { id: 'history', label: 'Cronologia', icon: CheckCircle }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`notification-tab ${activeTab === tab.id ? 'active' : ''}`}
                >
                  <tab.icon size={16} />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="notification-tab-content">
            {/* Debug Tab */}
            {activeTab === 'debug' && (
              <div>
                <h3 className="tab-section-title">🐛 Debug FCM - Risolvi Problemi Token</h3>

                <div className="notification-info-box" style={{ background: 'rgba(255, 193, 7, 0.15)', borderColor: 'rgba(255, 193, 7, 0.4)' }}>
                  <div className="notification-info-text">
                    <strong>⚠️ PROBLEMA RILEVATO:</strong> I tuoi token FCM sono scaduti/invalidi.<br/>
                    <strong>💡 SOLUZIONE:</strong> Segui questi passaggi nell'ordine per risolvere il problema.
                  </div>
                </div>

                <div className="notification-form-grid">
                  <div className="notification-form-section">
                    <h4 style={{ color: '#FFD700', marginBottom: '20px' }}>🔧 Strumenti di Debug</h4>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                      <button
                        onClick={debugFCM}
                        className="notification-btn"
                        style={{ background: 'rgba(139, 92, 246, 0.2)', borderColor: 'rgba(139, 92, 246, 0.4)', color: '#8b5cf6' }}
                      >
                        <Bug size={16} />
                        1. Debug Status FCM
                      </button>

                      <button
                        onClick={cleanTokens}
                        disabled={loading}
                        className="notification-btn"
                        style={{ background: 'rgba(255, 193, 7, 0.2)', borderColor: 'rgba(255, 193, 7, 0.4)', color: '#ffc107' }}
                      >
                        {loading ? <Loader2 size={16} className="spin" /> : '🧹'}
                        2. Pulisci Token Scaduti
                      </button>

                      <button
                        onClick={refreshTokens}
                        disabled={loading}
                        className="notification-btn notification-btn-success"
                      >
                        {loading ? <Loader2 size={16} className="spin" /> : '🔄'}
                        3. Ottieni Nuovi Token
                      </button>

                      <button
                        onClick={testBrowserNotification}
                        className="notification-btn"
                        style={{ background: 'rgba(67, 34, 27, 0.2)', borderColor: 'rgba(67, 34, 27, 0.4)', color: '#FFD700' }}
                      >
                        🧪 Test Notifica Browser
                      </button>

                      <button
                        onClick={sendTestNotification}
                        disabled={loading}
                        className="notification-btn notification-btn-primary"
                      >
                        {loading ? <Loader2 size={16} className="spin" /> : '🚀'}
                        4. Test Notifica FCM
                      </button>
                    </div>
                  </div>

                  <div className="notification-preview">
                    <h4 className="notification-preview-title">📋 Istruzioni</h4>
                    <div style={{ color: 'white', lineHeight: '1.6' }}>
                      <div style={{ marginBottom: '15px' }}>
                        <strong style={{ color: '#FFD700' }}>STEP 1:</strong> Clicca "Debug Status FCM" e controlla la console del browser (F12) per vedere i dettagli.
                      </div>

                      <div style={{ marginBottom: '15px' }}>
                        <strong style={{ color: '#FFD700' }}>STEP 2:</strong> Clicca "Pulisci Token Scaduti" per rimuovere i token invalidi dal database.
                      </div>

                      <div style={{ marginBottom: '15px' }}>
                        <strong style={{ color: '#FFD700' }}>STEP 3:</strong> Clicca "Ottieni Nuovi Token" per registrare nuovi token FCM validi.
                      </div>

                      <div style={{ marginBottom: '15px' }}>
                        <strong style={{ color: '#FFD700' }}>STEP 4:</strong> Clicca "Test Notifica FCM" per verificare che tutto funzioni.
                      </div>

                      <div style={{ marginTop: '20px', padding: '15px', background: 'rgba(40, 167, 69, 0.1)', borderRadius: '8px', border: '1px solid rgba(40, 167, 69, 0.3)' }}>
                        <strong style={{ color: '#28a745' }}>💡 NOTA:</strong> Se il problema persiste, assicurati che:
                        <ul style={{ marginLeft: '20px', marginTop: '8px' }}>
                          <li>Le notifiche siano abilitate nel browser</li>
                          <li>Il service worker sia registrato</li>
                          <li>Non ci siano errori nella console</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Immediate Notifications Tab */}
            {activeTab === 'immediate' && (
              <div>
                <h3 className="tab-section-title">Invia Notifica Immediata</h3>

                <div className="notification-form-grid">
                  <div className="notification-form-section">
                    <div className="notification-form-group">
                      <label className="notification-form-label">Titolo</label>
                      <input
                        type="text"
                        value={immediateForm.title}
                        onChange={(e) => setImmediateForm({...immediateForm, title: e.target.value})}
                        className="notification-form-input"
                        placeholder="Titolo della notifica"
                        maxLength={50}
                      />
                      <div className="notification-form-hint">
                        {immediateForm.title.length}/50 caratteri
                      </div>
                    </div>

                    <div className="notification-form-group">
                      <label className="notification-form-label">Messaggio</label>
                      <textarea
                        value={immediateForm.body}
                        onChange={(e) => setImmediateForm({...immediateForm, body: e.target.value})}
                        rows={4}
                        className="notification-form-textarea"
                        placeholder="Il tuo messaggio di notifica..."
                        maxLength={200}
                      />
                      <div className="notification-form-hint">
                        {immediateForm.body.length}/200 caratteri
                      </div>
                    </div>

                    <div className="notification-form-group">
                      <label className="notification-form-label">Destinatari</label>
                      <select
                        value={immediateForm.target}
                        onChange={(e) => setImmediateForm({...immediateForm, target: e.target.value})}
                        className="notification-form-select"
                      >
                        <option value="all">Tutti gli Utenti</option>
                        <option value="customers">Solo Clienti</option>
                        <option value="birthday_today">Compleanni di Oggi</option>
                        <option value="reward_eligible">Utenti con 9 Timbri</option>
                        <option value="inactive_users">Utenti Inattivi (30+ giorni)</option>
                      </select>
                    </div>

                    <div className="notification-form-group">
                      <label className="notification-form-label">Azione Click (Pagina da aprire)</label>
                      <select
                        value={immediateForm.clickAction}
                        onChange={(e) => setImmediateForm({...immediateForm, clickAction: e.target.value})}
                        className="notification-form-select"
                      >
                        <option value="/profile">Profilo</option>
                        <option value="/menu">Menu</option>
                        <option value="/stamps">Timbri</option>
                        <option value="/contacts">Contatti</option>
                        <option value="/notifications">Notifiche</option>
                      </select>
                    </div>

                    <button
                      onClick={sendImmediateNotification}
                      disabled={loading || !immediateForm.title.trim() || !immediateForm.body.trim()}
                      className="notification-btn notification-btn-primary"
                    >
                      {loading ? (
                        <>
                          <Loader2 size={16} className="spin" />
                          Invio...
                        </>
                      ) : (
                        <>
                          <Send size={16} />
                          Invia Notifica
                        </>
                      )}
                    </button>
                  </div>

                  <div className="notification-preview">
                    <h4 className="notification-preview-title">Anteprima</h4>
                    <div className="notification-preview-card">
                      <div className="notification-preview-content">
                        <div className="notification-preview-icon">
                          <Bell size={16} color="white" />
                        </div>
                        <div className="notification-preview-text">
                          <div className="notification-preview-text-title">
                            {immediateForm.title || 'Titolo Notifica'}
                          </div>
                          <div className="notification-preview-text-body">
                            {immediateForm.body || 'Il tuo messaggio apparirà qui...'}
                          </div>
                          <div className="notification-preview-text-meta">
                            Dandy App • Ora
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="notification-preview-info">
                      <div className="notification-preview-info-item">
                        <strong>Destinatari:</strong> {getTargetDescription(immediateForm.target)}
                      </div>
                      <div className="notification-preview-info-item">
                        <strong>Portata stimata:</strong> {getEstimatedReach(immediateForm.target)}
                      </div>
                      <div className="notification-preview-info-item">
                        <strong>💡 Info:</strong> Le notifiche vengono inviate tramite Firebase Cloud Messaging
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Rest of the component remains the same... */}
            {/* I'll keep the other tabs unchanged since they don't need FCM integration */}

            {/* Automated Rules Tab */}
            {activeTab === 'automated' && (
              <div>
                <h3 className="tab-section-title">Crea Regola Automatica</h3>
                <div className="notification-info-box">
                  <div className="notification-info-text">
                    <strong>ℹ️ Le regole automatiche vengono eseguite dai server Firebase:</strong><br/>
                    • Compleanni: ogni giorno alle 9:00<br/>
                    • Pulizia token FCM: ogni domenica alle 2:00<br/>
                    • Le notifiche vengono inviate automaticamente agli utenti idonei
                  </div>
                </div>

                {/* Rest of automated rules content... */}
                <div className="notification-rules-grid">
                  <div className="notification-form-section">
                    <div className="notification-form-group">
                      <label className="notification-form-label">Tipo Regola</label>
                      <select
                        value={automatedForm.type}
                        onChange={(e) => handleTemplateChange(e.target.value)}
                        className="notification-form-select"
                      >
                        <option value="birthday">Buon Compleanno</option>
                        <option value="stamp_milestone">Traguardo Timbri</option>
                        <option value="reward_available">Caffè Gratuito (9 Timbri)</option>
                        <option value="inactive_user">Utente Inattivo</option>
                        <option value="special_offer">Offerta Speciale</option>
                        <option value="new_menu_item">Nuovo Menu</option>
                      </select>
                    </div>

                    <div className="notification-form-group">
                      <label className="notification-form-label">Titolo</label>
                      <input
                        type="text"
                        value={automatedForm.title}
                        onChange={(e) => setAutomatedForm({...automatedForm, title: e.target.value})}
                        className="notification-form-input"
                        maxLength={50}
                      />
                      <div className="notification-form-hint">
                        {automatedForm.title.length}/50 caratteri
                      </div>
                    </div>

                    <div className="notification-form-group">
                      <label className="notification-form-label">Messaggio</label>
                      <textarea
                        value={automatedForm.body}
                        onChange={(e) => setAutomatedForm({...automatedForm, body: e.target.value})}
                        rows={3}
                        className="notification-form-textarea"
                        maxLength={200}
                      />
                      <div className="notification-form-hint">
                        {automatedForm.body.length}/200 caratteri
                      </div>
                    </div>

                    <div className="notification-checkbox-group">
                      <input
                        type="checkbox"
                        id="enabled"
                        checked={automatedForm.enabled}
                        onChange={(e) => setAutomatedForm({...automatedForm, enabled: e.target.checked})}
                        className="notification-checkbox"
                      />
                      <label htmlFor="enabled" className="notification-checkbox-label">
                        Abilita questa regola
                      </label>
                    </div>

                    <button
                      onClick={saveAutomatedRule}
                      disabled={loading || !automatedForm.title.trim() || !automatedForm.body.trim()}
                      className="notification-btn notification-btn-success"
                    >
                      {loading ? (
                        <>
                          <Loader2 size={16} className="spin" />
                          Salvataggio...
                        </>
                      ) : (
                        <>
                          <Clock size={16} />
                          Salva Regola
                        </>
                      )}
                    </button>
                  </div>

                  <div className="notification-rules-section">
                    <h4 className="notification-preview-title">
                      Regole Esistenti ({automatedRules.length})
                    </h4>
                    <div className="notification-rules-list">
                      {automatedRules.map(rule => (
                        <div key={rule.id} className="notification-rule-card">
                          <div className="notification-rule-header">
                            <div className="notification-rule-content">
                              <div className="notification-rule-title-row">
                                <span className="notification-rule-emoji">
                                  {notificationTemplates[rule.type]?.emoji || '📝'}
                                </span>
                                <span className="notification-rule-title">{rule.title}</span>
                                <span className={`notification-badge ${rule.enabled ? 'active' : 'disabled'}`}>
                                  {rule.enabled ? 'Attivo' : 'Disabilitato'}
                                </span>
                              </div>
                              <div className="notification-rule-body">{rule.body}</div>
                              <div className="notification-rule-meta">
                                Tipo: {rule.type} • Inviate: {rule.totalSent || 0} volte
                                {rule.lastTriggered && (
                                  <> • Ultimo: {new Date(rule.lastTriggered).toLocaleDateString('it-IT')}</>
                                )}
                              </div>
                            </div>
                            <div className="notification-rule-actions">
                              <button
                                onClick={() => toggleAutomatedRule(rule.id, rule.enabled)}
                                className={`notification-rule-toggle ${rule.enabled ? 'disable' : 'enable'}`}
                                disabled={loading}
                              >
                                {rule.enabled ? 'Disabilita' : 'Abilita'}
                              </button>
                              <button
                                onClick={() => deleteAutomatedRule(rule.id)}
                                className="notification-rule-delete"
                                disabled={deleteLoading[rule.id]}
                              >
                                {deleteLoading[rule.id] ? (
                                  <Loader2 size={14} className="spin" />
                                ) : (
                                  <Trash2 size={14} />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {automatedRules.length === 0 && (
                      <div className="notification-empty">
                        <Clock size={48} className="notification-empty-icon" />
                        <p className="notification-empty-text">Nessuna regola automatica creata</p>
                        <p className="notification-empty-subtext">Crea la tua prima regola per automatizzare le notifiche</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* History Tab */}
            {activeTab === 'history' && (
              <div>
                <h3 className="tab-section-title">
                  Cronologia Notifiche ({notificationHistory.length})
                </h3>

                {notificationHistory.length > 0 && (
                  <div className="notification-history-stats">
                    <div className="notification-stat-mini">
                      <span className="stat-mini-label">Totale Inviate</span>
                      <span className="stat-mini-value">{notificationHistory.length}</span>
                    </div>
                    <div className="notification-stat-mini">
                      <span className="stat-mini-label">Utenti Raggiunti</span>
                      <span className="stat-mini-value">
                        {notificationHistory.reduce((acc, n) => acc + (n.successCount || 0), 0)}
                      </span>
                    </div>
                    <div className="notification-stat-mini">
                      <span className="stat-mini-label">Tasso Successo</span>
                      <span className="stat-mini-value">
                        {Math.round((notificationHistory.filter(n => n.status === 'delivered').length / notificationHistory.length) * 100)}%
                      </span>
                    </div>
                  </div>
                )}

                <div className="notification-rules-section">
                  {notificationHistory.map(notification => (
                    <div key={notification.id} className="notification-history-card">
                      <div className="notification-history-header">
                        <div className="notification-history-content">
                          <div className="notification-history-title-row">
                            <span className="notification-history-title">{notification.title}</span>
                            <span className={`notification-badge ${notification.type}`}>
                              {notification.type === 'immediate' ? 'Immediata' : 'Automatica'}
                            </span>
                            <span className={`notification-badge ${notification.status || 'delivered'}`}>
                              {notification.status === 'pending' ? 'In Attesa' :
                               notification.status === 'delivered' ? 'Consegnata' :
                               notification.status === 'failed' ? 'Fallita' : 'Consegnata'}
                            </span>
                          </div>
                          <div className="notification-history-body">{notification.body}</div>
                          <div className="notification-history-meta">
                            {notification.successCount && (
                              <span>✅ Consegnata a {notification.successCount} utenti • </span>
                            )}
                            🎯 Destinatari: {getTargetDescription(notification.target)} •
                            📅 {new Date(notification.createdAt).toLocaleString('it-IT')}
                          </div>
                        </div>
                        <div className="notification-history-actions">
                          <button
                            onClick={() => {
                              setActiveTab('immediate')
                              setImmediateForm({
                                title: notification.title,
                                body: notification.body,
                                target: notification.target || 'all',
                                clickAction: notification.clickAction || '/profile'
                              })
                            }}
                            className="notification-history-duplicate"
                            title="Duplica notifica"
                          >
                            <Edit size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {notificationHistory.length === 0 && (
                    <div className="notification-empty">
                      <Bell size={48} className="notification-empty-icon" />
                      <p className="notification-empty-text">Nessuna notifica inviata ancora</p>
                      <p className="notification-empty-subtext">Le tue notifiche inviate appariranno qui</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="notification-quick-actions">
          <div className="notification-quick-card blue">
            <div className="notification-quick-header">
              <div className="notification-quick-info">
                <div className="notification-quick-label">Compleanni Oggi</div>
                <div className="notification-quick-number">{quickStats.birthdays}</div>
              </div>
              <Gift size={32} className="notification-quick-icon" />
            </div>
            <button
              className="notification-quick-btn"
              onClick={quickActionHandlers.birthday}
              disabled={quickStats.birthdays === 0}
            >
              {quickStats.birthdays === 0 ? 'Nessun Compleanno' : 'Invia Auguri'}
            </button>
          </div>

          <div className="notification-quick-card green">
            <div className="notification-quick-header">
              <div className="notification-quick-info">
                <div className="notification-quick-label">Caffè Gratis Pronti</div>
                <div className="notification-quick-number">{quickStats.nearReward}</div>
              </div>
              <Star size={32} className="notification-quick-icon" />
            </div>
            <button
              className="notification-quick-btn"
              onClick={quickActionHandlers.milestone}
            >
              Notifica Caffè Gratis
            </button>
          </div>

          <div className="notification-quick-card purple">
            <div className="notification-quick-header">
              <div className="notification-quick-info">
                <div className="notification-quick-label">Utenti Inattivi</div>
                <div className="notification-quick-number">{quickStats.inactive}</div>
              </div>
              <Users size={32} className="notification-quick-icon" />
            </div>
            <button
              className="notification-quick-btn"
              onClick={quickActionHandlers.inactive}
            >
              Offerta Ritorno
            </button>
          </div>
        </div>

        {/* Performance Tips */}
        <div className="notification-tips-card">
          <h4 className="notification-tips-title">
            💡 Suggerimenti per Migliorare l'Engagement
          </h4>
          <div className="notification-tips-grid">
            <div className="notification-tip">
              <div className="notification-tip-icon">🎯</div>
              <div className="notification-tip-content">
                <strong>Personalizza i Messaggi</strong>
                <p>Usa emoji e un tono amichevole per aumentare l'apertura delle notifiche</p>
              </div>
            </div>
            <div className="notification-tip">
              <div className="notification-tip-icon">⏰</div>
              <div className="notification-tip-content">
                <strong>Timing Ottimale</strong>
                <p>Invia notifiche tra le 10:00-12:00 e 16:00-18:00 per massimo engagement</p>
              </div>
            </div>
            <div className="notification-tip">
              <div className="notification-tip-icon">🎁</div>
              <div className="notification-tip-content">
                <strong>Bonus Compleanno</strong>
                <p>Gli utenti ricevono automaticamente 1 timbro extra nel giorno del compleanno</p>
              </div>
            </div>
            <div className="notification-tip">
              <div className="notification-tip-icon">📊</div>
              <div className="notification-tip-content">
                <strong>Sistema Automatico</strong>
                <p>Le notifiche vengono inviate tramite Firebase Cloud Functions per massima affidabilità</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

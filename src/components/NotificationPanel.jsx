import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Bell, Send, Clock, CheckCircle, Loader2, Trash2, Edit, Gift, Star, Users } from 'lucide-react'
import { collection, getDocs, addDoc, query, orderBy, limit, updateDoc, doc, deleteDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { firestore, functions } from '../lib/firebase'
import './NotificationPanel.css'

export default function NotificationPanel() {
  const [activeTab, setActiveTab] = useState('immediate')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [userStats, setUserStats] = useState({ total: 0, withTokens: 0 })
  const [notificationHistory, setNotificationHistory] = useState([])
  const [automatedRules, setAutomatedRules] = useState([])
  const [refreshing, setRefreshing] = useState(false)

  // Cloud Functions
  const sendPushNotification = httpsCallable(functions, 'sendPushNotification')
  const testNotification = httpsCallable(functions, 'testNotification')

  // Form states
  const [immediateForm, setImmediateForm] = useState({
    title: '',
    body: '',
    target: 'all',
    clickAction: '/profile',
    scheduled: false,
    scheduledDate: '',
    scheduledTime: ''
  })

  const [automatedForm, setAutomatedForm] = useState({
    type: 'birthday',
    title: 'Buon Compleanno! 🎉',
    body: 'Tanti auguri da tutto il team Dandy! Oggi ricevi un timbro extra con la tua prima scansione!',
    clickAction: '/profile',
    enabled: true
  })

  // Templates
  const templates = useMemo(() => ({
    birthday: {
      title: 'Buon Compleanno! 🎉',
      body: 'Tanti auguri da tutto il team Dandy! Oggi ricevi un timbro extra con la tua prima scansione!'
    },
    reward_available: {
      title: 'Hai un caffè gratis! 🎁',
      body: 'Hai raggiunto 9 timbri! Vieni a ritirare il tuo caffè gratuito.'
    },
    inactive_user: {
      title: 'Ci Manchi! 😢',
      body: 'Non ti vediamo da un po\'... Vieni a trovarci per un caffè speciale!'
    },
    special_offer: {
      title: 'Offerta Speciale! 🔥',
      body: 'Solo oggi: 20% di sconto su tutti i caffè! Non perdere questa occasione.'
    }
  }), [])

  // Load data
  useEffect(() => {
    loadAllData()
  }, [])

  const loadAllData = useCallback(async () => {
    setRefreshing(true)
    try {
      await Promise.all([loadUserStats(), loadNotificationHistory(), loadAutomatedRules()])
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
      const q = query(collection(firestore, 'adminNotifications'), orderBy('createdAt', 'desc'), limit(20))
      const snapshot = await getDocs(q)
      const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      setNotificationHistory(notifications)
    } catch (error) {
      console.error('Error loading notification history:', error)
    }
  }, [])

  const loadAutomatedRules = useCallback(async () => {
    try {
      const snapshot = await getDocs(collection(firestore, 'automatedNotifications'))
      const rules = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      setAutomatedRules(rules)
    } catch (error) {
      console.error('Error loading automated rules:', error)
    }
  }, [])

  // Send immediate notification
  const sendImmediateNotification = useCallback(async () => {
    if (!immediateForm.title?.trim() || !immediateForm.body?.trim()) {
      setMessage('❌ Titolo e messaggio sono richiesti')
      return
    }

    // Validate scheduled time if scheduling is enabled
    if (immediateForm.scheduled) {
      if (!immediateForm.scheduledDate || !immediateForm.scheduledTime) {
        setMessage('❌ Data e ora sono richieste per la programmazione')
        return
      }

      const scheduledDateTime = new Date(`${immediateForm.scheduledDate}T${immediateForm.scheduledTime}`)
      const now = new Date()

      if (scheduledDateTime <= now) {
        setMessage('❌ La data/ora programmata deve essere nel futuro')
        return
      }
    }

    setLoading(true)
    try {
      if (immediateForm.scheduled) {
        // Save as scheduled notification
        const scheduledDateTime = new Date(`${immediateForm.scheduledDate}T${immediateForm.scheduledTime}`)

        await addDoc(collection(firestore, 'scheduledNotifications'), {
          title: immediateForm.title.trim(),
          body: immediateForm.body.trim(),
          target: immediateForm.target,
          clickAction: immediateForm.clickAction,
          scheduledFor: scheduledDateTime.toISOString(),
          createdAt: new Date().toISOString(),
          status: 'scheduled',
          type: 'immediate'
        })

        setMessage(`✅ Notifica programmata per ${scheduledDateTime.toLocaleString('it-IT')}!`)

        // Also add to admin notifications for tracking
        await addDoc(collection(firestore, 'adminNotifications'), {
          type: 'scheduled',
          title: immediateForm.title.trim(),
          body: immediateForm.body.trim(),
          target: immediateForm.target,
          clickAction: immediateForm.clickAction,
          scheduledFor: scheduledDateTime.toISOString(),
          createdAt: new Date().toISOString(),
          status: 'scheduled'
        })
      } else {
        // Send immediately
        const result = await sendPushNotification({
          title: immediateForm.title.trim(),
          body: immediateForm.body.trim(),
          target: immediateForm.target,
          clickAction: immediateForm.clickAction,
          data: { type: 'admin_broadcast', priority: 'normal' }
        })

        await addDoc(collection(firestore, 'adminNotifications'), {
          type: 'immediate',
          title: immediateForm.title.trim(),
          body: immediateForm.body.trim(),
          target: immediateForm.target,
          clickAction: immediateForm.clickAction,
          targetCount: result.data.targetCount || 0,
          successCount: result.data.successCount || 0,
          failedCount: result.data.failedCount || 0,
          createdAt: new Date().toISOString(),
          status: 'delivered'
        })

        const successMsg = result.data.targetCount > 0
          ? `✅ Notifica inviata a ${result.data.successCount} utenti!`
          : '⚠️ Nessun utente trovato'

        setMessage(successMsg)
      }

      setImmediateForm({
        title: '',
        body: '',
        target: 'all',
        clickAction: '/profile',
        scheduled: false,
        scheduledDate: '',
        scheduledTime: ''
      })
      await loadNotificationHistory()
    } catch (error) {
      console.error('Error sending notification:', error)
      setMessage(`❌ Errore: ${error.message || 'Errore sconosciuto'}`)
    } finally {
      setLoading(false)
    }
  }, [immediateForm, loadNotificationHistory, sendPushNotification])

  // Test notification
  const sendTestNotification = useCallback(async () => {
    try {
      setLoading(true)
      const result = await testNotification({
        title: 'Test Dandy 🧪',
        body: 'Questa è una notifica di test dal pannello admin!'
      })
      setMessage(`✅ ${result.data.message}`)
    } catch (error) {
      console.error('Test notification failed:', error)
      setMessage(`❌ Test fallito: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }, [testNotification])

  // Save automated rule
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

      setMessage('✅ Regola salvata con successo!')
      setAutomatedForm({
        type: 'birthday',
        title: 'Buon Compleanno! 🎉',
        body: 'Tanti auguri da tutto il team Dandy! Oggi ricevi un timbro extra con la tua prima scansione!',
        clickAction: '/profile',
        enabled: true
      })
      await loadAutomatedRules()
    } catch (error) {
      console.error('Error saving automated rule:', error)
      setMessage('❌ Errore nel salvataggio')
    } finally {
      setLoading(false)
    }
  }, [automatedForm, loadAutomatedRules])

  // Toggle rule
  const toggleRule = useCallback(async (ruleId, currentStatus) => {
    try {
      await updateDoc(doc(firestore, 'automatedNotifications', ruleId), { enabled: !currentStatus })
      await loadAutomatedRules()
      setMessage(`✅ Regola ${!currentStatus ? 'abilitata' : 'disabilitata'}`)
    } catch (error) {
      console.error('Error toggling rule:', error)
      setMessage('❌ Errore aggiornamento')
    }
  }, [loadAutomatedRules])

  // Delete rule
  const deleteRule = useCallback(async (ruleId) => {
    if (!window.confirm('Eliminare questa regola?')) return
    try {
      await deleteDoc(doc(firestore, 'automatedNotifications', ruleId))
      await loadAutomatedRules()
      setMessage('✅ Regola eliminata')
    } catch (error) {
      console.error('Error deleting rule:', error)
      setMessage('❌ Errore eliminazione')
    }
  }, [loadAutomatedRules])

  // Helpers
  const getTargetDescription = (target) => {
    const descriptions = {
      all: 'Tutti gli utenti',
      customers: 'Solo clienti',
      birthday_today: 'Compleanni di oggi',
      inactive_users: 'Utenti inattivi',
      reward_eligible: 'Utenti con 9 timbri'
    }
    return descriptions[target] || target
  }

  const getEstimatedReach = (target) => {
    switch (target) {
      case 'all': return `${userStats.withTokens} utenti`
      case 'customers': return `${Math.max(0, userStats.withTokens - 1)} utenti`
      case 'birthday_today': return 'Utenti compleanno oggi'
      case 'inactive_users': return 'Utenti inattivi (30+ giorni)'
      case 'reward_eligible': return 'Utenti con 9 timbri'
      default: return 'Sconosciuto'
    }
  }

  const quickActions = [
    {
      id: 'birthday',
      label: 'Compleanni Oggi',
      count: Math.floor(Math.random() * 5),
      icon: Gift,
      color: 'blue',
      action: () => {
        setActiveTab('immediate')
        setImmediateForm({
          title: 'Buon Compleanno! 🎉',
          body: 'Tanti auguri da tutto il team Dandy! Oggi ricevi un timbro extra!',
          target: 'birthday_today',
          clickAction: '/profile',
          scheduled: false,
          scheduledDate: '',
          scheduledTime: ''
        })
      }
    },
    {
      id: 'reward',
      label: 'Caffè Gratis',
      count: Math.floor(Math.random() * 10),
      icon: Star,
      color: 'green',
      action: () => {
        setActiveTab('immediate')
        setImmediateForm({
          title: 'Hai un caffè gratis! 🎁',
          body: 'Hai raggiunto 9 timbri! Vieni a ritirare il tuo caffè gratuito.',
          target: 'reward_eligible',
          clickAction: '/stamps',
          scheduled: false,
          scheduledDate: '',
          scheduledTime: ''
        })
      }
    },
    {
      id: 'inactive',
      label: 'Utenti Inattivi',
      count: Math.floor(Math.random() * 15),
      icon: Users,
      color: 'purple',
      action: () => {
        setActiveTab('immediate')
        setImmediateForm({
          title: 'Ci Manchi! 😢',
          body: 'Non ti vediamo da un po\'... Torna per un caffè speciale!',
          target: 'inactive_users',
          clickAction: '/menu',
          scheduled: false,
          scheduledDate: '',
          scheduledTime: ''
        })
      }
    }
  ]

  // Clear message after 5 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 5000)
      return () => clearTimeout(timer)
    }
  }, [message])

  return (
    <div className="notification-panel">
      {/* Header */}
      <div className="notification-header">
        <div className="header-content">
          <div className="header-text">
            <h1 className="title">
              <Bell className="title-icon" />
              Pannello Notifiche
              {refreshing && <Loader2 className="loading-icon" />}
            </h1>
            <p className="subtitle">Gestisci le notifiche push per i tuoi clienti</p>
          </div>

          <div className="stats">
            <div className="stats-label">Utenti Totali</div>
            <div className="stats-number">{userStats.total}</div>
            <div className="stats-sub">{userStats.withTokens} con notifiche abilitate</div>
            <div className="stats-actions">
              <button onClick={loadAllData} className="stats-btn" disabled={refreshing}>
                {refreshing ? <Loader2 size={16} className="spin" /> : 'Aggiorna'}
              </button>
              <button onClick={sendTestNotification} className="stats-btn test" disabled={loading}>
                {loading ? <Loader2 size={16} className="spin" /> : 'Test'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Status Message */}
      {message && (
        <div className={`message ${message.includes('❌') ? 'error' : message.includes('⚠️') ? 'warning' : 'success'}`}>
          <span>{message}</span>
          <button onClick={() => setMessage('')} className="message-close">✕</button>
        </div>
      )}

      {/* Main Content */}
      <div className="main-card">
        {/* Tabs */}
        <div className="tabs">
          <nav className="tabs-nav">
            {[
              { id: 'immediate', label: 'Invia Ora', icon: Send },
              { id: 'automated', label: 'Regole Auto', icon: Clock },
              { id: 'history', label: 'Cronologia', icon: CheckCircle }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`tab ${activeTab === tab.id ? 'active' : ''}`}
              >
                <tab.icon size={16} />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="tab-content">
          {activeTab === 'immediate' && (
            <div>
              <h2 className="section-title">Invia Notifica Immediata</h2>

              <div className="info-box">
                <strong>💡 Opzioni di invio:</strong><br/>
                • <strong>Immediato:</strong> Invia subito a tutti gli utenti selezionati<br/>
                • <strong>Programmato:</strong> Programma l'invio per data e ora specifiche
              </div>

              <div className="form-grid">
                <div className="form-section">
                  <div className="form-group">
                    <label className="form-label">Titolo</label>
                    <input
                      type="text"
                      value={immediateForm.title}
                      onChange={(e) => setImmediateForm({...immediateForm, title: e.target.value})}
                      className="form-input"
                      placeholder="Titolo della notifica"
                      maxLength={50}
                    />
                    <div className="form-hint">{immediateForm.title.length}/50 caratteri</div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Messaggio</label>
                    <textarea
                      value={immediateForm.body}
                      onChange={(e) => setImmediateForm({...immediateForm, body: e.target.value})}
                      rows={4}
                      className="form-textarea"
                      placeholder="Il tuo messaggio..."
                      maxLength={200}
                    />
                    <div className="form-hint">{immediateForm.body.length}/200 caratteri</div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Destinatari</label>
                      <select
                        value={immediateForm.target}
                        onChange={(e) => setImmediateForm({...immediateForm, target: e.target.value})}
                        className="form-select"
                      >
                        <option value="all">Tutti gli Utenti</option>
                        <option value="customers">Solo Clienti</option>
                        <option value="birthday_today">Compleanni di Oggi</option>
                        <option value="reward_eligible">Utenti con 9 Timbri</option>
                        <option value="inactive_users">Utenti Inattivi</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Azione Click</label>
                      <select
                        value={immediateForm.clickAction}
                        onChange={(e) => setImmediateForm({...immediateForm, clickAction: e.target.value})}
                        className="form-select"
                      >
                        <option value="/profile">Profilo</option>
                        <option value="/menu">Menu</option>
                        <option value="/stamps">Timbri</option>
                        <option value="/contacts">Contatti</option>
                      </select>
                    </div>
                  </div>

                  <div className="scheduling-section">
                    <div className="checkbox-group">
                      <input
                        type="checkbox"
                        id="scheduled"
                        checked={immediateForm.scheduled}
                        onChange={(e) => setImmediateForm({...immediateForm, scheduled: e.target.checked})}
                        className="checkbox"
                      />
                      <label htmlFor="scheduled" className="checkbox-label">📅 Programma invio</label>
                    </div>

                    {immediateForm.scheduled && (
                      <div className="schedule-inputs">
                        <div className="form-row">
                          <div className="form-group">
                            <label className="form-label">Data</label>
                            <input
                              type="date"
                              value={immediateForm.scheduledDate}
                              onChange={(e) => setImmediateForm({...immediateForm, scheduledDate: e.target.value})}
                              className="form-input"
                              min={new Date().toISOString().split('T')[0]}
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Ora</label>
                            <input
                              type="time"
                              value={immediateForm.scheduledTime}
                              onChange={(e) => setImmediateForm({...immediateForm, scheduledTime: e.target.value})}
                              className="form-input"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={sendImmediateNotification}
                    disabled={loading || !immediateForm.title.trim() || !immediateForm.body.trim()}
                    className="submit-btn"
                  >
                    {loading ? (
                      <>
                        <Loader2 size={16} className="spin" />
                        {immediateForm.scheduled ? 'Programmazione...' : 'Invio...'}
                      </>
                    ) : (
                      <>
                        <Send size={16} />
                        {immediateForm.scheduled ? 'Programma Notifica' : 'Invia Notifica'}
                      </>
                    )}
                  </button>
                </div>

                <div className="preview">
                  <h3 className="preview-title">Anteprima</h3>
                  <div className="preview-card">
                    <div className="preview-notification">
                      <div className="preview-icon">
                        <Bell size={16} />
                      </div>
                      <div className="preview-content">
                        <div className="preview-title-text">
                          {immediateForm.title || 'Titolo Notifica'}
                        </div>
                        <div className="preview-body-text">
                          {immediateForm.body || 'Il tuo messaggio apparirà qui...'}
                        </div>
                        <div className="preview-meta">Dandy App • Ora</div>
                      </div>
                    </div>
                  </div>

                  <div className="preview-info">
                    <div><strong>Destinatari:</strong> {getTargetDescription(immediateForm.target)}</div>
                    <div><strong>Portata stimata:</strong> {getEstimatedReach(immediateForm.target)}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'automated' && (
            <div>
              <h2 className="section-title">Regole Automatiche</h2>

              <div className="info-box">
                <strong>ℹ️ Le regole automatiche vengono eseguite dai server Firebase:</strong><br/>
                • Compleanni: ogni giorno alle 6:30<br/>
                • Le notifiche vengono inviate automaticamente agli utenti idonei
              </div>

              <div className="form-grid">
                <div className="form-section">
                  <div className="form-group">
                    <label className="form-label">Tipo Regola</label>
                    <select
                      value={automatedForm.type}
                      onChange={(e) => {
                        const template = templates[e.target.value]
                        if (template) {
                          setAutomatedForm(prev => ({
                            ...prev,
                            type: e.target.value,
                            title: template.title,
                            body: template.body
                          }))
                        }
                      }}
                      className="form-select"
                    >
                      <option value="birthday">Buon Compleanno</option>
                      <option value="reward_available">Caffè Gratuito</option>
                      <option value="inactive_user">Utente Inattivo</option>
                      <option value="special_offer">Offerta Speciale</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Titolo</label>
                    <input
                      type="text"
                      value={automatedForm.title}
                      onChange={(e) => setAutomatedForm({...automatedForm, title: e.target.value})}
                      className="form-input"
                      maxLength={50}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Messaggio</label>
                    <textarea
                      value={automatedForm.body}
                      onChange={(e) => setAutomatedForm({...automatedForm, body: e.target.value})}
                      rows={3}
                      className="form-textarea"
                      maxLength={200}
                    />
                  </div>

                  <div className="checkbox-group">
                    <input
                      type="checkbox"
                      id="enabled"
                      checked={automatedForm.enabled}
                      onChange={(e) => setAutomatedForm({...automatedForm, enabled: e.target.checked})}
                      className="checkbox"
                    />
                    <label htmlFor="enabled" className="checkbox-label">Abilita questa regola</label>
                  </div>

                  <button
                    onClick={saveAutomatedRule}
                    disabled={loading || !automatedForm.title.trim() || !automatedForm.body.trim()}
                    className="submit-btn"
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

                <div className="rules-section">
                  <h3 className="preview-title">Regole Esistenti ({automatedRules.length})</h3>
                  <div className="rules-list">
                    {automatedRules.map(rule => (
                      <div key={rule.id} className="rule-card">
                        <div className="rule-header">
                          <div className="rule-content">
                            <div className="rule-title-row">
                              <span className="rule-title">{rule.title}</span>
                              <span className={`badge ${rule.enabled ? 'active' : 'disabled'}`}>
                                {rule.enabled ? 'Attivo' : 'Disabilitato'}
                              </span>
                            </div>
                            <div className="rule-body">{rule.body}</div>
                            <div className="rule-meta">
                              Tipo: {rule.type} • Inviate: {rule.totalSent || 0} volte
                            </div>
                          </div>
                          <div className="rule-actions">
                            <button
                              onClick={() => toggleRule(rule.id, rule.enabled)}
                              className={`rule-toggle ${rule.enabled ? 'disable' : 'enable'}`}
                            >
                              {rule.enabled ? 'Disabilita' : 'Abilita'}
                            </button>
                            <button
                              onClick={() => deleteRule(rule.id)}
                              className="rule-delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {automatedRules.length === 0 && (
                    <div className="empty-state">
                      <Clock size={48} />
                      <p>Nessuna regola automatica creata</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div>
              <h2 className="section-title">Cronologia ({notificationHistory.length})</h2>

              {notificationHistory.length > 0 && (
                <div className="history-stats">
                  <div className="stat-item">
                    <span className="stat-label">Totale</span>
                    <span className="stat-value">{notificationHistory.length}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Raggiunti</span>
                    <span className="stat-value">
                      {notificationHistory.reduce((acc, n) => acc + (n.successCount || 0), 0)}
                    </span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Successo</span>
                    <span className="stat-value">
                      {Math.round((notificationHistory.filter(n => n.status === 'delivered').length / notificationHistory.length) * 100)}%
                    </span>
                  </div>
                </div>
              )}

              <div className="history-list">
                {notificationHistory.map(notification => (
                  <div key={notification.id} className="history-card">
                    <div className="history-header">
                      <div className="history-content">
                        <div className="history-title-row">
                          <span className="history-title">{notification.title}</span>
                          <span className={`badge ${notification.type}`}>
                            {notification.type === 'immediate' ? 'Immediata' : 'Automatica'}
                          </span>
                        </div>
                        <div className="history-body">{notification.body}</div>
                        <div className="history-meta">
                          {notification.successCount && (
                            <span>✅ {notification.successCount} utenti • </span>
                          )}
                          📅 {new Date(notification.createdAt).toLocaleString('it-IT')}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setActiveTab('immediate')
                          setImmediateForm({
                            title: notification.title,
                            body: notification.body,
                            target: notification.target || 'all',
                            clickAction: notification.clickAction || '/profile',
                            scheduled: false,
                            scheduledDate: '',
                            scheduledTime: ''
                          })
                        }}
                        className="history-duplicate"
                        title="Duplica"
                      >
                        <Edit size={14} />
                      </button>
                    </div>
                  </div>
                ))}

                {notificationHistory.length === 0 && (
                  <div className="empty-state">
                    <Bell size={48} />
                    <p>Nessuna notifica inviata</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="quick-actions">
        {quickActions.map(action => {
          const IconComponent = action.icon
          return (
            <div key={action.id} className={`quick-card ${action.color}`}>
              <div className="quick-header">
                <div className="quick-info">
                  <div className="quick-label">{action.label}</div>
                  <div className="quick-number">{action.count}</div>
                </div>
                <IconComponent size={32} className="quick-icon" />
              </div>
              <button
                className="quick-btn"
                onClick={action.action}
                disabled={action.id === 'birthday' && action.count === 0}
              >
                {action.id === 'birthday' && action.count === 0 ? 'Nessun Compleanno' :
                 action.id === 'birthday' ? 'Invia Auguri' :
                 action.id === 'reward' ? 'Notifica Caffè' : 'Offerta Ritorno'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

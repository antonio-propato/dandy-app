// src/components/NotificationPanel.jsx
import React, { useState, useEffect } from 'react'
import { Bell, Send, Calendar, Users, Gift, Star, Clock, CheckCircle, AlertTriangle } from 'lucide-react'
import { collection, getDocs, addDoc, query, where, orderBy, limit, updateDoc, doc } from 'firebase/firestore'
import { firestore } from '../lib/firebase'
import './NotificationPanel.css'

export default function NotificationPanel() {
  const [activeTab, setActiveTab] = useState('immediate')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [userStats, setUserStats] = useState({ total: 0, withTokens: 0 })
  const [notificationHistory, setNotificationHistory] = useState([])
  const [automatedRules, setAutomatedRules] = useState([])

  // Immediate notification state
  const [immediateForm, setImmediateForm] = useState({
    title: '',
    body: '',
    target: 'all', // all, customers, birthday_today
    clickAction: '/profile'
  })

  // Automated notification state
  const [automatedForm, setAutomatedForm] = useState({
    type: 'birthday',
    title: 'Buon Compleanno! 🎉',
    body: 'Tanti auguri da tutto il team Dandy! Oggi è il tuo giorno speciale.',
    clickAction: '/profile',
    enabled: true
  })

  useEffect(() => {
    loadUserStats()
    loadNotificationHistory()
    loadAutomatedRules()
  }, [])

  const loadUserStats = async () => {
    try {
      const usersSnapshot = await getDocs(collection(firestore, 'users'))
      const users = usersSnapshot.docs.map(doc => doc.data())

      const total = users.filter(u => u.role !== 'superuser').length
      const withTokens = users.filter(u => u.role !== 'superuser' && u.fcmTokens?.length > 0).length

      setUserStats({ total, withTokens })
    } catch (error) {
      console.error('Error loading user stats:', error)
    }
  }

  const loadNotificationHistory = async () => {
    try {
      const q = query(
        collection(firestore, 'notifications'),
        orderBy('createdAt', 'desc'),
        limit(20)
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
  }

  const loadAutomatedRules = async () => {
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
  }

  const sendImmediateNotification = async () => {
    if (!immediateForm.title || !immediateForm.body) {
      setMessage('Titolo e messaggio sono richiesti')
      return
    }

    setLoading(true)
    try {
      // Get target users
      let targetUsers = []
      const usersSnapshot = await getDocs(collection(firestore, 'users'))
      const allUsers = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))

      switch (immediateForm.target) {
        case 'all':
          targetUsers = allUsers.filter(u => u.role !== 'superuser' && u.fcmTokens?.length > 0)
          break
        case 'customers':
          targetUsers = allUsers.filter(u => u.role === 'customer' && u.fcmTokens?.length > 0)
          break
        case 'birthday_today':
          const today = new Date()
          const todayStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}`
          targetUsers = allUsers.filter(u =>
            u.role !== 'superuser' &&
            u.fcmTokens?.length > 0 &&
            u.dob === todayStr
          )
          break
      }

      if (targetUsers.length === 0) {
        setMessage('Nessun utente trovato per i criteri selezionati')
        setLoading(false)
        return
      }

      // Save notification to Firestore - this will trigger the Cloud Function
      const notificationDoc = await addDoc(collection(firestore, 'notifications'), {
        type: 'immediate',
        title: immediateForm.title,
        body: immediateForm.body,
        target: immediateForm.target,
        clickAction: immediateForm.clickAction,
        targetCount: targetUsers.length,
        createdAt: new Date().toISOString(),
        status: 'pending'
      })

      setMessage(`Notifica inviata con successo a ${targetUsers.length} utenti!`)
      setImmediateForm({
        title: '',
        body: '',
        target: 'all',
        clickAction: '/profile'
      })

      // Reload history
      loadNotificationHistory()
    } catch (error) {
      console.error('Error sending notification:', error)
      setMessage('Errore nell\'invio della notifica')
    } finally {
      setLoading(false)
    }
  }

  const saveAutomatedRule = async () => {
    if (!automatedForm.title || !automatedForm.body) {
      setMessage('Titolo e messaggio sono richiesti')
      return
    }

    setLoading(true)
    try {
      await addDoc(collection(firestore, 'automatedNotifications'), {
        ...automatedForm,
        createdAt: new Date().toISOString(),
        lastTriggered: null,
        totalSent: 0
      })

      setMessage('Regola automatica salvata con successo!')
      loadAutomatedRules()
    } catch (error) {
      console.error('Error saving automated rule:', error)
      setMessage('Errore nel salvataggio della regola automatica')
    } finally {
      setLoading(false)
    }
  }

  const toggleAutomatedRule = async (ruleId, currentStatus) => {
    try {
      await updateDoc(doc(firestore, 'automatedNotifications', ruleId), {
        enabled: !currentStatus
      })
      loadAutomatedRules()
    } catch (error) {
      console.error('Error toggling rule:', error)
    }
  }

  const getTargetDescription = (target) => {
    switch (target) {
      case 'all': return 'Tutti gli utenti'
      case 'customers': return 'Solo clienti'
      case 'birthday_today': return 'Compleanni di oggi'
      default: return target
    }
  }

  // Clear message after 5 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 5000)
      return () => clearTimeout(timer)
    }
  }, [message])

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
              </h1>
              <p className="notification-subtitle">Gestisci le notifiche push per i tuoi clienti</p>
            </div>
            <div className="notification-stats">
              <div className="stats-label">Utenti Totali</div>
              <div className="stats-number">{userStats.total}</div>
              <div className="stats-sub">{userStats.withTokens} con notifiche abilitate</div>
            </div>
          </div>
        </div>

        {/* Status Message */}
        {message && (
          <div className={`notification-message ${
            message.includes('Errore') ? 'error' : 'success'
          }`}>
            {message}
          </div>
        )}

        {/* Tabs */}
        <div className="notification-card">
          <div className="notification-tabs">
            <nav className="notification-tabs-nav">
              {[
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
                      />
                    </div>

                    <div className="notification-form-group">
                      <label className="notification-form-label">Messaggio</label>
                      <textarea
                        value={immediateForm.body}
                        onChange={(e) => setImmediateForm({...immediateForm, body: e.target.value})}
                        rows={4}
                        className="notification-form-textarea"
                        placeholder="Il tuo messaggio di notifica..."
                      />
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
                      </select>
                    </div>

                    <button
                      onClick={sendImmediateNotification}
                      disabled={loading}
                      className="notification-btn notification-btn-primary"
                    >
                      <Send size={16} />
                      {loading ? 'Invio...' : 'Invia Notifica'}
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
                        <strong>Portata stimata:</strong> {
                          immediateForm.target === 'all' ? `${userStats.withTokens} utenti` :
                          immediateForm.target === 'customers' ? `${Math.max(0, userStats.withTokens - 1)} utenti` :
                          'Utenti compleanno oggi'
                        }
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Automated Rules Tab */}
            {activeTab === 'automated' && (
              <div>
                <h3 className="tab-section-title">Crea Regola Automatica</h3>

                <div className="notification-rules-grid">
                  <div className="notification-form-section">
                    <div className="notification-form-group">
                      <label className="notification-form-label">Tipo Regola</label>
                      <select
                        value={automatedForm.type}
                        onChange={(e) => {
                          const templates = {
                            birthday: {
                              title: 'Buon Compleanno! 🎉',
                              body: 'Tanti auguri da tutto il team Dandy! Oggi è il tuo giorno speciale.'
                            },
                            stamp_milestone: {
                              title: 'Quasi al traguardo! ⭐',
                              body: 'Ti mancano solo 2 timbri per ottenere il tuo caffè gratuito!'
                            },
                            reward_available: {
                              title: 'Ricompensa disponibile! 🎁',
                              body: 'Hai raggiunto 10 timbri! Vieni a ritirare il tuo caffè gratuito.'
                            },
                            inactive_user: {
                              title: 'Ti mancano! 😢',
                              body: 'Non ti vediamo da un po\'... Vieni a trovarci per un caffè speciale!'
                            }
                          }
                          const template = templates[e.target.value]
                          setAutomatedForm({
                            ...automatedForm,
                            type: e.target.value,
                            title: template.title,
                            body: template.body
                          })
                        }}
                        className="notification-form-select"
                      >
                        <option value="birthday">Auguri Compleanno</option>
                        <option value="stamp_milestone">Traguardo Timbri</option>
                        <option value="reward_available">Ricompensa Disponibile</option>
                        <option value="inactive_user">Utente Inattivo</option>
                      </select>
                    </div>

                    <div className="notification-form-group">
                      <label className="notification-form-label">Titolo</label>
                      <input
                        type="text"
                        value={automatedForm.title}
                        onChange={(e) => setAutomatedForm({...automatedForm, title: e.target.value})}
                        className="notification-form-input"
                      />
                    </div>

                    <div className="notification-form-group">
                      <label className="notification-form-label">Messaggio</label>
                      <textarea
                        value={automatedForm.body}
                        onChange={(e) => setAutomatedForm({...automatedForm, body: e.target.value})}
                        rows={3}
                        className="notification-form-textarea"
                      />
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

                    <div className="notification-info-box">
                      <div className="notification-info-text">
                        <strong>Info Trigger:</strong>
                        {automatedForm.type === 'birthday' && ' Eseguito giornalmente alle 9:00 per utenti con compleanno oggi'}
                        {automatedForm.type === 'stamp_milestone' && ' Eseguito giornalmente per utenti con 8-9 timbri'}
                        {automatedForm.type === 'reward_available' && ' Eseguito giornalmente per utenti con 10+ timbri non riscattati'}
                        {automatedForm.type === 'inactive_user' && ' Eseguito settimanalmente per utenti inattivi da 30+ giorni'}
                      </div>
                    </div>

                    <button
                      onClick={saveAutomatedRule}
                      disabled={loading}
                      className="notification-btn notification-btn-success"
                    >
                      {loading ? 'Salvataggio...' : 'Salva Regola'}
                    </button>
                  </div>

                  <div className="notification-rules-section">
                    <h4 className="notification-preview-title">Regole Esistenti</h4>
                    {automatedRules.map(rule => (
                      <div key={rule.id} className="notification-rule-card">
                        <div className="notification-rule-header">
                          <div className="notification-rule-content">
                            <div className="notification-rule-title-row">
                              <span className="notification-rule-title">{rule.title}</span>
                              <span className={`notification-badge ${rule.enabled ? 'active' : 'disabled'}`}>
                                {rule.enabled ? 'Attivo' : 'Disabilitato'}
                              </span>
                            </div>
                            <div className="notification-rule-body">{rule.body}</div>
                            <div className="notification-rule-meta">
                              Tipo: {rule.type} • Inviate: {rule.totalSent || 0} volte
                            </div>
                          </div>
                          <button
                            onClick={() => toggleAutomatedRule(rule.id, rule.enabled)}
                            className={`notification-rule-toggle ${rule.enabled ? 'disable' : 'enable'}`}
                          >
                            {rule.enabled ? 'Disabilita' : 'Abilita'}
                          </button>
                        </div>
                      </div>
                    ))}

                    {automatedRules.length === 0 && (
                      <div className="notification-empty">
                        <Clock size={48} className="notification-empty-icon" />
                        <p className="notification-empty-text">Nessuna regola automatica creata</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* History Tab */}
            {activeTab === 'history' && (
              <div>
                <h3 className="tab-section-title">Cronologia Notifiche</h3>
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
                              <span>Consegnata a {notification.successCount} utenti • </span>
                            )}
                            Destinatari: {getTargetDescription(notification.target)} •
                            {new Date(notification.createdAt).toLocaleString('it-IT')}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {notificationHistory.length === 0 && (
                    <div className="notification-empty">
                      <Bell size={48} className="notification-empty-icon" />
                      <p className="notification-empty-text">Nessuna notifica inviata ancora</p>
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
                <div className="notification-quick-number">
                  {Math.floor(Math.random() * 5)}
                </div>
              </div>
              <Gift size={32} className="notification-quick-icon" />
            </div>
            <button
              className="notification-quick-btn"
              onClick={() => {
                setActiveTab('immediate')
                setImmediateForm({
                  ...immediateForm,
                  target: 'birthday_today',
                  title: 'Buon Compleanno! 🎉',
                  body: 'Tanti auguri da tutto il team Dandy! Oggi è il tuo giorno speciale.'
                })
              }}
            >
              Invia Auguri
            </button>
          </div>

          <div className="notification-quick-card green">
            <div className="notification-quick-header">
              <div className="notification-quick-info">
                <div className="notification-quick-label">Vicini al Premio</div>
                <div className="notification-quick-number">
                  {Math.floor(Math.random() * 10)}
                </div>
              </div>
              <Star size={32} className="notification-quick-icon" />
            </div>
            <button
              className="notification-quick-btn"
              onClick={() => {
                setActiveTab('immediate')
                setImmediateForm({
                  ...immediateForm,
                  title: 'Quasi al traguardo! ⭐',
                  body: 'Ti mancano solo pochi timbri per il tuo caffè gratuito! Vieni a trovarci.'
                })
              }}
            >
              Incoraggia Visite
            </button>
          </div>

          <div className="notification-quick-card purple">
            <div className="notification-quick-header">
              <div className="notification-quick-info">
                <div className="notification-quick-label">Utenti Inattivi</div>
                <div className="notification-quick-number">
                  {Math.floor(Math.random() * 15)}
                </div>
              </div>
              <Users size={32} className="notification-quick-icon" />
            </div>
            <button
              className="notification-quick-btn"
              onClick={() => {
                setActiveTab('immediate')
                setImmediateForm({
                  ...immediateForm,
                  title: 'Ti mancano! 😢',
                  body: 'Non ti vediamo da un po\'... Torna per un caffè speciale con il 20% di sconto!'
                })
              }}
            >
              Offerta Ritorno
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

import React, { useState, useEffect } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { firestore } from '../lib/firebase'
import Nav from '../components/Nav'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faPlus,
  faTrash,
  faEdit,
  faSave,
  faTimes,
  faCheck,
  faXmark,
  faTable
} from '@fortawesome/free-solid-svg-icons'
import './Tables.css'

export default function Tables() {
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newTableNumber, setNewTableNumber] = useState('')
  const [showAddTable, setShowAddTable] = useState(false)
  const [editingTable, setEditingTable] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [showCustomAlert, setShowCustomAlert] = useState(null)

  useEffect(() => {
    fetchTables()
  }, [])

  const customConfirm = (message, title = 'Conferma') => {
    return new Promise((resolve) => {
      setShowCustomAlert({
        title,
        message,
        onConfirm: () => {
          setShowCustomAlert(null)
          resolve(true)
        },
        onCancel: () => {
          setShowCustomAlert(null)
          resolve(false)
        }
      })
    })
  }

  const customAlert = (message, title = 'Attenzione') => {
    return new Promise((resolve) => {
      setShowCustomAlert({
        title,
        message,
        onConfirm: () => {
          setShowCustomAlert(null)
          resolve(true)
        },
        isAlert: true
      })
    })
  }

  const fetchTables = async () => {
    try {
      const tablesDoc = await getDoc(doc(firestore, 'settings', 'tables'))
      if (tablesDoc.exists()) {
        const data = tablesDoc.data()
        setTables(data.tableNumbers || [])
      } else {
        // Create default table numbers if document doesn't exist
        const defaultTables = ['1', '2', '3', '4', '5']
        setTables(defaultTables)
        await saveTables(defaultTables)
      }
    } catch (error) {
      console.error('Error fetching tables:', error)
      await customAlert('Errore nel caricare i tavoli. Riprova.', 'Errore')
    } finally {
      setLoading(false)
    }
  }

  const saveTables = async (tableList = tables) => {
    setSaving(true)
    try {
      await setDoc(doc(firestore, 'settings', 'tables'), {
        tableNumbers: tableList,
        lastUpdated: new Date()
      })
      console.log('Tables saved successfully')
    } catch (error) {
      console.error('Error saving tables:', error)
      await customAlert('Errore nel salvare i tavoli. Riprova.', 'Errore di Salvataggio')
    } finally {
      setSaving(false)
    }
  }

  const addTable = async () => {
    if (!newTableNumber.trim()) {
      await customAlert('Inserisci il numero del tavolo')
      return
    }

    const tableNumber = newTableNumber.trim()

    if (tables.includes(tableNumber)) {
      await customAlert('Questo numero di tavolo esiste già')
      return
    }

    const updatedTables = [...tables, tableNumber].sort((a, b) => {
      // Try to sort numerically if possible, otherwise alphabetically
      const numA = parseInt(a)
      const numB = parseInt(b)
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB
      }
      return a.localeCompare(b)
    })

    setTables(updatedTables)
    setNewTableNumber('')
    setShowAddTable(false)
    await saveTables(updatedTables)
  }

  const removeTable = async (tableNumber) => {
    const confirmed = await customConfirm(
      `Eliminare il tavolo "${tableNumber}"?`,
      'Elimina Tavolo'
    )

    if (confirmed) {
      const updatedTables = tables.filter(table => table !== tableNumber)
      setTables(updatedTables)
      await saveTables(updatedTables)
    }
  }

  const startEdit = (tableNumber) => {
    setEditingTable(tableNumber)
    setEditValue(tableNumber)
  }

  const saveEdit = async () => {
    if (!editValue.trim()) {
      await customAlert('Inserisci il numero del tavolo')
      return
    }

    const newTableNumber = editValue.trim()

    if (newTableNumber !== editingTable && tables.includes(newTableNumber)) {
      await customAlert('Questo numero di tavolo esiste già')
      return
    }

    const updatedTables = tables.map(table =>
      table === editingTable ? newTableNumber : table
    ).sort((a, b) => {
      const numA = parseInt(a)
      const numB = parseInt(b)
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB
      }
      return a.localeCompare(b)
    })

    setTables(updatedTables)
    setEditingTable(null)
    setEditValue('')
    await saveTables(updatedTables)
  }

  const cancelEdit = () => {
    setEditingTable(null)
    setEditValue('')
  }

  if (loading) {
    return (
      <div className="tables-container">
        <Nav />
        <div className="tables-loading">
          <div className="loading-spinner"></div>
          <p>Caricamento tavoli...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="tables-container">
      <Nav />

      <div className="tables-content">
        <div className="tables-header">
          <h1>
            <FontAwesomeIcon icon={faTable} />
            Gestione Tavoli
          </h1>
          <p>Aggiungi, modifica o rimuovi i numeri dei tavoli disponibili nel locale.</p>
        </div>

        <div className="add-table-section">
          {!showAddTable ? (
            <button
              onClick={() => setShowAddTable(true)}
              className="add-table-btn"
            >
              <FontAwesomeIcon icon={faPlus} />
              Aggiungi Tavolo
            </button>
          ) : (
            <div className="add-table-form">
              <input
                type="text"
                value={newTableNumber}
                onChange={(e) => setNewTableNumber(e.target.value)}
                placeholder="Numero tavolo (es. 1, A1, VIP1)"
                onKeyPress={(e) => e.key === 'Enter' && addTable()}
                className="table-input"
                autoFocus
              />
              <div className="form-buttons">
                <button onClick={addTable} className="save-btn">
                  <FontAwesomeIcon icon={faCheck} />
                </button>
                <button
                  onClick={() => {
                    setShowAddTable(false)
                    setNewTableNumber('')
                  }}
                  className="cancel-btn"
                >
                  <FontAwesomeIcon icon={faXmark} />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="tables-grid">
          {tables.length === 0 ? (
            <div className="no-tables">
              <p>Nessun tavolo configurato</p>
              <p>Aggiungi il primo numero di tavolo per iniziare</p>
            </div>
          ) : (
            tables.map((tableNumber) => (
              <div key={tableNumber} className="table-card">
                {editingTable === tableNumber ? (
                  <div className="table-edit">
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && saveEdit()}
                      className="table-input"
                      autoFocus
                    />
                    <div className="table-actions">
                      <button onClick={saveEdit} className="save-btn">
                        <FontAwesomeIcon icon={faCheck} />
                      </button>
                      <button onClick={cancelEdit} className="cancel-btn">
                        <FontAwesomeIcon icon={faXmark} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="table-display">
                    <div className="table-number">
                      <FontAwesomeIcon icon={faTable} />
                      <span>Tavolo {tableNumber}</span>
                    </div>
                    <div className="table-actions">
                      <button
                        onClick={() => startEdit(tableNumber)}
                        className="edit-btn"
                        title="Modifica"
                      >
                        <FontAwesomeIcon icon={faEdit} />
                      </button>
                      <button
                        onClick={() => removeTable(tableNumber)}
                        className="delete-btn"
                        title="Elimina"
                      >
                        <FontAwesomeIcon icon={faTrash} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="tables-summary">
          <p>
            <strong>Totale tavoli configurati: {tables.length}</strong>
          </p>
          <p className="info-text">
            I numeri dei tavoli verranno mostrati nel menu a tendina quando i clienti ordinano "Al Tavolo".
          </p>
        </div>

        {saving && (
          <div className="saving-indicator">
            <FontAwesomeIcon icon={faSave} spin />
            Salvando...
          </div>
        )}
      </div>

      {/* Custom Alert Modal */}
      {showCustomAlert && (
        <div className="alert-overlay">
          <div className="alert-modal">
            <h3>{showCustomAlert.title}</h3>
            <p>{showCustomAlert.message}</p>
            <div className="alert-buttons">
              <button onClick={showCustomAlert.onConfirm} className="confirm-btn">
                {showCustomAlert.isAlert ? 'OK' : 'Conferma'}
              </button>
              {!showCustomAlert.isAlert && (
                <button onClick={showCustomAlert.onCancel} className="cancel-btn">
                  Annulla
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

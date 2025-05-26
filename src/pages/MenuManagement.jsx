// src/pages/MenuManagement.jsx - Streamlined and compact design
import React, { useState, useEffect, useRef } from 'react'
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
  faChevronUp,
  faChevronDown,
  faGripVertical,
  faEye,
  faEyeSlash
} from '@fortawesome/free-solid-svg-icons'
import './MenuManagement.css'

export default function MenuManagement() {
  const [menuData, setMenuData] = useState({})
  const [categoryOrder, setCategoryOrder] = useState([])
  const [collapsedCategories, setCollapsedCategories] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [newItem, setNewItem] = useState({ name: '', price: '€' })
  const [addingToCategory, setAddingToCategory] = useState(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [draggedCategory, setDraggedCategory] = useState(null)
  const [draggedItem, setDraggedItem] = useState(null)
  const [showCustomAlert, setShowCustomAlert] = useState(null)

  // Custom alert/confirm function
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

  useEffect(() => {
    fetchMenuData()
  }, [])

  const fetchMenuData = async () => {
    try {
      const menuDoc = await getDoc(doc(firestore, 'settings', 'menu'))
      if (menuDoc.exists()) {
        const data = menuDoc.data()
        setMenuData(data.items || getDefaultMenuData())
        setCategoryOrder(data.categoryOrder || Object.keys(data.items || getDefaultMenuData()))
      } else {
        const defaultMenu = getDefaultMenuData()
        const defaultOrder = Object.keys(defaultMenu)
        setMenuData(defaultMenu)
        setCategoryOrder(defaultOrder)
        await saveMenuData(defaultMenu, defaultOrder)
      }
    } catch (error) {
      console.error('Error fetching menu data:', error)
      const defaultMenu = getDefaultMenuData()
      setMenuData(defaultMenu)
      setCategoryOrder(Object.keys(defaultMenu))
    } finally {
      setLoading(false)
    }
  }

  const getDefaultMenuData = () => {
    return {
      Caffetteria: [
        { name: 'Espresso', price: '€0.90' },
        { name: 'Doppio Espresso', price: '€1.00' },
        { name: "Caffè Orzo", price: '€1.20' },
        { name: 'Latte Macchiato', price: '€1.50' },
        { name: 'Cioccolata Calda', price: '€2.00' },
        { name: 'Tè Verde', price: '€1.50' },
        { name: 'Tè Nero', price: '€1.50' },
        { name: 'Tè alla Pesca', price: '€1.50' },
        { name: 'Tè al Limone', price: '€1.50' },
        { name: 'Cappuccino', price: '€1.50' }
      ],
      Cornetteria: [
        { name: 'Vuoto', price: '€1.00' },
        { name: 'Vegano', price: '€1.20' },
        { name: 'Crema', price: '€1.50' },
        { name: 'Marmellata', price: '€1.50' },
        { name: 'Cioccolato', price: '€1.50' },
        { name: 'Pistacchio', price: '€1.50' }
      ],
      Alcolici: [
        { name: 'Birra', price: '€1.50' },
        { name: 'Aperol Spritz', price: '€5.00' },
        { name: 'Negroni', price: '€5.00' },
        { name: 'Gin Tonic', price: '€5.00' },
        { name: 'Rum Cola', price: '€5.00' },
        { name: 'Mojito', price: '€5.00' },
        { name: 'Bellini', price: '€5.00' },
        { name: 'Bloody Mary', price: '€5.00' },
        { name: 'Shot Rum', price: '€3.00/€5.00' },
        { name: 'Shot Vodka', price: '€3.00/€5.00' },
        { name: 'Shot Gin', price: '€3.00/€5.00' },
        { name: 'Shot Tequila', price: '€3.00/€5.00' }
      ]
    }
  }

  const saveMenuData = async (data = menuData, order = categoryOrder) => {
    setSaving(true)
    try {
      await setDoc(doc(firestore, 'settings', 'menu'), {
        items: data,
        categoryOrder: order,
        lastUpdated: new Date()
      })
      console.log('Menu saved successfully')
    } catch (error) {
      console.error('Error saving menu data:', error)
      await customAlert('Errore nel salvare il menu. Riprova.', 'Errore di Salvataggio')
    } finally {
      setSaving(false)
    }
  }

  const formatPrice = (price) => {
    if (!price || price === '€') return '€'
    const cleanPrice = price.replace(/[^\d.,]/g, '')
    if (!cleanPrice) return '€'
    const formattedPrice = cleanPrice.replace(',', '.')
    // Ensure always has decimals
    const number = parseFloat(formattedPrice)
    if (isNaN(number)) return '€'
    return `€${number.toFixed(2)}`
  }

  const formatItemName = (name) => {
    if (!name) return ''
    // Capitalize first letter and keep the rest as entered
    return name.charAt(0).toUpperCase() + name.slice(1)
  }

  const toggleCategoryCollapse = (category) => {
    setCollapsedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }))
  }

  const addCategory = async () => {
    if (!newCategoryName.trim()) {
      await customAlert('Inserisci il nome della categoria')
      return
    }
    if (menuData[newCategoryName]) {
      await customAlert('Categoria già esistente')
      return
    }
    const updatedMenu = { ...menuData, [newCategoryName]: [] }
    const updatedOrder = [...categoryOrder, newCategoryName]
    setMenuData(updatedMenu)
    setCategoryOrder(updatedOrder)
    setNewCategoryName('')
    setShowAddCategory(false)
    await saveMenuData(updatedMenu, updatedOrder)
  }

  const removeCategory = async (category) => {
    console.log('Attempting to remove category:', category)
    try {
      const confirmed = await customConfirm(
        `Eliminare la categoria "${category}" e tutti i suoi elementi?`,
        'Elimina Categoria'
      )
      console.log('User confirmation:', confirmed)
      if (confirmed) {
        const updatedMenu = { ...menuData }
        delete updatedMenu[category]
        const updatedOrder = categoryOrder.filter(c => c !== category)
        console.log('Updated menu:', updatedMenu)
        console.log('Updated order:', updatedOrder)
        setMenuData(updatedMenu)
        setCategoryOrder(updatedOrder)
        await saveMenuData(updatedMenu, updatedOrder)
      }
    } catch (error) {
      console.error('Error in removeCategory:', error)
      await customAlert('Errore durante l\'eliminazione della categoria', 'Errore')
    }
  }

  const addItem = async (category) => {
    if (!newItem.name.trim() || !newItem.price.trim()) {
      alert('Inserisci nome e prezzo')
      return
    }
    const formattedItem = {
      name: formatItemName(newItem.name.trim()),
      price: formatPrice(newItem.price)
    }
    const updatedMenu = {
      ...menuData,
      [category]: [formattedItem, ...(menuData[category] || [])]
    }
    setMenuData(updatedMenu)
    setNewItem({ name: '', price: '€' })
    setAddingToCategory(null)
    await saveMenuData(updatedMenu, categoryOrder)
  }

  const removeItem = async (category, index) => {
    if (window.confirm('Eliminare questo elemento?')) {
      const updatedMenu = {
        ...menuData,
        [category]: menuData[category].filter((_, i) => i !== index)
      }
      setMenuData(updatedMenu)
      await saveMenuData(updatedMenu, categoryOrder)
    }
  }

  const moveItem = async (category, fromIndex, toIndex) => {
    const items = [...menuData[category]]
    const [movedItem] = items.splice(fromIndex, 1)
    items.splice(toIndex, 0, movedItem)

    const updatedMenu = { ...menuData, [category]: items }
    setMenuData(updatedMenu)
    await saveMenuData(updatedMenu, categoryOrder)
  }

  const moveItemUp = async (category, index) => {
    if (index > 0) {
      await moveItem(category, index, index - 1)
    }
  }

  const moveItemDown = async (category, index) => {
    if (index < menuData[category].length - 1) {
      await moveItem(category, index, index + 1)
    }
  }

  const moveCategoryUp = async (category) => {
    const currentIndex = categoryOrder.indexOf(category)
    if (currentIndex > 0) {
      const newOrder = [...categoryOrder]
      newOrder.splice(currentIndex, 1)
      newOrder.splice(currentIndex - 1, 0, category)
      setCategoryOrder(newOrder)
      await saveMenuData(menuData, newOrder)
    }
  }

  const moveCategoryDown = async (category) => {
    const currentIndex = categoryOrder.indexOf(category)
    if (currentIndex < categoryOrder.length - 1) {
      const newOrder = [...categoryOrder]
      newOrder.splice(currentIndex, 1)
      newOrder.splice(currentIndex + 1, 0, category)
      setCategoryOrder(newOrder)
      await saveMenuData(menuData, newOrder)
    }
  }

  const startEdit = (category, index) => {
    setEditingItem({
      category,
      index,
      name: menuData[category][index].name,
      price: menuData[category][index].price
    })
  }

  const saveEdit = async () => {
    if (!editingItem.name.trim() || !editingItem.price.trim()) {
      await customAlert('Inserisci nome e prezzo')
      return
    }
    const updatedMenu = {
      ...menuData,
      [editingItem.category]: menuData[editingItem.category].map((item, i) =>
        i === editingItem.index
          ? {
              name: formatItemName(editingItem.name.trim()),
              price: formatPrice(editingItem.price)
            }
          : item
      )
    }
    setMenuData(updatedMenu)
    setEditingItem(null)
    await saveMenuData(updatedMenu, categoryOrder)
  }

  // Drag and Drop handlers
  const handleCategoryDragStart = (e, category) => {
    setDraggedCategory(category)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleCategoryDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleCategoryDrop = async (e, targetCategory) => {
    e.preventDefault()
    if (!draggedCategory || draggedCategory === targetCategory) return

    const dragIndex = categoryOrder.indexOf(draggedCategory)
    const dropIndex = categoryOrder.indexOf(targetCategory)

    const newOrder = [...categoryOrder]
    newOrder.splice(dragIndex, 1)
    newOrder.splice(dropIndex, 0, draggedCategory)

    setCategoryOrder(newOrder)
    setDraggedCategory(null)
    await saveMenuData(menuData, newOrder)
  }

  const handleItemDragStart = (e, category, index) => {
    setDraggedItem({ category, index })
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleItemDrop = async (e, targetCategory, targetIndex) => {
    e.preventDefault()
    if (!draggedItem) return

    const { category: sourceCategory, index: sourceIndex } = draggedItem

    if (sourceCategory === targetCategory) {
      await moveItem(sourceCategory, sourceIndex, targetIndex)
    }

    setDraggedItem(null)
  }

  if (loading) {
    return (
      <div className="menu-management-container">
        <Nav />
        <div className="menu-management-content">
          <h1>Caricamento...</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="menu-management-container">
      <Nav />
      <div className="menu-management-content">
        <div className="menu-management-header">
          <h1>Gestione Menu Clienti</h1>
          <p>Trascina le categorie e gli elementi per riordinarli. Clicca l'occhio per comprimere.</p>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              onClick={() => setShowAddCategory(true)}
              disabled={showAddCategory}
              className="add-btn"
            >
              <FontAwesomeIcon icon={faPlus} /> Aggiungi Categoria
            </button>
          </div>
        </div>

        {showAddCategory && (
          <div className="category-card add-category-card">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Nome categoria"
              onKeyPress={(e) => e.key === 'Enter' && addCategory()}
              className="mobile-friendly-input"
            />
            <div className="mobile-button-group">
              <button onClick={addCategory} className="save-btn">
                <FontAwesomeIcon icon={faSave} /> Salva
              </button>
              <button onClick={() => { setShowAddCategory(false); setNewCategoryName('') }} className="cancel-btn">
                <FontAwesomeIcon icon={faTimes} /> Annulla
              </button>
            </div>
          </div>
        )}

        {categoryOrder.map((category, categoryIndex) => (
          menuData[category] && (
            <div
              key={category}
              className="category-card"
              draggable
              onDragStart={(e) => handleCategoryDragStart(e, category)}
              onDragOver={handleCategoryDragOver}
              onDrop={(e) => handleCategoryDrop(e, category)}
            >
              <div className="category-header">
                <div className="category-title-section">
                  <FontAwesomeIcon icon={faGripVertical} className="drag-handle" />
                  <h2>{category}</h2>
                  <div className="category-arrow-controls">
                    <button
                      onClick={() => moveCategoryUp(category)}
                      disabled={categoryIndex === 0}
                      className="arrow-btn"
                      title="Sposta categoria su"
                    >
                      <FontAwesomeIcon icon={faChevronUp} />
                    </button>
                    <button
                      onClick={() => moveCategoryDown(category)}
                      disabled={categoryIndex === categoryOrder.length - 1}
                      className="arrow-btn"
                      title="Sposta categoria giù"
                    >
                      <FontAwesomeIcon icon={faChevronDown} />
                    </button>
                  </div>
                  <button
                    onClick={() => toggleCategoryCollapse(category)}
                    className="collapse-btn"
                    title={collapsedCategories[category] ? "Espandi" : "Comprimi"}
                  >
                    <FontAwesomeIcon icon={collapsedCategories[category] ? faEye : faEyeSlash} />
                  </button>
                </div>
                <div className="category-buttons">
                  <button
                    onClick={() => setAddingToCategory(category)}
                    className="add-btn"
                    disabled={addingToCategory === category}
                  >
                    <FontAwesomeIcon icon={faPlus} /> <span className="btn-text">Aggiungi</span>
                  </button>
                  <button
                    onClick={() => removeCategory(category)}
                    className="delete-btn"
                  >
                    <FontAwesomeIcon icon={faTrash} /> <span className="btn-text">Elimina</span>
                  </button>
                </div>
              </div>

              {!collapsedCategories[category] && (
                <div className="category-content">
                  {addingToCategory === category && (
                    <div className="add-item-form compact-form">
                      <div className="compact-item-row">
                        <input
                          type="text"
                          value={newItem.name}
                          onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                          placeholder="Nome prodotto"
                          className="mobile-friendly-input item-name-input"
                        />
                        <input
                          type="text"
                          value={newItem.price}
                          onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                          onBlur={(e) => setNewItem({ ...newItem, price: formatPrice(e.target.value) })}
                          placeholder="€1.50"
                          className="mobile-friendly-input item-price-input"
                        />
                        <div className="compact-actions">
                          <button onClick={() => addItem(category)} className="save-btn compact-btn">
                            <FontAwesomeIcon icon={faSave} />
                          </button>
                          <button onClick={() => { setAddingToCategory(null); setNewItem({ name: '', price: '€' }) }} className="cancel-btn compact-btn">
                            <FontAwesomeIcon icon={faTimes} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="items-list compact-list">
                    {menuData[category].map((item, index) => (
                      <div
                        key={index}
                        className="menu-item-row compact-item"
                        draggable
                        onDragStart={(e) => handleItemDragStart(e, category, index)}
                        onDragOver={handleCategoryDragOver}
                        onDrop={(e) => handleItemDrop(e, category, index)}
                      >
                        {editingItem && editingItem.category === category && editingItem.index === index ? (
                          <div className="compact-item-row editing">
                            <FontAwesomeIcon icon={faGripVertical} className="drag-handle-small" />
                            <input
                              type="text"
                              value={editingItem.name}
                              onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                              placeholder="Nome"
                              className="mobile-friendly-input item-name-input"
                            />
                            <input
                              type="text"
                              value={editingItem.price}
                              onChange={(e) => setEditingItem({ ...editingItem, price: e.target.value })}
                              onBlur={(e) => setEditingItem({ ...editingItem, price: formatPrice(e.target.value) })}
                              placeholder="€1.50"
                              className="mobile-friendly-input item-price-input"
                            />
                            <div className="compact-arrows">
                              <button
                                onClick={() => moveItemUp(category, index)}
                                disabled={index === 0}
                                className="arrow-btn-small"
                              >
                                <FontAwesomeIcon icon={faChevronUp} />
                              </button>
                              <button
                                onClick={() => moveItemDown(category, index)}
                                disabled={index === menuData[category].length - 1}
                                className="arrow-btn-small"
                              >
                                <FontAwesomeIcon icon={faChevronDown} />
                              </button>
                            </div>
                            <div className="compact-actions">
                              <button onClick={saveEdit} className="save-btn compact-btn">
                                <FontAwesomeIcon icon={faSave} />
                              </button>
                              <button onClick={() => setEditingItem(null)} className="cancel-btn compact-btn">
                                <FontAwesomeIcon icon={faTimes} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="compact-item-row">
                            <FontAwesomeIcon icon={faGripVertical} className="drag-handle-small" />
                            <div className="item-name">{item.name}</div>
                            <div className="item-price">{item.price}</div>
                            <div className="compact-arrows">
                              <button
                                onClick={() => moveItemUp(category, index)}
                                disabled={index === 0}
                                className="arrow-btn-small"
                              >
                                <FontAwesomeIcon icon={faChevronUp} />
                              </button>
                              <button
                                onClick={() => moveItemDown(category, index)}
                                disabled={index === menuData[category].length - 1}
                                className="arrow-btn-small"
                              >
                                <FontAwesomeIcon icon={faChevronDown} />
                              </button>
                            </div>
                            <div className="compact-actions">
                              <button onClick={() => startEdit(category, index)} className="edit-btn compact-btn">
                                <FontAwesomeIcon icon={faEdit} />
                              </button>
                              <button onClick={() => removeItem(category, index)} className="delete-btn compact-btn">
                                <FontAwesomeIcon icon={faTrash} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        ))}

        {saving && <div className="saving-indicator">Salvando...</div>}

        {/* Custom Alert/Confirm Modal */}
        {showCustomAlert && (
          <div className="custom-confirm-overlay">
            <div className="custom-confirm-dialog">
              <h3>{showCustomAlert.title}</h3>
              <p>{showCustomAlert.message}</p>
              <div className="custom-confirm-buttons">
                {!showCustomAlert.isAlert && (
                  <button
                    className="custom-confirm-btn cancel"
                    onClick={showCustomAlert.onCancel}
                  >
                    Annulla
                  </button>
                )}
                <button
                  className="custom-confirm-btn confirm"
                  onClick={showCustomAlert.onConfirm}
                >
                  {showCustomAlert.isAlert ? 'OK' : 'Conferma'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

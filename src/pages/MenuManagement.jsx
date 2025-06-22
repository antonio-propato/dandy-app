import React, { useState, useEffect, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { firestore } from '../lib/firebase';
import Nav from '../components/Nav';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPen, faTrash, faCheck, faTimes, faPlus, faTh } from '@fortawesome/free-solid-svg-icons';
import './MenuManagement.css';

const initialNewItemState = { name: '', price: '' };
const initialNewCategoryState = '';

export default function MenuManagement() {
  const [menuData, setMenuData] = useState({});
  const [categoryOrder, setCategoryOrder] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // State for UI controls
  const [collapsedCategories, setCollapsedCategories] = useState({});
  const [editingCategory, setEditingCategory] = useState({ oldName: null, newName: '' });
  const [editingItem, setEditingItem] = useState({ category: null, index: null, data: { name: '', price: '' } });

  // State for Deletion Modals
  const [showDeleteItemConfirm, setShowDeleteItemConfirm] = useState({ show: false, category: null, index: null });
  const [showDeleteCategoryConfirm, setShowDeleteCategoryConfirm] = useState({ show: false, category: null });

  // State for adding new content
  const [addingToCategory, setAddingToCategory] = useState(null);
  const [newItem, setNewItem] = useState(initialNewItemState);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState(initialNewCategoryState);

  // State for Drag and Drop (both mouse and touch)
  const [draggedItem, setDraggedItem] = useState(null);
  const [draggedCategory, setDraggedCategory] = useState(null);
  const dragOverItem = useRef(null);
  const dragOverCategory = useRef(null);

  // Touch drag state
  const [touchDrag, setTouchDrag] = useState({
    isDragging: false,
    dragType: null, // 'category' or 'item'
    draggedIndex: null,
    category: null,
    startY: 0,
    currentY: 0,
    element: null
  });

  useEffect(() => {
    fetchMenuData();
  }, []);

  const fetchMenuData = async () => {
    setLoading(true);
    try {
      const menuDoc = await getDoc(doc(firestore, 'settings', 'menu'));
      if (menuDoc.exists()) {
        const data = menuDoc.data();
        setMenuData(data.items || {});
        setCategoryOrder(data.categoryOrder || Object.keys(data.items || {}));
      }
    } catch (error) {
      console.error("Error fetching menu data:", error);
    } finally {
      setLoading(false);
    }
  };

  const saveMenuData = async (newMenuData, newCategoryOrder) => {
    setSaving(true);
    try {
      await setDoc(doc(firestore, 'settings', 'menu'), {
        items: newMenuData,
        categoryOrder: newCategoryOrder,
      });
    } catch (error) {
      console.error("Error saving menu data:", error);
    } finally {
      setSaving(false);
    }
  };

  const formatPrice = (priceStr) => {
    if (!priceStr) return '€0.00';
    const cleanPrice = priceStr.toString().replace(/[€\s]/g, '').replace(',', '.');
    const number = parseFloat(cleanPrice);
    if (isNaN(number)) return '€0.00';
    return `€${number.toFixed(2)}`;
  };

  const toggleCategoryCollapse = (category) => {
    // Prevent collapsing when an action button is clicked or during drag
    if (editingCategory.oldName === category || touchDrag.isDragging) return;
    setCollapsedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  // --- Touch Drag Handlers ---
  const handleTouchStart = (e, type, index, category = null) => {
    e.preventDefault();
    const touch = e.touches[0];
    const element = e.currentTarget;

    setTouchDrag({
      isDragging: true,
      dragType: type,
      draggedIndex: index,
      category: category,
      startY: touch.clientY,
      currentY: touch.clientY,
      element: element
    });

    // Add visual feedback
    element.style.opacity = '0.7';
    element.style.transform = 'scale(1.05)';
    element.style.zIndex = '1000';
  };

  const handleTouchMove = (e) => {
    if (!touchDrag.isDragging) return;
    e.preventDefault();

    const touch = e.touches[0];
    const currentY = touch.clientY;
    const deltaY = currentY - touchDrag.startY;

    setTouchDrag(prev => ({ ...prev, currentY }));

    // Update element position
    if (touchDrag.element) {
      touchDrag.element.style.transform = `scale(1.05) translateY(${deltaY}px)`;
    }

    // Find drop target
    const elementsBelow = document.elementsFromPoint(touch.clientX, touch.clientY);
    const dropTarget = elementsBelow.find(el =>
      el.classList.contains('menu-item-wrapper') ||
      el.classList.contains('category-header')
    );

    if (dropTarget) {
      if (touchDrag.dragType === 'category' && dropTarget.classList.contains('category-header')) {
        const categoryIndex = Array.from(dropTarget.parentElement.parentElement.children)
          .findIndex(child => child.contains(dropTarget));
        dragOverCategory.current = categoryIndex;
      } else if (touchDrag.dragType === 'item' && dropTarget.classList.contains('menu-item-wrapper')) {
        const itemIndex = Array.from(dropTarget.parentElement.children)
          .findIndex(child => child === dropTarget);
        dragOverItem.current = itemIndex;
      }
    }
  };

  const handleTouchEnd = async (e) => {
    if (!touchDrag.isDragging) return;
    e.preventDefault();

    // Reset visual feedback
    if (touchDrag.element) {
      touchDrag.element.style.opacity = '';
      touchDrag.element.style.transform = '';
      touchDrag.element.style.zIndex = '';
    }

    // Perform the drop action
    if (touchDrag.dragType === 'category') {
      await handleCategoryDrop();
    } else if (touchDrag.dragType === 'item') {
      await handleItemDrop(touchDrag.category);
    }

    // Reset touch drag state
    setTouchDrag({
      isDragging: false,
      dragType: null,
      draggedIndex: null,
      category: null,
      startY: 0,
      currentY: 0,
      element: null
    });
  };

  // --- Category Handlers ---
  const handleEditCategory = (e, categoryName) => {
    e.stopPropagation(); // Prevent collapse when clicking edit
    setEditingCategory({ oldName: categoryName, newName: categoryName });
  };

  const handleSaveCategory = async () => {
    const { oldName, newName } = editingCategory;
    if (!newName.trim() || newName === oldName) {
      setEditingCategory({ oldName: null, newName: '' });
      return;
    }
    const newMenuData = { ...menuData };
    newMenuData[newName] = newMenuData[oldName];
    delete newMenuData[oldName];
    const newCategoryOrder = categoryOrder.map(cat => (cat === oldName ? newName : cat));
    setMenuData(newMenuData);
    setCategoryOrder(newCategoryOrder);
    await saveMenuData(newMenuData, newCategoryOrder);
    setEditingCategory({ oldName: null, newName: '' });
  };

  const handleAddCategory = async () => {
    const trimmedName = newCategoryName.trim();
    if (!trimmedName || menuData[trimmedName]) return;
    const newMenuData = { ...menuData, [trimmedName]: [] };
    const newCategoryOrder = [...categoryOrder, trimmedName];
    setMenuData(newMenuData);
    setCategoryOrder(newCategoryOrder);
    await saveMenuData(newMenuData, newCategoryOrder);
    setNewCategoryName(initialNewCategoryState);
    setIsAddingCategory(false);
  };

  const handleDeleteCategory = async (e) => {
    e.stopPropagation(); // Prevent collapse
    const { category } = showDeleteCategoryConfirm;
    const newMenuData = { ...menuData };
    delete newMenuData[category];
    const newCategoryOrder = categoryOrder.filter(c => c !== category);
    setMenuData(newMenuData);
    setCategoryOrder(newCategoryOrder);
    await saveMenuData(newMenuData, newCategoryOrder);
    setShowDeleteCategoryConfirm({ show: false, category: null });
  };

  // --- Item Handlers ---
  const handleEditItem = (category, index) => setEditingItem({ category, index, data: { ...menuData[category][index] } });

  const handleSaveItem = async () => {
    const { category, index, data } = editingItem;
    const updatedItems = [...menuData[category]];
    updatedItems[index] = { name: data.name.trim(), price: formatPrice(data.price) };
    const newMenuData = { ...menuData, [category]: updatedItems };
    setMenuData(newMenuData);
    await saveMenuData(newMenuData, categoryOrder);
    setEditingItem({ category: null, index: null, data: { name: '', price: '' } });
  };

  const cancelEditItem = () => setEditingItem({ category: null, index: null, data: { name: '', price: '' } });

  const handleDeleteItem = async () => {
    const { category, index } = showDeleteItemConfirm;
    const updatedItems = menuData[category].filter((_, i) => i !== index);
    const newMenuData = { ...menuData, [category]: updatedItems };
    setMenuData(newMenuData);
    await saveMenuData(newMenuData, categoryOrder);
    setShowDeleteItemConfirm({ show: false, category: null, index: null });
  };

  const handleAddItem = async (category) => {
    if (!newItem.name.trim() || !newItem.price.trim()) return;
    const formattedItem = { name: newItem.name.trim(), price: formatPrice(newItem.price) };
    const updatedItems = [...menuData[category], formattedItem];
    const newMenuData = { ...menuData, [category]: updatedItems };
    setMenuData(newMenuData);
    await saveMenuData(newMenuData, categoryOrder);
    setNewItem(initialNewItemState);
    setAddingToCategory(null);
  };

  // --- Drag and Drop Handlers (Mouse) ---
  const handleCategoryDrop = async () => {
    let sourceIndex, targetIndex;

    if (touchDrag.isDragging) {
      sourceIndex = touchDrag.draggedIndex;
      targetIndex = dragOverCategory.current;
    } else {
      sourceIndex = draggedCategory;
      targetIndex = dragOverCategory.current;
    }

    if (sourceIndex === null || targetIndex === null) return;

    const newCategoryOrder = [...categoryOrder];
    const draggedItemContent = newCategoryOrder.splice(sourceIndex, 1)[0];
    newCategoryOrder.splice(targetIndex, 0, draggedItemContent);
    setCategoryOrder(newCategoryOrder);
    await saveMenuData(menuData, newCategoryOrder);

    setDraggedCategory(null);
    dragOverCategory.current = null;
  };

  const handleItemDrop = async (category) => {
    let sourceIndex, targetIndex;

    if (touchDrag.isDragging) {
      sourceIndex = touchDrag.draggedIndex;
      targetIndex = dragOverItem.current;
    } else {
      sourceIndex = draggedItem;
      targetIndex = dragOverItem.current;
    }

    if (sourceIndex === null || targetIndex === null) return;

    const items = [...menuData[category]];
    const draggedItemContent = items.splice(sourceIndex, 1)[0];
    items.splice(targetIndex, 0, draggedItemContent);
    const newMenuData = { ...menuData, [category]: items };
    setMenuData(newMenuData);
    await saveMenuData(newMenuData, categoryOrder);

    setDraggedItem(null);
    dragOverItem.current = null;
  };

  if (loading) {
    return (
      <div className="global-loading-container">
        <div className="global-loading-spinner"></div>
        <p className="global-loading-text">Caricamento menu...</p>
      </div>
    );
  }

  return (
    <div className="menu-management-container">
      <Nav />

      {/* Header Section */}
      <div className="menu-management-header">
        <h1>Gestione Menu</h1>
      </div>

      <div className="menu-management-content">
        <div className="add-category-section">
          {isAddingCategory ? (
            <div className="item-edit-form">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="item-edit-input name-input"
                placeholder="Nome nuova categoria"
                autoFocus
              />
              <div className="edit-form-actions">
                <button className="form-action-btn save" onClick={handleAddCategory}>
                  <FontAwesomeIcon icon={faCheck} />
                </button>
                <button className="form-action-btn cancel" onClick={() => setIsAddingCategory(false)}>
                  <FontAwesomeIcon icon={faTimes} />
                </button>
              </div>
            </div>
          ) : (
            <button className="add-category-btn" onClick={() => setIsAddingCategory(true)}>
              <FontAwesomeIcon icon={faPlus} /> Aggiungi Categoria
            </button>
          )}
        </div>

        {categoryOrder.map((category, catIndex) => (
          <div key={category} className="category-section">
            <div
              className="category-header"
              onClick={() => toggleCategoryCollapse(category)}
              draggable
              onDragStart={(e) => {
                e.stopPropagation();
                setDraggedCategory(catIndex);
              }}
              onDragEnter={(e) => {
                e.stopPropagation();
                dragOverCategory.current = catIndex;
              }}
              onDragEnd={(e) => {
                e.stopPropagation();
                handleCategoryDrop();
              }}
              onDragOver={(e) => e.preventDefault()}
            >
              <div className="category-title-group">
                <FontAwesomeIcon
                  icon={faTh}
                  className="drag-handle"
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    handleTouchStart(e, 'category', catIndex);
                  }}
                  onTouchMove={(e) => {
                    e.stopPropagation();
                    handleTouchMove(e);
                  }}
                  onTouchEnd={(e) => {
                    e.stopPropagation();
                    handleTouchEnd(e);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
                {editingCategory.oldName === category ? (
                  <>
                    <input
                      type="text"
                      className="category-edit-input"
                      value={editingCategory.newName}
                      onChange={(e) => setEditingCategory({ ...editingCategory, newName: e.target.value })}
                      autoFocus
                      onBlur={handleSaveCategory}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveCategory()}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button className="category-save-btn" onClick={handleSaveCategory}>
                      Salva
                    </button>
                  </>
                ) : (
                  <h2>{category}</h2>
                )}
              </div>
              <div className="category-header-actions">
                <FontAwesomeIcon
                  icon={faPen}
                  className="icon-btn"
                  onClick={(e) => handleEditCategory(e, category)}
                />
                <FontAwesomeIcon
                  icon={faPlus}
                  className="icon-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAddingToCategory(category);
                  }}
                  title="Aggiungi Prodotto"
                />
                <FontAwesomeIcon
                  icon={faTrash}
                  className="icon-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteCategoryConfirm({ show: true, category });
                  }}
                  title="Elimina Categoria"
                />
              </div>
            </div>

            {!collapsedCategories[category] && (
              <div className="item-list-container">
                {addingToCategory === category && (
                  <div className="add-item-form-wrapper">
                    <div className="item-edit-form">
                      <input
                        type="text"
                        value={newItem.name}
                        onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                        className="item-edit-input name-input"
                        placeholder="Nome nuovo prodotto"
                        autoFocus
                      />
                      <input
                        type="text"
                        value={newItem.price}
                        onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                        className="item-edit-input price-input"
                        placeholder="Prezzo"
                      />
                      <div className="edit-form-actions">
                        <button className="form-action-btn save" onClick={() => handleAddItem(category)}>
                          <FontAwesomeIcon icon={faCheck} />
                        </button>
                        <button
                          className="form-action-btn cancel"
                          onClick={() => {
                            setAddingToCategory(null);
                            setNewItem(initialNewItemState);
                          }}
                        >
                          <FontAwesomeIcon icon={faTimes} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {menuData[category].map((item, itemIndex) => {
                  return (
                    <div
                      key={itemIndex}
                      className="menu-item-wrapper"
                      draggable
                      onDragStart={() => setDraggedItem(itemIndex)}
                      onDragEnter={() => dragOverItem.current = itemIndex}
                      onDragEnd={() => handleItemDrop(category)}
                      onDragOver={(e) => e.preventDefault()}
                    >
                      {editingItem.category === category && editingItem.index === itemIndex ? (
                        <div className="item-edit-form">
                          <input
                            type="text"
                            value={editingItem.data.name}
                            onChange={(e) => setEditingItem({
                              ...editingItem,
                              data: { ...editingItem.data, name: e.target.value }
                            })}
                            className="item-edit-input name-input"
                            placeholder="Nome"
                          />
                          <input
                            type="text"
                            value={editingItem.data.price}
                            onChange={(e) => setEditingItem({
                              ...editingItem,
                              data: { ...editingItem.data, price: e.target.value }
                            })}
                            className="item-edit-input price-input"
                            placeholder="Prezzo"
                          />
                          <div className="edit-form-actions">
                            <button className="form-action-btn save" onClick={handleSaveItem}>
                              <FontAwesomeIcon icon={faCheck} />
                            </button>
                            <button className="form-action-btn cancel" onClick={cancelEditItem}>
                              <FontAwesomeIcon icon={faTimes} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="menu-item-display">
                          <FontAwesomeIcon
                            icon={faTh}
                            className="drag-handle item-drag-handle"
                            onTouchStart={(e) => {
                              e.stopPropagation();
                              handleTouchStart(e, 'item', itemIndex, category);
                            }}
                            onTouchMove={(e) => {
                              e.stopPropagation();
                              handleTouchMove(e);
                            }}
                            onTouchEnd={(e) => {
                              e.stopPropagation();
                              handleTouchEnd(e);
                            }}
                          />
                          <span className="item-name">{item.name}</span>
                          <div className="item-right-group">
                            <span className="item-price">{item.price}</span>
                            <div className="item-actions">
                              <FontAwesomeIcon
                                icon={faPen}
                                className="icon-btn"
                                onClick={() => handleEditItem(category, itemIndex)}
                              />
                              <FontAwesomeIcon
                                icon={faTrash}
                                className="icon-btn"
                                onClick={() => setShowDeleteItemConfirm({
                                  show: true,
                                  category,
                                  index: itemIndex
                                })}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {showDeleteItemConfirm.show && (
        <div
          className="custom-alert-overlay"
          onClick={() => setShowDeleteItemConfirm({ show: false, category: null, index: null })}
        >
          <div className="custom-alert" onClick={(e) => e.stopPropagation()}>
            <h3>Elimina Elemento</h3>
            <p>Sei sicuro di voler eliminare questo elemento?</p>
            <div className="alert-buttons">
              <button className="confirm-btn" onClick={handleDeleteItem}>
                Conferma
              </button>
              <button
                className="cancel-btn-modal"
                onClick={() => setShowDeleteItemConfirm({ show: false, category: null, index: null })}
              >
                ANNULLA
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteCategoryConfirm.show && (
        <div
          className="custom-alert-overlay"
          onClick={() => setShowDeleteCategoryConfirm({ show: false, category: null })}
        >
          <div className="custom-alert" onClick={(e) => e.stopPropagation()}>
            <h3>Elimina Categoria</h3>
            <p>
              Sei sicuro di voler eliminare la categoria "{showDeleteCategoryConfirm.category}" e tutti i suoi prodotti?
              L'azione è irreversibile.
            </p>
            <div className="alert-buttons">
              <button className="confirm-btn" onClick={handleDeleteCategory}>
                Conferma
              </button>
              <button
                className="cancel-btn-modal"
                onClick={() => setShowDeleteCategoryConfirm({ show: false, category: null })}
              >
                ANNULLA
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

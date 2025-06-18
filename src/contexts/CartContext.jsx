// src/contexts/CartContext.jsx - Updated for simplified payment flow
import React, { createContext, useContext, useReducer } from 'react'

const CartContext = createContext()

const cartReducer = (state, action) => {
  switch (action.type) {
    case 'ADD_ITEM':
      const { item, category } = action.payload
      const existingItemIndex = state.items.findIndex(
        cartItem => cartItem.name.toLowerCase() === item.name.toLowerCase() && cartItem.category === category
      )

      if (existingItemIndex > -1) {
        const updatedItems = [...state.items]
        updatedItems[existingItemIndex].quantity += 1
        return {
          ...state,
          items: updatedItems
        }
      } else {
        return {
          ...state,
          items: [...state.items, {
            ...item,
            category,
            quantity: 1,
            id: Date.now()
          }]
        }
      }

    case 'REMOVE_ITEM':
      return {
        ...state,
        items: state.items.filter(item => item.id !== action.payload.id)
      }

    case 'UPDATE_QUANTITY':
      const { id, quantity } = action.payload
      if (quantity <= 0) {
        return {
          ...state,
          items: state.items.filter(item => item.id !== id)
        }
      }
      return {
        ...state,
        items: state.items.map(item =>
          item.id === id ? { ...item, quantity } : item
        )
      }

    case 'CLEAR_CART':
      return {
        ...state,
        items: []
      }

    case 'SET_ORDER_TYPE':
      return {
        ...state,
        orderType: action.payload
      }

    case 'SET_TABLE_NUMBER':
      return {
        ...state,
        tableNumber: action.payload
      }

    case 'SET_DELIVERY_INFO':
      return {
        ...state,
        deliveryInfo: action.payload
      }

    case 'SET_NOTES':
      return {
        ...state,
        notes: action.payload
      }

    case 'SET_PROMO_CODE':
      return {
        ...state,
        promoCode: action.payload
      }

    default:
      return state
  }
}

const initialState = {
  items: [],
  orderType: 'tavolo', // 'tavolo' or 'consegna' (updated from 'table')
  tableNumber: null,
  deliveryInfo: {
    nome: '',
    cognome: '',
    telefono: '',
    email: '',
    indirizzo: '',
    civico: '',
    citta: '',
    provincia: '',
    cap: ''
  },
  notes: '',
  promoCode: ''
}

export const CartProvider = ({ children }) => {
  const [cart, dispatch] = useReducer(cartReducer, initialState)

  // Calculate totals
  const getTotalItems = () => {
    return cart.items.reduce((total, item) => total + item.quantity, 0)
  }

  const getTotalPrice = () => {
    return cart.items.reduce((total, item) => {
      // Make sure item.price is parsed as a number
      const price = parseFloat(item.price.replace('€', ''))
      return total + (price * item.quantity)
    }, 0)
  }

  // Get count for a specific item
  const getItemCount = (itemName, category) => {
    const item = cart.items.find(cartItem =>
      cartItem.name.toLowerCase() === itemName.toLowerCase() && cartItem.category === category
    )
    return item ? item.quantity : 0
  }

  // Cart actions
  const addItem = (item, category) => {
    dispatch({ type: 'ADD_ITEM', payload: { item, category } })
  }

  const removeItem = (id) => {
    dispatch({ type: 'REMOVE_ITEM', payload: { id } })
  }

  const updateQuantity = (id, quantity) => {
    dispatch({ type: 'UPDATE_QUANTITY', payload: { id, quantity } })
  }

  const clearCart = () => {
    dispatch({ type: 'CLEAR_CART' })
  }

  // Order configuration actions
  const setOrderType = (orderType) => {
    dispatch({ type: 'SET_ORDER_TYPE', payload: orderType })
  }

  const setTableNumber = (tableNumber) => {
    dispatch({ type: 'SET_TABLE_NUMBER', payload: tableNumber })
  }

  const setDeliveryInfo = (deliveryInfo) => {
    dispatch({ type: 'SET_DELIVERY_INFO', payload: deliveryInfo })
  }

  const setNotes = (notes) => {
    dispatch({ type: 'SET_NOTES', payload: notes })
  }

  const setPromoCode = (promoCode) => {
    dispatch({ type: 'SET_PROMO_CODE', payload: promoCode })
  }

  const value = {
    cart,
    getTotalItems,
    getTotalPrice,
    getItemCount,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    setOrderType,
    setTableNumber,
    setDeliveryInfo,
    setNotes,
    setPromoCode
  }

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart must be used within a CartProvider')
  }
  return context
}

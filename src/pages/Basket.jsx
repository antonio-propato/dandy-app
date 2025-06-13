import React, { useEffect, useState } from 'react';
import { ArrowLeft, Minus, Plus, CreditCard, Clock, X, CheckCircle } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, firestore } from '../lib/firebase';
import { doc, getDoc, addDoc, collection, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import "./Basket.css";
import { useCart } from '../contexts/CartContext';

export default function Basket() {
  const navigate = useNavigate();

  // Cart context
  const {
    cart,
    updateQuantity,
    getTotalItems,
    getTotalPrice,
    setPromoCode,
    setNotes,
    setOrderType,
    setTableNumber,
    setDeliveryInfo
  } = useCart();

  // Local state for notes and user profile
  const [notesSaved, setNotesSaved] = useState(false);
  const [userProfile, setUserProfile] = useState(null);

  // Order confirmation modal states
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [orderProcessing, setOrderProcessing] = useState(false);
  const [pendingOrder, setPendingOrder] = useState(null);
  const [cancelCountdown, setCancelCountdown] = useState(10);
  const [canCancel, setCanCancel] = useState(true);
  const [orderStatus, setOrderStatus] = useState('pending'); // Track order status explicitly
  const [showCancelledNotification, setShowCancelledNotification] = useState(false);

  // Fetch user profile data
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async user => {
      if (user) {
        try {
          const docRef = doc(firestore, 'users', user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setUserProfile(docSnap.data());
          }
        } catch (error) {
          console.error('Error fetching user profile:', error);
        }
      }
    });
    return unsubscribe;
  }, []);

  // Validation functions
  const isTableOrderValid = () => {
    return cart.orderType === 'tavolo' && cart.tableNumber && cart.tableNumber.trim() !== '';
  };

  const isDeliveryOrderValid = () => {
    if (cart.orderType !== 'consegna') return false;

    const required = [
      cart.deliveryInfo.nome,
      cart.deliveryInfo.cognome,
      cart.deliveryInfo.telefono,
      cart.deliveryInfo.email,
      cart.deliveryInfo.indirizzo,
      cart.deliveryInfo.civico,
      cart.deliveryInfo.citta,
      cart.deliveryInfo.provincia,
      cart.deliveryInfo.cap
    ];

    return required.every(field => field && field.trim() !== '');
  };

  const isOrderValid = () => {
    if (cartItems.length === 0) return false;
    if (cart.orderType === 'tavolo') return isTableOrderValid();
    if (cart.orderType === 'consegna') return isDeliveryOrderValid();
    return false;
  };

  // Auto-populate delivery info when switching to delivery and user profile is available
  useEffect(() => {
    if (cart.orderType === 'consegna' && userProfile) {
      // Parse phone number to handle different formats
      let formattedPhone = userProfile.phone || '';
      if (formattedPhone && !formattedPhone.startsWith('+')) {
        formattedPhone = `+${formattedPhone}`;
      }

      // Only populate if the basic fields are empty
      const shouldPopulate = !cart.deliveryInfo.nome ||
                           !cart.deliveryInfo.cognome ||
                           !cart.deliveryInfo.email ||
                           !cart.deliveryInfo.telefono;

      if (shouldPopulate) {
        setDeliveryInfo({
          ...cart.deliveryInfo, // Preserve existing address fields
          nome: userProfile.firstName || '',
          cognome: userProfile.lastName || '',
          telefono: formattedPhone,
          email: userProfile.email || ''
        });
      }
    }
  }, [cart.orderType, userProfile, setDeliveryInfo]);

  // Real-time listener for order status changes
  useEffect(() => {
    let unsubscribe;

    if (pendingOrder && pendingOrder.id) {
      console.log('👀 Setting up listener for order:', pendingOrder.id);

      unsubscribe = onSnapshot(
        doc(firestore, 'orders', pendingOrder.id),
        (doc) => {
          if (doc.exists()) {
            const orderData = doc.data();
            const newStatus = orderData.status;
            console.log('📦 Order status update:', newStatus);

            setOrderStatus(newStatus);

            if (newStatus === 'confirmed') {
              console.log('✅ Order confirmed by superuser!');
              setCanCancel(false);
              setCancelCountdown(0);
              // Small delay to show the confirmation, then redirect
              setTimeout(() => {
                handleOrderConfirmed();
              }, 2000);
            } else if (newStatus === 'cancelled') {
              console.log('❌ Order was cancelled');
              handleOrderCancelled();
            }
          } else {
            console.log('❌ Order document no longer exists');
            handleOrderCancelled();
          }
        },
        (error) => {
          console.error('❌ Error listening to order updates:', error);
        }
      );
    }

    return () => {
      if (unsubscribe) {
        console.log('🔄 Cleaning up order listener');
        unsubscribe();
      }
    };
  }, [pendingOrder]);

  // Countdown timer for order cancellation
  useEffect(() => {
    let timer;

    if (showPendingModal && canCancel && cancelCountdown > 0 && orderStatus === 'pending') {
      timer = setTimeout(() => {
        setCancelCountdown(prev => {
          const newCount = prev - 1;
          console.log('⏰ Countdown:', newCount);
          return newCount;
        });
      }, 1000);
    } else if (cancelCountdown <= 0 && orderStatus === 'pending') {
      console.log('⏰ Countdown expired, disabling cancel');
      setCanCancel(false);
    }

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [showPendingModal, canCancel, cancelCountdown, orderStatus]);

  // Generate unique order number
const generateOrderNumber = () => {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2); // Last 2 digits of year
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const hour = now.getHours().toString().padStart(2, '0');
  const minute = now.getMinutes().toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');

  return `${year}${month}${day}${hour}${minute}${random}`;
  // Example: 250613162499
};

  // Save user preferences for marketing
  const saveUserPreferences = async (orderData) => {
    try {
      if (userProfile && auth.currentUser) {
        const preferences = {
          lastOrderType: cart.orderType,
          lastOrderItems: cartItems.map(item => ({
            name: item.name,
            category: item.category
          })),
          lastOrderDate: new Date().toISOString(),
          preferredDeliveryInfo: cart.orderType === 'consegna' ? cart.deliveryInfo : null,
          preferredTableNumber: cart.orderType === 'tavolo' ? cart.tableNumber : null,
          totalOrders: (userProfile.totalOrders || 0) + 1,
          totalSpent: (userProfile.totalSpent || 0) + total,
          lastOrderTotal: total
        };

        await updateDoc(doc(firestore, 'users', auth.currentUser.uid), {
          preferences,
          updatedAt: serverTimestamp()
        });
        console.log('✅ User preferences saved');
      }
    } catch (error) {
      console.error('Error saving user preferences:', error);
    }
  };

  // Submit order to Firebase
  const submitOrder = async (paymentMethod) => {
    try {
      setOrderProcessing(true);
      console.log('🚀 Submitting order...');

      const orderNumber = generateOrderNumber();
      const orderData = {
        orderNumber,
        userId: auth.currentUser.uid,
        userName: `${userProfile.firstName} ${userProfile.lastName}`,
        userEmail: userProfile.email,
        orderType: cart.orderType,
        tableNumber: cart.orderType === 'tavolo' ? cart.tableNumber : null,
        deliveryInfo: cart.orderType === 'consegna' ? cart.deliveryInfo : null,
        items: cartItems,
        notes: cart.notes || '',
        promoCode: cart.promoCode || '',
        totalPrice: total,
        paymentMethod,
        status: 'pending', // IMPORTANT: Start as pending
        timestamp: serverTimestamp(),
        createdAt: new Date().toISOString()
      };

      console.log('📦 Order data:', orderData);

      // Add order to Firebase
      const orderRef = await addDoc(collection(firestore, 'orders'), orderData);
      console.log('✅ Order submitted with ID:', orderRef.id);

      // Save user preferences
      await saveUserPreferences(orderData);

      // Store order for pending modal
      setPendingOrder({ ...orderData, id: orderRef.id });
      setOrderStatus('pending');

      return orderRef.id;
    } catch (error) {
      console.error('❌ Error submitting order:', error);
      throw error;
    } finally {
      setOrderProcessing(false);
    }
  };

  // Cancel order
  const cancelOrder = async () => {
    try {
      if (pendingOrder && pendingOrder.id && canCancel && orderStatus === 'pending') {
        console.log('❌ Cancelling order:', pendingOrder.id);

        // Update order status to cancelled
        await updateDoc(doc(firestore, 'orders', pendingOrder.id), {
          status: 'cancelled',
          cancelledAt: serverTimestamp(),
          cancelledBy: 'customer'
        });

        console.log('✅ Order cancelled successfully');

        // The real-time listener will handle the UI updates
      } else {
        console.log('❌ Cannot cancel order - conditions not met');
        console.log('Pending order:', !!pendingOrder);
        console.log('Can cancel:', canCancel);
        console.log('Order status:', orderStatus);
      }
    } catch (error) {
      console.error('❌ Error cancelling order:', error);
      setShowCancelledNotification(true);
      setTimeout(() => setShowCancelledNotification(false), 3000);
    }
  };

  // Handle order cancellation (from real-time listener)
  const handleOrderCancelled = () => {
    console.log('🔄 Handling order cancellation');
    setShowPendingModal(false);
    setPendingOrder(null);
    setCancelCountdown(10);
    setCanCancel(true);
    setSelectedPayment(null);
    setOrderStatus('pending');
    setShowCancelledNotification(true);
    // Auto-hide notification after 3 seconds
    setTimeout(() => setShowCancelledNotification(false), 3000);
  };

  const cartItems = cart.items;
  const total = getTotalPrice();
  const totalItems = getTotalItems();

  // Group items by category
  const groupedItems = cartItems.reduce((acc, item) => {
    if (!acc[item.category]) {
      acc[item.category] = [];
    }
    acc[item.category].push(item);
    return acc;
  }, {});

  const saveNotes = () => {
    if (cart.notes.trim()) {
      setNotesSaved(true);
      // Here you could also save to backend if needed
      alert('Note salvate!');
    } else {
      alert('Inserisci delle note prima di salvare!');
    }
  };

  const amendNotes = () => {
    setNotesSaved(false);
    // Focus on the textarea for better UX
    const textarea = document.querySelector('.cart-notes-textarea');
    if (textarea) {
      textarea.focus();
    }
  };

  const confirmOrder = () => {
    if (!isOrderValid()) {
      alert('Completa tutti i campi richiesti per procedere');
      return;
    }
    setShowPaymentModal(true);
  };

  // Handle payment method selection
  const handlePaymentSelect = async (method) => {
    setSelectedPayment(method);
    setShowPaymentModal(false);

    try {
      await submitOrder(method);
      setShowPendingModal(true);
      setCancelCountdown(10);
      setCanCancel(true);
      setOrderStatus('pending');
    } catch (error) {
      alert('Errore nell\'invio dell\'ordine. Riprova.');
      setSelectedPayment(null);
    }
  };

  // Handle order confirmation (when superuser confirms)
  const handleOrderConfirmed = () => {
    console.log('🎉 Navigating to success page');
    setShowPendingModal(false);
    // Clear cart
    cartItems.forEach(item => {
      updateQuantity(item.id, 0);
    });
    // Navigate to success page
    navigate('/order-success');
  };

  return (
    <div className="cart-container">
      <div className="cart-background-overlay" />

      <div className="cart-content">
        <div className="cart-order-summary">
          <div className="cart-summary-header">
            <button className="cart-back-button" onClick={() => navigate('/menu')}>
              <ArrowLeft size={20} />
            </button>
            <h2 className="cart-summary-title">
              RIEPILOGO ORDINE
            </h2>
          </div>

          {/* Cart items */}
          {Object.entries(groupedItems).map(([category, items]) => (
            <div key={category} className="cart-category-group">
              <div className="cart-category-header">
                {category}
              </div>
              <div className="cart-category-items">
                {items.map((item) => (
                  <div key={item.id} className="cart-item">
                    <div className="menu-item-count">{item.quantity}</div>
                    <div className="cart-item-name">{item.name}</div>
                    <div className="cart-item-price">
                      €{(parseFloat(item.price.replace('€', '')) * item.quantity).toFixed(2)}
                    </div>
                    <div className="cart-item-controls">
                      <button
                        className="menu-minus-btn"
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        aria-label={`Remove one ${item.name}`}
                      >
                        -
                      </button>
                      <button
                        className="menu-plus-btn"
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        aria-label={`Add one ${item.name}`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Total */}
          <div className="cart-total-section">
            <div className="cart-total-row">
              <span className="cart-total-label">Totale ({totalItems}):</span>
              <span className="cart-total-amount">€{total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Promo code */}
        <div className="cart-promo-section">
          <input
            type="text"
            placeholder="Codice promozionale"
            value={cart.promoCode}
            onChange={(e) => setPromoCode(e.target.value)}
            className="cart-promo-input"
          />
          <button className="cart-promo-btn">Applica</button>
        </div>

        {/* Notes section with improved functionality */}
        <div className="cart-notes-section">
          <textarea
            placeholder="Note (allergie, richieste speciali...)"
            value={cart.notes}
            onChange={(e) => {
              setNotes(e.target.value);
              // Reset saved state if user modifies notes
              if (notesSaved && e.target.value !== cart.notes) {
                setNotesSaved(false);
              }
            }}
            rows={3}
            className="cart-notes-textarea"
            disabled={notesSaved}
          />
          <button
            onClick={notesSaved ? amendNotes : saveNotes}
            className={`cart-save-notes-btn ${notesSaved ? 'cart-amend-notes-btn' : ''}`}
          >
            {notesSaved ? 'Modifica Note' : 'Salva Note'}
          </button>
        </div>

        {/* Order type */}
        <div className="cart-order-type-section">
          <h3 className="cart-order-type-title">Tipo di Ordine</h3>
          <div className="cart-order-type-buttons">
            <button
              onClick={() => setOrderType('tavolo')}
              className={`cart-order-type-btn ${cart.orderType === 'tavolo' ? 'active' : ''}`}
            >
              Al Tavolo
            </button>
            <button
              onClick={() => setOrderType('consegna')}
              className={`cart-order-type-btn ${cart.orderType === 'consegna' ? 'active' : ''}`}
            >
              Consegna
            </button>
          </div>
        </div>

        {/* Conditional sections based on order type - only show when selected */}
        {cart.orderType === 'tavolo' && (
          <div className="cart-table-section">
            <label className="cart-table-label">Numero Tavolo:</label>
            <input
              type="text"
              value={cart.tableNumber || ''}
              onChange={(e) => setTableNumber(e.target.value)}
              placeholder="Tavolo 1"
              className="cart-table-input"
            />
          </div>
        )}

        {cart.orderType === 'consegna' && (
          <div className="cart-delivery-section">
            <h3 className="cart-delivery-title">Informazioni Consegna</h3>
            <div className="cart-delivery-grid">
              <input
                type="text"
                placeholder="Nome *"
                value={cart.deliveryInfo.nome || ''}
                onChange={(e) => setDeliveryInfo({ ...cart.deliveryInfo, nome: e.target.value })}
                className="cart-delivery-input"
                required
              />
              <input
                type="text"
                placeholder="Cognome *"
                value={cart.deliveryInfo.cognome || ''}
                onChange={(e) => setDeliveryInfo({ ...cart.deliveryInfo, cognome: e.target.value })}
                className="cart-delivery-input"
                required
              />
              <input
                type="tel"
                placeholder="Telefono *"
                value={cart.deliveryInfo.telefono || ''}
                onChange={(e) => setDeliveryInfo({ ...cart.deliveryInfo, telefono: e.target.value })}
                className="cart-delivery-input"
                required
              />
              <input
                type="email"
                placeholder="Email *"
                value={cart.deliveryInfo.email || ''}
                onChange={(e) => setDeliveryInfo({ ...cart.deliveryInfo, email: e.target.value })}
                className="cart-delivery-input"
                required
              />

              {/* Company field - optional, spans full width */}
              <input
                type="text"
                placeholder="Compagnia (opzionale)"
                value={cart.deliveryInfo.compagnia || ''}
                onChange={(e) => setDeliveryInfo({ ...cart.deliveryInfo, compagnia: e.target.value })}
                className="cart-delivery-input cart-delivery-full-width"
              />

              {/* Address fields */}
              <input
                type="text"
                placeholder="Indirizzo *"
                value={cart.deliveryInfo.indirizzo || ''}
                onChange={(e) => setDeliveryInfo({ ...cart.deliveryInfo, indirizzo: e.target.value })}
                className="cart-delivery-input"
                required
              />
              <input
                type="text"
                placeholder="Numero Civico *"
                value={cart.deliveryInfo.civico || ''}
                onChange={(e) => setDeliveryInfo({ ...cart.deliveryInfo, civico: e.target.value })}
                className="cart-delivery-input"
                required
              />
              <input
                type="text"
                placeholder="Città *"
                value={cart.deliveryInfo.citta || ''}
                onChange={(e) => setDeliveryInfo({ ...cart.deliveryInfo, citta: e.target.value })}
                className="cart-delivery-input"
                required
              />
              <input
                type="text"
                placeholder="Provincia *"
                value={cart.deliveryInfo.provincia || ''}
                onChange={(e) => setDeliveryInfo({ ...cart.deliveryInfo, provincia: e.target.value })}
                className="cart-delivery-input"
                required
              />
              <input
                type="text"
                placeholder="CAP *"
                value={cart.deliveryInfo.cap || ''}
                onChange={(e) => setDeliveryInfo({ ...cart.deliveryInfo, cap: e.target.value })}
                className="cart-delivery-input"
                maxLength="5"
                pattern="[0-9]{5}"
                required
              />
            </div>
          </div>
        )}

        <button
          onClick={confirmOrder}
          disabled={!isOrderValid()}
          className={`cart-confirm-btn ${!isOrderValid() ? 'cart-confirm-btn-disabled' : ''}`}
        >
          CONFERMA ORDINE
        </button>
      </div>

      {/* Payment Selection Modal */}
      {showPaymentModal && (
        <div className="modal-overlay">
          <div className="payment-modal">
            <div className="modal-header">
               <h3>Pagamento</h3>
              <img src="/images/Dandy.jpeg" alt="Dandy Logo" className="modal-logo" />
              <button
                onClick={() => setShowPaymentModal(false)}
                className="modal-close"
              >
                <X size={15} />
              </button>
            </div>

            <div className="payment-summary">
              <div className="summary-row">
                <span>Subtotale ({totalItems} articoli)</span>
                <span>€{total.toFixed(2)}</span>
              </div>
              <div className="summary-row total">
                <span>Totale</span>
                <span>€{total.toFixed(2)}</span>
              </div>
            </div>

            <div className="payment-methods">
              <button
                onClick={() => handlePaymentSelect('pay-at-till')}
                className="payment-btn pay-till"
                disabled={orderProcessing}
              >
                <CreditCard size={20} />
                <div>
                  <div className="payment-title">Paga alla Cassa</div>
                  <div className="payment-subtitle">Procedi subito, paga al ritiro</div>
                </div>
              </button>

              <button
                onClick={() => handlePaymentSelect('pay-now')}
                className="payment-btn pay-now disabled"
                disabled={true}
                title="Pagamento online non ancora disponibile"
              >
                <CreditCard size={20} />
                <div>
                  <div className="payment-title">Paga Ora</div>
                  <div className="payment-subtitle">Apple Pay / Google Pay / PayPal</div>
                  <div className="payment-coming-soon">Presto disponibile</div>
                </div>
              </button>
            </div>

            {orderProcessing && (
              <div className="processing-indicator">
                <Clock size={20} />
                <span>Elaborazione ordine...</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pending Order Modal */}
      {showPendingModal && pendingOrder && (
        <div className="modal-overlay">
          <div className="pending-modal">
            <div className="pending-header">
              <img src="/images/Dandy.jpeg" alt="Dandy Logo" className="modal-logo" />
              <div className="pending-icon">
                {orderStatus === 'confirmed' ? (
                  <CheckCircle size={40} color="#28a745" />
                ) : (
                  <Clock size={40} />
                )}
              </div>
              <h2>
                {orderStatus === 'confirmed' ? 'Ordine Confermato!' : 'Ordine in Attesa'}
              </h2>
              <div className="order-number">
                Ordine #{pendingOrder.orderNumber}
              </div>
            </div>

            <div className="pending-content">
              <div className="status-message">
                {orderStatus === 'confirmed' ? (
                  <p>Il tuo ordine è stato confermato dal locale!</p>
                ) : (
                  <>
                    <p>Il tuo ordine è stato inviato con successo!</p>
                    <p>È in attesa di conferma dal locale.</p>
                  </>
                )}
              </div>

              <div className="order-summary">
                <div className="summary-item">
                  <strong>Consegna:</strong> {cart.orderType === 'tavolo' ? `Tavolo ${cart.tableNumber}` : 'Consegna'}
                </div>
                <div className="summary-item">
                  <strong>Totale:</strong> €{total.toFixed(2)}
                </div>
                <div className="summary-item">
                  <strong>Pagamento:</strong> {selectedPayment === 'pay-at-till' ? 'Paga alla Cassa' : 'Pagamento Online'}
                </div>
                <div className="summary-item">
                  <strong>Stato:</strong> {orderStatus === 'confirmed' ? 'Confermato' : 'In Attesa'}
                </div>
              </div>

              {canCancel && orderStatus === 'pending' && (
                <div className="cancel-section">
                  <p>Puoi cancellare l'ordine entro:</p>
                  <div className="countdown">
                    <span className="countdown-number">{cancelCountdown}</span>
                    <span>secondi</span>
                  </div>
                  <button
                    onClick={cancelOrder}
                    className="cancel-btn"
                    disabled={!canCancel}
                  >
                    Cancella Ordine
                  </button>
                </div>
              )}

              {orderStatus === 'confirmed' && (
                <div className="confirmed-section">
                  <CheckCircle size={32} color="#28a745" />
                  <p>Ordine confermato dal locale!</p>
                  <button
                    onClick={handleOrderConfirmed}
                    className="continue-btn"
                  >
                    Continua
                  </button>
                </div>
              )}

              {orderStatus === 'pending' && !canCancel && (
                <div className="waiting-section">
                  <Clock size={32} color="#ffc107" />
                  <p>In attesa di conferma dal locale...</p>
                  <p className="small-text">Non è più possibile cancellare l'ordine</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Custom Cancellation Notification */}
      {showCancelledNotification && (
        <div className="custom-notification">
          <div className="notification-content">
            <img src="/images/Dandy.jpeg" alt="Dandy Logo" className="notification-logo" />
            <div className="notification-text">
              <h3>Ordine Cancellato</h3>
              <p>Il tuo ordine è stato cancellato con successo.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

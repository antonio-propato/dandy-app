import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Minus, Plus, CreditCard, Clock, X, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, firestore, functions } from '../lib/firebase';
import { doc, getDoc, addDoc, collection, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import "./Basket.css";
import { useCart } from '../contexts/CartContext';

const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

const stripePromise = STRIPE_KEY ? loadStripe(STRIPE_KEY) : null;

if (!STRIPE_KEY) {
  console.error('❌ Stripe publishable key not found. Check your .env file.');
}

// Stripe Payment Form Component
const StripePaymentForm = ({ total, onSuccess, onError, onCancel, orderData }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const createPaymentIntent = httpsCallable(functions, 'createPaymentIntent');

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setProcessing(true);
    setErrorMessage('');

    const cardElement = elements.getElement(CardElement);

    try {
      // FIXED: Correct amount calculation - total is already in euros, convert to cents
      const amountInCents = Math.round(total * 100);
      console.log(`💰 Frontend: Total €${total} -> Amount in cents: ${amountInCents}`);

      const result = await createPaymentIntent({
        amount: amountInCents, // Already in cents
        currency: 'eur',
        orderData: orderData,
        userId: auth.currentUser.uid,
        capture_method: 'manual'
      });

      const { client_secret } = result.data;

      const { error, paymentIntent } = await stripe.confirmCardPayment(client_secret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            name: `${orderData.deliveryInfo?.nome || ''} ${orderData.deliveryInfo?.cognome || ''}`.trim(),
            email: orderData.deliveryInfo?.email || auth.currentUser.email,
            phone: orderData.deliveryInfo?.telefono,
            address: orderData.orderType === 'consegna' ? {
              line1: `${orderData.deliveryInfo?.indirizzo || ''} ${orderData.deliveryInfo?.civico || ''}`.trim(),
              city: orderData.deliveryInfo?.citta,
              state: orderData.deliveryInfo?.provincia,
              postal_code: orderData.deliveryInfo?.cap,
              country: 'IT',
            } : undefined,
          },
        },
      });

      if (error) {
        console.error('Payment confirmation error:', error);
        setErrorMessage(error.message);
        onError(error.message);
      } else {
        console.log('Payment Intent Status:', paymentIntent.status);

        if (paymentIntent.status === 'requires_capture') {
          console.log('✅ Payment authorized successfully, requires capture');
          onSuccess(paymentIntent.id);
        } else if (paymentIntent.status === 'succeeded') {
          console.log('⚠️ Payment was immediately captured (unexpected for manual capture)');
          onSuccess(paymentIntent.id);
        } else {
          console.log('❓ Unexpected payment status:', paymentIntent.status);
          setErrorMessage(`Stato pagamento inaspettato: ${paymentIntent.status}`);
          onError(`Unexpected payment status: ${paymentIntent.status}`);
        }
      }
    } catch (err) {
      console.error('Payment processing error:', err);
      setErrorMessage('Errore durante il pagamento. Riprova.');
      onError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const cardElementOptions = {
    style: {
      base: {
        fontSize: '16px',
        color: '#ECF0BA',
        backgroundColor: 'transparent',
        '::placeholder': {
          color: 'rgba(236, 240, 186, 0.5)',
        },
        iconColor: '#ECF0BA',
      },
      invalid: {
        color: '#ff4444',
        iconColor: '#ff4444',
      },
    },
    hidePostalCode: false,
  };

  return (
    <form onSubmit={handleSubmit} className="stripe-payment-form">
      <div className="payment-authorization-notice">
        <Info size={16} />
        <span>Il pagamento verrà addebitato solo dopo l'approvazione dell'ordine da parte del negozio.</span>
      </div>

      <div className="card-element-container">
        <CardElement options={cardElementOptions} />
      </div>

      {errorMessage && (
        <div className="stripe-error-message">
          <AlertTriangle size={16} />
          {errorMessage}
        </div>
      )}

      <div className="stripe-form-actions">
        <button
          type="button"
          onClick={onCancel}
          className="basket-cancel-btn"
          disabled={processing}
        >
          Annulla
        </button>
        <button
          type="submit"
          disabled={!stripe || processing}
          className="stripe-pay-button"
        >
          {processing ? (
            <>
              <Clock size={16} />
              Autorizzazione...
            </>
          ) : (
            <>
              <CreditCard size={16} />
              Autorizza €{total.toFixed(2)}
            </>
          )}
        </button>
      </div>
    </form>
  );
};

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

  // Delivery warning modal state
  const [showDeliveryWarningModal, setShowDeliveryWarningModal] = useState(false);

  // Order confirmation modal states
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showStripeModal, setShowStripeModal] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [orderProcessing, setOrderProcessing] = useState(false);
  const [pendingOrder, setPendingOrder] = useState(null);
  const [cancelCountdown, setCancelCountdown] = useState(10);
  const [canCancel, setCanCancel] = useState(true);
  const [orderStatus, setOrderStatus] = useState('pending');
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
      let formattedPhone = userProfile.phone || '';
      if (formattedPhone && !formattedPhone.startsWith('+')) {
        formattedPhone = `+${formattedPhone}`;
      }

      const shouldPopulate = !cart.deliveryInfo.nome ||
                           !cart.deliveryInfo.cognome ||
                           !cart.deliveryInfo.email ||
                           !cart.deliveryInfo.telefono;

      if (shouldPopulate) {
        setDeliveryInfo({
          ...cart.deliveryInfo,
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
      unsubscribe = onSnapshot(
        doc(firestore, 'orders', pendingOrder.id),
        (doc) => {
          if (doc.exists()) {
            const orderData = doc.data();
            const newStatus = orderData.status;
            setOrderStatus(newStatus);

            if (newStatus === 'confirmed') {
              setCanCancel(false);
              setCancelCountdown(0);
              // Do not navigate away automatically, let the user see the confirmed state.
            } else if (newStatus === 'cancelled') {
              handleOrderCancelled();
            }
          } else {
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
        unsubscribe();
      }
    };
  }, [pendingOrder]);

  // Countdown timer for order cancellation
  useEffect(() => {
    let timer;

    if (showPendingModal && canCancel && cancelCountdown > 0 && orderStatus === 'pending') {
      timer = setTimeout(() => {
        setCancelCountdown(prev => prev - 1);
      }, 1000);
    } else if (cancelCountdown <= 0 && orderStatus === 'pending') {
      setCanCancel(false);
    }

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [showPendingModal, canCancel, cancelCountdown, orderStatus]);

  // Order number generator
  const generateOrderNumber = () => {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const datePrefix = `${year}${month}${day}`;

    const randomValues = new Uint32Array(1);
    window.crypto.getRandomValues(randomValues);
    const randomSuffix = (randomValues[0] % 10000).toString().padStart(4, '0');

    return `${datePrefix}${randomSuffix}`;
  };

  // Save user preferences for marketing
  const saveUserPreferences = async () => {
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
      }
    } catch (error) {
      console.error('Error saving user preferences:', error);
    }
  };

  // Submit order to Firebase
  const submitOrder = async (paymentMethod, paymentIntentId = null) => {
    try {
      setOrderProcessing(true);

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
        paymentIntentId: paymentIntentId,
        // UNIFIED: All orders are now 'pending' for superuser approval
        status: 'pending',
        // CHANGE: Track payment status separately
        paymentStatus: paymentIntentId ? 'authorized' : 'pending_payment',
        // NEW: Track if this is an authorized payment that needs capture
        requiresCapture: paymentIntentId ? true : false,
        timestamp: serverTimestamp(),
        createdAt: new Date().toISOString()
      };

      const orderRef = await addDoc(collection(firestore, 'orders'), orderData);

      await saveUserPreferences();

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
        await updateDoc(doc(firestore, 'orders', pendingOrder.id), {
          status: 'cancelled',
          cancelledAt: serverTimestamp(),
          cancelledBy: 'customer'
        });
      }
    } catch (error) {
      console.error('❌ Error cancelling order:', error);
      setShowCancelledNotification(true);
      setTimeout(() => setShowCancelledNotification(false), 3000);
    }
  };

  // Handle order cancellation
  const handleOrderCancelled = () => {
    setShowPendingModal(false);
    setPendingOrder(null);
    setCancelCountdown(10);
    setCanCancel(true);
    setSelectedPayment(null);
    setOrderStatus('pending');
    setShowCancelledNotification(true);
    setTimeout(() => setShowCancelledNotification(false), 3000);
  };

  // Handle payment failure
  const handlePaymentFailed = () => {
    setShowPendingModal(false);
    setPendingOrder(null);
    setCancelCountdown(10);
    setCanCancel(true);
    setSelectedPayment(null);
    setOrderStatus('pending');
    alert('Il pagamento non è andato a buon fine. Riprova o scegli un altro metodo di pagamento.');
  };

  // Handle delivery button click
  const handleDeliveryClick = () => {
    setShowDeliveryWarningModal(true);
  };

  // Handle proceeding with delivery after warning
  const proceedWithDelivery = () => {
    setOrderType('consegna');
    setShowDeliveryWarningModal(false);
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
      alert('Note salvate!');
    } else {
      alert('Inserisci delle note prima di salvare!');
    }
  };

  const amendNotes = () => {
    setNotesSaved(false);
    const textarea = document.querySelector('.basket-notes-textarea');
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

    if (method === 'pay-now') {
      setShowStripeModal(true);
    } else {
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
    }
  };

  // Handle successful Stripe payment authorization
  const handleStripeSuccess = async (paymentIntentId) => {
    try {
      setShowStripeModal(false);
      await submitOrder('pay-now', paymentIntentId);
      setShowPendingModal(true);
      setCancelCountdown(10);
      setCanCancel(true); // Allow cancellation until confirmed
      setOrderStatus('pending'); // The order is pending approval
    } catch (error) {
      alert('Errore nell\'invio dell\'ordine. Riprova.');
      setSelectedPayment(null);
    }
  };

  // Handle Stripe payment error
  const handleStripeError = (error) => {
    console.error('Stripe payment error:', error);
    setSelectedPayment(null);
  };

  // Handle Stripe payment cancellation
  const handleStripeCancel = () => {
    setShowStripeModal(false);
    setSelectedPayment(null);
  };

  // Handle leaving the page after order is confirmed
  const handleContinue = () => {
    setShowPendingModal(false);
    cartItems.forEach(item => {
      updateQuantity(item.id, 0); // Clear the cart
    });
    navigate('/menu'); // Navigate away, e.g., back to the menu
  };

  // Create order data for Stripe
  const createOrderDataForStripe = () => ({
    orderType: cart.orderType,
    tableNumber: cart.orderType === 'tavolo' ? cart.tableNumber : null,
    deliveryInfo: cart.orderType === 'consegna' ? cart.deliveryInfo : null,
    items: cartItems,
    notes: cart.notes || '',
    promoCode: cart.promoCode || '',
    totalPrice: total,
  });

  return (
    <Elements stripe={stripePromise}>
      <div className="basket-container">
        <div className="basket-background-overlay" />

        <div className="basket-content">
          <div className="basket-order-summary">
            <div className="basket-summary-header">
              <button className="basket-back-button" onClick={() => navigate('/menu')}>
                <ArrowLeft size={20} />
              </button>
              <h2 className="basket-summary-title">
                RIEPILOGO ORDINE
              </h2>
            </div>

            {/* Cart items */}
            {Object.entries(groupedItems).map(([category, items]) => (
              <div key={category} className="basket-category-group">
                <div className="basket-category-header">
                  {category}
                </div>
                <div className="basket-category-items">
                  {items.map((item) => (
                    <div key={item.id} className="basket-item">
                      <div className="basket-item-count">{item.quantity}</div>
                      <div className="basket-item-name">{item.name}</div>
                      <div className="basket-item-price">
                        €{(parseFloat(item.price.replace('€', '')) * item.quantity).toFixed(2)}
                      </div>
                      <div className="basket-item-controls">
                        <button
                          className="basket-minus-btn"
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          aria-label={`Remove one ${item.name}`}
                        >
                          -
                        </button>
                        <button
                          className="basket-plus-btn"
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
            <div className="basket-total-section">
              <div className="basket-total-row">
                <span className="basket-total-label">Totale ({totalItems}):</span>
                <span className="basket-total-amount">€{total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Promo code */}
          <div className="basket-promo-section">
            <input
              type="text"
              placeholder="Codice promozionale"
              value={cart.promoCode}
              onChange={(e) => setPromoCode(e.target.value)}
              className="basket-promo-input"
            />
            <button className="basket-promo-btn">Applica</button>
          </div>

          {/* Notes section */}
          <div className="basket-notes-section">
            <textarea
              placeholder="Note (allergie, richieste speciali...)"
              value={cart.notes}
              onChange={(e) => {
                setNotes(e.target.value);
                if (notesSaved && e.target.value !== cart.notes) {
                  setNotesSaved(false);
                }
              }}
              rows={3}
              className="basket-notes-textarea"
              disabled={notesSaved}
            />
            <button
              onClick={notesSaved ? amendNotes : saveNotes}
              className={`basket-save-notes-btn ${notesSaved ? 'basket-amend-notes-btn' : ''}`}
            >
              {notesSaved ? 'Modifica Note' : 'Salva Note'}
            </button>
          </div>

          {/* Order type */}
          <div className="basket-order-type-section">
            <h3 className="basket-order-type-title">Tipo di Ordine</h3>
            <div className="basket-order-type-buttons">
              <button
                onClick={() => setOrderType('tavolo')}
                className={`basket-order-type-btn ${cart.orderType === 'tavolo' ? 'active' : ''}`}
              >
                Al Tavolo
              </button>
              <button
                onClick={handleDeliveryClick}
                className={`basket-order-type-btn ${cart.orderType === 'consegna' ? 'active' : ''}`}
              >
                Consegna
              </button>
            </div>
          </div>

          {/* Conditional sections based on order type */}
          {cart.orderType === 'tavolo' && (
            <div className="basket-table-section">
              <label className="basket-table-label">Numero Tavolo:</label>
              <input
                type="text"
                value={cart.tableNumber || ''}
                onChange={(e) => setTableNumber(e.target.value)}
                placeholder="Tavolo 1"
                className="basket-table-input"
              />
            </div>
          )}

          {cart.orderType === 'consegna' && (
            <div className="basket-delivery-section">
              <h3 className="basket-delivery-title">Informazioni Consegna</h3>
              <div className="basket-delivery-grid">
                <input
                  type="text"
                  placeholder="Nome *"
                  value={cart.deliveryInfo.nome || ''}
                  onChange={(e) => setDeliveryInfo({ ...cart.deliveryInfo, nome: e.target.value })}
                  className="basket-delivery-input"
                  required
                />
                <input
                  type="text"
                  placeholder="Cognome *"
                  value={cart.deliveryInfo.cognome || ''}
                  onChange={(e) => setDeliveryInfo({ ...cart.deliveryInfo, cognome: e.target.value })}
                  className="basket-delivery-input"
                  required
                />
                <input
                  type="tel"
                  placeholder="Telefono *"
                  value={cart.deliveryInfo.telefono || ''}
                  onChange={(e) => setDeliveryInfo({ ...cart.deliveryInfo, telefono: e.target.value })}
                  className="basket-delivery-input"
                  required
                />
                <input
                  type="email"
                  placeholder="Email *"
                  value={cart.deliveryInfo.email || ''}
                  onChange={(e) => setDeliveryInfo({ ...cart.deliveryInfo, email: e.target.value })}
                  className="basket-delivery-input"
                  required
                />

                <input
                  type="text"
                  placeholder="Compagnia (opzionale)"
                  value={cart.deliveryInfo.compagnia || ''}
                  onChange={(e) => setDeliveryInfo({ ...cart.deliveryInfo, compagnia: e.target.value })}
                  className="basket-delivery-input basket-delivery-full-width"
                />

                <input
                  type="text"
                  placeholder="Indirizzo *"
                  value={cart.deliveryInfo.indirizzo || ''}
                  onChange={(e) => setDeliveryInfo({ ...cart.deliveryInfo, indirizzo: e.target.value })}
                  className="basket-delivery-input"
                  required
                />
                <input
                  type="text"
                  placeholder="Numero Civico *"
                  value={cart.deliveryInfo.civico || ''}
                  onChange={(e) => setDeliveryInfo({ ...cart.deliveryInfo, civico: e.target.value })}
                  className="basket-delivery-input"
                  required
                />
                <input
                  type="text"
                  placeholder="Città *"
                  value={cart.deliveryInfo.citta || ''}
                  onChange={(e) => setDeliveryInfo({ ...cart.deliveryInfo, citta: e.target.value })}
                  className="basket-delivery-input"
                  required
                />
                <input
                  type="text"
                  placeholder="Provincia *"
                  value={cart.deliveryInfo.provincia || ''}
                  onChange={(e) => setDeliveryInfo({ ...cart.deliveryInfo, provincia: e.target.value })}
                  className="basket-delivery-input"
                  required
                />
                <input
                  type="text"
                  placeholder="CAP *"
                  value={cart.deliveryInfo.cap || ''}
                  onChange={(e) => setDeliveryInfo({ ...cart.deliveryInfo, cap: e.target.value })}
                  className="basket-delivery-input"
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
            className={`basket-confirm-btn ${!isOrderValid() ? 'basket-confirm-btn-disabled' : ''}`}
          >
            CONFERMA ORDINE
          </button>
        </div>

        {/* Delivery Warning Modal */}
        {showDeliveryWarningModal && (
          <div className="basket-modal-overlay">
            <div className="basket-payment-modal">
              <div className="basket-pending-content">
                <div className="basket-pending-icon">
                  <AlertTriangle size={40} color="#ffc107" />
                </div>

                <div className="basket-status-message">
                  <p><strong>Gli ordini a domicilio non accumulano timbri fedeltà.</strong></p>
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                  <button
                    onClick={() => setShowDeliveryWarningModal(false)}
                    className="basket-cancel-btn"
                    style={{ flex: 1 }}
                  >
                    Annulla
                  </button>
                  <button
                    onClick={proceedWithDelivery}
                    className="basket-continue-btn"
                    style={{ flex: 1 }}
                  >
                    Procedi
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Payment Selection Modal */}
        {showPaymentModal && (
          <div className="basket-modal-overlay">
            <div className="basket-payment-modal">
              <div className="basket-modal-header">
                <img src="/images/Dandy.jpeg" alt="Dandy Logo" className="basket-modal-logo" />
                <h3>Pagamento</h3>
                <button
                  onClick={() => setShowPaymentModal(false)}
                  className="basket-modal-close"
                >
                  <X size={15} color="#43221B" />
                </button>
              </div>

              <div className="basket-payment-summary">
                <div className="basket-summary-row">
                  <span>Subtotale ({totalItems} articoli)</span>
                  <span>€{total.toFixed(2)}</span>
                </div>
                <div className="basket-summary-row total">
                  <span>Totale</span>
                  <span>€{total.toFixed(2)}</span>
                </div>
              </div>

              <div className="basket-payment-methods">
                <button
                  onClick={() => handlePaymentSelect('pay-at-till')}
                  className="basket-payment-btn pay-till"
                  disabled={orderProcessing}
                >
                  <CreditCard size={20} />
                  <div>
                    <div className="basket-payment-title">Contanti</div>
                    <div className="basket-payment-subtitle">Paga in Contanti</div>
                  </div>
                </button>

                <button
                  onClick={() => handlePaymentSelect('pay-now')}
                  className="basket-payment-btn pay-now"
                  disabled={orderProcessing}
                >
                  <CreditCard size={20} />
                  <div>
                    <div className="basket-payment-title">Carta</div>
                    <div className="basket-payment-subtitle">Autorizza con Carta di Credito</div>
                  </div>
                </button>
              </div>

              {orderProcessing && (
                <div className="basket-processing-indicator">
                  <Clock size={20} />
                  <span>Elaborazione ordine...</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Stripe Payment Modal */}
        {showStripeModal && (
          <div className="basket-modal-overlay">
            <div className="basket-payment-modal stripe-modal">
              <div className="basket-modal-header">
                <img src="/images/Dandy.jpeg" alt="Dandy Logo" className="basket-modal-logo" />
                <h3>Autorizzazione Pagamento</h3>
                <button
                  onClick={handleStripeCancel}
                  className="basket-modal-close"
                >
                  <X size={15} color="#43221B" />
                </button>
              </div>

              <div className="basket-payment-summary">
                <div className="basket-summary-row">
                  <span>Subtotale ({totalItems} articoli)</span>
                  <span>€{total.toFixed(2)}</span>
                </div>
                <div className="basket-summary-row total">
                  <span>Totale</span>
                  <span>€{total.toFixed(2)}</span>
                </div>
              </div>

              <div className="stripe-payment-container">
                <StripePaymentForm
                  total={total}
                  onSuccess={handleStripeSuccess}
                  onError={handleStripeError}
                  onCancel={handleStripeCancel}
                  orderData={createOrderDataForStripe()}
                />
              </div>
            </div>
          </div>
        )}

        {/* Pending Order Modal */}
        {showPendingModal && pendingOrder && (
          <div className="basket-modal-overlay">
            <div className="basket-pending-modal">
              <div className="basket-pending-shine" />

              <div className="basket-pending-content">
                <div className="basket-pending-icon">
                  {orderStatus === 'confirmed' ? (
                    <CheckCircle size={40} color="#28a745" />
                  ) : (
                    <Clock size={40} color="#ffc107" />
                  )}
                </div>

                <img src="/images/Dandy.jpeg" alt="Dandy Logo" className="basket-pending-logo" />

                <h2 className="basket-pending-title">
                  {orderStatus === 'confirmed' ? 'Ordine Confermato!' : 'Ordine in Attesa di Approvazione'}
                </h2>

                <div className="basket-order-number">
                  Ordine #{pendingOrder.orderNumber}
                </div>

                <div className="basket-status-message">
                  {/* UPDATED: New messaging for unified pending flow */}
                  {orderStatus === 'pending' && pendingOrder.paymentMethod === 'pay-now' ? (
                    <>
                      <p><strong>Autorizzazione Riuscita!</strong></p>
                      <p>Il tuo ordine è in attesa di approvazione dal negozio.</p>
                      <p>Il pagamento verrà addebitato solo se l'ordine viene accettato.</p>
                    </>
                  ) : orderStatus === 'pending' ? (
                    <>
                      <p>Il tuo ordine è stato inviato con successo!</p>
                      <p>È in attesa di approvazione dal negozio.</p>
                    </>
                  ) : orderStatus === 'confirmed' ? (
                    <>
                      <p>Il tuo ordine è stato confermato dal negozio!</p>
                      {pendingOrder.paymentMethod === 'pay-now' && (
                        <p>Il pagamento è stato addebitato con successo.</p>
                      )}
                    </>
                  ) : null}
                </div>

                <div className="basket-order-summary">
                  <div className="basket-summary-item">
                    <strong>Consegna:</strong>
                    <span>{cart.orderType === 'tavolo' ? `Al Tavolo ${cart.tableNumber}` : 'Consegna'}</span>
                  </div>
                  <div className="basket-summary-item">
                    <strong>Totale:</strong>
                    <span>€{total.toFixed(2)}</span>
                  </div>
                  <div className="basket-summary-item">
                    <strong>Pagamento:</strong>
                    <span>{pendingOrder.paymentMethod === 'pay-at-till' ? 'Contanti' : 'Carta di Credito'}</span>
                  </div>
                  <div className="basket-summary-item">
                    <strong>Stato:</strong>
                    <span style={{
                      color: orderStatus === 'confirmed' ? '#28a745' : '#ffc107'
                    }}>
                      {orderStatus === 'confirmed' ? 'Confermato' : 'In Attesa di Approvazione'}
                    </span>
                  </div>
                </div>

                {orderStatus === 'pending' && canCancel && (
                  <div className="basket-cancel-section">
                    <p>Puoi cancellare l'ordine entro:</p>
                    <div className="basket-countdown">
                      <span className="basket-countdown-number">{cancelCountdown}</span>
                      <span>secondi</span>
                    </div>
                    <button
                      onClick={cancelOrder}
                      className="basket-cancel-btn"
                      disabled={!canCancel}
                    >
                      Cancella Ordine
                    </button>
                  </div>
                )}

                {orderStatus === 'confirmed' && (
                  <div className="basket-confirmed-section">
                    <CheckCircle size={32} color="#28a745" />
                    <p>Il negozio sta preparando il tuo ordine!</p>
                    <button
                      onClick={handleContinue}
                      className="basket-continue-btn"
                    >
                      Torna al Menu
                    </button>
                  </div>
                )}

                {orderStatus === 'pending' && !canCancel && (
                  <div className="basket-waiting-section">
                    <Clock size={32} color="#ffc107" />
                    <p>In attesa di approvazione dal negozio...</p>
                    <p className="basket-small-text">Non è più possibile cancellare l'ordine</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Custom Cancellation Notification */}
        {showCancelledNotification && (
          <div className="basket-custom-notification">
            <div className="basket-notification-content">
              <img src="/images/Dandy.jpeg" alt="Dandy Logo" className="basket-notification-logo" />
              <div className="basket-notification-text">
                <h3>Ordine Cancellato</h3>
                <p>Il tuo ordine è stato cancellato con successo.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Elements>
  );
}

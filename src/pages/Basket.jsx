// Optimized NewBasket.jsx - Complete component with enhanced loading states
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Minus, Plus, CreditCard, Clock, CheckCircle, AlertTriangle, Info, ChevronDown, Banknote, Loader } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, firestore, functions } from '../lib/firebase';
import { doc, getDoc, addDoc, collection, updateDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentRequestButtonElement,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js';
import "./Basket.css";
import { useCart } from '../contexts/CartContext';

const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = STRIPE_KEY ? loadStripe(STRIPE_KEY) : null;

if (!STRIPE_KEY) {
  console.error('❌ Stripe publishable key not found. Check your .env file.');
}

// =========================================================================
//  OPTIMIZED Stripe Payment Form Component
// =========================================================================
const StripePaymentForm = ({ total, onSuccess, onError, onCancel, clientSecret, orderData, userProfile }) => {
  const stripe = useStripe();
  const elements = useElements();

  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [paymentRequest, setPaymentRequest] = useState(null);
  const [showCardForm, setShowCardForm] = useState(false);

  useEffect(() => {
    if (!stripe) return;

    const pr = stripe.paymentRequest({
      country: 'IT',
      currency: 'eur',
      total: { label: 'Totale ordine', amount: Math.round(total * 100) },
      requestPayerName: true,
      requestPayerEmail: true,
      requestPayerPhone: true,
    });

    pr.canMakePayment().then(result => {
      if (result) {
        setPaymentRequest(pr);
        console.log('✅ Apple Pay/Google Pay available');
      } else {
        console.log('❌ Apple Pay/Google Pay not available');
      }
    });

    pr.on('paymentmethod', async (ev) => {
      console.log('🍎 Apple Pay payment initiated');
      setProcessing(true);

      try {
        const { paymentIntent, error: confirmError } = await stripe.confirmCardPayment(clientSecret, {
          payment_method: ev.paymentMethod.id,
        });

        if (confirmError) {
          console.error('❌ Apple Pay payment failed:', confirmError);
          ev.complete('fail');
          setErrorMessage(confirmError.message);
          onError(confirmError.message);
        } else {
          if (paymentIntent.status === 'requires_capture') {
            console.log('✅ Apple Pay payment authorized');
            ev.complete('success');
            onSuccess(paymentIntent.id);
          } else {
             console.warn('⚠️ Unexpected payment status:', paymentIntent.status);
             ev.complete('fail');
             onError(`Unexpected payment status: ${paymentIntent.status}`);
          }
        }
      } catch (error) {
        console.error('❌ Apple Pay error:', error);
        ev.complete('fail');
        onError('Errore durante il pagamento. Riprova.');
      } finally {
        setProcessing(false);
      }
    });
  }, [stripe, total, clientSecret, onSuccess, onError]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!stripe || !elements || !showCardForm) return;

    setProcessing(true);
    setErrorMessage('');

    const cardElement = elements.getElement(CardNumberElement);
    const billingName = `${orderData.deliveryInfo?.nome || ''} ${orderData.deliveryInfo?.cognome || ''}`.trim();

    const { error, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: cardElement,
        billing_details: {
            name: billingName || `${userProfile?.firstName || ''} ${userProfile?.lastName || ''}`,
            email: orderData.deliveryInfo?.email || auth.currentUser.email,
        },
      },
    });

    if (error) {
      setErrorMessage(error.message);
      onError(error.message);
    } else {
      if (paymentIntent.status === 'requires_capture') {
        onSuccess(paymentIntent.id);
      } else {
        onError(`Unexpected payment status: ${paymentIntent.status}`);
      }
    }
    setProcessing(false);
  };

  const elementOptions = {
    style: {
      base: {
        fontSize: '16px',
        color: '#ECF0BA',
        '::placeholder': { color: 'rgba(236, 240, 186, 0.5)' },
        fontFamily: 'Raleway, sans-serif',
      },
      invalid: { color: '#ff4444' },
    },
  };

  return (
    <form onSubmit={handleSubmit} className="stripe-payment-form">
      {paymentRequest && (
        <div id="payment-request-button">
          <PaymentRequestButtonElement
            options={{
              paymentRequest,
              style: {
                paymentRequestButton: {
                  theme: 'dark',
                  height: '56px',
                  type: 'default', // Use default for better compatibility
                }
              }
            }}
          />
        </div>
      )}

      {paymentRequest && <div className="form-divider"><span>OPPURE</span></div>}

      <button
        type="button"
        className="stripe-card-toggle-btn"
        onClick={() => setShowCardForm(!showCardForm)}
      >
        <CreditCard size={20} />
        <span>Paga con Carta</span>
        <ChevronDown size={20} className={`chevron-icon ${showCardForm ? 'open' : ''}`} />
      </button>

      {showCardForm && (
        <div className="stripe-card-form-collapsible">
          <div className="stripe-input-container">
            <CardNumberElement options={elementOptions} />
          </div>
          <div className="stripe-input-grid">
            <div className="stripe-input-container">
              <CardExpiryElement options={elementOptions} />
            </div>
            <div className="stripe-input-container">
              <CardCvcElement options={{...elementOptions, placeholder: 'CVC'}} />
            </div>
          </div>

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
              {processing ? 'Autorizzazione...' : `Autorizza €${total.toFixed(2)}`}
            </button>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="stripe-error-message">
          <AlertTriangle size={16} />
          {errorMessage}
        </div>
      )}
    </form>
  );
};

// =========================================================================
//  MAIN Basket Component - Enhanced with Loading States
// =========================================================================
export default function Basket() {
  const navigate = useNavigate();
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

  // State management
  const [notesSaved, setNotesSaved] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [showDeliveryWarningModal, setShowDeliveryWarningModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showStripeModal, setShowStripeModal] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [orderProcessing, setOrderProcessing] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false); // NEW: Specific loading for Stripe
  const [stripeLoadingProgress, setStripeLoadingProgress] = useState(0); // NEW: Progress indicator
  const [pendingOrder, setPendingOrder] = useState(null);
  const [cancelCountdown, setCancelCountdown] = useState(10);
  const [canCancel, setCanCancel] = useState(true);
  const [orderStatus, setOrderStatus] = useState('pending');
  const [showCancelledNotification, setShowCancelledNotification] = useState(false);
  const [stripeClientSecret, setStripeClientSecret] = useState('');

  const createPaymentIntent = httpsCallable(functions, 'createPaymentIntent');
  const cartItems = cart.items;

  const [loadingDots, setLoadingDots] = useState(''); // NEW: For animated dots

  // NEW: Animated loading dots effect
  useEffect(() => {
    let interval;
    if (stripeLoading) {
      setLoadingDots('');
      interval = setInterval(() => {
        setLoadingDots(prev => {
          if (prev === '...') return '';
          return prev + '.';
        });
      }, 500); // Change dots every 500ms
    }
    return () => clearInterval(interval);
  }, [stripeLoading]);

  // Effects
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async user => {
      if (user) {
        try {
          const docRef = doc(firestore, 'users', user.uid);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) setUserProfile(docSnap.data());
        } catch (error) {
          console.error('Error fetching user profile:', error);
        }
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (cart.orderType === 'consegna' && userProfile) {
      const { nome, cognome, email, telefono } = cart.deliveryInfo;
      if (!nome || !cognome || !email || !telefono) {
        setDeliveryInfo({
          ...cart.deliveryInfo,
          nome: nome || userProfile.firstName || '',
          cognome: cognome || userProfile.lastName || '',
          telefono: telefono || userProfile.phone || '',
          email: email || userProfile.email || ''
        });
      }
    }
  }, [cart.orderType, userProfile, setDeliveryInfo, cart.deliveryInfo]);

  useEffect(() => {
    let unsubscribe;
    if (pendingOrder?.id) {
      unsubscribe = onSnapshot(doc(firestore, 'orders', pendingOrder.id), (docSnap) => {
        if (docSnap.exists()) {
          const newStatus = docSnap.data().status;
          setOrderStatus(newStatus);
          if (newStatus === 'confirmed') setCanCancel(false);
          else if (newStatus === 'cancelled') handleOrderCancelled();
        } else handleOrderCancelled();
      });
    }
    return () => unsubscribe && unsubscribe();
  }, [pendingOrder]);

  useEffect(() => {
    let timer;
    if (showPendingModal && canCancel && cancelCountdown > 0) {
      timer = setTimeout(() => setCancelCountdown(prev => prev - 1), 1000);
    } else if (cancelCountdown <= 0) setCanCancel(false);
    return () => clearTimeout(timer);
  }, [showPendingModal, canCancel, cancelCountdown]);

  // Event handlers for modal closing
  const handleOverlayClick = (e, closeFunction) => {
    // Only close if clicking on the overlay itself, not the modal content
    if (e.target === e.currentTarget) {
      closeFunction();
    }
  };

  // Utility functions
  const isOrderValid = () => {
    if (cartItems.length === 0) return false;
    if (cart.orderType === 'tavolo') {
      return cart.tableNumber && cart.tableNumber.trim() !== '';
    }
    if (cart.orderType === 'consegna') {
      const { nome, cognome, telefono, email, indirizzo, civico, citta, provincia, cap } = cart.deliveryInfo;
      return [nome, cognome, telefono, email, indirizzo, civico, citta, provincia, cap]
        .every(field => field && field.trim() !== '');
    }
    return false;
  };

  const generateOrderNumber = () =>
    `${new Date().getFullYear().toString().slice(-2)}${(new Date().getMonth() + 1).toString().padStart(2, '0')}${new Date().getDate().toString().padStart(2, '0')}${Math.floor(Math.random() * 9000) + 1000}`;

  const createOrderDataForStripe = () => ({
    orderType: cart.orderType,
    deliveryInfo: cart.orderType === 'consegna' ? cart.deliveryInfo : null,
  });

  // Event handlers
  const submitOrder = async (paymentMethod, paymentIntentId = null) => {
    setOrderProcessing(true);
    try {
      const orderData = {
        orderNumber: generateOrderNumber(),
        userId: auth.currentUser.uid,
        userName: `${userProfile?.firstName || ''} ${userProfile?.lastName || ''}`,
        userEmail: userProfile?.email || '',
        orderType: cart.orderType,
        tableNumber: cart.orderType === 'tavolo' ? cart.tableNumber : null,
        deliveryInfo: cart.orderType === 'consegna' ? cart.deliveryInfo : null,
        items: cartItems,
        notes: cart.notes || '',
        promoCode: cart.promoCode || '',
        totalPrice: getTotalPrice(),
        paymentMethod,
        paymentIntentId,
        status: 'pending',
        paymentStatus: paymentIntentId ? 'authorized' : 'pending_payment',
        requiresCapture: !!paymentIntentId,
        timestamp: serverTimestamp(),
        createdAt: new Date().toISOString()
      };
      const orderRef = await addDoc(collection(firestore, 'orders'), orderData);
      setPendingOrder({ ...orderData, id: orderRef.id });
    } finally {
      setOrderProcessing(false);
    }
  };

  const handleOrderCancelled = () => {
    setShowPendingModal(false);
    setPendingOrder(null);
    setShowCancelledNotification(true);
    setTimeout(() => setShowCancelledNotification(false), 3000);
  };

  const cancelOrder = async () => {
    if (pendingOrder?.id && canCancel) {
      await updateDoc(doc(firestore, 'orders', pendingOrder.id), {
        status: 'cancelled',
        cancelledBy: 'customer'
      });
    }
  };

  const confirmOrder = () => {
    if (isOrderValid()) {
      setShowPaymentModal(true);
    } else {
      alert('Completa tutti i campi richiesti per procedere');
    }
  };

  const handleContinue = () => {
    setShowPendingModal(false);
    cartItems.forEach(item => updateQuantity(item.id, 0));
    navigate('/menu');
  };

  const handlePaymentSelect = async (method) => {
    setSelectedPayment(method);
    setShowPaymentModal(false);

    if (method === 'pay-now') {
      // NEW: Show loading state immediately with minimum 2 second duration
      setStripeLoading(true);
      setStripeLoadingProgress(0);

      const startTime = Date.now();
      const minLoadingTime = 2000; // 2 seconds minimum

      try {
        console.log('🔄 Creating Payment Intent...');
        const result = await createPaymentIntent({
          amount: Math.round(total * 100),
          currency: 'eur',
          orderData: createOrderDataForStripe(),
          userId: auth.currentUser.uid,
          capture_method: 'manual'
        });

        const { client_secret } = result.data;
        if (client_secret) {
          setStripeClientSecret(client_secret);

          // Ensure minimum loading time has passed
          const elapsedTime = Date.now() - startTime;
          const remainingTime = Math.max(0, minLoadingTime - elapsedTime);

          // Complete the progress and show modal after minimum time
          setStripeLoadingProgress(100);
          setTimeout(() => {
            setStripeLoading(false);
            setShowStripeModal(true);
          }, remainingTime + 300); // Small delay to show completed progress
        } else {
          throw new Error("Client secret not received");
        }
      } catch (error) {
        console.error("Failed to create Payment Intent:", error);
        // Ensure minimum time even for errors
        const elapsedTime = Date.now() - startTime;
        const remainingTime = Math.max(0, minLoadingTime - elapsedTime);

        setTimeout(() => {
          setStripeLoading(false);
          setSelectedPayment(null);
          alert("Errore nell'inizializzazione del pagamento. Riprova.");
        }, remainingTime);
      }
    } else {
      // Cash payment - immediate processing
      setOrderProcessing(true);
      await submitOrder(method);
      setShowPendingModal(true);
      setOrderProcessing(false);
    }
  };

  const handleStripeSuccess = async (paymentIntentId) => {
    setShowStripeModal(false);
    setOrderProcessing(true);
    await submitOrder('pay-now', paymentIntentId);
    setShowPendingModal(true);
    setStripeClientSecret('');
    setOrderProcessing(false);
  };

  const handleStripeError = (error) => {
    console.error('Stripe payment error:', error);
  };

  const handleStripeCancel = () => {
    setShowStripeModal(false);
    setSelectedPayment(null);
    setStripeClientSecret('');
  };

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

  // Computed values
  const total = getTotalPrice();
  const totalItems = getTotalItems();
  const groupedItems = cartItems.reduce((acc, item) => {
    (acc[item.category] = acc[item.category] || []).push(item);
    return acc;
  }, {});

  return (
    <div className="basket-container">
      <div className="basket-background-overlay" />
      <div className="basket-content">
        {/* Order Summary */}
        <div className="basket-order-summary">
          <div className="basket-summary-header">
            <button className="basket-back-button" onClick={() => navigate('/menu')}>
              <ArrowLeft size={20} />
            </button>
            <h2 className="basket-summary-title">RIEPILOGO ORDINE</h2>
          </div>
          {Object.entries(groupedItems).map(([category, items]) => (
            <div key={category} className="basket-category-group">
              <div className="basket-category-header">{category}</div>
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
                      >
                        -
                      </button>
                      <button
                        className="basket-plus-btn"
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="basket-total-section">
            <div className="basket-total-row">
              <span className="basket-total-label">Totale ({totalItems}):</span>
              <span className="basket-total-amount">€{total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Promo Section */}
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

        {/* Notes Section */}
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

        {/* Order Type Section */}
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
              onClick={() => setShowDeliveryWarningModal(true)}
              className={`basket-order-type-btn ${cart.orderType === 'consegna' ? 'active' : ''}`}
            >
              Consegna
            </button>
          </div>
        </div>

        {/* Table Number Input */}
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

        {/* Delivery Info */}
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
                required
              />
            </div>
          </div>
        )}

        {/* Confirm Order Button */}
        <button
          onClick={confirmOrder}
          disabled={!isOrderValid()}
          className={`basket-confirm-btn ${!isOrderValid() ? 'basket-confirm-btn-disabled' : ''}`}
        >
          CONFERMA ORDINE
        </button>
      </div>

      {/* ========== MODALS WITH TAP-TO-CLOSE ========== */}

      {/* NEW: Stripe Loading Modal */}
      {stripeLoading && (
        <div className="basket-modal-overlay">
          <div className="basket-simple-loading-modal">
            <p className="loading-text">Caricamento{loadingDots}</p>
          </div>
        </div>
      )}

      {/* Delivery Warning Modal */}
      {showDeliveryWarningModal && (
        <div
          className="basket-modal-overlay"
          onClick={(e) => handleOverlayClick(e, () => setShowDeliveryWarningModal(false))}
        >
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
                  onClick={() => {
                    setOrderType('consegna');
                    setShowDeliveryWarningModal(false);
                  }}
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

      {/* Payment Method Selection Modal */}
      {showPaymentModal && (
        <div
          className="basket-modal-overlay"
          onClick={(e) => handleOverlayClick(e, () => setShowPaymentModal(false))}
        >
          <div className="basket-payment-modal">
            <div className="basket-modal-header">
              {/* Empty header for spacing */}
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
                <Banknote size={24} />
                <div className="basket-payment-title">Contanti</div>
              </button>
              <button
                onClick={() => handlePaymentSelect('pay-now')}
                className="basket-payment-btn pay-now"
                disabled={orderProcessing}
              >
                <CreditCard size={24} />
                <div className="basket-payment-title">Online</div>
              </button>
            </div>
            {orderProcessing && (
              <div className="basket-processing-indicator">
                <Clock size={20} />
                <span>Elaborazione...</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stripe Payment Modal */}
      {showStripeModal && stripeClientSecret && (
        <div
          className="basket-modal-overlay"
          onClick={(e) => handleOverlayClick(e, handleStripeCancel)}
        >
          <div className="basket-payment-modal stripe-modal">
            <div className="basket-modal-header">
              <div className="payment-authorization-notice">
                <Info size={16} />
                <span>Il pagamento verrà addebitato dopo l'approvazione dell'ordine.</span>
              </div>
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
              <Elements stripe={stripePromise} options={{ clientSecret: stripeClientSecret }}>
                <StripePaymentForm
                  total={total}
                  clientSecret={stripeClientSecret}
                  onSuccess={handleStripeSuccess}
                  onError={handleStripeError}
                  onCancel={handleStripeCancel}
                  orderData={createOrderDataForStripe()}
                  userProfile={userProfile}
                />
              </Elements>
            </div>
          </div>
        </div>
      )}

      {/* Pending Order Modal */}
      {showPendingModal && pendingOrder && (
        <div
          className="basket-modal-overlay"
          onClick={(e) => {
            // Only allow closing if order is confirmed or cancelled
            if (orderStatus === 'confirmed' || orderStatus === 'cancelled') {
              handleOverlayClick(e, () => setShowPendingModal(false));
            }
          }}
        >
          <div className="basket-pending-modal">
            <div className="basket-pending-content">
              <div className="basket-pending-icon">
                {orderStatus === 'confirmed' ? (
                  <CheckCircle size={40} color="#28a745" />
                ) : (
                  <Clock size={40} color="#ffc107" />
                )}
              </div>
              <h2 className="basket-pending-title">
                {orderStatus === 'confirmed' ? '' : ''}
              </h2>
              <div className="basket-order-number">Ordine #{pendingOrder.orderNumber}</div>
              <div className="basket-status-message">
                {orderStatus === 'pending' && pendingOrder.paymentMethod === 'pay-now' && (
                  <p></p>
                )}
                {orderStatus === 'pending' && pendingOrder.paymentMethod === 'pay-at-till' && (
                  <p>Il tuo ordine è in attesa di approvazione.</p>
                )}
                {orderStatus === 'confirmed' && (
                  <p></p>
                )}
              </div>
              <div className="basket-order-summary">
                <div className="basket-summary-item">
                  <strong>Consegna:</strong>
                  <span>
                    {cart.orderType === 'tavolo' ? `Tavolo ${cart.tableNumber}` : 'Consegna'}
                  </span>
                </div>
                <div className="basket-summary-item">
                  <strong>Totale:</strong>
                  <span>€{total.toFixed(2)}</span>
                </div>
                <div className="basket-summary-item">
                  <strong>Pagamento:</strong>
                  <span>
                    {pendingOrder.paymentMethod === 'pay-at-till' ? 'Contanti' : 'Online'}
                  </span>
                </div>
                <div className="basket-summary-item">
                  <strong>Stato:</strong>
                  <span style={{
                    color: orderStatus === 'confirmed' ? '#28a745' : '#ffc107'
                  }}>
                    {orderStatus === 'confirmed' ? 'Confermato' : 'In Attesa'}
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
                  <p>Stiamo preparando il tuo ordine!</p>
                  <button onClick={handleContinue} className="basket-continue-btn">
                    Torna al Menu
                  </button>
                </div>
              )}

              {orderStatus === 'pending' && !canCancel && (
                <div className="basket-waiting-section">
                  <p className="basket-small-text">Non è più possibile cancellare l'ordine</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancelled Order Notification */}
      {showCancelledNotification && (
        <div className="basket-custom-notification">
          <div className="basket-notification-content">
            <div className="basket-notification-text">
              <h3>Ordine Cancellato</h3>
              <p>Il tuo ordine è stato cancellato.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

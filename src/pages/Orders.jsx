import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  query,
  orderBy,
  limit,
  where,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';
import { firestore } from '../lib/firebase';
import Nav from '../components/Nav';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSearch,
  faQrcode,
  faCheck,
  faSpinner,
  faClock,
  faUser,
  faHashtag,
  faMapMarkerAlt,
  faUtensils,
  faExclamationTriangle,
  faEuroSign,
  faCreditCard,
  faCalendarAlt,
  faVolumeUp,
  faVolumeMute,
  faTimes,
  faStickyNote,
  faPhone,
  faBuilding,
  faListOl,
  faHome,
  faTruck,
  faMoneyBillWave,
  faCheckCircle
} from '@fortawesome/free-solid-svg-icons';
import './Orders.css';

// --- Enhanced OrderCard Component ---
const OrderCard = ({ order, onConfirm, onCancel, onConfirmPayment, onRejectPayment, processingOrders, isModal = false, isGhosted = false, paymentConfirmed = false, paymentOverdue = false }) => {
  const isPending = order.status === 'pending';
  const isProcessing = processingOrders.has(order.id);
  const isCashPayment = order.paymentMethod === 'pay-at-till' || order.paymentMethod === 'cash' || order.paymentMethod === 'contanti';

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A';
    return timestamp.toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPaymentMethodDisplay = (method) => ({
    'pay-at-till': 'Contanti',
    'pay-now': 'Carta Online',
    'card': 'Carta',
    'cash': 'Contanti',
    'contanti': 'Contanti'
  }[method] || method || 'N/A');

  // **MODIFICATION**: Determine CSS class for cancellation type
  const cancellationClass =
    order.status === 'cancelled'
      ? (order.cancelledBy === 'user' || order.cancelledBy === 'customer')
        ? 'user-cancelled'
        : 'superuser-cancelled'
      : '';

  const cardClasses = [
    'order-card',
    `status-${order.status}`,
    isGhosted ? 'ghosted' : '',
    paymentOverdue ? 'payment-overdue' : ''
  ].filter(Boolean).join(' ');

  return (
    <div className={cardClasses} data-order-id={order.id}>
      {/* Ghosting overlay */}
      {isGhosted && (
        <div className="ghosting-overlay">
          <div className="ghosting-message">
            <FontAwesomeIcon icon={faClock} />
            <span>Nuovo ordine in arrivo...</span>
          </div>
        </div>
      )}

      {/* Card Header with Order Number and Price */}
      <div className="card-header">
        <div className="card-header-left">
          <span className="order-number-label">#</span>
          <span className="order-number">{order.orderNumber || 'N/A'}</span>
        </div>
        <div className="card-header-right">
          <span className="total-price">€{order.totalPrice?.toFixed(2) || '0.00'}</span>
        </div>
      </div>

      <div className="card-body">
        {/* Date and Name on same line */}
        <div className="card-row">
          <div className="detail-item">
            <FontAwesomeIcon icon={faCalendarAlt} />
            <span>{formatTimestamp(order.timestamp)}</span>
          </div>
          <div className="detail-item">
            <FontAwesomeIcon icon={faUser} />
            <span>{order.userName || 'Cliente Sconosciuto'}</span>
          </div>
        </div>

        {/* Location Details */}
        <div className="card-section">
          {order.orderType === 'tavolo' ? (
            <div className="detail-item">
              <FontAwesomeIcon icon={faHome} />
              <span>Tavolo: <strong>{order.tableNumber || 'N/A'}</strong></span>
            </div>
          ) : (
            <>
              <div className="detail-item">
                <FontAwesomeIcon icon={faTruck} />
                <span>{order.deliveryInfo?.indirizzo}, {order.deliveryInfo?.civico} - {order.deliveryInfo?.citta}</span>
              </div>
              {/* Display phone number if it exists in deliveryInfo */}
              {order.deliveryInfo?.telefono && (
                <div className="detail-item delivery-phone-item">
                  <FontAwesomeIcon icon={faPhone} />
                  <span>{order.deliveryInfo.telefono}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Items section with category grouping */}
        <div className="items-section">
          <div className="items-header">
            <FontAwesomeIcon icon={faUtensils} />
            <span>({order.items?.length || 0})</span>
          </div>

          {/* Group items by category and display dynamically */}
          {(() => {
            // Group items by category
            const groupedItems = (order.items || []).reduce((acc, item) => {
              const category = item.category || 'Altro';
              (acc[category] = acc[category] || []).push(item);
              return acc;
            }, {});

            return Object.entries(groupedItems).map(([category, items]) => (
              <div key={category} className="items-category-group">
                <div className="items-category-header">{category}</div>
                <ul className="items-list">
                  {items.map((item, index) => (
                    <li key={`${category}-${index}`}>
                      <span className="item-info">
                        <span className="item-quantity">{item.quantity}x</span>
                        <span className="item-name">{item.name}</span>
                      </span>
                      {item.price && !isNaN(Number(item.price)) && (
                        <span className="item-price">€{Number(item.price).toFixed(2)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ));
          })()}

          {/* Notes included in items section */}
          {order.notes && (
            <div className="notes-in-items">
              <div className="notes-item">
                <span className="notes-label"><FontAwesomeIcon icon={faExclamationTriangle} /> Note Speciali:</span>
                <span className="notes-text">{order.notes}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Card Footer with unified payment display */}
      <div className="card-footer">
        <div className={`payment-info-section ${
          order.status === 'confirmed' &&
          isCashPayment &&
          !order.paymentConfirmed &&
          !order.paymentRejected &&
          paymentOverdue ? 'payment-overdue-section' : ''
        }`}
        onClick={() => {
          // Make entire section clickable when overdue for dramatic effect
          if (order.status === 'confirmed' &&
              isCashPayment &&
              !order.paymentConfirmed &&
              !order.paymentRejected &&
              paymentOverdue &&
              !isModal) {
            onConfirmPayment(order.id);
          }
        }}
        style={{
          cursor: (order.status === 'confirmed' &&
                  isCashPayment &&
                  !order.paymentConfirmed &&
                  !order.paymentRejected &&
                  paymentOverdue &&
                  !isModal) ? 'pointer' : 'default'
        }}
        title={
          (order.status === 'confirmed' &&
           isCashPayment &&
           !order.paymentConfirmed &&
           !order.paymentRejected &&
           paymentOverdue &&
           !isModal) ? 'PAGAMENTO SCADUTO! Clicca per confermare il pagamento ricevuto' : ''
        }
        >
          <div className="payment-method-row">
            <FontAwesomeIcon icon={faCreditCard} />
            <span>{getPaymentMethodDisplay(order.paymentMethod)}</span>
          </div>

          {/* Payment Status Row - Show payment status for all payment types */}
          {order.status === 'confirmed' && (
            <div className="payment-status-row">
              {/* UNIFIED PAYMENT STATUS DISPLAY */}
              {order.paymentConfirmed ? (
                // Payment confirmed - same styling for both cash and card
                <div className="payment-status-indicator" style={{ color: '#28a745' }}>
                  <FontAwesomeIcon icon={faCheckCircle} />
                  <span>Pagato</span>
                </div>
              ) : order.paymentRejected ? (
                // Payment rejected
                <div className="payment-status-indicator" style={{ color: '#f44336' }}>
                  <FontAwesomeIcon icon={faTimes} />
                  <span>Rifiutato</span>
                </div>
              ) : isCashPayment ? (
                // Cash payment - waiting for confirmation with overdue styling
                <div
                  className={`payment-status-indicator payment-clickable ${paymentOverdue ? 'payment-overdue-text' : ''}`}
                  style={{ color: paymentOverdue ? '#f44336' : '#ffc107' }}
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent double-click when section is also clickable
                    if (!isModal) onConfirmPayment(order.id);
                  }}
                  title="Clicca per confermare il pagamento ricevuto"
                >
                  <FontAwesomeIcon icon={faMoneyBillWave} />
                  <span>{paymentOverdue ? 'NON PAGATO!' : 'In Attesa'}</span>
                </div>
              ) : (
                // Card payment - show as paid (already processed)
                <div className="payment-status-indicator" style={{ color: '#28a745' }}>
                  <FontAwesomeIcon icon={faCheckCircle} />
                  <span>Pagato</span>
                </div>
              )}
            </div>
          )}
        </div>

        {!isModal && (
          isPending ? (
            <div className="card-actions">
              <button
                onClick={() => onCancel(order.id)}
                disabled={isGhosted || isProcessing}
                className="action-btn cancel-btn"
                title="Cancella Ordine"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
              <button
                onClick={() => onConfirm(order.id)}
                disabled={isGhosted || isProcessing}
                className="action-btn confirm-btn"
                title="Conferma Ordine"
              >
                {isProcessing ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faCheck} />}
              </button>
            </div>
          ) : (
            // **MODIFICATION**: The className now includes the dynamic cancellationClass
            <div className={`status-badge status-${order.status} ${cancellationClass}`}>
              <FontAwesomeIcon
                icon={order.status === 'confirmed' ? faCheck : faTimes}
                // **MODIFICATION**: Inline style removed, color handled by CSS
              />
              {/* In the order status here you can add Confermato or Cancellato - currently only showing a ✅ or X*/}
              <span>{order.status === 'confirmed' ? '' : ''}</span>
            </div>
          )
        )}
      </div>
    </div>
  );
};

// --- Main Orders Component ---
export default function Orders() {
  const navigate = useNavigate();
  const [allOrders, setAllOrders] = useState([]);
  const [cardOrders, setCardOrders] = useState([]);
  const [tableOrders, setTableOrders] = useState([]);
  const [filteredCardOrders, setFilteredCardOrders] = useState([]);
  const [filteredTableOrders, setFilteredTableOrders] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [processingOrders, setProcessingOrders] = useState(new Set());
  const [selectedOrder, setSelectedOrder] = useState(null);

  // New state for enhancements
  const [newOrders, setNewOrders] = useState(new Set());
  const [paymentOverdueOrders, setPaymentOverdueOrders] = useState(new Set());
  const previousOrderIds = useRef(new Set());
  const paymentTimers = useRef(new Map()); // Track payment timers
  const paymentCheckInterval = useRef(null); // For live updates

  // Fetch orders with real-time updates - FIXED VERSION
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const ordersQuery = query(
      collection(firestore, 'orders'),
      orderBy('timestamp', 'desc'),
      limit(200)
    );

    let isInitialLoad = true;

    const unsubscribe = onSnapshot(ordersQuery, (snapshot) => {
      const orders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate()
      }));

      console.log('📦 Orders updated:', orders.length);

      const currentOrderIds = new Set(orders.map(order => order.id));

      if (!isInitialLoad) {
        // Only detect new orders after the initial load
        const newOrderIds = new Set();

        currentOrderIds.forEach(id => {
          if (!previousOrderIds.current.has(id)) {
            newOrderIds.add(id);
          }
        });

        if (newOrderIds.size > 0) {
          console.log('👻 New orders detected:', Array.from(newOrderIds));
          setNewOrders(prev => new Set([...prev, ...newOrderIds]));

          // Set timeout to remove ghosting after 10 seconds
          newOrderIds.forEach(orderId => {
            setTimeout(() => {
              setNewOrders(prev => {
                const newSet = new Set(prev);
                newSet.delete(orderId);
                return newSet;
              });
            }, 10000);
          });
        }
      } else {
        // On initial load, just populate previousOrderIds without triggering new order detection
        console.log('📋 Initial load - setting up existing order IDs:', currentOrderIds.size);
        isInitialLoad = false;
      }

      // Always update the previousOrderIds for future comparisons
      previousOrderIds.current = currentOrderIds;
      setAllOrders(orders);

      if (loading) setLoading(false);
    }, (error) => {
      console.error('❌ Error setting up orders listener:', error);
      if (loading) setLoading(false);
    });

    return () => unsubscribe();
  }, [loading]);

  // Process and sort orders
  useEffect(() => {
    // Sort all orders: pending first, then by timestamp
    const sortedOrders = [...allOrders].sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (b.status === 'pending' && a.status !== 'pending') return 1;
      return (b.timestamp || new Date(0)).getTime() - (a.timestamp || new Date(0)).getTime();
    });

    // Split orders into cards (max 12) and table
    const cards = sortedOrders.slice(0, 12);
    const table = sortedOrders.slice(12);

    setCardOrders(cards);
    setTableOrders(table);
  }, [allOrders]);

  // Filter orders based on search term
  useEffect(() => {
    const searchLower = searchTerm.toLowerCase();
    const filterFn = (order) => (
      order.userName?.toLowerCase().includes(searchLower) ||
      order.userEmail?.toLowerCase().includes(searchLower) ||
      order.deliveryInfo?.telefono?.includes(searchLower) ||
      order.deliveryInfo?.phone?.includes(searchLower) ||
      order.orderNumber?.toLowerCase().includes(searchLower) ||
      order.tableNumber?.toLowerCase().includes(searchLower)
    );

    setFilteredCardOrders(searchTerm ? cardOrders.filter(filterFn) : cardOrders);
    setFilteredTableOrders(searchTerm ? tableOrders.filter(filterFn) : tableOrders);
  }, [searchTerm, cardOrders, tableOrders]);

  // IMPROVED: Real-time payment overdue tracking with live updates
  useEffect(() => {
    const checkPaymentOverdue = () => {
      const currentTime = Date.now();
      const newOverdueOrders = new Set();

      allOrders.forEach(order => {
        const isCashPayment = order.paymentMethod === 'pay-at-till' || order.paymentMethod === 'cash' || order.paymentMethod === 'contanti';

        if (isCashPayment && order.status === 'confirmed' && !order.paymentConfirmed && !order.paymentRejected) {
          const confirmationTime = order.confirmedAt?.toDate?.()?.getTime() || order.confirmedAt?.getTime() || 0;

          if (confirmationTime) {
            const timeElapsed = currentTime - confirmationTime;
            const overdueThreshold = 60 * 1000; // 1 minute in milliseconds

            if (timeElapsed > overdueThreshold) {
              newOverdueOrders.add(order.id);
              console.log(`🔴 Order ${order.id} is payment overdue (${Math.round(timeElapsed/1000)}s elapsed)`);
            }
          }
        }
      });

      // Update overdue orders state if changed
      setPaymentOverdueOrders(prev => {
        const prevArray = Array.from(prev).sort();
        const newArray = Array.from(newOverdueOrders).sort();

        if (JSON.stringify(prevArray) !== JSON.stringify(newArray)) {
          console.log('🔴 Payment overdue orders updated:', Array.from(newOverdueOrders));
          return newOverdueOrders;
        }
        return prev;
      });
    };

    // Initial check
    checkPaymentOverdue();

    // Set up interval to check every 5 seconds for live updates
    paymentCheckInterval.current = setInterval(checkPaymentOverdue, 5000);

    // Cleanup interval on unmount or dependency change
    return () => {
      if (paymentCheckInterval.current) {
        clearInterval(paymentCheckInterval.current);
        paymentCheckInterval.current = null;
      }
    };
  }, [allOrders]);

  // Update order status
  const updateOrderStatus = async (orderId, status) => {
    const data = {
      status,
      [`${status}At`]: serverTimestamp(),
      [`${status}By`]: 'superuser'
    };

    try {
      console.log(`🔄 Updating order ${orderId} to ${status}`);
      setProcessingOrders(prev => new Set([...prev, orderId]));
      await updateDoc(doc(firestore, 'orders', orderId), data);
      console.log(`✅ Order ${orderId} successfully updated to ${status}`);

      // Play sound notification if enabled
      if (soundEnabled) {
        console.log('🔊 Playing notification sound');
      }
    } catch (error) {
      console.error(`❌ Error updating order ${orderId} to ${status}:`, error);
      alert(`Errore nell'aggiornamento dell'ordine. Riprova.`);
    } finally {
      setProcessingOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(orderId);
        return newSet;
      });
    }
  };

  // Confirm payment received
  const confirmPayment = async (orderId) => {
    try {
      console.log(`💰 Confirming payment for order ${orderId}`);
      await updateDoc(doc(firestore, 'orders', orderId), {
        paymentConfirmed: true,
        paymentConfirmedAt: serverTimestamp(),
        paymentConfirmedBy: 'superuser'
      });

      // Remove from overdue immediately
      setPaymentOverdueOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(orderId);
        return newSet;
      });

      console.log(`✅ Payment confirmed for order ${orderId}`);
    } catch (error) {
      console.error(`❌ Error confirming payment for order ${orderId}:`, error);
      alert(`Errore nella conferma del pagamento. Riprova.`);
    }
  };

  // Reject payment (mark as payment rejected)
  const rejectPayment = async (orderId) => {
    try {
      console.log(`💰 Rejecting payment for order ${orderId}`);
      await updateDoc(doc(firestore, 'orders', orderId), {
        paymentRejected: true,
        paymentRejectedAt: serverTimestamp(),
        paymentRejectedBy: 'superuser'
      });

      // Remove from overdue immediately
      setPaymentOverdueOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(orderId);
        return newSet;
      });

      console.log(`❌ Payment rejected for order ${orderId}`);
    } catch (error) {
      console.error(`❌ Error rejecting payment for order ${orderId}:`, error);
      alert(`Errore nel rifiuto del pagamento. Riprova.`);
    }
  };

  const confirmOrder = (orderId) => updateOrderStatus(orderId, 'confirmed');

  const cancelOrder = (orderId) => {
    if (window.confirm('Sei sicuro di voler cancellare questo ordine?')) {
      updateOrderStatus(orderId, 'cancelled');
    }
  };

  // Format timestamp for table display
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A';
    return timestamp.toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Check if payment is overdue using real-time state
  const isPaymentOverdue = (order) => {
    return paymentOverdueOrders.has(order.id);
  };

  // Table row component
  const OrderTableRow = ({ order }) => (
    <tr className="order-table-row" onClick={() => setSelectedOrder(order)}>
      <td>{formatTimestamp(order.timestamp)}</td>
      <td>{order.orderNumber}</td>
      <td>{order.userName || 'N/A'}</td>
      <td>
        {order.orderType === 'tavolo' ? (
          <span><FontAwesomeIcon icon={faHome} /> Tavolo {order.tableNumber}</span>
        ) : (
          <span><FontAwesomeIcon icon={faTruck} /> Consegna</span>
        )}
      </td>
      <td>€{order.totalPrice?.toFixed(2)}</td>
      <td className={`status-cell status-${order.status}`}>
        {order.status === 'confirmed' && <FontAwesomeIcon icon={faCheck} />}
        {order.status === 'cancelled' && (
          <FontAwesomeIcon
            icon={faTimes}
            style={{
              color: order.cancelledBy === 'user' || order.cancelledBy === 'customer' ? '#ff9800' : '#f44336'
            }}
          />
        )}
        {order.status === 'pending' && <FontAwesomeIcon icon={faClock} />}
        <span style={{marginLeft: '0.5rem'}}>{order.status}</span>
      </td>
    </tr>
  );

  // Loading state
  if (loading) {
    return (
      <div className="orders-container">
        <Nav />
        <div className="orders-loading">
          <FontAwesomeIcon icon={faSpinner} spin size="3x" />
          <p>Caricamento ordini in corso...</p>
        </div>
      </div>
    );
  }

  const pendingCount = cardOrders.filter(o => o.status === 'pending').length;

  return (
    <div className="orders-container">
      <Nav />

      {/* Modal for order details */}
      {selectedOrder && (
        <div className="modal-overlay" onClick={() => setSelectedOrder(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setSelectedOrder(null)}>
              <FontAwesomeIcon icon={faTimes} />
            </button>
            <OrderCard
              order={selectedOrder}
              processingOrders={processingOrders}
              isModal={true}
              paymentConfirmed={selectedOrder.paymentConfirmed}
              paymentOverdue={isPaymentOverdue(selectedOrder)}
            />
          </div>
        </div>
      )}

      {/* Header Section */}
      <header className="orders-header">
        <div className="header-top">
          <h1>Gestione Ordini</h1>
          <div className="header-actions">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`sound-toggle ${soundEnabled ? 'enabled' : 'disabled'}`}
              title={soundEnabled ? 'Disabilita suoni' : 'Abilita suoni'}
            >
              <FontAwesomeIcon icon={soundEnabled ? faVolumeUp : faVolumeMute} />
              <span>{soundEnabled ? 'Audio On' : 'Audio Off'}</span>
            </button>
            <button onClick={() => navigate('/scan')} className="scan-btn">
              <FontAwesomeIcon icon={faQrcode} />
              <span>Scan QR</span>
            </button>
          </div>
        </div>

        <div className="search-bar">
          <FontAwesomeIcon icon={faSearch} className="search-icon" />
          <input
            type="text"
            placeholder="Cerca per nome, email, telefono, numero ordine, tavolo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
      </header>

      <main className="orders-content">
        {/* Recent Orders Section */}
        <section className="orders-section">
          <h2>
            <FontAwesomeIcon icon={faClock} />
            Ordini Recenti
            {pendingCount > 0 && (
              <span className="pending-indicator">
                <FontAwesomeIcon icon={faExclamationTriangle} />
                {pendingCount} in attesa
              </span>
            )}
          </h2>

          {filteredCardOrders.length > 0 ? (
            <div className="orders-card-grid">
              {filteredCardOrders.map(order => {
                const overdue = isPaymentOverdue(order);
                return (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onConfirm={confirmOrder}
                    onCancel={cancelOrder}
                    onConfirmPayment={confirmPayment}
                    onRejectPayment={rejectPayment}
                    processingOrders={processingOrders}
                    isGhosted={newOrders.has(order.id)}
                    paymentConfirmed={order.paymentConfirmed}
                    paymentOverdue={overdue}
                  />
                );
              })}
            </div>
          ) : (
            <div className="no-orders-message">
              <FontAwesomeIcon icon={faListOl} size="2x" style={{marginBottom: '1rem'}} />
              <p>Nessun ordine recente da mostrare.</p>
            </div>
          )}
        </section>

        {/* Previous Orders Section */}
        <section className="orders-section">
          <h2>
            <FontAwesomeIcon icon={faListOl} />
            Ordini Precedenti
          </h2>

          {filteredTableOrders.length > 0 ? (
            <div className="table-container">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th><FontAwesomeIcon icon={faCalendarAlt} /> Data/Ora</th>
                    <th><FontAwesomeIcon icon={faHashtag} /> N. Ordine</th>
                    <th><FontAwesomeIcon icon={faUser} /> Cliente</th>
                    <th><FontAwesomeIcon icon={faMapMarkerAlt} /> Tipo</th>
                    <th><FontAwesomeIcon icon={faEuroSign} /> Totale</th>
                    <th><FontAwesomeIcon icon={faCheck} /> Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTableOrders.map(order => (
                    <OrderTableRow key={order.id} order={order} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="no-orders-message">
              <FontAwesomeIcon icon={faListOl} size="2x" style={{marginBottom: '1rem'}} />
              <p>Nessun ordine precedente trovato.</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

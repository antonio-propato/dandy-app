// Orders.jsx
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
  faPhone, // <-- IMPORT THE PHONE ICON
  faBuilding,
  faListOl,
  faHome,
  faTruck
} from '@fortawesome/free-solid-svg-icons';
import './Orders.css';

// --- Enhanced OrderCard Component ---
const OrderCard = ({ order, onConfirm, onCancel, processingOrders, isModal = false }) => {
  const isPending = order.status === 'pending';
  const isProcessing = processingOrders.has(order.id);

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
    'pay-now': 'Online',
    'card': 'Carta',
    'cash': 'Contanti'
  }[method] || method || 'N/A');

  return (
    <div className={`order-card status-${order.status}`} data-order-id={order.id}>
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
              {/* --- THIS IS THE FIX --- */}
              {/* Display phone number if it exists in deliveryInfo */}
              {order.deliveryInfo?.telefono && (
                <div className="detail-item telephone-number">
                  <FontAwesomeIcon icon={faPhone} />
                  <span>{order.deliveryInfo.telefono}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Items section with notes included */}
        <div className="items-section">
          <div className="items-header">
            <FontAwesomeIcon icon={faUtensils} />
            <span>({order.items?.length || 0})</span>
          </div>
          <ul className="items-list">
            {order.items?.map((item, index) => (
              <li key={index}>
                <span className="item-info">
                  <span className="item-quantity">{item.quantity}x</span>
                  <span className="item-name">{item.name}</span>
                </span>
                {item.price && !isNaN(Number(item.price)) && (
                  <span className="item-price">{Number(item.price).toFixed(2)}</span>
                )}
              </li>
            ))}
          </ul>

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

      {/* Card Footer */}
      <div className="card-footer">
        <div className="payment-method">
          <FontAwesomeIcon icon={faCreditCard} />
          <span>{getPaymentMethodDisplay(order.paymentMethod)}</span>
        </div>

        {!isModal && (
          isPending ? (
            <div className="card-actions">
              <button
                onClick={() => onCancel(order.id)}
                disabled={isProcessing}
                className="action-btn cancel-btn"
                title="Cancella Ordine"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
              <button
                onClick={() => onConfirm(order.id)}
                disabled={isProcessing}
                className="action-btn confirm-btn"
                title="Conferma Ordine"
              >
                {isProcessing ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faCheck} />}
              </button>
            </div>
          ) : (
            <div className={`status-badge status-${order.status}`}>
              <FontAwesomeIcon icon={order.status === 'confirmed' ? faCheck : faTimes} />
              <span>{order.status === 'confirmed' ? 'Confermato' : 'Cancellato'}</span>
            </div>
          )
        )}
      </div>
    </div>
  );
};


// The rest of the Orders.jsx file remains unchanged.
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

  // Fetch orders with real-time updates
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const ordersQuery = query(
      collection(firestore, 'orders'),
      orderBy('timestamp', 'desc'),
      limit(200)
    );

    const unsubscribe = onSnapshot(ordersQuery, (snapshot) => {
      const orders = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate()
      }));

      console.log('📦 Orders updated:', orders.length);
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
        // You can add sound notification here
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
        {order.status === 'cancelled' && <FontAwesomeIcon icon={faTimes} />}
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
              {filteredCardOrders.map(order => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onConfirm={confirmOrder}
                  onCancel={cancelOrder}
                  processingOrders={processingOrders}
                />
              ))}
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

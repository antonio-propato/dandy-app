// OrdersLog.jsx - Complete Analytics Dashboard for Orders
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { firestore, auth } from '../lib/firebase';
import './OrdersLog.css'; // Updated CSS file with proper class names

export default function OrdersLog() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [ordersHistory, setOrdersHistory] = useState([]);
  const [filteredHistory, setFilteredHistory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [stats, setStats] = useState({
    totalOrders: 0,
    todayOrders: 0,
    totalRevenue: 0,
    todayRevenue: 0,
    avgOrderValue: 0,
    pendingOrders: 0,
    confirmedOrders: 0,
    cancelledOrders: 0
  });

  // Check for filter parameter from dashboard
  useEffect(() => {
    const filterParam = searchParams.get('filter');
    if (filterParam === 'today') {
      setDateToToday();
    }
  }, [searchParams]);

  useEffect(() => {
    const checkSuperUser = async () => {
      if (!auth.currentUser) {
        navigate('/signin');
        return;
      }

      try {
        const userDoc = await getDoc(doc(firestore, 'users', auth.currentUser.uid));
        if (!userDoc.exists() || userDoc.data().role !== 'superuser') {
          navigate('/profile');
          return;
        }

        await loadOrdersHistory();
      } catch (err) {
        console.error('Error checking user role:', err);
        navigate('/signin');
      } finally {
        setLoading(false);
      }
    };

    checkSuperUser();
  }, [navigate]);

  const formatDateForComparison = (date) => {
    const d = new Date(date);
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  };

  const isToday = (timestamp) => {
    if (!timestamp) return false;
    const today = formatDateForComparison(new Date());
    const orderDate = formatDateForComparison(timestamp);
    return today === orderDate;
  };

  const loadOrdersHistory = async () => {
    try {
      console.log('🔍 Loading orders history...');

      // Get ALL orders for accurate lifetime revenue calculation
      // We'll process all orders for stats but only show recent ones in the list
      const allOrdersQuery = query(
        collection(firestore, 'orders'),
        orderBy('timestamp', 'desc')
        // No limit for accurate lifetime calculations
      );

      const unsubscribe = onSnapshot(allOrdersQuery, (snapshot) => {
        const allOrders = [];
        let totalOrdersCount = 0;
        let todayOrdersCount = 0;
        let totalRevenueSum = 0;
        let todayRevenueSum = 0;
        let pendingCount = 0;
        let confirmedCount = 0;
        let cancelledCount = 0;

        console.log(`📊 Processing ${snapshot.docs.length} total orders for accurate calculations`);

        snapshot.docs.forEach((doc, index) => {
          const orderData = doc.data();
          const orderId = doc.id;
          const timestamp = orderData.timestamp?.toDate();

          if (timestamp) {
            totalOrdersCount++;
            const totalPrice = orderData.totalPrice || 0;

            // Add to TOTAL LIFETIME REVENUE (all orders)
            totalRevenueSum += totalPrice;

            const orderIsToday = isToday(timestamp);
            if (orderIsToday) {
              todayOrdersCount++;
              todayRevenueSum += totalPrice;
            }

            // Count by status (all orders)
            switch (orderData.status) {
              case 'pending':
                pendingCount++;
                break;
              case 'confirmed':
                confirmedCount++;
                break;
              case 'cancelled':
                cancelledCount++;
                break;
            }

            // Only add to display list if within first 1000 orders (for performance)
            // Stats are calculated from ALL orders above
            if (index < 1000) {
              allOrders.push({
                id: orderId,
                orderNumber: orderData.orderNumber || 'N/A',
                userName: orderData.userName || 'Cliente Sconosciuto',
                userEmail: orderData.userEmail || '',
                timestamp: timestamp,
                totalPrice: totalPrice,
                status: orderData.status || 'unknown',
                orderType: orderData.orderType || 'unknown',
                tableNumber: orderData.tableNumber || '',
                deliveryInfo: orderData.deliveryInfo || {},
                paymentMethod: orderData.paymentMethod || 'N/A',
                items: orderData.items || [],
                notes: orderData.notes || '',
                isToday: orderIsToday,
                dateString: formatDateForComparison(timestamp)
              });
            }
          }
        });

        // Calculate average order value from ALL orders
        const avgOrderValue = totalOrdersCount > 0 ? totalRevenueSum / totalOrdersCount : 0;

        console.log(`📊 ACCURATE LIFETIME STATS:`);
        console.log(`   • Total Orders: ${totalOrdersCount}`);
        console.log(`   • Total Revenue: €${totalRevenueSum.toFixed(2)}`);
        console.log(`   • Today Orders: ${todayOrdersCount}`);
        console.log(`   • Today Revenue: €${todayRevenueSum.toFixed(2)}`);
        console.log(`   • Average Order: €${avgOrderValue.toFixed(2)}`);
        console.log(`📋 Displaying recent ${allOrders.length} orders in list`);

        setOrdersHistory(allOrders);
        setFilteredHistory(allOrders);
        setStats({
          totalOrders: totalOrdersCount,        // From ALL orders
          todayOrders: todayOrdersCount,        // From ALL orders
          totalRevenue: totalRevenueSum,        // From ALL orders - ACCURATE LIFETIME
          todayRevenue: todayRevenueSum,        // From ALL orders - ACCURATE TODAY
          avgOrderValue: avgOrderValue,         // From ALL orders
          pendingOrders: pendingCount,          // From ALL orders
          confirmedOrders: confirmedCount,      // From ALL orders
          cancelledOrders: cancelledCount       // From ALL orders
        });
      });

      // Store unsubscribe function for cleanup
      return unsubscribe;

    } catch (error) {
      console.error('💥 Error loading orders history:', error);
      setOrdersHistory([]);
      setFilteredHistory([]);
      setStats({
        totalOrders: 0,
        todayOrders: 0,
        totalRevenue: 0,
        todayRevenue: 0,
        avgOrderValue: 0,
        pendingOrders: 0,
        confirmedOrders: 0,
        cancelledOrders: 0
      });
    }
  };

  // Filter orders based on search and date
  useEffect(() => {
    let filtered = [...ordersHistory];

    console.log('🔍 Applying filters:', { selectedDate, searchTerm });

    // Date filter first
    if (selectedDate) {
      filtered = filtered.filter(order => order.dateString === selectedDate);
      console.log(`📅 After date filter (${selectedDate}): ${filtered.length} entries`);
    }

    // Then apply search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(order =>
        order.userName.toLowerCase().includes(searchLower) ||
        order.userEmail.toLowerCase().includes(searchLower) ||
        order.orderNumber.toLowerCase().includes(searchLower) ||
        order.tableNumber.toLowerCase().includes(searchLower) ||
        order.deliveryInfo?.telefono?.includes(searchTerm) ||
        order.deliveryInfo?.phone?.includes(searchTerm)
      );
      console.log(`👤 After search filter (${searchTerm}): ${filtered.length} entries`);
    }

    setFilteredHistory(filtered);
  }, [searchTerm, selectedDate, ordersHistory]);

  const formatDateTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    return timestamp.toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusDisplay = (status) => ({
    'pending': 'In Attesa',
    'confirmed': 'Confermato',
    'cancelled': 'Cancellato'
  }[status] || status);

  const getStatusColor = (status) => ({
    'pending': '#ff9800',
    'confirmed': '#4caf50',
    'cancelled': '#f44336'
  }[status] || '#6c757d');

  const getPaymentMethodDisplay = (method) => ({
    'pay-at-till': 'Paga alla Cassa',
    'pay-now': 'Pagamento Online',
    'card': 'Carta',
    'cash': 'Contanti'
  }[method] || method || 'N/A');

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedDate('');
  };

  const setDateToYesterday = () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    setSelectedDate(formatDateForComparison(yesterday));
  };

  const setDateToToday = () => {
    const today = new Date();
    setSelectedDate(formatDateForComparison(today));
  };

  if (loading) {
    return (
      <div className="global-loading-container">
        <div className="global-loading-spinner"></div>
        <p className="global-loading-text">Caricamento storico ordini...</p>
      </div>
    );
  }

  return (
    <div className="orderslog-container">
      <div className="orderslog-header">
        <h1>Storico Ordini & Analytics</h1>
        <button className="orderslog-back-button" onClick={() => navigate('/superuser-dashboard')}>
          ← Dashboard
        </button>
      </div>

      {/* Enhanced Stats Grid */}
      <div className="orderslog-stats">
        <div className="orderslog-stat-card total">
          <h3>Ordini Totali</h3>
          <div className="orderslog-stat-number">{stats.totalOrders}</div>
        </div>

        <div className="orderslog-stat-card today">
          <h3>Ordini Oggi</h3>
          <div className="orderslog-stat-number">{stats.todayOrders}</div>
        </div>

        <div className="orderslog-stat-card revenue" style={{ borderTop: '3px solid #4caf50' }}>
          <h3>Incasso Totale</h3>
          <div className="orderslog-stat-number">€{stats.totalRevenue.toFixed(2)}</div>
        </div>

        <div className="orderslog-stat-card today-revenue" style={{ borderTop: '3px solid #2196f3' }}>
          <h3>Incasso Oggi</h3>
          <div className="orderslog-stat-number">€{stats.todayRevenue.toFixed(2)}</div>
        </div>

        <div className="orderslog-stat-card average" style={{ borderTop: '3px solid #9c27b0' }}>
          <h3>Ordine Medio</h3>
          <div className="orderslog-stat-number">€{stats.avgOrderValue.toFixed(2)}</div>
        </div>

        <div className="orderslog-stat-card pending" style={{ borderTop: '3px solid #ff9800' }}>
          <h3>In Attesa</h3>
          <div className="orderslog-stat-number" style={{ color: '#ff9800' }}>{stats.pendingOrders}</div>
        </div>
      </div>

      {/* Status Summary */}
      <div className="status-summary">
        <div className="status-badge confirmed">
          ✅ Confermati: {stats.confirmedOrders}
        </div>
        <div className="status-badge cancelled">
          ❌ Cancellati: {stats.cancelledOrders}
        </div>
      </div>

      {/* Filters */}
      <div className="orderslog-filters-container">
        <div className="orderslog-filter-group">
          <label>Seleziona Data:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="orderslog-filter-input"
          />
          <small style={{color: 'rgba(255,255,255,0.7)', fontSize: '12px', marginTop: '4px'}}>
            Mostra tutti gli ordini di questa data
          </small>
        </div>

        <div className="orderslog-filter-group">
          <label>Cerca (opzionale):</label>
          <input
            type="text"
            placeholder="Nome, email, n. ordine, tavolo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="orderslog-filter-input"
          />
          <small style={{color: 'rgba(255,255,255,0.7)', fontSize: '12px', marginTop: '4px'}}>
            Filtra per cliente, numero ordine, tavolo, ecc.
          </small>
        </div>

        <div className="orderslog-filter-group">
          <button onClick={clearFilters} className="orderslog-clear-btn">
            Pulisci
          </button>
          <button onClick={setDateToToday} className="orderslog-today-btn" style={{marginLeft: '10px'}}>
            Oggi
          </button>
          <button onClick={setDateToYesterday} className="orderslog-today-btn" style={{marginLeft: '10px'}}>
            Ieri
          </button>
        </div>
      </div>

      {/* Results Info */}
      {/* <div className="orderslog-results-info">
        <p> */}
          {/* Mostrando <strong>{filteredHistory.length}</strong> di <strong>{ordersHistory.length}</strong> ordini recenti */}
          {/* <span style={{color: 'rgba(255,255,255,0.6)', marginLeft: '10px', fontSize: '0.9rem'}}> */}
            {/* (Stats calcolate da {stats.totalOrders} ordini totali) */}
          {/* </span>
          {selectedDate && (
            <span style={{color: '#FFD700', marginLeft: '10px'}}>
              📅 Data: {new Date(selectedDate).toLocaleDateString('it-IT')}
            </span>
          )}
          {searchTerm && (
            <span style={{color: '#FFD700', marginLeft: '10px'}}>
              🔍 Ricerca: "{searchTerm}"
            </span>
          )}
        </p>
      </div> */}

      {/* Orders List
      <div className="orderslog-list">
        {filteredHistory.length > 0 ? (
          filteredHistory.map((order) => (
            <div className="orderslog-card" key={order.id}>
              <div className="orderslog-main">
                <div className="orderslog-customer-info">
                  <div className="orderslog-info-line">
                    <span className="orderslog-customer-name">
                      #{order.orderNumber} - {order.userName}
                      {order.orderType === 'tavolo' && order.tableNumber && (
                        <span style={{ color: '#4caf50', marginLeft: '8px' }}>
                          🏠 Tavolo {order.tableNumber}
                        </span>
                      )}
                      {order.orderType === 'consegna' && (
                        <span style={{ color: '#2196f3', marginLeft: '8px' }}>
                          🚚 Consegna
                        </span>
                      )}
                    </span>
                    <span className="orderslog-date">{formatDateTime(order.timestamp)}</span>
                  </div>
                  <div className="orderslog-details">
                    <span>💰 €{order.totalPrice.toFixed(2)}</span>
                    <span>🍽️ {order.items.length} articoli</span>
                    <span>💳 {getPaymentMethodDisplay(order.paymentMethod)}</span>
                  </div>
                  {order.notes && (
                    <div className="orderslog-notes">
                      📝 {order.notes}
                    </div>
                  )}
                </div>
                <div className="orderslog-method">
                  <span
                    className="orderslog-method-badge"
                    style={{
                      backgroundColor: `${getStatusColor(order.status)}20`,
                      color: getStatusColor(order.status),
                      border: `1px solid ${getStatusColor(order.status)}40`
                    }}
                  >
                    {getStatusDisplay(order.status)}
                  </span>
                  {order.isToday && <span className="orderslog-today-badge">Oggi</span>}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="orderslog-no-orders">
            <p>Nessun ordine trovato per i filtri selezionati</p>
            <button onClick={clearFilters} className="orderslog-clear-btn">
              Rimuovi Filtri
            </button>
          </div>
        )}
      </div> */}
    </div>
  );
}

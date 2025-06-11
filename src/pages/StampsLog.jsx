import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { firestore, auth } from '../lib/firebase';
import './StampsLog.css';

export default function StampsLog() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [stampsData, setStampsData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [filter, setFilter] = useState(searchParams.get('filter') || 'all'); // 'all', 'today', 'week', 'month'
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('date'); // 'date', 'customer', 'addedBy'
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc', 'desc'
  const [stats, setStats] = useState({
    totalStamps: 0,
    todayStamps: 0,
    weekStamps: 0,
    monthStamps: 0
  });

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

        await loadStampsData();
      } catch (err) {
        console.error('Error checking user role:', err);
        navigate('/signin');
      } finally {
        setLoading(false);
      }
    };

    checkSuperUser();
  }, [navigate]);

  // Apply filters and sorting when data or filter settings change
  useEffect(() => {
    applyFiltersAndSort();
  }, [stampsData, filter, searchTerm, sortBy, sortOrder]);

  const loadStampsData = async () => {
    try {
      // Get all stamps documents
      const stampsSnapshot = await getDocs(collection(firestore, 'stamps'));

      const allStamps = [];
      let totalStamps = 0;
      let todayStamps = 0;
      let weekStamps = 0;
      let monthStamps = 0;

      // Calculate date ranges
      const now = new Date();
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);

      const monthAgo = new Date(now);
      monthAgo.setMonth(monthAgo.getMonth() - 1);

      // Process each stamps document
      for (const stampDoc of stampsSnapshot.docs) {
        const stampsData = stampDoc.data();
        const userId = stampDoc.id;

        // Get user info
        let userName = 'Utente Sconosciuto';
        try {
          const userDoc = await getDoc(doc(firestore, 'users', userId));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            userName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || 'Utente Sconosciuto';
          }
        } catch (err) {
          console.error('Error fetching user info:', err);
        }

        // Process individual stamps
        if (stampsData.stamps && Array.isArray(stampsData.stamps)) {
          for (const stamp of stampsData.stamps) {
            const stampDate = new Date(stamp.date);

            totalStamps++;

            // Count by time periods
            if (stampDate >= today && stampDate < tomorrow) {
              todayStamps++;
            }
            if (stampDate >= weekAgo) {
              weekStamps++;
            }
            if (stampDate >= monthAgo) {
              monthStamps++;
            }

            // Determine who added the stamp
            let addedByText = '';
            if (stamp.addedByName) {
              addedByText = stamp.addedByName;
            } else if (stamp.addedByUser && stamp.addedBy === 'manual') {
              try {
                const staffDoc = await getDoc(doc(firestore, 'users', stamp.addedByUser));
                if (staffDoc.exists()) {
                  const staffData = staffDoc.data();
                  addedByText = `${staffData.firstName} ${staffData.lastName}`;
                } else {
                  addedByText = 'Staff';
                }
              } catch (err) {
                addedByText = 'Staff';
              }
            } else if (stamp.addedBy === 'qr') {
              addedByText = 'QR Scan';
            } else if (stamp.addedBy === 'manual') {
              addedByText = 'Staff';
            } else {
              addedByText = 'Sistema';
            }

            allStamps.push({
              id: `${userId}-${stamp.date}`,
              userId,
              userName,
              date: stamp.date,
              timestamp: stampDate,
              addedBy: stamp.addedBy || 'unknown',
              addedByUser: stamp.addedByUser || null,
              addedByName: stamp.addedByName || null,
              addedByText,
              method: stamp.addedBy === 'qr' ? 'QR Scan' : 'Manuale'
            });
          }
        }
      }

      // Sort by date (newest first) initially
      allStamps.sort((a, b) => b.timestamp - a.timestamp);

      setStampsData(allStamps);
      setStats({
        totalStamps,
        todayStamps,
        weekStamps,
        monthStamps
      });

    } catch (error) {
      console.error('Error loading stamps data:', error);
    }
  };

  const applyFiltersAndSort = () => {
    let filtered = [...stampsData];

    // Apply time filter
    const now = new Date();
    switch (filter) {
      case 'today':
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        filtered = filtered.filter(stamp =>
          stamp.timestamp >= today && stamp.timestamp < tomorrow
        );
        break;
      case 'week':
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        filtered = filtered.filter(stamp => stamp.timestamp >= weekAgo);
        break;
      case 'month':
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        filtered = filtered.filter(stamp => stamp.timestamp >= monthAgo);
        break;
      default:
        // 'all' - no time filter
        break;
    }

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(stamp =>
        stamp.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        stamp.addedByText.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue, bValue;

      switch (sortBy) {
        case 'customer':
          aValue = a.userName.toLowerCase();
          bValue = b.userName.toLowerCase();
          break;
        case 'addedBy':
          aValue = a.addedByText.toLowerCase();
          bValue = b.addedByText.toLowerCase();
          break;
        case 'date':
        default:
          aValue = a.timestamp;
          bValue = b.timestamp;
          break;
      }

      if (sortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    setFilteredData(filtered);
  };

  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const getFilterTitle = () => {
    switch (filter) {
      case 'today': return "Timbri di Oggi";
      case 'week': return "Timbri dell'Ultima Settimana";
      case 'month': return "Timbri dell'Ultimo Mese";
      default: return "Tutti i Timbri";
    }
  };

  if (loading) {
    return (
      <div className="global-loading-container">
        <div className="global-loading-spinner"></div>
        <p className="global-loading-text">Caricamento log timbri...</p>
      </div>
    );
  }

  return (
    <div className="stamps-log-container">
      <div className="log-header">
        <h1>Log Timbri</h1>
        <button className="back-button" onClick={() => navigate('/superuser-dashboard')}>
          ← Torna alla Dashboard
        </button>
      </div>

      {/* Stats overview */}
      <div className="stats-overview">
        <div className="stat-item">
          <span className="stat-label">Totale</span>
          <span className="stat-value">{stats.totalStamps}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Oggi</span>
          <span className="stat-value">{stats.todayStamps}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Ultima Settimana</span>
          <span className="stat-value">{stats.weekStamps}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Ultimo Mese</span>
          <span className="stat-value">{stats.monthStamps}</span>
        </div>
      </div>

      {/* Filters and controls */}
      <div className="controls-section">
        <div className="filter-buttons">
          <button
            className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            Tutti
          </button>
          <button
            className={`filter-btn ${filter === 'today' ? 'active' : ''}`}
            onClick={() => setFilter('today')}
          >
            Oggi
          </button>
          <button
            className={`filter-btn ${filter === 'week' ? 'active' : ''}`}
            onClick={() => setFilter('week')}
          >
            Sett
          </button>
          <button
            className={`filter-btn ${filter === 'month' ? 'active' : ''}`}
            onClick={() => setFilter('month')}
          >
            Mese
          </button>
        </div>

        <div className="search-sort-section">
          <input
            type="text"
            placeholder="Cerca cliente o staff..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="sort-select"
          >
            <option value="date">Ordina per Data</option>
            <option value="customer">Ordina per Cliente</option>
            <option value="addedBy">Ordina per Aggiunto da</option>
          </select>

          <button
            className="sort-order-btn"
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="results-section">
        <div className="results-header">
          <h2>{getFilterTitle()}</h2>
          <span className="results-count">
            {filteredData.length} {filteredData.length === 1 ? 'risultato' : 'risultati'}
          </span>
        </div>

        <div className="stamps-list">
          {filteredData.length > 0 ? (
            filteredData.map((stamp) => (
              <div className="stamp-item" key={stamp.id}>
                <div className="stamp-main-info">
                  <div className="customer-name">{stamp.userName}</div>
                  <div className="stamp-datetime">{formatDateTime(stamp.date)}</div>
                </div>
                <div className="stamp-details">
                  <div className="added-by">
                    <span className="label">Aggiunto da:</span>
                    <span className="value">{stamp.addedByText}</span>
                  </div>
                  <div className="method">
                    <span className="label">Metodo:</span>
                    <span className={`value method-${stamp.addedBy}`}>
                      {stamp.method}
                    </span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="no-results">
              <p>📭 Nessun timbro trovato per i criteri selezionati</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

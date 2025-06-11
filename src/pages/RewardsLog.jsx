import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { firestore, auth } from '../lib/firebase';
import './RewardsLog.css';

export default function RewardsLog() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [rewardsHistory, setRewardsHistory] = useState([]);
  const [filteredHistory, setFilteredHistory] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [stats, setStats] = useState({
    totalRewards: 0,
    todayRewards: 0
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

        await loadRewardsHistory();
      } catch (err) {
        console.error('Error checking user role:', err);
        navigate('/signin');
      } finally {
        setLoading(false);
      }
    };

    checkSuperUser();
  }, [navigate]);

  const isValidDate = (dateString) => {
    if (!dateString || dateString === 'Data non disponibile') return false;
    const date = new Date(dateString);
    return !isNaN(date.getTime()) && date.getFullYear() > 1970;
  };

  const formatDateForComparison = (date) => {
    // Returns YYYY-MM-DD format for comparison
    const d = new Date(date);
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  };

  const isToday = (dateString) => {
    if (!isValidDate(dateString)) return false;
    const today = formatDateForComparison(new Date());
    const rewardDate = formatDateForComparison(new Date(dateString));
    return today === rewardDate;
  };

  const loadRewardsHistory = async () => {
    try {
      const stampsSnapshot = await getDocs(collection(firestore, 'stamps'));
      const allRewards = [];
      let totalRewardsCount = 0;
      let todayRewardsCount = 0;

      console.log('🔍 Loading rewards history...');

      // Process each stamps document
      for (const stampDoc of stampsSnapshot.docs) {
        const stampsData = stampDoc.data();
        const userId = stampDoc.id;

        // Get user info
        const userDoc = await getDoc(doc(firestore, 'users', userId));
        const userName = userDoc.exists()
          ? `${userDoc.data().firstName || ''} ${userDoc.data().lastName || ''}`.trim()
          : 'Utente Sconosciuto';

        // Get total rewards count from rewardsEarned field
        const rewardsEarned = stampsData.rewardsEarned || 0;
        totalRewardsCount += rewardsEarned;

        console.log(`📊 User ${userName}: ${rewardsEarned} total rewards`);

        // Process detailed reward history if available
        if (stampsData.rewardHistory && Array.isArray(stampsData.rewardHistory)) {
          console.log(`📋 Processing ${stampsData.rewardHistory.length} reward history entries for ${userName}`);

          stampsData.rewardHistory.forEach((reward, index) => {
            // Validate the date
            if (!isValidDate(reward.redeemedAt)) {
              console.warn(`⚠️ Invalid date for reward: ${reward.redeemedAt}`);
              return; // Skip this reward entry
            }

            const rewardDate = new Date(reward.redeemedAt);
            const rewardIsToday = isToday(reward.redeemedAt);

            if (rewardIsToday) {
              todayRewardsCount++;
            }

            // Determine redemption method with better formatting
            let redemptionMethod = 'Manuale';
            if (reward.redemptionMethod === 'qr') {
              redemptionMethod = 'QR Code';
            } else if (reward.redeemedByName && reward.redeemedByName !== userName) {
              redemptionMethod = `Staff: ${reward.redeemedByName}`;
            }

            allRewards.push({
              id: `${userId}-${reward.redeemedAt}-${index}`,
              userId,
              userName,
              redeemedAt: reward.redeemedAt,
              timestamp: rewardDate,
              redemptionMethod,
              isToday: rewardIsToday,
              dateString: formatDateForComparison(rewardDate)
            });
          });
        } else if (rewardsEarned > 0) {
          // If no detailed history but rewardsEarned > 0, create a summary entry
          console.log(`📝 Creating summary entry for ${userName} (${rewardsEarned} historical rewards)`);
          allRewards.push({
            id: `${userId}-historical-summary`,
            userId,
            userName,
            redeemedAt: 'Storico (senza data)',
            timestamp: new Date(0), // Very old date for sorting
            redemptionMethod: 'Storico',
            isToday: false,
            dateString: 'historical',
            isHistorical: true,
            historicalCount: rewardsEarned
          });
        }
      }

      // Sort by timestamp (newest first), but put historical entries at the end
      allRewards.sort((a, b) => {
        if (a.isHistorical && !b.isHistorical) return 1;
        if (!a.isHistorical && b.isHistorical) return -1;
        return b.timestamp - a.timestamp;
      });

      console.log(`📊 Final stats: ${totalRewardsCount} total, ${todayRewardsCount} today`);
      console.log(`📋 Total reward entries: ${allRewards.length}`);

      setRewardsHistory(allRewards);
      setFilteredHistory(allRewards);
      setStats({
        totalRewards: totalRewardsCount,
        todayRewards: todayRewardsCount
      });

    } catch (error) {
      console.error('Error loading rewards history:', error);
    }
  };

  // Filter rewards based on search and date (independent filters)
  useEffect(() => {
    let filtered = [...rewardsHistory];

    console.log('🔍 Applying filters:', { selectedDate, searchTerm });

    // Date filter FIRST (independent of search)
    if (selectedDate) {
      filtered = filtered.filter(reward => {
        // Skip historical entries when filtering by date
        if (reward.isHistorical) return false;
        return reward.dateString === selectedDate;
      });
      console.log(`📅 After date filter (${selectedDate}): ${filtered.length} entries`);
    }

    // THEN apply search filter (optional additional filter)
    if (searchTerm) {
      filtered = filtered.filter(reward =>
        reward.userName.toLowerCase().includes(searchTerm.toLowerCase())
      );
      console.log(`👤 After search filter (${searchTerm}): ${filtered.length} entries`);
    }

    setFilteredHistory(filtered);
  }, [searchTerm, selectedDate, rewardsHistory]);

  const formatDateTime = (dateString) => {
    if (!isValidDate(dateString)) {
      return dateString; // Return original string for display (e.g., "Storico (senza data)")
    }

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
    if (!isValidDate(dateString)) {
      return dateString;
    }

    const date = new Date(dateString);
    return date.toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

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
        <p className="global-loading-text">Caricamento storico premi...</p>
      </div>
    );
  }

  return (
    <div className="rewards-log-container">
      <div className="rewards-header">
        <h1>Storico Premi Riscattati</h1>
        <button className="back-button" onClick={() => navigate('/superuser-dashboard')}>
          ← Dashboard
        </button>
      </div>

      <div className="rewards-stats">
        <div className="stat-card total">
          <h3>Premi Totali (Lifetime)</h3>
          <div className="stat-number">{stats.totalRewards}</div>
          <div className="stat-label">Caffè riscattati</div>
        </div>

        <div className="stat-card today">
          <h3>Premi Oggi</h3>
          <div className="stat-number">{stats.todayRewards}</div>
          <div className="stat-label">Riscattati oggi</div>
        </div>
      </div>

      <div className="filters-container">
        <div className="filter-group">
          <label>Seleziona Data:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="filter-input"
            placeholder="Scegli una data..."
          />
          <small style={{color: 'rgba(255,255,255,0.7)', fontSize: '12px', marginTop: '4px'}}>
            Mostra tutti i premi riscattati in questa data
          </small>
        </div>

        <div className="filter-group">
          <label>Cerca Cliente (opzionale):</label>
          <input
            type="text"
            placeholder="Nome cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="filter-input"
          />
          <small style={{color: 'rgba(255,255,255,0.7)', fontSize: '12px', marginTop: '4px'}}>
            Filtra ulteriormente per nome cliente
          </small>
        </div>

        <div className="filter-group">
          <button onClick={clearFilters} className="clear-btn">
            Pulisci Filtri
          </button>
          <button onClick={setDateToToday} className="today-btn" style={{marginLeft: '10px'}}>
            Oggi
          </button>
          <button onClick={setDateToYesterday} className="today-btn" style={{marginLeft: '10px'}}>
            Ieri
          </button>
        </div>
      </div>

      <div className="results-info">
        <p>
          Mostrando <strong>{filteredHistory.length}</strong> di <strong>{rewardsHistory.length}</strong> premi riscattati
          {selectedDate && (
            <span style={{color: '#FFD700', marginLeft: '10px'}}>
              Data: {new Date(selectedDate).toLocaleDateString('it-IT')}
            </span>
          )}
          {searchTerm && (
            <span style={{color: '#FFD700', marginLeft: '10px'}}>
              👤 Cliente: "{searchTerm}"
            </span>
          )}
        </p>
      </div>

      <div className="rewards-list">
        {filteredHistory.length > 0 ? (
          filteredHistory.map((reward) => (
            <div className="reward-card" key={reward.id}>
              <div className="reward-main">
                <div className="customer-info">
                  <div className="reward-info-line">
                    <span className="customer-name">
                      {reward.userName}
                      {reward.isHistorical && (
                        <span className="historical-count">
                          ({reward.historicalCount} premi storici)
                        </span>
                      )}
                    </span>
                    <span className="reward-date">{formatDateTime(reward.redeemedAt)}</span>
                  </div>
                </div>
                <div className="reward-method">
                  <span className={`method-badge ${
                    reward.redemptionMethod === 'QR Code' ? 'qr' :
                    reward.redemptionMethod === 'Storico' ? 'historical' : 'manual'
                  }`}>
                    {reward.redemptionMethod}
                  </span>
                  {reward.isToday && <span className="today-badge">Oggi</span>}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="no-rewards">
            <p>Nessun premio trovato per i filtri selezionati</p>
            {selectedDate && (
              <p style={{fontSize: '14px', color: 'rgba(255,255,255,0.7)', marginTop: '10px'}}>
                💡 Nota: I premi "STORICO" non hanno data specifica e non appariranno nei filtri per data
              </p>
            )}
            <button onClick={clearFilters} className="clear-btn">
              Rimuovi Filtri
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

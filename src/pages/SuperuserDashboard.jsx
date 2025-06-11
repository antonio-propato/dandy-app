import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, query, orderBy, limit, where, Timestamp, updateDoc } from 'firebase/firestore';
import { firestore, auth } from '../lib/firebase';
import './SuperuserDashboard.css';

export default function SuperuserDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userData, setUserData] = useState(null);
  const [todayStamps, setTodayStamps] = useState([]);
  const [showTodayLog, setShowTodayLog] = useState(false);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalStamps: 0,
    stampsToday: 0,
    totalRewardsLifetime: 0,
    totalRewardsToday: 0
  });
  const scrollRef = useRef(null);
  const todayLogRef = useRef(null);

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

        setUserData(userDoc.data());
        await loadDashboardData();
      } catch (err) {
        console.error('Error checking user role:', err);
        navigate('/signin');
      } finally {
        setLoading(false);
        window.scrollTo(0, 0);
      }
    };

    checkSuperUser();
  }, [navigate]);

  const loadDashboardData = async () => {
    setRefreshing(true);

    try {
      // Get ALL users count
      const usersSnapshot = await getDocs(collection(firestore, 'users'));
      const totalUsers = usersSnapshot.docs.length;

      // Calculate today's date range
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Get all stamps documents
      const stampsSnapshot = await getDocs(collection(firestore, 'stamps'));

      // Initialize counters
      let totalLifetimeStamps = 0;
      let stampsToday = 0;
      let totalRewardsLifetime = 0;
      let totalRewardsToday = 0;
      const todayStampsActivity = [];

      // Process each stamps document
      for (const stampDoc of stampsSnapshot.docs) {
        const stampsData = stampDoc.data();
        const userId = stampDoc.id;

        // Get current stamps and stats
        const currentStamps = stampsData.stamps && Array.isArray(stampsData.stamps) ? stampsData.stamps.length : 0;
        let lifetimeStamps = stampsData.lifetimeStamps || 0;
        const rewardsEarned = stampsData.rewardsEarned || 0;

        // Calculate the expected lifetimeStamps based on rewards and current stamps
        const expectedLifetimeStamps = (rewardsEarned * 9) + currentStamps;

        // Check if lifetimeStamps is missing OR incorrect
        if (lifetimeStamps < expectedLifetimeStamps) {
          lifetimeStamps = expectedLifetimeStamps;

          // Update document with correct lifetimeStamps value
          try {
            await updateDoc(doc(firestore, 'stamps', userId), {
              lifetimeStamps: lifetimeStamps
            });
            console.log(`Updated lifetimeStamps for user ${userId} to ${expectedLifetimeStamps}`);
          } catch (err) {
            console.error(`Failed to update lifetimeStamps for user ${userId}:`, err);
          }
        }

        // Add to totals
        totalLifetimeStamps += lifetimeStamps;
        totalRewardsLifetime += rewardsEarned;

        // Count today's stamps and build enhanced activity log
        if (stampsData.stamps && Array.isArray(stampsData.stamps)) {
          stampsData.stamps.forEach(stamp => {
            const stampDate = new Date(stamp.date);
            if (stampDate >= today && stampDate < tomorrow) {
              stampsToday++;

              // Add to today's stamps log with client info
              todayStampsActivity.push({
                userId,
                timestamp: stampDate,
                date: stamp.date,
                addedBy: stamp.addedBy || 'unknown',
                addedByUser: stamp.addedByUser || null,
                addedByName: stamp.addedByName || null,
                // Client stats at time of stamp
                currentStamps,
                lifetimeStamps,
                rewardsEarned
              });
            }
          });
        }

        // Count today's rewards redeemed
        if (stampsData.rewardHistory && Array.isArray(stampsData.rewardHistory)) {
          stampsData.rewardHistory.forEach(reward => {
            const rewardDate = new Date(reward.redeemedAt);
            if (rewardDate >= today && rewardDate < tomorrow) {
              totalRewardsToday++;
            }
          });
        }
      }

      // Sort today's activities by timestamp (newest first)
      todayStampsActivity.sort((a, b) => b.timestamp - a.timestamp);

      // Enrich today's stamps activity with user names
      const enrichedTodayStamps = await Promise.all(
        todayStampsActivity.map(async (activity) => {
          try {
            // Get customer info
            const userDoc = await getDoc(doc(firestore, 'users', activity.userId));
            const customerName = userDoc.exists()
              ? `${userDoc.data().firstName} ${userDoc.data().lastName}`
              : 'Utente Sconosciuto';

            // Determine who added the stamp
            let addedByText = '';
            if (activity.addedByName) {
              addedByText = activity.addedByName;
            } else if (activity.addedByUser && activity.addedBy === 'manual') {
              try {
                const staffDoc = await getDoc(doc(firestore, 'users', activity.addedByUser));
                if (staffDoc.exists()) {
                  const staffData = staffDoc.data();
                  addedByText = `${staffData.firstName} ${staffData.lastName}`;
                } else {
                  addedByText = 'Staff';
                }
              } catch (err) {
                addedByText = 'Staff';
              }
            } else if (activity.addedBy === 'qr') {
              addedByText = 'QR Scan';
            } else if (activity.addedBy === 'manual') {
              addedByText = 'Staff';
            } else {
              addedByText = 'Sistema';
            }

            return {
              ...activity,
              userName: customerName,
              addedByText: addedByText
            };
          } catch (err) {
            console.error('Error fetching today activity details:', err);
            return {
              ...activity,
              userName: 'Utente Sconosciuto',
              addedByText: 'Sistema'
            };
          }
        })
      );

      // Update state
      setTodayStamps(enrichedTodayStamps);
      setStats({
        totalUsers,
        totalStamps: totalLifetimeStamps,
        stampsToday,
        totalRewardsLifetime,
        totalRewardsToday
      });

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    loadDashboardData();
  };

  // Navigation handlers for clickable stats
  const handleTotalUsersClick = () => {
    navigate('/client-management');
  };

  const handleTotalStampsClick = () => {
    navigate('/stamps-log');
  };

  const handleTodayStampsClick = () => {
    setShowTodayLog(!showTodayLog);
    if (!showTodayLog) {
      setTimeout(() => {
        todayLogRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  };

  const handleLifetimeRewardsClick = () => {
    navigate('/rewards-log');
  };

  const handleTodayRewardsClick = () => {
    navigate('/rewards-log?filter=today');
  };

  // Format time only for compact display
  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('it-IT', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="global-loading-container">
        <div className="global-loading-spinner"></div>
        <p className="global-loading-text">Caricamento pannello...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-container" ref={scrollRef}>
      <div className="dashboard-header">
        <h1>Pannello di Controllo</h1>
        <div className="staff-info">
          <p>Ciao {userData?.firstName} </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="dashboard-actions">
        <button className="action-button scan-button" onClick={() => navigate('/scan')}>
          Scan QR
        </button>

        <button
          className="action-button refresh-button"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? (
            <>
              <div className="global-loading-spinner-small"></div>
              Aggiornamento...
            </>
          ) : (
            'Aggiorna'
          )}
        </button>
      </div>

      {/* Clickable stats grid */}
      <div className="dashboard-stats">
        <div className="stat-card clickable" onClick={handleTotalUsersClick}>
          <h3>Clienti Totali</h3>
          <div className="stat-value">{stats.totalUsers}</div>
          <div className="click-hint">👆 Clicca per gestire</div>
        </div>

        <div className="stat-card clickable" onClick={handleTotalStampsClick}>
          <h3>Timbri Totali</h3>
          <div className="stat-value">{stats.totalStamps}</div>
          <div className="click-hint">👆 Clicca per log</div>
        </div>

        <div className="stat-card clickable" onClick={handleTodayStampsClick}>
          <h3>Timbri Oggi</h3>
          <div className="stat-value">{stats.stampsToday}</div>
          <div className="click-hint">👆 Clicca per log</div>
        </div>

        <div className="stat-card rewards-split">
          <h3>Caffè Riscattati</h3>
          <div className="rewards-container">
            <div className="reward-item clickable" onClick={handleLifetimeRewardsClick}>
              <div className="reward-label">Lifetime</div>
              <div className="reward-value">{stats.totalRewardsLifetime}</div>
            </div>
            <div className="reward-divider">|</div>
            <div className="reward-item clickable" onClick={handleTodayRewardsClick}>
              <div className="reward-label">Oggi</div>
              <div className="reward-value">{stats.totalRewardsToday}</div>
            </div>
          </div>
          <div className="click-hint">👆 Clicca per logs</div>
        </div>
      </div>

      {/* Enhanced Today's Stamps Log with client info */}
      {showTodayLog && (
        <div className="todays-stamps-log" ref={todayLogRef}>
          <div className="log-header">
            <h2>Timbri di Oggi ({stats.stampsToday})</h2>
          </div>

          <div className="enhanced-log-list">
            {todayStamps.length > 0 ? (
              todayStamps.map((stamp, index) => (
                <div className="enhanced-log-item" key={index}>
                  {/* First line: Time, Name, Added By */}
                  <div className="log-main-line">
                    <div className="log-time">{formatTime(stamp.date)}</div>
                    <div className="log-customer">{stamp.userName}</div>
                    <div className="log-addedby">{stamp.addedByText}</div>
                  </div>

                  {/* Second line: Client stats */}
                  <div className="log-stats-line">
                    <span className="stat-attuali">Attuali: {stamp.currentStamps}</span>
                    <span className="stat-totali">Totali: {stamp.lifetimeStamps}</span>
                    <span className="stat-riscat">Riscat: {stamp.rewardsEarned}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="no-stamps-today">
                <p>📭 Nessun timbro aggiunto oggi</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

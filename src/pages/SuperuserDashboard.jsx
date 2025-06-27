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
  const [userStampCounts, setUserStampCounts] = useState({}); // NEW: Track stamps per user today
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalStamps: 0,
    stampsToday: 0,
    totalRewardsLifetime: 0,
    totalRewardsToday: 0,
    totalOrdersLifetime: 0,
    ordersToday: 0
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

      // Get all orders documents
      const ordersSnapshot = await getDocs(collection(firestore, 'orders'));

      // Initialize counters
      let totalLifetimeStamps = 0;
      let stampsToday = 0;
      let totalRewardsLifetime = 0;
      let totalRewardsToday = 0;
      let totalOrdersLifetime = 0;
      let ordersToday = 0;
      const todayStampsActivity = [];
      const dailyUserStampCounts = {}; // NEW: Track stamps per user today

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

        // Initialize user stamp count for today
        dailyUserStampCounts[userId] = 0;

        // Count today's stamps and build enhanced activity log
        if (stampsData.stamps && Array.isArray(stampsData.stamps)) {
          stampsData.stamps.forEach(stamp => {
            const stampDate = new Date(stamp.date);
            if (stampDate >= today && stampDate < tomorrow) {
              stampsToday++;
              dailyUserStampCounts[userId]++; // NEW: Increment user's daily count

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

      // Process orders data
      for (const orderDoc of ordersSnapshot.docs) {
        const orderData = orderDoc.data();
        totalOrdersLifetime++;

        // Count today's orders
        if (orderData.createdAt) {
          let orderDate;

          // Handle different date formats
          if (orderData.createdAt.toDate) {
            // Firestore Timestamp
            orderDate = orderData.createdAt.toDate();
          } else if (typeof orderData.createdAt === 'string') {
            // String date
            orderDate = new Date(orderData.createdAt);
          } else {
            // Regular Date object
            orderDate = new Date(orderData.createdAt);
          }

          if (orderDate >= today && orderDate < tomorrow) {
            ordersToday++;
          }
        }
      }

      // Sort today's activities by timestamp (newest first)
      todayStampsActivity.sort((a, b) => b.timestamp - a.timestamp);

      // Enrich today's stamps activity with user names and high activity detection
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

            // NEW: Check if user has high activity today (>3 stamps)
            const userTodayCount = dailyUserStampCounts[activity.userId] || 0;
            const isHighActivity = userTodayCount > 3;

            return {
              ...activity,
              userName: customerName,
              addedByText: addedByText,
              isHighActivity: isHighActivity, // NEW: Flag for high activity
              dailyStampCount: userTodayCount // NEW: Total stamps today for this user
            };
          } catch (err) {
            console.error('Error fetching today activity details:', err);
            return {
              ...activity,
              userName: 'Utente Sconosciuto',
              addedByText: 'Sistema',
              isHighActivity: false,
              dailyStampCount: 0
            };
          }
        })
      );

      // Update state
      setTodayStamps(enrichedTodayStamps);
      setUserStampCounts(dailyUserStampCounts); // NEW: Set user stamp counts
      setStats({
        totalUsers,
        totalStamps: totalLifetimeStamps,
        stampsToday,
        totalRewardsLifetime,
        totalRewardsToday,
        totalOrdersLifetime,
        ordersToday
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

  const handleLifetimeOrdersClick = () => {
    navigate('/orders-log');
  };

  const handleTodayOrdersClick = () => {
    navigate('/orders-log?filter=today');
  };

  // Format time only for compact display
  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('it-IT', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // NEW: Get high activity users for alert summary with names
  const getHighActivitySummary = () => {
    const highActivityUsers = Object.entries(userStampCounts)
      .filter(([userId, count]) => count > 3)
      .map(([userId, count]) => {
        // Find the user's name from today's stamps data
        const userStamp = todayStamps.find(stamp => stamp.userId === userId);
        const userName = userStamp ? userStamp.userName : `ID: ${userId.slice(-4)}`;

        return { userId, count, userName };
      });

    return highActivityUsers;
  };

  if (loading) {
    return (
      <div className="global-loading-container">
        <div className="global-loading-spinner"></div>
        <p className="global-loading-text">Caricamento pannello...</p>
      </div>
    );
  }

  const highActivityUsers = getHighActivitySummary();

  return (
    <div className="superuser-dashboard-container" ref={scrollRef}>
      <div className="superuser-dashboard-header">
        <h1>Pannello di Controllo</h1>
        <div className="superuser-staff-info">
          <p>Ciao {userData?.firstName} </p>
        </div>
      </div>



      {/* Action buttons */}
      <div className="superuser-dashboard-actions">
        <button className="superuser-action-button superuser-scan-button" onClick={() => navigate('/scan')}>
          Scan QR
        </button>

        <button
          className="superuser-action-button superuser-refresh-button"
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

      {/* Enhanced stats grid with orders */}
      <div className="superuser-dashboard-stats">
        <div className="superuser-stat-card clickable" onClick={handleTotalUsersClick}>
          <h3>Clienti Totali</h3>
          <div className="superuser-stat-value">{stats.totalUsers}</div>
          <div className="superuser-click-hint">👆 Clicca per gestire</div>
        </div>

        <div className="superuser-stat-card clickable" onClick={handleTotalStampsClick}>
          <h3>Timbri Totali</h3>
          <div className="superuser-stat-value">{stats.totalStamps}</div>
          <div className="superuser-click-hint">👆 Clicca per log</div>
        </div>

        <div className="superuser-stat-card clickable" onClick={handleTodayStampsClick}>
          <h3>Timbri Oggi</h3>
          <div className="superuser-stat-value">{stats.stampsToday}</div>
          <div className="superuser-click-hint">👆 Clicca per log</div>
        </div>

        <div className="superuser-stat-card superuser-rewards-split">
          <h3>Caffè Riscattati</h3>
          <div className="superuser-rewards-container">
            <div className="superuser-reward-item clickable" onClick={handleLifetimeRewardsClick}>
              <div className="superuser-reward-label">Lifetime</div>
              <div className="superuser-reward-value">{stats.totalRewardsLifetime}</div>
            </div>
            <div className="superuser-reward-divider">|</div>
            <div className="superuser-reward-item clickable" onClick={handleTodayRewardsClick}>
              <div className="superuser-reward-label">Oggi</div>
              <div className="superuser-reward-value">{stats.totalRewardsToday}</div>
            </div>
          </div>
          <div className="superuser-click-hint">👆 Clicca per logs</div>
        </div>

        <div className="superuser-stat-card superuser-orders-split">
          <h3>Ordini Totali</h3>
          <div className="superuser-orders-container">
            <div className="superuser-order-item clickable" onClick={handleLifetimeOrdersClick}>
              <div className="superuser-order-label">Lifetime</div>
              <div className="superuser-order-value">{stats.totalOrdersLifetime}</div>
            </div>
            <div className="superuser-order-divider">|</div>
            <div className="superuser-order-item clickable" onClick={handleTodayOrdersClick}>
              <div className="superuser-order-label">Oggi</div>
              <div className="superuser-order-value">{stats.ordersToday}</div>
            </div>
          </div>
          <div className="superuser-click-hint">👆 Clicca per logs</div>
        </div>
      </div>

      {/* Enhanced Today's Stamps Log with client info */}

            {/* NEW: High activity alert banner */}
      {highActivityUsers.length > 0 && (
        <div className="superuser-high-activity-alert">
          <div className="superuser-alert-icon">⚠️</div>
          <div className="superuser-alert-content">
            <strong>Attività Alta Oggi:</strong> {highActivityUsers.length} cliente{highActivityUsers.length > 1 ? 'i' : ''} con più di 3 timbri
            <div className="superuser-alert-details">
              {highActivityUsers.slice(0, 3).map((user, index) => (
                <span key={user.userId} className="superuser-alert-user">
                  {user.userName} ({user.count} timbri)
                </span>
              ))}
              {highActivityUsers.length > 3 && (
                <span className="superuser-alert-more">
                  +{highActivityUsers.length - 3} altri...
                </span>
              )}
            </div>
          </div>
        </div>
      )}
<br />
      {showTodayLog && (
        <div className="superuser-todays-stamps-log" ref={todayLogRef}>
          <div className="superuser-log-header">
            <h2>Timbri di Oggi ({stats.stampsToday})</h2>
          </div>

          <div className="superuser-enhanced-log-list">
            {todayStamps.length > 0 ? (
              todayStamps.map((stamp, index) => (
                <div
                  className={`superuser-enhanced-log-item ${stamp.isHighActivity ? 'superuser-high-activity' : ''}`}
                  key={index}
                >
                  {/* First line: Time, Name, Added By */}
                  <div className="superuser-log-main-line">
                    <div className="superuser-log-time">{formatTime(stamp.date)}</div>
                    <div className="superuser-log-customer">
                      {stamp.userName}
                      {/* NEW: High activity indicator */}
                      {stamp.isHighActivity && (
                        <span className="superuser-high-activity-badge">
                          🔥 {stamp.dailyStampCount} oggi
                        </span>
                      )}
                    </div>
                    <div className="superuser-log-addedby">{stamp.addedByText}</div>
                  </div>

                  {/* Second line: Client stats */}
                  <div className="superuser-log-stats-line">
                    <span className="superuser-stat-attuali">Attuali: {stamp.currentStamps}</span>
                    <span className="superuser-stat-totali">Totali: {stamp.lifetimeStamps}</span>
                    <span className="superuser-stat-riscat">Riscat: {stamp.rewardsEarned}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="superuser-no-stamps-today">
                <p>📭 Nessun timbro aggiunto oggi</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

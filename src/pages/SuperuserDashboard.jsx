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
  const [recentScans, setRecentScans] = useState([]);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalStamps: 0,    // Sum of all lifetimeStamps across all users
    stampsToday: 0,    // Count of stamps added today only (not redemptions)
    totalRewards: 0    // Sum of all rewardsEarned across all users
  });
  const scrollRef = useRef(null);

  useEffect(() => {
    const checkSuperUser = async () => {
      if (!auth.currentUser) {
        navigate('/signin');
        return;
      }

      try {
        const userDoc = await getDoc(doc(firestore, 'users', auth.currentUser.uid));
        if (!userDoc.exists() || userDoc.data().role !== 'superuser') {
          // Not a superuser, redirect to profile
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
        // Ensure scroll position is at top when dashboard loads
        window.scrollTo(0, 0);
      }
    };

    checkSuperUser();
  }, [navigate]);

  const loadDashboardData = async () => {
    setRefreshing(true);

    try {
      // Get all users count (excluding superusers)
      const usersSnapshot = await getDocs(collection(firestore, 'users'));
      const totalUsers = usersSnapshot.docs.filter(doc => doc.data().role !== 'superuser').length;

      // Calculate today's date range (midnight to midnight)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Get all stamps documents
      const stampsSnapshot = await getDocs(collection(firestore, 'stamps'));

      // Initialize counters
      let totalLifetimeStamps = 0;
      let stampsToday = 0;
      let totalRewards = 0;
      const recentActivity = [];

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
          // Update to the correct calculated value
          lifetimeStamps = expectedLifetimeStamps;

          // Update document with correct lifetimeStamps value
          try {
            await updateDoc(doc(firestore, 'stamps', userId), {
              lifetimeStamps: lifetimeStamps
            });
            console.log(`Updated lifetimeStamps for user ${userId} from ${lifetimeStamps} to ${expectedLifetimeStamps}`);
          } catch (err) {
            console.error(`Failed to update lifetimeStamps for user ${userId}:`, err);
          }
        }

        // Add to total lifetime stamps
        totalLifetimeStamps += lifetimeStamps;

        // Add to total rewards
        totalRewards += rewardsEarned;

        // Count today's stamps - check stamps created today
        if (stampsData.stamps && Array.isArray(stampsData.stamps)) {
          stampsData.stamps.forEach(stamp => {
            const stampDate = new Date(stamp.date);
            if (stampDate >= today && stampDate < tomorrow) {
              stampsToday++;
            }
          });
        }

        // Add to recent activity if there are stamps
        if (stampsData.stamps && stampsData.stamps.length > 0) {
          // Sort stamps by date (newest first)
          const sortedStamps = [...stampsData.stamps].sort((a, b) =>
            new Date(b.date) - new Date(a.date)
          );

          const latestStamp = sortedStamps[0];
          const stampDate = new Date(latestStamp.date);

          recentActivity.push({
            userId,
            timestamp: stampDate,
            date: latestStamp.date,
            currentStamps,
            lifetimeStamps,
            rewardsEarned
          });
        }
      }

      // Sort recent activity by timestamp (newest first)
      recentActivity.sort((a, b) => b.timestamp - a.timestamp);

      // Get top 10 most recent activities
      const recentActivities = recentActivity.slice(0, 10);

      // Fetch user names for the recent activities
      const enrichedActivities = await Promise.all(
        recentActivities.map(async (activity) => {
          try {
            // Get user info
            const userDoc = await getDoc(doc(firestore, 'users', activity.userId));

            return {
              ...activity,
              userName: userDoc.exists()
                ? `${userDoc.data().firstName} ${userDoc.data().lastName}`
                : 'Utente Sconosciuto',
            };
          } catch (err) {
            console.error('Error fetching activity details:', err);
            return {
              ...activity,
              userName: 'Utente Sconosciuto',
            };
          }
        })
      );

      // Update state with the calculated stats
      setRecentScans(enrichedActivities);
      setStats({
        totalUsers,
        totalStamps: totalLifetimeStamps,
        stampsToday,
        totalRewards
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

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Caricamento pannello...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-container" ref={scrollRef}>
      <div className="dashboard-header">
        <h1>Dandy - Pannello di Controllo</h1>
        <div className="staff-info">
          <p>Ciao, {userData?.firstName} {userData?.lastName}</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="dashboard-actions">
        <button className="action-button scan-button" onClick={() => navigate('/scan')}>
          <span className="action-icon">📷</span>
          Scansiona QR Cliente
        </button>
        <button
          className="action-button refresh-button"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <span className="action-icon">🔄</span>
          {refreshing ? 'Aggiornamento...' : 'Aggiorna Dati'}
        </button>
      </div>

      <div className="dashboard-stats">
        <div className="stat-card">
          <h3>Clienti Totali</h3>
          <div className="stat-value">{stats.totalUsers}</div>
        </div>
        <div className="stat-card">
          <h3>Timbri Totali</h3>
          <div className="stat-value">{stats.totalStamps}</div>
        </div>
        <div className="stat-card">
          <h3>Timbri Oggi</h3>
          <div className="stat-value">{stats.stampsToday}</div>
        </div>
        <div className="stat-card">
          <h3>Premi Riscattati</h3>
          <div className="stat-value">{stats.totalRewards}</div>
        </div>
      </div>

      <div className="recent-activity">
        <h2>Attività Recenti</h2>
        <div className="activity-list">
          {recentScans.length > 0 ? (
            recentScans.map((scan, index) => (
              <div className="activity-item" key={index}>
                <div className="activity-content">
                  <p className="activity-title">Timbro Aggiunto</p>
                  <p className="activity-user">Cliente: {scan.userName}</p>
                  <p className="activity-stamps">Timbri Attuali: {scan.currentStamps}/9</p>
                  <p className="activity-lifetime">
                    Timbri Totali: {scan.lifetimeStamps} |
                    Premi Riscattati: {scan.rewardsEarned}
                  </p>
                </div>
                <div className="activity-time">
                  {formatDate(scan.date)}
                </div>
              </div>
            ))
          ) : (
            <p className="no-activity">Nessuna attività recente</p>
          )}
        </div>
      </div>
    </div>
  );
}

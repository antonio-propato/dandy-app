import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, query, orderBy, limit, where, Timestamp } from 'firebase/firestore';
import { firestore, auth } from '../lib/firebase';
import './SuperuserDashboard.css';

export default function SuperuserDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);
  const [recentScans, setRecentScans] = useState([]);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalStamps: 0,
    stampsToday: 0
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
      }
    };

    checkSuperUser();
  }, [navigate]);

  const loadDashboardData = async () => {
    try {
      // Get all users count (excluding superusers)
      const usersSnapshot = await getDocs(collection(firestore, 'users'));
      const totalUsers = usersSnapshot.docs.filter(doc => doc.data().role !== 'superuser').length;

      // Get all stamps and today's stamps
      let totalStamps = 0;
      let stampsToday = 0;

      // Calculate today's date range (midnight to midnight)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayStart = Timestamp.fromDate(today);
      const todayEnd = Timestamp.fromDate(tomorrow);

      const stampsSnapshot = await getDocs(collection(firestore, 'stamps'));
      const recentActivity = [];

      for (const stampDoc of stampsSnapshot.docs) {
        const stampsData = stampDoc.data();
        if (stampsData.stamps && Array.isArray(stampsData.stamps)) {
          // Count total stamps
          totalStamps += stampsData.stamps.length;

          // Count today's stamps - check if date is between today start and end
          stampsData.stamps.forEach(stamp => {
            const stampDate = new Date(stamp.date);

            // Check if stamp was created today
            if (stampDate >= today && stampDate < tomorrow) {
              stampsToday++;
            }

            // Add to recent activity with user ID
            recentActivity.push({
              userId: stampDoc.id,
              timestamp: stampDate,
              date: stamp.date
            });
          });
        }
      }

      // Sort recent activity by timestamp (newest first)
      recentActivity.sort((a, b) => b.timestamp - a.timestamp);

      // Get top 10 most recent activities
      const recentActivities = recentActivity.slice(0, 10);

      // Fetch user names and current stamp count for the recent activities
      const enrichedActivities = await Promise.all(
        recentActivities.map(async (activity) => {
          try {
            // Get user info
            const userDoc = await getDoc(doc(firestore, 'users', activity.userId));

            // Get current stamp count
            const stampDoc = await getDoc(doc(firestore, 'stamps', activity.userId));
            const currentStamps = stampDoc.exists() ?
              (stampDoc.data().stamps ? stampDoc.data().stamps.length : 0) : 0;

            return {
              ...activity,
              userName: userDoc.exists()
                ? `${userDoc.data().firstName} ${userDoc.data().lastName}`
                : 'Utente Sconosciuto',
              currentStamps: currentStamps
            };
          } catch (err) {
            console.error('Error fetching activity details:', err);
            return {
              ...activity,
              userName: 'Utente Sconosciuto',
              currentStamps: 0
            };
          }
        })
      );

      setRecentScans(enrichedActivities);
      setStats({
        totalUsers,
        totalStamps,
        stampsToday
      });

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    }
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
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>Dandy - Pannello di Controllo</h1>
        <div className="staff-info">
          <p>Ciao, {userData?.firstName} {userData?.lastName}</p>
        </div>
      </div>

      {/* Moved scan button to top */}
      <div className="dashboard-actions">
        <button className="action-button scan-button" onClick={() => navigate('/scan')}>
          <span className="action-icon">📷</span>
          Scansiona QR Cliente
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
                  <p className="activity-stamps">Timbri Attuali: {scan.currentStamps}</p>
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

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
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
      // Get all users count
      const usersSnapshot = await getDocs(collection(firestore, 'users'));
      const totalUsers = usersSnapshot.docs.filter(doc => doc.data().role !== 'superuser').length;

      // Get all stamps and today's stamps
      let totalStamps = 0;
      let stampsToday = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const stampsSnapshot = await getDocs(collection(firestore, 'stamps'));
      const recentActivity = [];

      for (const doc of stampsSnapshot.docs) {
        const stampsData = doc.data();
        if (stampsData.stamps && Array.isArray(stampsData.stamps)) {
          totalStamps += stampsData.stamps.length;

          // Count today's stamps
          const todayStamps = stampsData.stamps.filter(stamp => {
            const stampDate = stamp.createdAt.toDate();
            stampDate.setHours(0, 0, 0, 0);
            return stampDate.getTime() === today.getTime();
          });

          stampsToday += todayStamps.length;

          // Add to recent activity
          stampsData.stamps.forEach(stamp => {
            recentActivity.push({
              userId: doc.id,
              timestamp: stamp.createdAt,
              staffId: stamp.createdBy
            });
          });
        }
      }

      // Sort and limit recent activity
      recentActivity.sort((a, b) => b.timestamp - a.timestamp);
      const recentActivities = recentActivity.slice(0, 10);

      // Fetch user names for the recent activities
      const enrichedActivities = await Promise.all(
        recentActivities.map(async (activity) => {
          const userDoc = await getDoc(doc(firestore, 'users', activity.userId));
          const staffDoc = await getDoc(doc(firestore, 'users', activity.staffId));

          return {
            ...activity,
            userName: userDoc.exists()
              ? `${userDoc.data().firstName} ${userDoc.data().lastName}`
              : 'Unknown User',
            staffName: staffDoc.exists()
              ? `${staffDoc.data().firstName} ${staffDoc.data().lastName}`
              : 'Unknown Staff'
          };
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

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>Dandy - Staff Dashboard</h1>
        <div className="staff-info">
          <p>Hello, {userData?.firstName} {userData?.lastName}</p>
          <button className="logout-btn" onClick={() => {
            auth.signOut();
            navigate('/signin');
          }}>Logout</button>
        </div>
      </div>

      <div className="dashboard-stats">
        <div className="stat-card">
          <h3>Total Customers</h3>
          <div className="stat-value">{stats.totalUsers}</div>
        </div>
        <div className="stat-card">
          <h3>Total Stamps</h3>
          <div className="stat-value">{stats.totalStamps}</div>
        </div>
        <div className="stat-card">
          <h3>Stamps Today</h3>
          <div className="stat-value">{stats.stampsToday}</div>
        </div>
      </div>

      <div className="dashboard-actions">
        <button className="action-button scan-button" onClick={() => navigate('/scan')}>
          <span className="action-icon">📷</span>
          Scan Customer QR
        </button>
      </div>

      <div className="recent-activity">
        <h2>Recent Activity</h2>
        <div className="activity-list">
          {recentScans.length > 0 ? (
            recentScans.map((scan, index) => (
              <div className="activity-item" key={index}>
                <div className="activity-content">
                  <p className="activity-title">Stamp Added</p>
                  <p className="activity-user">Customer: {scan.userName}</p>
                  <p className="activity-staff">Staff: {scan.staffName}</p>
                </div>
                <div className="activity-time">
                  {scan.timestamp.toDate().toLocaleString()}
                </div>
              </div>
            ))
          ) : (
            <p className="no-activity">No recent activity</p>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, query, orderBy, limit, where, Timestamp, addDoc } from 'firebase/firestore';
import { firestore, auth } from '../lib/firebase';
import './SuperuserDashboard.css';

export default function SuperuserDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);
  const [recentActivities, setRecentActivities] = useState([]);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalStamps: 0,
    stampsToday: 0,
    totalRewards: 0,
    topCustomers: []
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

    // Set up auto-refresh every minute
    const refreshInterval = setInterval(() => {
      if (auth.currentUser) {
        loadDashboardData();
      }
    }, 60000);

    return () => clearInterval(refreshInterval);
  }, [navigate]);

  const loadDashboardData = async () => {
    try {
      console.log("LOADING DASHBOARD DATA - COMPLETE REFRESH");

      // Get all users count (excluding superusers)
      const usersSnapshot = await getDocs(collection(firestore, 'users'));
      const users = usersSnapshot.docs.filter(doc => doc.data().role !== 'superuser');
      const totalUsers = users.length;
      console.log(`Found ${totalUsers} customers`);

      // Get all users' lifetime stats
      console.log("Getting lifetime stats across all users...");
      const lifetimeStats = await getTotalLifetimeStats();
      console.log(`Lifetime stats results: ${JSON.stringify(lifetimeStats)}`);

      // Calculate today's stamps using the new multi-method approach
      console.log("Calculating today's stamps...");
      const todayStatsResult = await calculateTodayStamps();
      console.log(`Today's stamps result: ${todayStatsResult.stampsToday}`);

      // Initialize dashboard stats with the new values
      const dashboardStats = {
        totalUsers,
        totalStamps: lifetimeStats.totalLifetimeStamps || 0,
        stampsToday: todayStatsResult.stampsToday || 0,
        totalRewards: lifetimeStats.totalRedemptions || 0,
        topCustomers: []
      };

      // Log the stats we've calculated so far
      console.log("Dashboard stats before top customers:", dashboardStats);

      // Get top loyal customers
      console.log("Getting top loyal customers...");
      const topCustomers = await getMostLoyalCustomers(5);
      dashboardStats.topCustomers = topCustomers;
      console.log(`Found ${topCustomers.length} top customers`);

      // Load recent activity
      console.log("Loading recent activity...");
      const activities = await loadAllActivity();
      console.log(`Found ${activities.length} recent activities`);

      // Update state with the new data
      console.log("Updating dashboard stats:", dashboardStats);
      setStats(dashboardStats);
      setRecentActivities(activities);

      console.log("Dashboard data loaded successfully");
    } catch (error) {
      console.error('Error loading dashboard data:', error);

      // If there's an error, provide default values so the UI doesn't break
      setStats({
        totalUsers: 0,
        totalStamps: 0,
        stampsToday: 0,
        totalRewards: 0,
        topCustomers: []
      });
      setRecentActivities([]);
    }
  };

  // Calculate total lifetime stamps and redemptions across all users
  const getTotalLifetimeStats = async () => {
    let totalLifetimeStamps = 0;
    let totalRedemptions = 0;

    try {
      const stampsSnapshot = await getDocs(collection(firestore, 'stamps'));

      console.log('Calculating lifetime stamps for all users...');

      for (const stampDoc of stampsSnapshot.docs) {
        const userId = stampDoc.id;
        const stampsData = stampDoc.data();

        // Calculate current active stamps
        const currentStamps = stampsData.stamps && Array.isArray(stampsData.stamps)
          ? stampsData.stamps.length
          : 0;

        // Calculate redeemed stamps
        const redeemedStamps = stampsData.redeemedStamps || 0;

        // Check for stored lifetime stamps value first
        let userLifetimeStamps = 0;

        if (stampsData.lifetimeStamps && typeof stampsData.lifetimeStamps === 'number') {
          // Use stored lifetime stamps if available
          userLifetimeStamps = stampsData.lifetimeStamps;
          console.log(`User ${userId} has stored lifetimeStamps: ${userLifetimeStamps}`);
        } else {
          // Calculate from current + redeemed if lifetimeStamps not available
          userLifetimeStamps = currentStamps + redeemedStamps;
          console.log(`User ${userId} has calculated lifetimeStamps: ${userLifetimeStamps} (current: ${currentStamps}, redeemed: ${redeemedStamps})`);
        }

        // Add to total
        totalLifetimeStamps += userLifetimeStamps;

        // Get total redemptions
        const userRedemptions = stampsData.totalRedemptions ||
                               (stampsData.redeemedStamps ? Math.floor(stampsData.redeemedStamps / 9) : 0);
        totalRedemptions += userRedemptions;
      }

      console.log(`Total lifetime stamps across all users: ${totalLifetimeStamps}`);
      console.log(`Total redemptions across all users: ${totalRedemptions}`);

      return { totalLifetimeStamps, totalRedemptions };
    } catch (error) {
      console.error('Error calculating total lifetime stats:', error);
      return { totalLifetimeStamps: 0, totalRedemptions: 0 };
    }
  };

  // Calculate today's stamps - Fixed to exclude reward scans
  const calculateTodayStamps = async () => {
    let stampsToday = 0;

    try {
      console.log("CALCULATING TODAY'S STAMPS - BUSINESS RULES FIXED");

      // Get current time and today's date boundaries
      const nowLocal = new Date();
      const startOfDayLocal = new Date(nowLocal);
      startOfDayLocal.setHours(0, 0, 0, 0);
      const endOfDayLocal = new Date(nowLocal);
      endOfDayLocal.setHours(23, 59, 59, 999);

      console.log(`Today's date range: ${startOfDayLocal.toISOString()} to ${endOfDayLocal.toISOString()}`);

      // Track all stamps by type for better counting
      const allTodayStamps = [];

      // STEP 1: Get all stamps from all users
      console.log("Checking current stamps in users' arrays");
      const stampsSnapshot = await getDocs(collection(firestore, 'stamps'));
      console.log(`Found ${stampsSnapshot.docs.length} user stamp documents`);

      // First, count all active stamps from today
      for (const stampDoc of stampsSnapshot.docs) {
        const userId = stampDoc.id;
        const stampsData = stampDoc.data();

        let userTodayStamps = 0;

        if (stampsData.stamps && Array.isArray(stampsData.stamps)) {
          // Look at each stamp to determine if it's from today
          stampsData.stamps.forEach((stamp, index) => {
            if (stamp && stamp.date) {
              // Convert to Date object if it's not already
              let stampDate = null;

              if (typeof stamp.date === 'string') {
                stampDate = new Date(stamp.date);
              } else if (stamp.date instanceof Timestamp) {
                stampDate = stamp.date.toDate();
              } else {
                stampDate = new Date(stamp.date);
              }

              // Check if this stamp is from today
              if (stampDate >= startOfDayLocal && stampDate <= endOfDayLocal) {
                // BUSINESS RULE: Check if this is a reward scan (should be excluded)
                const isRewardScan = stamp.isRewardScan || false;

                if (!isRewardScan) {
                  userTodayStamps++;
                  allTodayStamps.push({
                    userId,
                    stampIndex: index,
                    timestamp: stampDate,
                    active: true,
                    isRewardScan: false
                  });
                } else {
                  console.log(`Found reward scan for user ${userId} - not counting in today's stamps`);
                  allTodayStamps.push({
                    userId,
                    stampIndex: index,
                    timestamp: stampDate,
                    active: true,
                    isRewardScan: true
                  });
                }
              }
            }
          });
        }

        if (userTodayStamps > 0) {
          console.log(`User ${userId} has ${userTodayStamps} regular stamps from today`);
        }
      }

      // STEP 2: Check StampActivities collection for more accurate data
      console.log("Checking stampActivities collection for today");
      try {
        const activitiesSnapshot = await getDocs(collection(firestore, 'stampActivities'));

        // Filter for today's activities
        for (const doc of activitiesSnapshot.docs) {
          const data = doc.data();

          if (data.timestamp) {
            const activityDate = new Date(data.timestamp);

            if (activityDate >= startOfDayLocal && activityDate <= endOfDayLocal) {
              // Check if this is a reward activity (redemption)
              const isRewardScan = data.type === 'redemption' || data.isRewardScan;

              if (!isRewardScan) {
                // Count normal stamp activities but not reward scans
                const alreadyCounted = allTodayStamps.some(s =>
                  s.userId === data.userId &&
                  Math.abs(s.timestamp - activityDate) < 1000 && // Within 1 second
                  !s.isRewardScan
                );

                if (!alreadyCounted) {
                  allTodayStamps.push({
                    userId: data.userId,
                    timestamp: activityDate,
                    fromActivities: true,
                    isRewardScan: false
                  });
                }
              } else {
                console.log(`Found reward activity for user ${data.userId} - not counting in today's stamps`);
                allTodayStamps.push({
                  userId: data.userId,
                  timestamp: activityDate,
                  fromActivities: true,
                  isRewardScan: true
                });
              }
            }
          }
        }
      } catch (err) {
        console.warn('Error checking stampActivities, skipping this approach:', err);
      }

      // STEP 3: Check global counters
      console.log("Checking global counters");
      try {
        const counterRef = doc(firestore, 'appStats', 'stampCounters');
        const counterDoc = await getDoc(counterRef);

        if (counterDoc.exists()) {
          const counterData = counterDoc.data();
          const todayStr = nowLocal.toISOString().split('T')[0]; // Format as YYYY-MM-DD

          if (counterData.dailyStats && counterData.dailyStats[todayStr]) {
            const dailyStats = counterData.dailyStats[todayStr];
            console.log(`Global counter stats for today:`, dailyStats);

            // Note: Global counters should already be correctly counting
            // regular stamps vs. reward scans based on the firebase-counters.js implementation
          }
        }
      } catch (err) {
        console.warn('Error checking global counters:', err);
      }

      // CALCULATE FINAL COUNT
      // Filter out reward scans as per business rules
      const regularStamps = allTodayStamps.filter(stamp => !stamp.isRewardScan);
      const rewardScans = allTodayStamps.filter(stamp => stamp.isRewardScan);

      console.log(`Found ${regularStamps.length} regular stamps and ${rewardScans.length} reward scans today`);

      // Set today's count to regular stamps only (not reward scans)
      stampsToday = regularStamps.length;

      console.log(`Final stamps today count: ${stampsToday} (excluding reward scans)`);

      return { stampsToday };
    } catch (error) {
      console.error('Error calculating today stamps:', error);
      return { stampsToday: 0 };
    }
  };

  // Get global stamp statistics directly from the counters
  const getGlobalStatsFromCounters = async () => {
    try {
      const counterRef = doc(firestore, 'appStats', 'stampCounters');
      const counterDoc = await getDoc(counterRef);

      if (counterDoc.exists()) {
        const counterData = counterDoc.data();
        const today = new Date().toISOString().split('T')[0]; // Format as YYYY-MM-DD

        // Get today's stats
        const todayStats = counterData.dailyStats?.[today] || { stampsGiven: 0, rewards: 0 };
        const stampsToday = todayStats.stampsGiven || 0;

        return {
          stampsToday
        };
      }

      return null; // No counter document exists
    } catch (error) {
      console.error('Error fetching global stats:', error);
      return null;
    }
  };

  // Load all activity - Fixed for accuracy and consistency
  const loadAllActivity = async () => {
    try {
      console.log("LOADING RECENT ACTIVITIES - FULLY FIXED");

      // First check if all collections exist
      console.log("Checking collections existence and access...");
      const collections = [
        { name: 'stamps', path: 'stamps' },
        { name: 'stampResetLogs', path: 'stampResetLogs' },
        { name: 'stampActivities', path: 'stampActivities' },
        { name: 'users', path: 'users' }
      ];

      for (const col of collections) {
        try {
          const snapshot = await getDocs(collection(firestore, col.path));
          console.log(`Collection '${col.name}' exists with ${snapshot.docs.length} documents`);
        } catch (err) {
          console.error(`Error accessing collection '${col.name}':`, err);
        }
      }

      // Create a master array of all activities
      const allActivities = [];

      // 1. STAMPS COLLECTION - Get all stamps and redemptions from user stamp documents
      console.log("Scanning stamps collection for all users...");
      const stampsSnapshot = await getDocs(collection(firestore, 'stamps'));

      // Process each user
      for (const stampDoc of stampsSnapshot.docs) {
        const userId = stampDoc.id;
        const stampsData = stampDoc.data();

        // First get user info
        let userName = 'Utente Sconosciuto';
        try {
          const userDoc = await getDoc(doc(firestore, 'users', userId));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.firstName && userData.lastName) {
              userName = `${userData.firstName} ${userData.lastName}`;
            } else if (userData.displayName) {
              userName = userData.displayName;
            } else if (userData.email) {
              userName = userData.email;
            }
          }
        } catch (userErr) {
          console.warn(`Error getting user data for ${userId}:`, userErr);
        }

        // Calculate current stamps
        const currentStamps = stampsData.stamps && Array.isArray(stampsData.stamps)
          ? stampsData.stamps.length
          : 0;

        // Calculate redeemed stamps
        const redeemedStamps = stampsData.redeemedStamps || 0;

        // Calculate lifetime stamps - use stored or calculated
        const lifetimeStamps = stampsData.lifetimeStamps || (currentStamps + redeemedStamps);

        console.log(`User ${userId} (${userName}): ${currentStamps} current, ${redeemedStamps} redeemed, ${lifetimeStamps} lifetime`);

        // Get all stamps from the user's stamps array
        if (stampsData.stamps && Array.isArray(stampsData.stamps)) {
          stampsData.stamps.forEach((stamp, index) => {
            if (stamp && stamp.date) {
              const stampDate = new Date(stamp.date);

              allActivities.push({
                type: 'add_stamp',
                userId,
                userName,
                timestamp: stampDate,
                date: stamp.date,
                currentStamps,
                lifetimeStamps,
                source: 'stamps_array'
              });
            }
          });
        }

        // Check for redemption events
        if (stampsData.redeemDate) {
          const redeemDate = new Date(stampsData.redeemDate);

          allActivities.push({
            type: 'redemption',
            userId,
            userName,
            timestamp: redeemDate,
            date: stampsData.redeemDate,
            stampsRedeemed: stampsData.redeemedStamps || 9,
            currentStamps,
            lifetimeStamps,
            source: 'stamps_redeem'
          });
        }
      }

      // 2. RESET LOGS - Get all redemption logs for more detail
      console.log("Scanning stampResetLogs collection...");
      const resetLogsSnapshot = await getDocs(collection(firestore, 'stampResetLogs'));

      for (const logDoc of resetLogsSnapshot.docs) {
        const logData = logDoc.data();

        if (logData.resetDate && logData.userId) {
          const resetDate = new Date(logData.resetDate);
          let userName = logData.firstName || 'Utente Sconosciuto';

          // Try to get full name if not in the log
          if (userName === 'Utente Sconosciuto') {
            try {
              const userDoc = await getDoc(doc(firestore, 'users', logData.userId));
              if (userDoc.exists()) {
                const userData = userDoc.data();
                if (userData.firstName && userData.lastName) {
                  userName = `${userData.firstName} ${userData.lastName}`;
                } else if (userData.displayName) {
                  userName = userData.displayName;
                } else if (userData.email) {
                  userName = userData.email;
                }
              }
            } catch (userErr) {
              console.warn(`Error getting user data from reset log for ${logData.userId}:`, userErr);
            }
          }

          // Get current stamps (might be 0 after redemption)
          let currentStamps = 0;
          let lifetimeStamps = logData.lifetimeTotal || 0;

          // Try to get current stamps
          try {
            const stampDoc = await getDoc(doc(firestore, 'stamps', logData.userId));
            if (stampDoc.exists()) {
              const stampData = stampDoc.data();
              currentStamps = stampData.stamps?.length || 0;

              // Update lifetime if not in the log
              if (!logData.lifetimeTotal && stampData.lifetimeStamps) {
                lifetimeStamps = stampData.lifetimeStamps;
              }
            }
          } catch (stampErr) {
            console.warn(`Error getting current stamps for reset log user ${logData.userId}:`, stampErr);
          }

          // Add the redemption event
          allActivities.push({
            type: 'redemption',
            userId: logData.userId,
            userName,
            timestamp: resetDate,
            date: logData.resetDate,
            stampsRedeemed: logData.stampsRedeemed || 9,
            currentStamps,
            lifetimeStamps,
            source: 'reset_logs'
          });
        }
      }

      // 3. ACTIVITIES COLLECTION - Check stampActivities if it exists
      console.log("Scanning stampActivities collection...");
      try {
        const activitiesSnapshot = await getDocs(
          query(collection(firestore, 'stampActivities'),
                orderBy('timestamp', 'desc'),
                limit(30))
        );

        for (const doc of activitiesSnapshot.docs) {
          const data = doc.data();

          if (data.timestamp && data.userId) {
            const activityDate = new Date(data.timestamp);

            // Get user name if not in activity
            let userName = data.userName || 'Utente Sconosciuto';
            if (userName === 'Utente Sconosciuto') {
              try {
                const userDoc = await getDoc(doc(firestore, 'users', data.userId));
                if (userDoc.exists()) {
                  const userData = userDoc.data();
                  if (userData.firstName && userData.lastName) {
                    userName = `${userData.firstName} ${userData.lastName}`;
                  } else if (userData.displayName) {
                    userName = userData.displayName;
                  } else if (userData.email) {
                    userName = userData.email;
                  }
                }
              } catch (userErr) {
                console.warn(`Error getting user data for activity ${data.userId}:`, userErr);
              }
            }

            // Try to get current and lifetime stamps
            let currentStamps = data.currentStamps || 0;
            let lifetimeStamps = data.lifetimeStamps || 0;

            if (!data.currentStamps || !data.lifetimeStamps) {
              try {
                const stampDoc = await getDoc(doc(firestore, 'stamps', data.userId));
                if (stampDoc.exists()) {
                  const stampData = stampDoc.data();

                  if (!data.currentStamps) {
                    currentStamps = stampData.stamps?.length || 0;
                  }

                  if (!data.lifetimeStamps) {
                    lifetimeStamps = stampData.lifetimeStamps ||
                      (currentStamps + (stampData.redeemedStamps || 0));
                  }
                }
              } catch (stampErr) {
                console.warn(`Error getting stamps for activity user ${data.userId}:`, stampErr);
              }
            }

            // Add to our activities
            allActivities.push({
              type: data.type || 'add_stamp',
              userId: data.userId,
              userName,
              timestamp: activityDate,
              date: data.timestamp,
              currentStamps,
              lifetimeStamps,
              stampsRedeemed: data.stampsRedeemed || 0,
              source: 'activities'
            });
          }
        }
      } catch (err) {
        console.warn('Error or no stampActivities collection:', err);
      }

      // Sort all activities by timestamp (newest first)
      allActivities.sort((a, b) => {
        const dateA = a.timestamp instanceof Date ? a.timestamp : new Date(a.timestamp);
        const dateB = b.timestamp instanceof Date ? b.timestamp : new Date(b.timestamp);
        return dateB - dateA;
      });

      console.log(`Found total of ${allActivities.length} activities from all sources`);

      // Remove duplicates (same user + timestamp + type within 1 minute)
      const uniqueActivities = [];
      const activityKeys = new Set();

      allActivities.forEach(activity => {
        const activityTime = activity.timestamp instanceof Date ?
          activity.timestamp : new Date(activity.timestamp);

        // Create a key for this activity (user + type + minute)
        const timeKey = `${activityTime.getFullYear()}-${activityTime.getMonth()}-${activityTime.getDate()}-${activityTime.getHours()}-${activityTime.getMinutes()}`;
        const activityKey = `${activity.userId}-${activity.type}-${timeKey}`;

        // If we haven't seen this key yet, add it
        if (!activityKeys.has(activityKey)) {
          activityKeys.add(activityKey);
          uniqueActivities.push(activity);
        }
      });

      console.log(`After deduplication: ${uniqueActivities.length} unique activities`);

      // Get most recent activities
      const recentActivities = uniqueActivities.slice(0, 10);

      // Log what we found
      console.log("Recent activities to display:");
      recentActivities.forEach((activity, idx) => {
        console.log(`${idx+1}. ${activity.type} - User: ${activity.userName}, ` +
                    `Time: ${activity.timestamp}, Source: ${activity.source}`);
      });

      // Add a debug activity if we have none
      if (recentActivities.length === 0) {
        console.warn("No activities found. Adding debug activity");
        return [{
          type: 'debug',
          userId: 'debug',
          userName: 'Debug User',
          timestamp: new Date(),
          date: new Date().toISOString(),
          currentStamps: 3,
          lifetimeStamps: 12,
          _debug: true
        }];
      }

      return recentActivities;
    } catch (error) {
      console.error('Fatal error loading all activity:', error);

      // Return debug activity on error
      return [{
        type: 'error',
        userId: 'error',
        userName: 'Error Loading',
        timestamp: new Date(),
        date: new Date().toISOString(),
        currentStamps: 0,
        lifetimeStamps: 0,
        errorMessage: error.message,
        _debug: true
      }];
    }
  };

  // Function to get the most loyal customers - Fixed for business rules
  const getMostLoyalCustomers = async (limit = 5) => {
    try {
      console.log("GETTING MOST LOYAL CUSTOMERS - FIXED FOR BUSINESS RULES");
      const stampsSnapshot = await getDocs(collection(firestore, 'stamps'));

      // Create an array of users with their lifetime stamps
      const userLoyalty = [];

      for (const stampDoc of stampsSnapshot.docs) {
        const userId = stampDoc.id;
        const stampsData = stampDoc.data();

        // Get current stamps count
        const currentStamps = stampsData.stamps?.length || 0;

        // Get redeemed stamps
        const redeemedStamps = stampsData.redeemedStamps || 0;

        // Calculate total redemptions
        let totalRedemptions = 0;
        if (stampsData.totalRedemptions && typeof stampsData.totalRedemptions === 'number') {
          totalRedemptions = stampsData.totalRedemptions;
        } else {
          totalRedemptions = Math.floor(redeemedStamps / 9);
        }

        // BUSINESS RULE CORRECTION: Lifetime stamps should exclude reward scans
        // Calculate lifetime stamps that represents actual customer visits
        let lifetimeStamps = 0;

        if (stampsData.lifetimeStamps && typeof stampsData.lifetimeStamps === 'number') {
          // Use stored lifetime but subtract reward scans which don't count as paid visits
          lifetimeStamps = stampsData.lifetimeStamps - totalRedemptions;
          console.log(`User ${userId} corrected lifetimeStamps: ${lifetimeStamps} (stored: ${stampsData.lifetimeStamps}, minus ${totalRedemptions} reward scans)`);
        } else {
          // Calculate from current + redeemed
          lifetimeStamps = currentStamps + redeemedStamps;
          console.log(`User ${userId} calculated lifetimeStamps: ${lifetimeStamps} (current: ${currentStamps}, redeemed: ${redeemedStamps})`);
        }

        // Ensure values can't be negative
        if (lifetimeStamps < 0) lifetimeStamps = 0;

        console.log(`User ${userId} loyal stats - Current: ${currentStamps}, Redeemed: ${redeemedStamps}, ` +
                    `Lifetime: ${lifetimeStamps}, Redemptions: ${totalRedemptions}`);

        if (lifetimeStamps > 0 || currentStamps > 0) {
          // Get user details
          const userDoc = await getDoc(doc(firestore, 'users', userId));
          let userName = 'Utente Sconosciuto';
          let userEmail = '';

          if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.firstName && userData.lastName) {
              userName = `${userData.firstName} ${userData.lastName}`;
            } else if (userData.displayName) {
              userName = userData.displayName;
            } else if (userData.email) {
              userName = userData.email;
            }

            userEmail = userData.email || '';
          }

          userLoyalty.push({
            userId,
            userName,
            email: userEmail,
            lifetimeStamps,          // Corrected lifetime stamps (excluding reward scans)
            currentStamps,
            redeemedStamps,
            totalRedemptions,
            lastRedemptionDate: stampsData.lastRedemptionDate
          });
        }
      }

      // Sort by lifetime stamps (descending)
      userLoyalty.sort((a, b) => b.lifetimeStamps - a.lifetimeStamps);

      // Log the top customers for debugging
      console.log("Top customers sorted by lifetime stamps:");
      userLoyalty.slice(0, Math.min(5, userLoyalty.length)).forEach((customer, idx) => {
        console.log(`${idx+1}. ${customer.userName}: ${customer.lifetimeStamps} lifetime stamps (paid visits), ` +
                    `${customer.currentStamps} current stamps, ${customer.redeemedStamps} redeemed stamps, ` +
                    `${customer.totalRedemptions} redemptions`);
      });

      // Return top users based on limit
      return userLoyalty.slice(0, limit);
    } catch (error) {
      console.error('Error fetching loyal customers:', error);
      return [];
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
        <h1>Pannello di Controllo</h1>
        <div className="staff-info">
          <p>Ciao, {userData?.firstName}</p>
        </div>
      </div>

      {/* Scan button at top */}
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
        <div className="stat-card">
          <h3>Caffè Omaggio</h3>
          <div className="stat-value">{stats.totalRewards}</div>
        </div>
      </div>

      {/* Top Customers */}
      <div className="top-customers">
        <h2>Clienti Più Fedeli</h2>
        <div className="customers-list">
          {stats.topCustomers.length > 0 ? (
            stats.topCustomers.map((customer, index) => (
              <div className="customer-item" key={index}>
                <div className="customer-rank">{index + 1}</div>
                <div className="customer-content">
                  <div className="customer-name">{customer.userName}</div>
                  <div className="customer-stats">
                    <span className="customer-lifetime">{customer.lifetimeStamps} timbri totali</span>
                    <span className="customer-redemptions">{customer.totalRedemptions || 0} caffè riscattati</span>
                  </div>
                </div>
                <div className="customer-stamps">
                  <div className="customer-current-stamps">{customer.currentStamps} timbri attuali</div>
                </div>
              </div>
            ))
          ) : (
            <p className="no-customers">Nessun cliente con timbri</p>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="recent-activity">
        <h2>Attività Recenti</h2>
        <div className="activity-list">
          {recentActivities.length > 0 ? (
            recentActivities.map((activity, index) => (
              <div
                className={`activity-item ${activity.type === 'redemption' ? 'redemption' : ''} ${activity._debug ? 'debug-activity' : ''}`}
                key={index}
              >
                <div className="activity-content">
                  {activity.type === 'debug' ? (
                    <>
                      <p className="activity-title">Debug: No Activities Found</p>
                      <p className="activity-user">Check console for detailed logs</p>
                    </>
                  ) : activity.type === 'error' ? (
                    <>
                      <p className="activity-title">Error Loading Activities</p>
                      <p className="activity-user">{activity.errorMessage}</p>
                    </>
                  ) : activity.type === 'redemption' ? (
                    <>
                      <p className="activity-title redemption-title">Caffè Riscattato!</p>
                      <p className="activity-user">Cliente: {activity.userName}</p>
                      <p className="activity-stamps-redeemed">Timbri Riscattati: {activity.stampsRedeemed}</p>
                      {activity.lifetimeStamps > 0 && (
                        <p className="activity-total-stamps">Timbri Totali: {activity.lifetimeStamps}</p>
                      )}
                      {activity._approach && <p className="activity-debug">Fonte: Approccio {activity._approach}</p>}
                    </>
                  ) : (
                    <>
                      <p className="activity-title">Timbro Aggiunto</p>
                      <p className="activity-user">Cliente: {activity.userName}</p>
                      <p className="activity-stamps">Timbri Attuali: {activity.currentStamps}</p>
                      {activity.lifetimeStamps > activity.currentStamps && (
                        <p className="activity-total-stamps">Timbri Totali: {activity.lifetimeStamps}</p>
                      )}
                      {activity._approach && <p className="activity-debug">Fonte: Approccio {activity._approach}</p>}
                    </>
                  )}
                </div>
                <div className="activity-time">
                  {activity.date ? formatDate(activity.date) : 'Data sconosciuta'}
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

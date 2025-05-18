// Updated firebase-counters.js to match business rules

import { doc, getDoc, updateDoc, setDoc, increment } from 'firebase/firestore';
import { firestore } from './firebase';

// Update counters when adding a regular stamp (not a redemption scan)
export const updateStampCounters = async (isNewStamp = true, isRewardScan = false) => {
  try {
    // If this is a reward scan, don't count it as a regular stamp
    if (isRewardScan) {
      console.log('Reward scan detected - not counting in regular stamps');
      return;
    }

    const counterRef = doc(firestore, 'appStats', 'stampCounters');
    const today = new Date().toISOString().split('T')[0]; // Format as YYYY-MM-DD

    // Get current counters
    const counterDoc = await getDoc(counterRef);

    if (counterDoc.exists()) {
      // Update existing counters
      const updateData = {};

      if (isNewStamp) {
        // Increment total stamps
        updateData.totalStampsGiven = increment(1);

        // Increment today's stamps
        updateData[`dailyStats.${today}.stampsGiven`] = increment(1);
      }

      await updateDoc(counterRef, updateData);
      console.log('Updated stamp counters successfully');
    } else {
      // Create new counters document
      const initialData = {
        totalStampsGiven: isNewStamp ? 1 : 0,
        totalStampsRedeemed: 0,
        totalRewards: 0,
        dailyStats: {}
      };

      // Add today's stats
      initialData.dailyStats[today] = {
        stampsGiven: isNewStamp ? 1 : 0,
        stampsRedeemed: 0,
        rewards: 0
      };

      await setDoc(counterRef, initialData);
      console.log('Created initial stamp counters');
    }
  } catch (error) {
    console.error('Error updating stamp counters:', error);
  }
};

// Update counters when redeeming stamps - track redemptions separately
export const updateRedemptionCounters = async (stampsRedeemed) => {
  try {
    const counterRef = doc(firestore, 'appStats', 'stampCounters');
    const today = new Date().toISOString().split('T')[0]; // Format as YYYY-MM-DD

    // Get current counters
    const counterDoc = await getDoc(counterRef);

    if (counterDoc.exists()) {
      // Update existing counters
      const updateData = {
        totalStampsRedeemed: increment(stampsRedeemed),
        totalRewards: increment(1),
        [`dailyStats.${today}.stampsRedeemed`]: increment(stampsRedeemed),
        [`dailyStats.${today}.rewards`]: increment(1)
      };

      await updateDoc(counterRef, updateData);
      console.log('Updated redemption counters successfully');
    } else {
      // Create new counters document
      const initialData = {
        totalStampsGiven: 0,
        totalStampsRedeemed: stampsRedeemed,
        totalRewards: 1,
        dailyStats: {}
      };

      // Add today's stats
      initialData.dailyStats[today] = {
        stampsGiven: 0,
        stampsRedeemed: stampsRedeemed,
        rewards: 1
      };

      await setDoc(counterRef, initialData);
      console.log('Created initial redemption counters');
    }
  } catch (error) {
    console.error('Error updating redemption counters:', error);
  }
};

// Initialize counters (run once from admin panel or setup)
export const initializeCounters = async () => {
  try {
    // Check if counters already exist
    const counterRef = doc(firestore, 'appStats', 'stampCounters');
    const counterDoc = await getDoc(counterRef);

    if (!counterDoc.exists()) {
      console.log('Creating initial counter document in Firebase...');

      // Today's date in YYYY-MM-DD format
      const today = new Date().toISOString().split('T')[0];

      // Create the initial counter document
      await setDoc(counterRef, {
        totalStampsGiven: 0,
        totalStampsRedeemed: 0,
        totalRewards: 0,
        dailyStats: {
          [today]: {
            stampsGiven: 0,
            stampsRedeemed: 0,
            rewards: 0
          }
        }
      });

      console.log('Counter document created successfully!');
      return true;
    } else {
      console.log('Counter document already exists.');
      return false;
    }
  } catch (error) {
    console.error('Error initializing counters:', error);
    return false;
  }
};

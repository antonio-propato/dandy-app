// Create a file called setup-counters.js in your src/lib directory

import { doc, setDoc, getDoc } from 'firebase/firestore';
import { firestore } from './firebase';

// Function to initialize counters
const initializeCounters = async () => {
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
    } else {
      console.log('Counter document already exists.');
    }
  } catch (error) {
    console.error('Error initializing counters:', error);
  }
};

// Run the function
initializeCounters();

// Export for potential reuse
export { initializeCounters };

const {onDocumentCreated} = require('firebase-functions/v2/firestore');
const {onSchedule} = require('firebase-functions/v2/scheduler');
const {onCall} = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

// 🔔 MAIN FUNCTION: Send notifications when notification document is created
exports.sendNotification = onDocumentCreated({
  document: 'notifications/{notificationId}',
  region: 'europe-west2' // London region - better for EU/international
}, async (event) => {
  try {
    const notification = event.data.data();
    const notificationId = event.params.notificationId;

    console.log('📱 Processing notification:', notificationId, notification);

    // Get target users based on criteria
    let targetUsers = [];
    const usersSnapshot = await db.collection('users').get();
    const allUsers = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    switch (notification.target) {
      case 'all': {
        targetUsers = allUsers.filter(u => u.role !== 'superuser' && u.fcmTokens && u.fcmTokens.length > 0);
        break;
      }
      case 'customers': {
        targetUsers = allUsers.filter(u => u.role === 'customer' && u.fcmTokens && u.fcmTokens.length > 0);
        break;
      }
      case 'birthday_today': {
        const today = new Date();
        const todayStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}`;
        targetUsers = allUsers.filter(u =>
          u.role !== 'superuser' &&
          u.fcmTokens && u.fcmTokens.length > 0 &&
          u.dob === todayStr
        );
        break;
      }
      case 'reward_eligible': {
        // Get users with exactly 9 stamps
        const stampsSnapshot = await db.collection('stamps').get();
        const usersWithNineStamps = [];

        stampsSnapshot.docs.forEach(doc => {
          const stampsData = doc.data();
          if (stampsData.stamps && stampsData.stamps.length === 9) {
            usersWithNineStamps.push(doc.id);
          }
        });

        targetUsers = allUsers.filter(u =>
          u.role !== 'superuser' &&
          u.fcmTokens && u.fcmTokens.length > 0 &&
          usersWithNineStamps.includes(u.id)
        );
        break;
      }
      case 'specific_user': {
        if (notification.targetUserId) {
          const targetUser = allUsers.find(u => u.id === notification.targetUserId && u.fcmTokens && u.fcmTokens.length > 0);
          if (targetUser) {
            targetUsers = [targetUser];
          }
        }
        break;
      }
    }

    if (targetUsers.length === 0) {
      console.log('❌ No target users found for criteria:', notification.target);
      await event.data.ref.update({
        status: 'completed',
        successCount: 0,
        failureCount: 0,
        processedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return;
    }

    // Collect all FCM tokens
    const tokens = [];
    targetUsers.forEach(user => {
      if (user.fcmTokens && Array.isArray(user.fcmTokens)) {
        tokens.push(...user.fcmTokens);
      }
    });

    console.log(`🎯 Sending to ${tokens.length} tokens for ${targetUsers.length} users`);

    if (tokens.length === 0) {
      console.log('❌ No valid FCM tokens found');
      await event.data.ref.update({
        status: 'completed',
        successCount: 0,
        failureCount: 0,
        processedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return;
    }

    // Send messages individually to avoid batch endpoint issues
    let successCount = 0;
    let failureCount = 0;
    const failedTokens = [];

    for (const token of tokens) {
      try {
        const message = {
          notification: {
            title: notification.title,
            body: notification.body
          },
          data: {
            click_action: notification.clickAction || '/profile',
            type: notification.type || 'general',
            notificationId: notificationId
          },
          token: token
        };

        await messaging.send(message);
        successCount++;
        console.log(`✅ Message sent successfully to token: ${token.substring(0, 20)}...`);
      } catch (error) {
        failureCount++;
        failedTokens.push(token);
        console.log(`❌ Failed to send to token ${token.substring(0, 20)}...:`, error.code || error.message);
      }
    }

    // Remove invalid tokens from user documents
    if (failedTokens.length > 0) {
      await removeInvalidTokens(failedTokens, targetUsers);
    }

    // Update notification document with results
    await event.data.ref.update({
      status: successCount > 0 ? 'delivered' : 'failed',
      successCount: successCount,
      failureCount: failureCount,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      actualTargetCount: tokens.length
    });

    console.log(`📊 Final results: ${successCount} delivered, ${failureCount} failed`);

  } catch (error) {
    console.error('💥 Error sending notification:', error);

    // Update notification with error status
    await event.data.ref.update({
      status: 'failed',
      error: error.message,
      processedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }
});

// 🎯 NEW FUNCTION: Process QR Code Scans with Birthday Bonus Logic
exports.processStampScan = onCall({
  region: 'europe-west2'
}, async (request) => {
  // Verify user is authenticated
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
  }

  const { scannedUserId } = request.data;

  if (!scannedUserId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing scannedUserId');
  }

  try {
    console.log(`🔍 Processing stamp scan for user: ${scannedUserId}`);

    // Get user data and stamps data
    const userRef = db.doc(`users/${scannedUserId}`);
    const stampsRef = db.doc(`stamps/${scannedUserId}`);

    const [userSnap, stampsSnap] = await Promise.all([
      userRef.get(),
      stampsRef.get()
    ]);

    if (!userSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }

    const userData = userSnap.data();
    const stampsData = stampsSnap.exists ? stampsSnap.data() : {
      stamps: [],
      lifetimeStamps: 0,
      rewardsEarned: 0
    };

    // Birthday bonus logic
    const today = new Date().toISOString().split('T')[0]; // "2024-06-08"
    const userBirthday = userData.dob; // Expected format: "08/06"

    let stampsToAdd = 1; // Default: 1 regular stamp
    let isBirthdayBonus = false;
    let message = 'Timbro aggiunto con successo!';

    // Check if today is user's birthday and they haven't received bonus yet
    if (userBirthday) {
      const [day, month] = userBirthday.split('/');
      const todayDate = new Date();
      const todayDay = String(todayDate.getDate()).padStart(2, '0');
      const todayMonth = String(todayDate.getMonth() + 1).padStart(2, '0');

      const isBirthday = day === todayDay && month === todayMonth;
      const alreadyGaveBirthdayBonus = stampsData.birthdayBonusGiven === today;

      console.log(`🎂 Birthday check - isBirthday: ${isBirthday}, alreadyGaveBonus: ${alreadyGaveBirthdayBonus}`);

      if (isBirthday && !alreadyGaveBirthdayBonus) {
        stampsToAdd = 2; // Regular stamp + birthday bonus
        isBirthdayBonus = true;
        message = '🎉 Buon compleanno! Hai ricevuto un timbro extra!';
        console.log(`🎁 Birthday bonus activated for user ${scannedUserId}`);
      }
    }

    // Check current stamp count
    const currentStampCount = stampsData.stamps ? stampsData.stamps.length : 0;
    const totalAfterScan = currentStampCount + stampsToAdd;

    console.log(`📊 Current stamps: ${currentStampCount}, Adding: ${stampsToAdd}, Total after: ${totalAfterScan}`);

    // If adding stamps would exceed 9, handle the reward logic
    if (totalAfterScan > 9) {
      console.log(`🎁 User reached reward threshold! Processing reward and overflow.`);

      // Calculate overflow stamps (stamps beyond 9)
      const overflowStamps = totalAfterScan - 9;
      console.log(`📊 Overflow stamps: ${overflowStamps}`);

      // Create stamps array for overflow
      const baseTime = Date.now();
      const overflowStampsArray = [];

      for (let i = 0; i < overflowStamps; i++) {
        const stampTime = new Date(baseTime + (i * 1000)).toISOString();
        overflowStampsArray.push({ date: stampTime });
        console.log(`📝 Adding overflow stamp ${i + 1} with timestamp: ${stampTime}`);
      }

      // User gets free coffee and stamps reset to overflow amount
      const updateData = {
        stamps: overflowStampsArray, // Set to overflow stamps, not empty array
        lifetimeStamps: admin.firestore.FieldValue.increment(stampsToAdd),
        rewardsEarned: admin.firestore.FieldValue.increment(1),
        rewardClaimed: true,
        lastRedemptionDate: new Date().toISOString()
      };

      // Add birthday bonus tracking if applicable
      if (isBirthdayBonus) {
        updateData.birthdayBonusGiven = today;
      }

      await stampsRef.set(updateData, { merge: true });

      console.log(`✅ Reward processed! Reset to ${overflowStamps} overflow stamps`);

      return {
        success: true,
        stampsAdded: stampsToAdd,
        message: overflowStamps > 0
          ? `🎁 Congratulazioni! Hai ottenuto un caffè gratis! Hai ${overflowStamps} timbro${overflowStamps > 1 ? 'i' : ''} per la prossima raccolta.`
          : '🎁 Congratulazioni! Hai ottenuto un caffè gratis! I tuoi timbri sono stati resettati.',
        rewardEarned: true,
        birthdayBonus: isBirthdayBonus,
        currentStamps: overflowStamps,
        overflowStamps: overflowStamps
      };
    }

    // Normal stamp addition
    const baseTime = Date.now();

    // Get current stamps and create new array explicitly
    const currentStampsArray = stampsData.stamps || [];
    console.log(`📊 Current stamps array length: ${currentStampsArray.length}`);
    console.log(`📊 Current stamps array:`, currentStampsArray);

    // Create new stamps array by copying existing and adding new ones
    const updatedStampsArray = [...currentStampsArray];

    // Add the required number of stamps with unique timestamps
    for (let i = 0; i < stampsToAdd; i++) {
      // Add millisecond offset to ensure unique timestamps
      const stampTime = new Date(baseTime + (i * 1000)).toISOString(); // 1 second apart
      updatedStampsArray.push({ date: stampTime });
      console.log(`📝 Adding stamp ${i + 1} with timestamp: ${stampTime}`);
    }

    console.log(`📊 Updated stamps array length: ${updatedStampsArray.length}`);
    console.log(`📊 Adding ${stampsToAdd} stamps. Before: ${currentStampsArray.length}, After: ${updatedStampsArray.length}`);
    console.log(`📊 Updated stamps array:`, updatedStampsArray);

    // Prepare update data - use set with merge instead of update
    const updateData = {
      stamps: updatedStampsArray,
      lifetimeStamps: (stampsData.lifetimeStamps || 0) + stampsToAdd // Calculate explicitly
    };

    // Add birthday bonus tracking if applicable
    if (isBirthdayBonus) {
      updateData.birthdayBonusGiven = today;
      console.log(`🎂 Birthday bonus tracked for date: ${today}`);
    }

    console.log(`💾 About to update with:`, {
      stampsCount: updatedStampsArray.length,
      lifetimeStamps: updateData.lifetimeStamps,
      birthdayBonus: isBirthdayBonus
    });

    // Perform the update using set with merge to ensure atomic operation
    await stampsRef.set(updateData, { merge: true });

    console.log(`✅ Database update completed successfully`);

    // Verify the update by reading back
    const verifyDoc = await stampsRef.get();
    const verifyData = verifyDoc.data();
    console.log(`🔍 Verification - stamps count after update: ${verifyData.stamps?.length || 0}`);
    console.log(`🔍 Verification - lifetimeStamps after update: ${verifyData.lifetimeStamps || 0}`);
    console.log(`🔍 Verification - actual stamps array:`, verifyData.stamps);

    console.log(`✅ Successfully added ${stampsToAdd} stamps to user ${scannedUserId}`);

    return {
      success: true,
      stampsAdded: stampsToAdd,
      message: message,
      currentStamps: currentStampCount + stampsToAdd,
      rewardEarned: false,
      birthdayBonus: isBirthdayBonus
    };

  } catch (error) {
    console.error('💥 Stamp scan processing error:', error);
    throw new functions.https.HttpsError('internal', 'Errore durante la scansione del QR code');
  }
});

// 🧹 Helper function to remove invalid FCM tokens
async function removeInvalidTokens(invalidTokens, users) {
  const batch = db.batch();

  for (const user of users) {
    if (user.fcmTokens && Array.isArray(user.fcmTokens)) {
      const validTokens = user.fcmTokens.filter(token => !invalidTokens.includes(token));

      if (validTokens.length !== user.fcmTokens.length) {
        const userRef = db.collection('users').doc(user.id);
        batch.update(userRef, { fcmTokens: validTokens });
        console.log(`🧹 Removing invalid tokens for user ${user.id}`);
      }
    }
  }

  try {
    await batch.commit();
    console.log('✅ Invalid tokens removed from user documents');
  } catch (error) {
    console.log('No tokens to remove or batch commit failed:', error.message);
  }
}

// 📅 AUTOMATED NOTIFICATIONS: Scheduled function (runs daily at 9 AM Italian time)
exports.sendAutomatedNotifications = onSchedule({
  schedule: '0 9 * * *',
  timeZone: 'Europe/Rome', // Keep Italian timezone for the coffee shop
  region: 'europe-west2' // London region
}, async () => {
  try {
    console.log('🤖 Running automated notifications check...');

    // Get all enabled automated rules
    const rulesSnapshot = await db
      .collection('automatedNotifications')
      .where('enabled', '==', true)
      .get();

    if (rulesSnapshot.empty) {
      console.log('📭 No enabled automated rules found');
      return;
    }

    console.log(`🔍 Found ${rulesSnapshot.size} enabled rules`);

    for (const ruleDoc of rulesSnapshot.docs) {
      const rule = ruleDoc.data();
      const ruleId = ruleDoc.id;

      console.log(`🎯 Processing rule: ${rule.type}`);

      try {
        // Process different rule types
        switch (rule.type) {
          case 'birthday':
            await processBirthdayNotifications(rule, ruleId);
            break;
          case 'stamp_milestone':
            await processStampMilestoneNotifications(rule, ruleId);
            break;
          case 'reward_available':
            await processRewardNotifications(rule, ruleId);
            break;
          case 'inactive_user':
            await processInactiveUserNotifications(rule, ruleId);
            break;
          default:
            console.log(`⚠️ Unknown rule type: ${rule.type}`);
        }
      } catch (ruleError) {
        console.error(`💥 Error processing rule ${rule.type}:`, ruleError);
      }
    }

    console.log('✅ Automated notifications check completed');

  } catch (error) {
    console.error('💥 Error in automated notifications:', error);
  }
});

// 🎂 Process birthday notifications
async function processBirthdayNotifications(rule, ruleId) {
  const today = new Date();
  const todayStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}`;

  console.log(`🎂 Checking for birthdays on ${todayStr}`);

  const usersSnapshot = await db.collection('users')
    .where('dob', '==', todayStr)
    .where('role', '==', 'customer')
    .get();

  if (usersSnapshot.empty) {
    console.log('🎂 No birthdays today');
    return;
  }

  console.log(`🎉 Found ${usersSnapshot.size} birthday(s) today!`);

  await db.collection('notifications').add({
    type: 'automated',
    ruleId: ruleId,
    title: rule.title,
    body: rule.body,
    target: 'birthday_today',
    clickAction: rule.clickAction || '/profile',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    status: 'pending'
  });

  await db.collection('automatedNotifications').doc(ruleId).update({
    lastTriggered: admin.firestore.FieldValue.serverTimestamp(),
    totalSent: admin.firestore.FieldValue.increment(1)
  });

  console.log('🎂 Birthday notification created');
}

// ⭐ Process stamp milestone notifications (6-8 stamps)
async function processStampMilestoneNotifications(rule, ruleId) {
  console.log('⭐ Checking for users near stamp milestone...');

  const stampsSnapshot = await db.collection('stamps').get();
  const usersNearMilestone = [];

  stampsSnapshot.docs.forEach(doc => {
    const stampsData = doc.data();
    const stampCount = stampsData.stamps ? stampsData.stamps.length : 0;

    // Users with 6, 7, or 8 stamps
    if (stampCount >= 6 && stampCount <= 8) {
      usersNearMilestone.push(doc.id);
    }
  });

  if (usersNearMilestone.length === 0) {
    console.log('⭐ No users near milestone found');
    return;
  }

  console.log(`⭐ Found ${usersNearMilestone.length} users near milestone`);

  // Send notifications to these users
  for (const userId of usersNearMilestone) {
    await db.collection('notifications').add({
      type: 'automated',
      ruleId: ruleId,
      title: rule.title,
      body: rule.body,
      target: 'specific_user',
      targetUserId: userId,
      clickAction: rule.clickAction || '/stamps',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'pending'
    });
  }

  await db.collection('automatedNotifications').doc(ruleId).update({
    lastTriggered: admin.firestore.FieldValue.serverTimestamp(),
    totalSent: admin.firestore.FieldValue.increment(1)
  });

  console.log('⭐ Milestone notifications created');
}

// 🎁 Process reward available notifications (9 stamps)
async function processRewardNotifications(rule, ruleId) {
  console.log('🎁 Checking for users with 9 stamps...');

  const stampsSnapshot = await db.collection('stamps').get();
  const usersWithReward = [];

  stampsSnapshot.docs.forEach(doc => {
    const stampsData = doc.data();
    const stampCount = stampsData.stamps ? stampsData.stamps.length : 0;

    // Users with exactly 9 stamps
    if (stampCount === 9) {
      usersWithReward.push(doc.id);
    }
  });

  if (usersWithReward.length === 0) {
    console.log('🎁 No users with 9 stamps found');
    return;
  }

  console.log(`🎁 Found ${usersWithReward.length} users with rewards available`);

  await db.collection('notifications').add({
    type: 'automated',
    ruleId: ruleId,
    title: rule.title,
    body: rule.body,
    target: 'reward_eligible',
    clickAction: rule.clickAction || '/stamps',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    status: 'pending'
  });

  await db.collection('automatedNotifications').doc(ruleId).update({
    lastTriggered: admin.firestore.FieldValue.serverTimestamp(),
    totalSent: admin.firestore.FieldValue.increment(1)
  });

  console.log('🎁 Reward notifications created');
}

// 💔 Process inactive user notifications
async function processInactiveUserNotifications(rule, ruleId) {
  console.log('💔 Checking for inactive users...');

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const usersSnapshot = await db.collection('users')
    .where('role', '==', 'customer')
    .get();

  const inactiveUsers = [];

  usersSnapshot.docs.forEach(doc => {
    const userData = doc.data();
    const lastLogin = userData.lastLogin ? new Date(userData.lastLogin) : null;

    if (!lastLogin || lastLogin < thirtyDaysAgo) {
      inactiveUsers.push(doc.id);
    }
  });

  if (inactiveUsers.length === 0) {
    console.log('💔 No inactive users found');
    return;
  }

  console.log(`💔 Found ${inactiveUsers.length} inactive users`);

  // Send notifications to inactive users
  for (const userId of inactiveUsers) {
    await db.collection('notifications').add({
      type: 'automated',
      ruleId: ruleId,
      title: rule.title,
      body: rule.body,
      target: 'specific_user',
      targetUserId: userId,
      clickAction: rule.clickAction || '/menu',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'pending'
    });
  }

  await db.collection('automatedNotifications').doc(ruleId).update({
    lastTriggered: admin.firestore.FieldValue.serverTimestamp(),
    totalSent: admin.firestore.FieldValue.increment(1)
  });

  console.log('💔 Inactive user notifications created');
}

const {onDocumentCreated} = require('firebase-functions/v2/firestore');
const {onSchedule} = require('firebase-functions/v2/scheduler');
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

// Rest of the automated notification functions remain the same...
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

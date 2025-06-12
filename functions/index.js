const { onCall, onRequest, onDocumentCreated } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { logger } = require('firebase-functions')
const admin = require('firebase-admin')
const { getFirestore } = require('firebase-admin/firestore')
const { getMessaging } = require('firebase-admin/messaging')

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp()
}

const db = getFirestore()
const messaging = getMessaging()

// Helper function to clean up invalid FCM tokens
async function cleanupInvalidTokens(userId, invalidTokens) {
  if (!invalidTokens || invalidTokens.length === 0) return

  try {
    const userRef = db.doc(`users/${userId}`)
    const userDoc = await userRef.get()

    if (userDoc.exists) {
      const userData = userDoc.data()
      const currentTokens = userData.fcmTokens || []
      const validTokens = currentTokens.filter(token => !invalidTokens.includes(token))

      await userRef.update({
        fcmTokens: validTokens,
        lastTokenCleanup: new Date().toISOString()
      })

      logger.info(`Cleaned up ${invalidTokens.length} invalid tokens for user ${userId}`)
    }
  } catch (error) {
    logger.error(`Error cleaning up tokens for user ${userId}:`, error)
  }
}

// Helper function to send FCM message
async function sendFCMMessage(tokens, title, body, clickAction = '/profile', data = {}) {
  if (!tokens || tokens.length === 0) {
    return { success: 0, failed: 0, invalidTokens: [] }
  }

  // Ensure tokens is an array
  const tokenArray = Array.isArray(tokens) ? tokens : [tokens]

  const message = {
    notification: {
      title: title.trim(),
      body: body.trim()
    },
    data: {
      click_action: clickAction,
      timestamp: new Date().toISOString(),
      ...data
    },
    // Don't set app name in android config to avoid "from Dandy"
    android: {
      notification: {
        clickAction,
        sound: 'default',
        priority: 'high'
      }
    },
    apns: {
      payload: {
        aps: {
          sound: 'default',
          badge: 1
        }
      },
      fcmOptions: {
        imageUrl: 'https://your-domain.com/images/favicon.png'
      }
    },
    webpush: {
      notification: {
        icon: '/images/favicon.png',
        badge: '/images/favicon.png',
        tag: 'dandy-notification',
        renotify: true,
        requireInteraction: true
      },
      fcmOptions: {
        link: clickAction
      }
    }
  }

  let successCount = 0
  let failedCount = 0
  const invalidTokens = []

  // Send to tokens in batches of 500 (FCM limit)
  const batchSize = 500
  for (let i = 0; i < tokenArray.length; i += batchSize) {
    const batch = tokenArray.slice(i, i + batchSize)

    try {
      const response = await messaging.sendEachForMulticast({
        ...message,
        tokens: batch
      })

      successCount += response.successCount
      failedCount += response.failureCount

      // Collect invalid tokens
      response.responses.forEach((resp, index) => {
        if (!resp.success) {
          const error = resp.error
          if (error.code === 'messaging/registration-token-not-registered' ||
              error.code === 'messaging/invalid-registration-token') {
            invalidTokens.push(batch[index])
          }
          logger.warn(`FCM send failed for token ${batch[index]}:`, error.code)
        }
      })

    } catch (error) {
      logger.error(`FCM batch send failed:`, error)
      failedCount += batch.length
    }
  }

  return {
    success: successCount,
    failed: failedCount,
    invalidTokens
  }
}

// 🔥 NEW: Send Push Notifications (Called by NotificationPanel)
exports.sendPushNotification = onCall({
  region: "europe-west2"
}, async (request) => {
  if (!request.auth) {
    throw new Error("Authentication required")
  }

  const { title, body, target, clickAction = '/profile', data = {} } = request.data

  if (!title?.trim() || !body?.trim()) {
    throw new Error("Title and body are required")
  }

  try {
    logger.info(`📱 Sending push notification - Target: ${target}, Title: ${title}`)

    // Get target users based on criteria
    let targetUsers = []
    const usersSnapshot = await db.collection('users').get()
    const allUsers = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))

    switch (target) {
      case 'all':
        targetUsers = allUsers.filter(u => u.role !== 'superuser' && u.fcmTokens?.length > 0)
        break
      case 'customers':
        targetUsers = allUsers.filter(u => u.role === 'customer' && u.fcmTokens?.length > 0)
        break
      case 'birthday_today':
        const today = new Date()
        const todayStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}`
        targetUsers = allUsers.filter(u =>
          u.role !== 'superuser' &&
          u.fcmTokens?.length > 0 &&
          u.dob === todayStr
        )
        break
      case 'inactive_users':
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        targetUsers = allUsers.filter(u =>
          u.role !== 'superuser' &&
          u.fcmTokens?.length > 0 &&
          (!u.lastLogin || new Date(u.lastLogin) < thirtyDaysAgo)
        )
        break
      case 'reward_eligible':
        // Get users with exactly 9 stamps
        const stampsSnapshot = await db.collection('stamps').get()
        const usersWithNineStamps = new Set()

        stampsSnapshot.docs.forEach(doc => {
          const stampsData = doc.data()
          if (stampsData.stamps?.length === 9) {
            usersWithNineStamps.add(doc.id)
          }
        })

        targetUsers = allUsers.filter(u =>
          u.role !== 'superuser' &&
          u.fcmTokens?.length > 0 &&
          usersWithNineStamps.has(u.id)
        )
        break
      default:
        throw new Error(`Invalid target: ${target}`)
    }

    if (targetUsers.length === 0) {
      return {
        success: true,
        message: 'No users found matching criteria',
        targetCount: 0,
        successCount: 0
      }
    }

    logger.info(`🎯 Found ${targetUsers.length} target users`)

    // Collect all FCM tokens
    const allTokens = []
    const userTokenMap = new Map() // Track which user owns which tokens

    targetUsers.forEach(user => {
      if (user.fcmTokens && Array.isArray(user.fcmTokens)) {
        user.fcmTokens.forEach(token => {
          allTokens.push(token)
          userTokenMap.set(token, user.id)
        })
      }
    })

    if (allTokens.length === 0) {
      return {
        success: true,
        message: 'No valid FCM tokens found',
        targetCount: targetUsers.length,
        successCount: 0
      }
    }

    // Send FCM messages
    const fcmResult = await sendFCMMessage(
      allTokens,
      title.trim(),
      body.trim(),
      clickAction,
      {
        type: 'admin_broadcast',
        target,
        ...data
      }
    )

    // Clean up invalid tokens
    if (fcmResult.invalidTokens.length > 0) {
      const tokensByUser = new Map()
      fcmResult.invalidTokens.forEach(token => {
        const userId = userTokenMap.get(token)
        if (userId) {
          if (!tokensByUser.has(userId)) {
            tokensByUser.set(userId, [])
          }
          tokensByUser.get(userId).push(token)
        }
      })

      // Clean up invalid tokens for each user
      const cleanupPromises = Array.from(tokensByUser.entries()).map(([userId, invalidTokens]) =>
        cleanupInvalidTokens(userId, invalidTokens)
      )
      await Promise.all(cleanupPromises)
    }

    // Create notification records for users who received the notification
    const batch = db.batch()
    const now = new Date().toISOString()

    targetUsers.forEach(user => {
      const userHasValidTokens = user.fcmTokens?.some(token => !fcmResult.invalidTokens.includes(token))

      if (userHasValidTokens) {
        const notificationRef = db.collection('notifications').doc()
        batch.set(notificationRef, {
          userId: user.id,
          title: title.trim(),
          body: body.trim(),
          createdAt: now,
          read: false,
          readAt: null,
          data: {
            click_action: clickAction,
            type: 'admin_broadcast',
            target,
            ...data
          },
          sentBy: 'superuser',
          campaign: target
        })
      }
    })

    await batch.commit()

    logger.info(`✅ Push notification sent - Success: ${fcmResult.success}, Failed: ${fcmResult.failed}`)

    return {
      success: true,
      message: `Notification sent successfully`,
      targetCount: targetUsers.length,
      successCount: fcmResult.success,
      failedCount: fcmResult.failed,
      invalidTokensCleaned: fcmResult.invalidTokens.length
    }

  } catch (error) {
    logger.error('💥 Error sending push notification:', error)
    throw new Error(`Failed to send notification: ${error.message}`)
  }
})

// 🔄 Automated Birthday Notifications (Daily at 9 AM)
exports.sendBirthdayNotifications = onSchedule({
  schedule: 'every day 09:00',
  timeZone: 'Europe/Rome',
  region: 'europe-west2'
}, async () => {
  try {
    logger.info('🎂 Running daily birthday notification check...')

    const today = new Date()
    const todayStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}`

    // Get users with birthday today
    const usersSnapshot = await db.collection('users')
      .where('dob', '==', todayStr)
      .where('role', '!=', 'superuser')
      .get()

    if (usersSnapshot.empty) {
      logger.info('🎂 No birthdays today')
      return
    }

    const birthdayUsers = usersSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(user => user.fcmTokens?.length > 0)

    if (birthdayUsers.length === 0) {
      logger.info('🎂 No birthday users with FCM tokens')
      return
    }

    // Send birthday notifications
    const allTokens = birthdayUsers.flatMap(user => user.fcmTokens || [])

    const fcmResult = await sendFCMMessage(
      allTokens,
      'Buon Compleanno! 🎉',
      'Tanti auguri da tutto il team Dandy! Oggi riceverai un timbro extra con la tua prima scansione!',
      '/profile',
      { type: 'birthday_bonus', automated: true }
    )

    // Create notification records
    const batch = db.batch()
    const now = new Date().toISOString()

    birthdayUsers.forEach(user => {
      const notificationRef = db.collection('notifications').doc()
      batch.set(notificationRef, {
        userId: user.id,
        title: 'Buon Compleanno! 🎉',
        body: 'Tanti auguri da tutto il team Dandy! Oggi riceverai un timbro extra con la tua prima scansione!',
        createdAt: now,
        read: false,
        readAt: null,
        data: {
          click_action: '/profile',
          type: 'birthday_bonus',
          automated: true
        },
        sentBy: 'system',
        campaign: 'birthday_automated'
      })
    })

    await batch.commit()

    logger.info(`🎂 Birthday notifications sent to ${birthdayUsers.length} users - Success: ${fcmResult.success}`)

  } catch (error) {
    logger.error('💥 Error in birthday notification job:', error)
  }
})

// 🎯 EXISTING: Process QR Code Scans with Enhanced Birthday Logic
exports.processStampScan = onCall({
  region: "europe-west2"
}, async (request) => {
  if (!request.auth) throw new Error("User must be logged in")
  const { scannedUserId } = request.data
  if (!scannedUserId) throw new Error("Missing scannedUserId")

  try {
    logger.info(`🔍 Processing stamp scan for user: ${scannedUserId}`)
    const userRef = db.doc(`users/${scannedUserId}`)
    const stampsRef = db.doc(`stamps/${scannedUserId}`)

    const [userSnap, stampsSnap] = await Promise.all([userRef.get(), stampsRef.get()])
    if (!userSnap.exists) throw new Error("User not found")

    const userData = userSnap.data()
    let stampsData = stampsSnap.exists ? stampsSnap.data() : {}

    const cleanStampsData = {
      stamps: stampsData.stamps || [],
      lifetimeStamps: stampsData.lifetimeStamps || 0,
      rewardsEarned: stampsData.rewardsEarned || 0,
      availableRewards: stampsData.availableRewards || 0,
      receivedFreeStamps: stampsData.receivedFreeStamps || false,
      birthdayBonusYear: stampsData.birthdayBonusYear || null,
      rewardHistory: stampsData.rewardHistory || []
    }

    if (stampsData.pendingStamps?.length) {
      logger.info(`🔧 Migrating ${stampsData.pendingStamps.length} pending stamps.`)
      cleanStampsData.stamps.push(...stampsData.pendingStamps)
    }
    stampsData = cleanStampsData

    const currentYear = new Date().getFullYear()
    let stampsToAdd = 1
    let isBirthdayBonus = false
    let message = "Timbro aggiunto con successo!"

    // Birthday bonus logic - once per year
    if (userData.dob) {
      const [day, month] = userData.dob.split("/")
      const todayDate = new Date()
      const todayDay = String(todayDate.getDate()).padStart(2, "0")
      const todayMonth = String(todayDate.getMonth() + 1).padStart(2, "0")
      const isBirthdayToday = (day === todayDay && month === todayMonth)

      const birthdayBonusAlreadyGivenThisYear = stampsData.birthdayBonusYear === currentYear

      if (isBirthdayToday && !birthdayBonusAlreadyGivenThisYear) {
        stampsToAdd = 2 // 1 normal + 1 birthday bonus
        isBirthdayBonus = true
        message = "🎉 Buon compleanno! Hai ricevuto un timbro extra!"
        logger.info(`🎁 Birthday bonus ACTIVATED for user ${scannedUserId} (year ${currentYear})`)
      } else if (isBirthdayToday && birthdayBonusAlreadyGivenThisYear) {
        logger.info(`🎂 Birthday bonus already given this year (${currentYear}) for user ${scannedUserId}. Awarding standard 1 stamp.`)
      }
    }

    const currentStampCount = stampsData.stamps.length
    const totalAfterScan = currentStampCount + stampsToAdd
    logger.info(`📊 Current stamps: ${currentStampCount}, Adding: ${stampsToAdd}, Total will be: ${totalAfterScan}`)

    let updateData
    let response

    if (totalAfterScan >= 9) {
      const overflowStamps = totalAfterScan - 9
      const overflowStampsArray = Array.from({ length: overflowStamps }, (_, i) => ({ date: new Date(Date.now() + i).toISOString() }))
      logger.info(`🎁 Collection complete! Overflow stamps: ${overflowStamps}`)

      updateData = {
        stamps: overflowStampsArray,
        lifetimeStamps: stampsData.lifetimeStamps + stampsToAdd,
        rewardsEarned: stampsData.rewardsEarned + 1,
        availableRewards: stampsData.availableRewards + 1,
        receivedFreeStamps: stampsData.receivedFreeStamps,
        lastStampDate: new Date().toISOString(),
        rewardHistory: stampsData.rewardHistory,
        birthdayBonusYear: isBirthdayBonus ? currentYear : stampsData.birthdayBonusYear
      }

      const successMessage = overflowStamps > 0
        ? `🎁 Congratulazioni! Raccolta completata! Nuovo giro con ${overflowStamps} timbr${overflowStamps > 1 ? "i" : "o"}.`
        : "🎁 Congratulazioni! Raccolta completata! Griglia resettata."

      response = {
        success: true,
        message: successMessage,
        rewardEarned: true,
        birthdayBonus: isBirthdayBonus,
        currentStamps: overflowStampsArray.length,
        stampsAdded: stampsToAdd
      }

      // Send reward notification to user
      if (userData.fcmTokens?.length > 0) {
        try {
          await sendFCMMessage(
            userData.fcmTokens,
            'Caffè Gratuito! 🎁',
            'Congratulazioni! Hai completato la raccolta timbri. Il tuo caffè gratuito ti aspetta!',
            '/stamps',
            { type: 'reward_earned' }
          )
        } catch (fcmError) {
          logger.warn('Failed to send reward notification:', fcmError)
        }
      }

    } else {
      const newStampsArray = [...stampsData.stamps]
      for (let i = 0; i < stampsToAdd; i++) newStampsArray.push({ date: new Date(Date.now() + i).toISOString() })
      logger.info(`📝 Adding ${stampsToAdd} stamps normally. New total: ${newStampsArray.length}`)

      updateData = {
        stamps: newStampsArray,
        lifetimeStamps: stampsData.lifetimeStamps + stampsToAdd,
        rewardsEarned: stampsData.rewardsEarned,
        availableRewards: stampsData.availableRewards,
        receivedFreeStamps: stampsData.receivedFreeStamps,
        lastStampDate: new Date().toISOString(),
        rewardHistory: stampsData.rewardHistory,
        birthdayBonusYear: isBirthdayBonus ? currentYear : stampsData.birthdayBonusYear
      }

      response = {
        success: true,
        stampsAdded: stampsToAdd,
        message,
        currentStamps: newStampsArray.length,
        rewardEarned: false,
        birthdayBonus: isBirthdayBonus
      }

      // Send milestone notification for users close to reward (7-8 stamps)
      if (newStampsArray.length >= 7 && newStampsArray.length <= 8 && userData.fcmTokens?.length > 0) {
        const stampsNeeded = 9 - newStampsArray.length
        try {
          await sendFCMMessage(
            userData.fcmTokens,
            'Quasi al traguardo! ⭐',
            `Ti ${stampsNeeded === 1 ? 'manca solo 1 timbro' : `mancano solo ${stampsNeeded} timbri`} per il caffè gratuito!`,
            '/stamps',
            { type: 'milestone_notification' }
          )
        } catch (fcmError) {
          logger.warn('Failed to send milestone notification:', fcmError)
        }
      }
    }

    await stampsRef.set(updateData, { merge: false })
    logger.info(`✅ Write operation successful for user ${scannedUserId}`)
    return response

  } catch (error) {
    logger.error("💥 Stamp scan processing error:", error)
    throw new Error(`Errore durante la scansione del QR code: ${error.message}`)
  }
})

// 🧹 Cleanup Invalid FCM Tokens (Weekly)
exports.cleanupFCMTokens = onSchedule({
  schedule: 'every sunday 02:00',
  timeZone: 'Europe/Rome',
  region: 'europe-west2'
}, async () => {
  try {
    logger.info('🧹 Running weekly FCM token cleanup...')

    const usersSnapshot = await db.collection('users').get()
    let totalCleaned = 0

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data()
      const tokens = userData.fcmTokens || []

      if (tokens.length === 0) continue

      // Test tokens by sending a dry-run message
      try {
        const testMessage = {
          notification: { title: 'Test', body: 'Test' },
          tokens: tokens,
          dryRun: true
        }

        const response = await messaging.sendEachForMulticast(testMessage)
        const invalidTokens = []

        response.responses.forEach((resp, index) => {
          if (!resp.success) {
            const error = resp.error
            if (error.code === 'messaging/registration-token-not-registered' ||
                error.code === 'messaging/invalid-registration-token') {
              invalidTokens.push(tokens[index])
            }
          }
        })

        if (invalidTokens.length > 0) {
          await cleanupInvalidTokens(userDoc.id, invalidTokens)
          totalCleaned += invalidTokens.length
        }

      } catch (error) {
        logger.warn(`Error testing tokens for user ${userDoc.id}:`, error)
      }
    }

    logger.info(`🧹 FCM token cleanup complete - Removed ${totalCleaned} invalid tokens`)

  } catch (error) {
    logger.error('💥 Error in FCM token cleanup job:', error)
  }
})

// 🔔 Test Notification Function (for debugging)
exports.testNotification = onCall({
  region: "europe-west2"
}, async (request) => {
  if (!request.auth) {
    throw new Error("Authentication required")
  }

  const { userId, title = 'Test Notification', body = 'This is a test from Dandy!' } = request.data

  try {
    // Get user's FCM tokens
    const userDoc = await db.doc(`users/${userId || request.auth.uid}`).get()

    if (!userDoc.exists) {
      throw new Error("User not found")
    }

    const userData = userDoc.data()
    const tokens = userData.fcmTokens || []

    if (tokens.length === 0) {
      return {
        success: false,
        message: 'No FCM tokens found for user'
      }
    }

    const result = await sendFCMMessage(tokens, title, body, '/profile', { type: 'test' })

    return {
      success: true,
      message: `Test notification sent - Success: ${result.success}, Failed: ${result.failed}`,
      details: result
    }

  } catch (error) {
    logger.error('💥 Error sending test notification:', error)
    throw new Error(`Test notification failed: ${error.message}`)
  }
})


// 🎁 UPDATED FUNCTION: Generate Reward QR Code
exports.generateRewardQR = onCall({
  region: "europe-west2"
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be logged in");
  }

  const userId = request.auth.uid;

  try {
    console.log(`🎁 Generating reward QR for user: ${userId}`);

    // Check if user has available rewards
    const stampsRef = db.doc(`stamps/${userId}`);
    const stampsSnap = await stampsRef.get();

    if (!stampsSnap.exists) {
      throw new HttpsError("not-found", "User stamps data not found");
    }

    const stampsData = stampsSnap.data();
    const availableRewards = stampsData.availableRewards || 0;

    if (availableRewards <= 0) {
      throw new HttpsError("failed-precondition", "No rewards available to generate QR");
    }

    // Generate unique reward ID (simpler format)
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substr(2, 9);
    const rewardId = `reward_${timestamp}_${randomString}`;
    const rewardQRText = `reward://dandy-app/${userId}/${rewardId}`;

    console.log(`📱 Generated reward QR text: ${rewardQRText}`);

    // Generate QR code using qrcode library
    const QRCode = require('qrcode');
    const qrCodeDataURL = await QRCode.toDataURL(rewardQRText, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      errorCorrectionLevel: 'M'
    });

    // Store reward QR in Firestore with expiration
    const expirationTime = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    await db.collection('rewardQRs').doc(rewardId).set({
      userId: userId,
      qrCode: rewardQRText,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: expirationTime,
      used: false,
      usedAt: null,
      redeemedBy: null
    });

    console.log(`✅ Reward QR created successfully with ID: ${rewardId}`);

    return {
      success: true,
      qrCodeDataURL: qrCodeDataURL,
      rewardId: rewardId,
      expiresAt: expirationTime.toISOString()
    };

  } catch (error) {
    console.error("💥 Error generating reward QR:", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "Failed to generate reward QR", { detail: error.message });
  }
});

// 🎁 UPDATED FUNCTION: Redeem Reward QR Code (with reward history tracking)
// 🎁 UPDATED FUNCTION: Redeem Reward QR Code (with enhanced Italian validation messages)
// ONLY REPLACE THIS FUNCTION - Keep generateRewardQR and claimAndResetReward as they are
exports.redeemRewardQR = onCall({
  region: "europe-west2"
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be logged in");
  }

  const { qrCode } = request.data;

  // Enhanced QR format validation with Italian message
  if (!qrCode || !qrCode.startsWith('reward://dandy-app/')) {
    throw new HttpsError("invalid-argument", "Questo QR code non è valido");
  }

  try {
    console.log(`🎁 Processing reward QR redemption: ${qrCode}`);

    // Parse QR code to extract userId and rewardId
    // Expected format: reward://dandy-app/{userId}/{rewardId}
    const qrPath = qrCode.replace('reward://dandy-app/', '');
    const qrParts = qrPath.split('/');

    console.log(`🔍 QR Path: ${qrPath}`);
    console.log(`🔍 QR Parts:`, qrParts);

    // Enhanced QR parts validation with Italian message
    if (qrParts.length !== 2) {
      throw new HttpsError("invalid-argument", "Questo QR code non è valido");
    }

    const [userId, rewardId] = qrParts;
    console.log(`👤 User ID: ${userId}, Reward ID: ${rewardId}`);

    // Validate the extracted IDs with Italian messages
    if (!userId || !rewardId) {
      throw new HttpsError("invalid-argument", "Questo QR code non è valido");
    }

    if (!rewardId.startsWith('reward_')) {
      throw new HttpsError("invalid-argument", "Questo QR code non è valido");
    }

    // Check if reward QR exists and is valid
    const rewardQRRef = db.doc(`rewardQRs/${rewardId}`);
    const rewardQRSnap = await rewardQRRef.get();

    // Enhanced validation with specific Italian messages
    if (!rewardQRSnap.exists) {
      throw new HttpsError("not-found", "Questo QR code non è valido");
    }

    const rewardQRData = rewardQRSnap.data();

    // Validate QR code with specific Italian messages
    if (rewardQRData.used) {
      throw new HttpsError("failed-precondition", "Questo QR code è già stato utilizzato");
    }

    if (rewardQRData.expiresAt.toDate() < new Date()) {
      throw new HttpsError("failed-precondition", "Questo QR code è scaduto");
    }

    if (rewardQRData.userId !== userId) {
      throw new HttpsError("permission-denied", "Questo QR code non è valido");
    }

    // Get user and stamps data
    const [userSnap, stampsSnap, redeemerSnap] = await Promise.all([
      db.doc(`users/${userId}`).get(),
      db.doc(`stamps/${userId}`).get(),
      db.doc(`users/${request.auth.uid}`).get()
    ]);

    if (!userSnap.exists) {
      throw new HttpsError("not-found", "User not found");
    }

    if (!stampsSnap.exists) {
      throw new HttpsError("not-found", "User stamps data not found");
    }

    const userData = userSnap.data();
    const stampsData = stampsSnap.data();
    const redeemerData = redeemerSnap.exists ? redeemerSnap.data() : null;

    if (stampsData.availableRewards <= 0) {
      throw new HttpsError("failed-precondition", "No rewards available to redeem");
    }

    console.log(`🔄 Processing redemption for user ${userData.firstName} ${userData.lastName}`);

    // Use transaction to ensure atomicity
    const result = await db.runTransaction(async (transaction) => {
      const rewardEntry = {
        redeemedAt: new Date().toISOString(),
        redemptionMethod: 'qr',
        redeemedBy: request.auth.uid,
        redeemedByName: redeemerData ? `${redeemerData.firstName || ''} ${redeemerData.lastName || ''}`.trim() : 'Unknown Staff'
      };

      // Mark reward QR as used
      transaction.update(rewardQRRef, {
        used: true,
        usedAt: admin.firestore.FieldValue.serverTimestamp(),
        redeemedBy: request.auth.uid
      });

      // Update user's stamps data with reward history
      const updateData = {
        availableRewards: stampsData.availableRewards - 1,
        rewardsEarned: (stampsData.rewardsEarned || 0) + 1,
        lastRewardClaimed: new Date().toISOString(),
        rewardHistory: admin.firestore.FieldValue.arrayUnion(rewardEntry)
      };

      // If user has exactly 9 stamps, reset the grid
      if (stampsData.stamps && stampsData.stamps.length === 9) {
        updateData.stamps = [];
        console.log(`🔄 Resetting stamp grid (had 9 stamps)`);
      }

      transaction.update(db.doc(`stamps/${userId}`), updateData);

      return {
        success: true,
        message: "🎁 Premio riscattato con successo!",
        customerName: `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || 'Unknown',
        customerEmail: userData.email || 'No email',
        remainingRewards: updateData.availableRewards,
        stampsReset: stampsData.stamps && stampsData.stamps.length === 9
      };
    });

    console.log(`✅ Reward QR redeemed successfully for user ${userId}`);

    return result;

  } catch (error) {
    console.error("💥 Error redeeming reward QR:", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "Failed to redeem reward QR", { detail: error.message });
  }
});

// 🎁 UPDATED FUNCTION: Claim and Reset Reward (manual claiming with history tracking)
exports.claimAndResetReward = onCall({
  region: "europe-west2"
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be logged in");
  }

  const userId = request.auth.uid;

  try {
    console.log(`🎁 Processing manual reward claim for user: ${userId}`);

    const [stampsSnap, userSnap] = await Promise.all([
      db.doc(`stamps/${userId}`).get(),
      db.doc(`users/${userId}`).get()
    ]);

    if (!stampsSnap.exists) {
      throw new HttpsError("not-found", "User stamps data not found");
    }

    const stampsData = stampsSnap.data();
    const userData = userSnap.exists ? userSnap.data() : null;
    const availableRewards = stampsData.availableRewards || 0;

    if (availableRewards <= 0) {
      throw new HttpsError("failed-precondition", "No rewards available to claim");
    }

    // Create reward history entry
    const rewardEntry = {
      redeemedAt: new Date().toISOString(),
      redemptionMethod: 'manual',
      redeemedBy: userId,
      redeemedByName: userData ? `${userData.firstName || ''} ${userData.lastName || ''}`.trim() : 'Self Service'
    };

    // Update the user's stamp data
    const updateData = {
      availableRewards: availableRewards - 1,
      rewardsEarned: (stampsData.rewardsEarned || 0) + 1,
      lastRewardClaimed: new Date().toISOString(),
      rewardHistory: admin.firestore.FieldValue.arrayUnion(rewardEntry)
    };

    // If user has exactly 9 stamps, reset the grid
    if (stampsData.stamps && stampsData.stamps.length === 9) {
      updateData.stamps = [];
    }

    await db.doc(`stamps/${userId}`).update(updateData);

    console.log(`✅ Manual reward claimed successfully for user ${userId}`);

    return {
      success: true,
      message: "Reward claimed successfully!",
      remainingRewards: availableRewards - 1
    };

  } catch (error) {
    console.error("💥 Error claiming reward:", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "Error claiming reward", { detail: error.message });
  }
});

// functions/index.js

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

// Initialize Firebase Admin
admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

// 🎁 NEW FUNCTION: Claim and Reset Reward
exports.claimAndResetReward = onCall({
  region: "europe-west2"
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be logged in");
  }

  const userId = request.auth.uid;

  try {
    console.log(`🎁 Processing reward claim for user: ${userId}`);

    const stampsRef = db.doc(`stamps/${userId}`);
    const stampsSnap = await stampsRef.get();

    if (!stampsSnap.exists) {
      throw new HttpsError("not-found", "User stamps data not found");
    }

    const stampsData = stampsSnap.data();
    const availableRewards = stampsData.availableRewards || 0;

    if (availableRewards <= 0) {
      throw new HttpsError("failed-precondition", "No rewards available to claim");
    }

    // Update the user's stamp data
    const updateData = {
      availableRewards: availableRewards - 1,
      rewardsEarned: stampsData.rewardsEarned || 0, // Keep track of total rewards earned
      lastRewardClaimed: new Date().toISOString()
    };

    await stampsRef.update(updateData);

    console.log(`✅ Reward claimed successfully for user ${userId}`);

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

// 🔔 MAIN FUNCTION: Send notifications when a notification document is created
exports.sendNotification = onDocumentCreated({
  document: "notifications/{notificationId}",
  region: "europe-west2"
}, async (event) => {
  try {
    const notification = event.data.data();
    const notificationId = event.params.notificationId;
    console.log("📱 Processing notification:", notificationId, notification);

    let targetUsers = [];
    const usersSnapshot = await db.collection("users").get();
    const allUsers = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    switch (notification.target) {
      case "all":
        targetUsers = allUsers.filter(u => u.role !== "superuser" && u.fcmTokens?.length > 0);
        break;
      case "customers":
        targetUsers = allUsers.filter(u => u.role === "customer" && u.fcmTokens?.length > 0);
        break;
      case "birthday_today": {
        const today = new Date();
        const todayStr = `${String(today.getDate()).padStart(2, "0")}/${String(today.getMonth() + 1).padStart(2, "0")}`;
        targetUsers = allUsers.filter(u => u.role !== "superuser" && u.fcmTokens?.length > 0 && u.dob === todayStr);
        break;
      }
      case "specific_user":
        if (notification.targetUserId) {
          const targetUser = allUsers.find(u => u.id === notification.targetUserId && u.fcmTokens?.length > 0);
          if (targetUser) targetUsers = [targetUser];
        }
        break;
    }

    if (targetUsers.length === 0) {
      console.log("❌ No target users found for criteria:", notification.target);
      return event.data.ref.update({ status: "completed", successCount: 0, failureCount: 0, processedAt: admin.firestore.FieldValue.serverTimestamp() });
    }

    const tokens = targetUsers.flatMap(user => user.fcmTokens || []);
    console.log(`🎯 Sending to ${tokens.length} tokens for ${targetUsers.length} users`);

    if (tokens.length === 0) {
      console.log("❌ No valid FCM tokens found");
      return event.data.ref.update({ status: "completed", successCount: 0, failureCount: 0, processedAt: admin.firestore.FieldValue.serverTimestamp() });
    }

    let successCount = 0;
    let failureCount = 0;
    const failedTokens = [];
    const sendPromises = tokens.map(async (token) => {
      try {
        await messaging.send({
          notification: { title: notification.title, body: notification.body },
          data: { click_action: notification.clickAction || "/profile", type: notification.type || "general", notificationId },
          token,
        });
        successCount++;
      } catch (error) {
        failureCount++;
        failedTokens.push(token);
        if (error.code === 'messaging/registration-token-not-registered') {
          console.log(`🧹 Found invalid token: ${token.substring(0, 20)}...`);
        } else {
          console.log(`❌ Failed to send to token ${token.substring(0, 20)}...:`, error.code || error.message);
        }
      }
    });

    await Promise.all(sendPromises);
    if (failedTokens.length > 0) await removeInvalidTokens(failedTokens, targetUsers);

    await event.data.ref.update({
      status: successCount > 0 ? "delivered" : "failed",
      successCount,
      failureCount,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      actualTargetCount: tokens.length,
    });
    console.log(`📊 Final results: ${successCount} delivered, ${failureCount} failed`);
  } catch (error) {
    console.error("💥 Error sending notification:", error);
    if (event.data) await event.data.ref.update({ status: "failed", error: error.message, processedAt: admin.firestore.FieldValue.serverTimestamp() });
  }
});

// 🎯 REFINED: Process QR Code Scans with Strict Birthday Logic
exports.processStampScan = onCall({
  region: "europe-west2"
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "User must be logged in");
  const { scannedUserId } = request.data;
  if (!scannedUserId) throw new HttpsError("invalid-argument", "Missing scannedUserId");

  try {
    console.log(`🔍 Processing stamp scan for user: ${scannedUserId}`);
    const userRef = db.doc(`users/${scannedUserId}`);
    const stampsRef = db.doc(`stamps/${scannedUserId}`);

    const [userSnap, stampsSnap] = await Promise.all([userRef.get(), stampsRef.get()]);
    if (!userSnap.exists) throw new HttpsError("not-found", "User not found");

    const userData = userSnap.data();
    let stampsData = stampsSnap.exists ? stampsSnap.data() : {};

    const cleanStampsData = {
      stamps: stampsData.stamps || [],
      lifetimeStamps: stampsData.lifetimeStamps || 0,
      rewardsEarned: stampsData.rewardsEarned || 0,
      availableRewards: stampsData.availableRewards || 0,
      receivedFreeStamps: stampsData.receivedFreeStamps || false,
      birthdayBonusGiven: stampsData.birthdayBonusGiven || null,
    };

    if (stampsData.pendingStamps?.length) {
      console.log(`🔧 Migrating ${stampsData.pendingStamps.length} pending stamps.`);
      cleanStampsData.stamps.push(...stampsData.pendingStamps);
    }
    stampsData = cleanStampsData;

    const today = new Date().toISOString().split("T")[0];
    let stampsToAdd = 1;
    let isBirthdayBonus = false;
    let message = "Timbro aggiunto con successo!";

    if (userData.dob) {
      const [day, month] = userData.dob.split("/");
      const todayDate = new Date();
      const todayDay = String(todayDate.getDate()).padStart(2, "0");
      const todayMonth = String(todayDate.getMonth() + 1).padStart(2, "0");
      const isBirthdayToday = (day === todayDay && month === todayMonth);

      if (isBirthdayToday && stampsData.birthdayBonusGiven !== today) {
        stampsToAdd = 2;
        isBirthdayBonus = true;
        message = "🎉 Buon compleanno! Hai ricevuto un timbro extra!";
        console.log(`🎁 Birthday bonus ACTIVATED for user ${scannedUserId}`);
      } else if (isBirthdayToday) {
        console.log(`🎂 Birthday bonus already given today for user ${scannedUserId}. Awarding standard 1 stamp.`);
      }
    }

    const currentStampCount = stampsData.stamps.length;
    const totalAfterScan = currentStampCount + stampsToAdd;
    console.log(`📊 Current stamps: ${currentStampCount}, Adding: ${stampsToAdd}, Total will be: ${totalAfterScan}`);

    let updateData;
    let response;

    if (totalAfterScan >= 9) {
      const overflowStamps = totalAfterScan - 9;
      const overflowStampsArray = Array.from({ length: overflowStamps }, (_, i) => ({ date: new Date(Date.now() + i).toISOString() }));
      console.log(`🎁 Collection complete! Overflow stamps: ${overflowStamps}`);

      updateData = {
        stamps: overflowStampsArray,
        lifetimeStamps: stampsData.lifetimeStamps + stampsToAdd,
        rewardsEarned: stampsData.rewardsEarned + 1,
        availableRewards: stampsData.availableRewards + 1,
        receivedFreeStamps: stampsData.receivedFreeStamps,
        lastStampDate: new Date().toISOString(),
      };

      const successMessage = overflowStamps > 0
        ? `🎁 Congratulazioni! Raccolta completata! Nuovo giro con ${overflowStamps} timbr${overflowStamps > 1 ? "i" : "o"}.`
        : "🎁 Congratulazioni! Raccolta completata! Griglia resettata.";

      response = { success: true, message: successMessage, rewardEarned: true, birthdayBonus: isBirthdayBonus, currentStamps: overflowStampsArray.length };

    } else {
      const newStampsArray = [...stampsData.stamps];
      for (let i = 0; i < stampsToAdd; i++) newStampsArray.push({ date: new Date(Date.now() + i).toISOString() });
      console.log(`📝 Adding ${stampsToAdd} stamps normally. New total: ${newStampsArray.length}`);

      updateData = {
        stamps: newStampsArray,
        lifetimeStamps: stampsData.lifetimeStamps + stampsToAdd,
        rewardsEarned: stampsData.rewardsEarned,
        availableRewards: stampsData.availableRewards,
        receivedFreeStamps: stampsData.receivedFreeStamps,
        lastStampDate: new Date().toISOString(),
      };

      response = { success: true, stampsAdded: stampsToAdd, message, currentStamps: newStampsArray.length, rewardEarned: false, birthdayBonus: isBirthdayBonus };
    }

    if (isBirthdayBonus) {
      updateData.birthdayBonusGiven = today;
    } else {
      updateData.birthdayBonusGiven = stampsData.birthdayBonusGiven;
    }

    await stampsRef.set(updateData, { merge: false });
    console.log(`✅ Write operation successful for user ${scannedUserId}`);
    return response;

  } catch (error) {
    console.error("💥 Stamp scan processing error:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Errore durante la scansione del QR code", { detail: error.message });
  }
});

// 🧹 Helper function to remove invalid FCM tokens
async function removeInvalidTokens(invalidTokens, users) {
  const batch = db.batch();
  users.forEach(user => {
    if (user.fcmTokens?.length) {
      const validTokens = user.fcmTokens.filter(token => !invalidTokens.includes(token));
      if (validTokens.length < user.fcmTokens.length) {
        batch.update(db.collection("users").doc(user.id), { fcmTokens: validTokens });
        console.log(`🧹 Removing invalid tokens for user ${user.id}`);
      }
    }
  });
  try {
    await batch.commit();
    console.log("✅ Invalid tokens removed successfully.");
  } catch (error) {
    console.error("Batch commit for token removal failed:", error.message);
  }
}

// 📅 AUTOMATED NOTIFICATIONS: Scheduled function
exports.sendAutomatedNotifications = onSchedule({
  schedule: "0 9 * * *",
  timeZone: "Europe/Rome",
  region: "europe-west2"
}, async () => {
  try {
    console.log("🤖 Running automated notifications check...");
    const rulesSnapshot = await db.collection("automatedNotifications").where("enabled", "==", true).get();
    if (rulesSnapshot.empty) {
      console.log("📭 No enabled automated rules found.");
      return;
    }
    console.log(`🔍 Found ${rulesSnapshot.size} enabled rules.`);
    for (const ruleDoc of rulesSnapshot.docs) {
      const rule = ruleDoc.data();
      console.log(`🎯 Processing rule: ${rule.type}`);
      try {
        switch (rule.type) {
          case "birthday":
            await processBirthdayNotifications(rule, ruleDoc.id);
            break;
          case "stamp_milestone":
            await processStampMilestoneNotifications(rule, ruleDoc.id);
            break;
          default:
            console.warn(`🤷‍♀️ Unknown rule type: ${rule.type}`);
        }
      } catch (error) {
        console.error(`💥 Error processing rule ${ruleDoc.id} (${rule.type}):`, error);
      }
    }
  } catch (error) {
    console.error("💥 Top-level error in sendAutomatedNotifications:", error);
  }
});

// Helper for birthday notifications
async function processBirthdayNotifications(rule, ruleId) {
  console.log(`🎂 [${ruleId}] Creating birthday notification job.`);
  await db.collection("notifications").add({
    title: rule.title || "Buon Compleanno!",
    body: rule.body || "Vieni a festeggiare con noi, ti aspetta una sorpresa!",
    target: "birthday_today",
    type: "birthday",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    status: "pending",
    ruleId: ruleId,
  });
  console.log(`✅ [${ruleId}] Birthday notification created.`);
}

// Placeholder for stamp milestone notifications
async function processStampMilestoneNotifications(rule, ruleId) {
  console.log(`🏆 [${ruleId}] Processing stamp milestone notifications.`);
  console.log(`[${ruleId}] Stamp milestone logic is a placeholder and needs implementation.`);
}

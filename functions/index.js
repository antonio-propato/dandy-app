// functions/index.js - Updated birthday logic sections

// 🎯 IMPROVED: Process QR Code Scans with Enhanced Birthday Logic
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
      birthdayBonusYear: stampsData.birthdayBonusYear || null, // NEW: Track by year instead of full date
      rewardHistory: stampsData.rewardHistory || []
    };

    if (stampsData.pendingStamps?.length) {
      console.log(`🔧 Migrating ${stampsData.pendingStamps.length} pending stamps.`);
      cleanStampsData.stamps.push(...stampsData.pendingStamps);
    }
    stampsData = cleanStampsData;

    const currentYear = new Date().getFullYear();
    let stampsToAdd = 1;
    let isBirthdayBonus = false;
    let message = "Timbro aggiunto con successo!";

    // IMPROVED: Birthday bonus logic - once per year, not per day
    if (userData.dob) {
      const [day, month] = userData.dob.split("/");
      const todayDate = new Date();
      const todayDay = String(todayDate.getDate()).padStart(2, "0");
      const todayMonth = String(todayDate.getMonth() + 1).padStart(2, "0");
      const isBirthdayToday = (day === todayDay && month === todayMonth);

      // Check if birthday bonus was already given this year
      const birthdayBonusAlreadyGivenThisYear = stampsData.birthdayBonusYear === currentYear;

      if (isBirthdayToday && !birthdayBonusAlreadyGivenThisYear) {
        stampsToAdd = 2; // 1 normal + 1 birthday bonus
        isBirthdayBonus = true;
        message = "🎉 Buon compleanno! Hai ricevuto un timbro extra!";
        console.log(`🎁 Birthday bonus ACTIVATED for user ${scannedUserId} (year ${currentYear})`);
      } else if (isBirthdayToday && birthdayBonusAlreadyGivenThisYear) {
        console.log(`🎂 Birthday bonus already given this year (${currentYear}) for user ${scannedUserId}. Awarding standard 1 stamp.`);
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
        rewardHistory: stampsData.rewardHistory,
        birthdayBonusYear: isBirthdayBonus ? currentYear : stampsData.birthdayBonusYear // NEW: Set year when birthday bonus given
      };

      const successMessage = overflowStamps > 0
        ? `🎁 Congratulazioni! Raccolta completata! Nuovo giro con ${overflowStamps} timbr${overflowStamps > 1 ? "i" : "o"}.`
        : "🎁 Congratulazioni! Raccolta completata! Griglia resettata.";

      response = {
        success: true,
        message: successMessage,
        rewardEarned: true,
        birthdayBonus: isBirthdayBonus,
        currentStamps: overflowStampsArray.length,
        stampsAdded: stampsToAdd
      };

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
        rewardHistory: stampsData.rewardHistory,
        birthdayBonusYear: isBirthdayBonus ? currentYear : stampsData.birthdayBonusYear // NEW: Set year when birthday bonus given
      };

      response = {
        success: true,
        stampsAdded: stampsToAdd,
        message,
        currentStamps: newStampsArray.length,
        rewardEarned: false,
        birthdayBonus: isBirthdayBonus
      };
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

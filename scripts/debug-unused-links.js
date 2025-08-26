#!/usr/bin/env node

/**
 * 3日間未読リンク通知のデバッグスクリプト
 * 実際のFirestoreデータを確認して、なぜ通知が送信されなかったかを調査
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Firebase Admin SDK 初期化
try {
  initializeApp({
    projectId: 'linkranger-b096e'
  });
  console.log('✅ Firebase Admin SDK 初期化完了');
} catch (error) {
  console.error('❌ Firebase初期化エラー:', error.message);
  process.exit(1);
}

const db = getFirestore();

/**
 * ユーザーデータの詳細を表示
 */
async function debugUserData() {
  console.log('\n🔍 ユーザーデータ確認');
  console.log('==================');
  
  try {
    const usersSnapshot = await db.collection('users')
      .where('fcmToken', '!=', null)
      .get();
    
    console.log(`📊 FCMトークンを持つユーザー数: ${usersSnapshot.size}`);
    
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      console.log(`\n👤 ユーザー: ${userDoc.id}`);
      console.log(`   FCMトークン: ${userData.fcmToken ? 'あり' : 'なし'}`);
      console.log(`   作成日: ${userData.createdAt?.toDate?.() || '不明'}`);
    }
  } catch (error) {
    console.error('❌ ユーザーデータ取得エラー:', error);
  }
}

/**
 * リンクデータの詳細を表示
 */
async function debugLinksData() {
  console.log('\n🔗 リンクデータ確認');
  console.log('==================');
  
  try {
    const usersSnapshot = await db.collection('users')
      .where('fcmToken', '!=', null)
      .get();
    
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      console.log(`\n👤 ユーザー: ${userId}`);
      
      // 全リンク
      const allLinksSnapshot = await db.collection('links')
        .where('userId', '==', userId)
        .get();
      
      console.log(`   📚 総リンク数: ${allLinksSnapshot.size}`);
      
      if (allLinksSnapshot.size === 0) {
        console.log('   ⚠️  リンクが存在しません');
        continue;
      }
      
      // 未読リンク
      const unreadLinksSnapshot = await db.collection('links')
        .where('userId', '==', userId)
        .where('isRead', '==', false)
        .get();
      
      console.log(`   📖 未読リンク数: ${unreadLinksSnapshot.size}`);
      
      // 未アーカイブリンク
      const unarchivedLinksSnapshot = await db.collection('links')
        .where('userId', '==', userId)
        .where('isArchived', '==', false)
        .get();
      
      console.log(`   📦 未アーカイブリンク数: ${unarchivedLinksSnapshot.size}`);
      
      // 3日間条件のチェック
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      
      const threeDayOldLinksSnapshot = await db.collection('links')
        .where('userId', '==', userId)
        .where('createdAt', '<=', threeDaysAgo)
        .get();
      
      console.log(`   ⏰ 3日前以前に作成されたリンク数: ${threeDayOldLinksSnapshot.size}`);
      
      // 3日間未読リンクの詳細確認
      const candidateLinksSnapshot = await db.collection('links')
        .where('userId', '==', userId)
        .where('isRead', '==', false)
        .where('isArchived', '==', false)
        .where('createdAt', '<=', threeDaysAgo)
        .get();
      
      console.log(`   🎯 3日間未読候補リンク数: ${candidateLinksSnapshot.size}`);
      
      // 各候補リンクの詳細確認
      for (const linkDoc of candidateLinksSnapshot.docs) {
        const linkData = linkDoc.data();
        const createdAt = linkData.createdAt?.toDate();
        const lastAccessedAt = linkData.lastAccessedAt?.toDate();
        
        console.log(`\n   📋 リンク詳細: ${linkDoc.id}`);
        console.log(`      タイトル: ${linkData.title || '無題'}`);
        console.log(`      作成日: ${createdAt ? createdAt.toISOString() : '不明'}`);
        console.log(`      最終アクセス: ${lastAccessedAt ? lastAccessedAt.toISOString() : '未アクセス'}`);
        console.log(`      isRead: ${linkData.isRead}`);
        console.log(`      isArchived: ${linkData.isArchived}`);
        
        // 通知フラグの確認
        const notificationsSent = linkData.notificationsSent || {};
        console.log(`      通知フラグ:`);
        console.log(`        unused3Days: ${notificationsSent.unused3Days || false}`);
        console.log(`        fcm3Days: ${notificationsSent.fcm3Days || false}`);
        console.log(`        threeDays: ${notificationsSent.threeDays || false}`);
        
        // 3日間経過判定
        const lastAccessTime = lastAccessedAt || createdAt;
        const isOlderThan3Days = lastAccessTime && lastAccessTime <= threeDaysAgo;
        const alreadyNotified = notificationsSent.unused3Days || notificationsSent.fcm3Days;
        
        console.log(`      判定結果:`);
        console.log(`        3日間経過: ${isOlderThan3Days ? 'はい' : 'いいえ'}`);
        console.log(`        通知済み: ${alreadyNotified ? 'はい' : 'いいえ'}`);
        console.log(`        通知対象: ${isOlderThan3Days && !alreadyNotified ? 'はい' : 'いいえ'}`);
        
        if (createdAt) {
          const ageInHours = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
          const ageInDays = ageInHours / 24;
          console.log(`        経過時間: ${ageInDays.toFixed(2)}日 (${ageInHours.toFixed(1)}時間)`);
        }
      }
    }
  } catch (error) {
    console.error('❌ リンクデータ取得エラー:', error);
  }
}

/**
 * 3日間条件の詳細分析
 */
async function analyzeThreeDayCondition() {
  console.log('\n📅 3日間条件の詳細分析');
  console.log('========================');
  
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  
  console.log(`現在時刻: ${now.toISOString()}`);
  console.log(`3日前時刻: ${threeDaysAgo.toISOString()}`);
  console.log(`判定基準: createdAt <= ${threeDaysAgo.toISOString()}`);
}

/**
 * メイン実行関数
 */
async function main() {
  console.log('🔍 3日間未読リンク通知デバッグ開始');
  console.log('====================================');
  
  await analyzeThreeDayCondition();
  await debugUserData();
  await debugLinksData();
  
  console.log('\n✅ デバッグ完了');
  console.log('\n💡 通知が送信されない原因:');
  console.log('1. リンクが3日経過していない');
  console.log('2. リンクが既に読まれている (isRead: true)');
  console.log('3. リンクがアーカイブされている (isArchived: true)');
  console.log('4. 既に通知が送信済み (notificationsSent.unused3Days: true)');
  console.log('5. FCMトークンが登録されていない');
  
  process.exit(0);
}

// 未処理の例外をキャッチ
process.on('unhandledRejection', (error) => {
  console.error('❌ 未処理の例外:', error);
  process.exit(1);
});

// メイン実行
main().catch((error) => {
  console.error('❌ メイン実行エラー:', error);
  process.exit(1);
});
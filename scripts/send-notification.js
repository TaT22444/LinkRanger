#!/usr/bin/env node

/**
 * プッシュ通知送信スクリプト
 * 使用方法:
 *   node scripts/send-notification.js [お知らせID]
 * 
 * 例:
 *   node scripts/send-notification.js "abc123def456"
 */

const { initializeApp, cert, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const path = require('path');
const fs = require('fs');

// Firebase Admin初期化（環境に応じて認証方法を選択）
let app;
try {
  // まず環境変数でサービスアカウントキーを確認
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  
  if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
    console.log('🔐 サービスアカウントキーを使用してログイン');
    const serviceAccount = require(serviceAccountPath);
    app = initializeApp({
      credential: cert(serviceAccount),
      projectId: 'linkranger-b096e'
    });
  } else {
    // Firebase CLIの認証を使用
    console.log('🔐 Firebase CLI認証を使用してログイン');
    
    // プロジェクトIDを明示的に設定
    process.env.GOOGLE_CLOUD_PROJECT = 'linkranger-b096e';
    process.env.GCLOUD_PROJECT = 'linkranger-b096e';
    
    app = initializeApp({
      credential: applicationDefault(),
      projectId: 'linkranger-b096e'
    });
  }
  
  console.log('✅ Firebase Admin SDK初期化完了');
} catch (error) {
  console.error('❌ Firebase初期化エラー:', error.message);
  console.error('');
  console.error('🔧 解決方法:');
  console.error('  方法1: Firebase CLIでログイン');
  console.error('     firebase login');
  console.error('     firebase use linkranger-b096e');
  console.error('');
  console.error('  方法2: サービスアカウントキーを使用');
  console.error('     1. Firebase Consoleからサービスアカウントキーをダウンロード');
  console.error('     2. 環境変数を設定: export GOOGLE_APPLICATION_CREDENTIALS="path/to/key.json"');
  console.error('');
  process.exit(1);
}

const db = getFirestore();
const messaging = getMessaging();

// コマンドライン引数を取得
const args = process.argv.slice(2);
const announcementId = args[0];

if (!announcementId) {
  console.error('❌ 使用方法: node send-notification.js "お知らせID"');
  console.error('');
  console.error('例:');
  console.error('  node scripts/send-notification.js "abc123def456"');
  process.exit(1);
}

async function sendNotification() {
  try {
    console.log('📱 プッシュ通知送信中...');
    
    // お知らせ情報を取得
    const announcementDoc = await db.collection('announcements').doc(announcementId).get();
    
    if (!announcementDoc.exists) {
      console.error('❌ 指定されたお知らせが見つかりません:', announcementId);
      process.exit(1);
    }
    
    const announcementData = announcementDoc.data();
    console.log('📢 お知らせ情報:');
    console.log('  タイトル:', announcementData.title);
    console.log('  内容:', announcementData.content.substring(0, 50) + '...');
    console.log('  優先度:', announcementData.priority);
    
    // 対象ユーザーを取得
    let usersQuery = db.collection('users').where('fcmToken', '!=', null);
    
    // プラン指定がある場合はフィルタリング
    if (announcementData.targetUserPlans && announcementData.targetUserPlans.length > 0) {
      usersQuery = usersQuery.where('subscription.plan', 'in', announcementData.targetUserPlans);
      console.log('  対象プラン:', announcementData.targetUserPlans.join(', '));
    } else {
      console.log('  対象プラン: 全ユーザー');
    }
    
    const usersSnapshot = await usersQuery.get();
    console.log('📊 対象ユーザー数:', usersSnapshot.docs.length);
    
    let successCount = 0;
    let failureCount = 0;
    
    // バッチで通知送信
    const promises = usersSnapshot.docs.map(async (userDoc) => {
      const userData = userDoc.data();
      const fcmToken = userData.fcmToken;
      
      if (!fcmToken) return;
      
      try {
        const message = {
          token: fcmToken,
          notification: {
            title: `📢 ${announcementData.title}`,
            body: announcementData.content.length > 100 
              ? announcementData.content.substring(0, 100) + '...' 
              : announcementData.content,
          },
          data: {
            type: 'announcement',
            announcementId: announcementId,
            userId: userDoc.id,
            timestamp: new Date().toISOString(),
          },
          apns: {
            payload: {
              aps: {
                sound: 'default',
              },
            },
          },
          android: {
            priority: 'high',
            notification: {
              sound: 'default',
              channelId: 'announcements',
            },
          },
        };
        
        await messaging.send(message);
        successCount++;
      } catch (error) {
        console.warn('⚠️ 個別通知送信失敗:', { userId: userDoc.id, error: error.message });
        failureCount++;
      }
    });
    
    await Promise.all(promises);
    
    console.log('✅ プッシュ通知送信完了!');
    console.log('  成功:', successCount + '件');
    console.log('  失敗:', failureCount + '件');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ プッシュ通知送信エラー:', error);
    process.exit(1);
  }
}

// 実行
sendNotification();
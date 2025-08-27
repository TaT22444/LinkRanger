#!/usr/bin/env node

/**
 * お知らせ作成スクリプト
 * 使用方法:
 *   node scripts/create-announcement.js "タイトル" "内容" [優先度] [対象プラン]
 * 
 * 例:
 *   node scripts/create-announcement.js "新機能のお知らせ" "新しいタグ機能を追加しました！" "medium" "all"
 *   node scripts/create-announcement.js "メンテナンスのお知らせ" "システムメンテナンスを実施します" "high" "plus"
 */

const { initializeApp, cert, applicationDefault } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
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

// コマンドライン引数を取得
const args = process.argv.slice(2);
const title = args[0];
const content = args[1];
const priority = args[2] || 'medium'; // low, medium, high
const targetPlans = args[3] || 'all'; // all, free, plus, または "free,plus"

if (!title || !content) {
  console.error('❌ 使用方法: node create-announcement.js "タイトル" "内容" [優先度] [対象プラン]');
  console.error('');
  console.error('例:');
  console.error('  node scripts/create-announcement.js "新機能のお知らせ" "新しいタグ機能を追加しました！"');
  console.error('  node scripts/create-announcement.js "メンテナンス" "システムメンテナンス実施" "high" "plus"');
  process.exit(1);
}

// 対象プランの処理
let targetUserPlans = [];
if (targetPlans !== 'all') {
  targetUserPlans = targetPlans.split(',').map(plan => plan.trim());
}

// お知らせタイプの判定
const getAnnouncementType = (title, content) => {
  const lowerTitle = title.toLowerCase();
  const lowerContent = content.toLowerCase();
  
  if (lowerTitle.includes('メンテナンス') || lowerContent.includes('メンテナンス')) {
    return 'maintenance';
  }
  if (lowerTitle.includes('新機能') || lowerTitle.includes('アップデート')) {
    return 'update';
  }
  if (lowerTitle.includes('警告') || lowerTitle.includes('注意')) {
    return 'warning';
  }
  return 'info';
};

async function createAnnouncement() {
  try {
    console.log('📢 お知らせ作成中...');
    
    const announcementData = {
      title: title,
      content: content,
      type: getAnnouncementType(title, content),
      priority: priority,
      isActive: true,
      targetUserPlans: targetUserPlans,
      publishedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      actionText: null,
      actionUrl: null,
      expiresAt: null,
    };
    
    console.log('📝 作成するお知らせ:');
    console.log('  タイトル:', title);
    console.log('  内容:', content);
    console.log('  優先度:', priority);
    console.log('  対象プラン:', targetPlans === 'all' ? '全ユーザー' : targetUserPlans.join(', '));
    console.log('  タイプ:', announcementData.type);
    
    // Firestoreに保存
    const docRef = await db.collection('announcements').add(announcementData);
    
    console.log('✅ お知らせ作成完了!');
    console.log('  ドキュメントID:', docRef.id);
    console.log('');
    console.log('📱 プッシュ通知を送信する場合は:');
    console.log(`  node scripts/send-notification.js "${docRef.id}"`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ お知らせ作成エラー:', error);
    process.exit(1);
  }
}

// 実行
createAnnouncement();
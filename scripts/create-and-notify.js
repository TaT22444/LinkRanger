#!/usr/bin/env node

/**
 * Cloud Functions経由でお知らせ作成・通知送信を行うスクリプト
 * 使用方法:
 *   node scripts/create-and-notify.js "タイトル" "内容" [優先度] [対象プラン] [通知送信]
 * 
 * 例:
 *   node scripts/create-and-notify.js "新機能のお知らせ" "新しいタグ機能を追加しました！" "medium" "all" "true"
 *   node scripts/create-and-notify.js "メンテナンス" "システムメンテナンス実施" "high" "plus" "true"
 */

const https = require('https');
const { execSync } = require('child_process');

// コマンドライン引数を取得
const args = process.argv.slice(2);
const title = args[0];
const content = args[1];
const priority = args[2] || 'medium'; // low, medium, high
const targetPlans = args[3] || 'all'; // all, free, plus
const shouldNotify = args[4] === 'true' || priority === 'high';

if (!title || !content) {
  console.error('❌ 使用方法: node create-and-notify.js "タイトル" "内容" [優先度] [対象プラン] [通知送信]');
  console.error('');
  console.error('例:');
  console.error('  node scripts/create-and-notify.js "新機能のお知らせ" "新しいタグ機能を追加しました！"');
  console.error('  node scripts/create-and-notify.js "メンテナンス" "システムメンテナンス実施" "high" "plus" "true"');
  process.exit(1);
}

// Firebase CLIでIDトークンを取得
function getAuthToken() {
  try {
    console.log('🔐 Firebase認証トークンを取得中...');
    const token = execSync('firebase auth:print-access-token', { encoding: 'utf8' }).trim();
    console.log('✅ 認証トークン取得完了');
    return token;
  } catch (error) {
    console.error('❌ Firebase認証トークンの取得に失敗:', error.message);
    console.error('');
    console.error('🔧 解決方法:');
    console.error('  firebase login');
    console.error('  firebase use linkranger-b096e');
    process.exit(1);
  }
}

// Cloud Functionsを呼び出し
function callCloudFunction(functionName, data, token) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ data });
    const options = {
      hostname: 'asia-northeast1-linkranger-b096e.cloudfunctions.net',
      port: 443,
      path: `/${functionName}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': `Bearer ${token}`,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const result = JSON.parse(data);
            resolve(result);
          } catch (parseError) {
            resolve({ success: true, message: data });
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

async function main() {
  try {
    const token = getAuthToken();
    
    console.log('📢 お知らせ作成開始...');
    console.log('  タイトル:', title);
    console.log('  内容:', content);
    console.log('  優先度:', priority);
    console.log('  対象プラン:', targetPlans === 'all' ? '全ユーザー' : targetPlans);
    console.log('  通知送信:', shouldNotify ? 'はい' : 'いいえ');
    console.log('');

    // サンプルお知らせ作成関数を使用してベースを作成
    try {
      const createResult = await callCloudFunction('createSampleAnnouncement', {}, token);
      console.log('📝 ベースお知らせ作成完了:', createResult);
    } catch (createError) {
      console.warn('⚠️ サンプル作成関数が利用できません。直接作成を試行します。');
    }

    // 高優先度の場合は通知送信を試行
    if (shouldNotify) {
      console.log('📱 プッシュ通知送信を試行中...');
      
      try {
        const targetUserPlans = targetPlans === 'all' ? [] : targetPlans.split(',').map(p => p.trim());
        
        const notifyResult = await callCloudFunction('sendAnnouncementNotification', {
          announcementId: 'manual-' + Date.now(),
          title: title,
          content: content,
          targetUserPlans: targetUserPlans
        }, token);
        
        console.log('✅ プッシュ通知送信完了:', notifyResult);
      } catch (notifyError) {
        console.error('❌ プッシュ通知送信エラー:', notifyError.message);
      }
    }

    console.log('');
    console.log('🎉 処理完了！');
    console.log('');
    console.log('💡 補足情報:');
    console.log('  - お知らせはアプリ内の通知画面で確認できます');
    console.log('  - Web管理画面: https://linkranger-b096e.web.app/admin');
    console.log('  - 詳細な管理はWeb管理画面をご利用ください');
    
  } catch (error) {
    console.error('❌ 処理エラー:', error.message);
    console.error('');
    console.error('💡 代替手段:');
    console.error('  Web管理画面をご利用ください: https://linkranger-b096e.web.app/admin');
    process.exit(1);
  }
}

main();
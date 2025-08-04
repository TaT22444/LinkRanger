// テストアカウント設定用スクリプト
const admin = require('firebase-admin');

// Firebase Admin SDK初期化（サービスアカウントキーが必要）
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  // または: credential: admin.credential.cert(require('./path/to/serviceAccountKey.json')),
});

const db = admin.firestore();

async function setTestAccount(userEmail, isTest = true, role = 'tester') {
  try {
    // メールアドレスからユーザーを検索
    const userRecord = await admin.auth().getUserByEmail(userEmail);
    const uid = userRecord.uid;
    
    // Firestoreのユーザードキュメントを更新
    await db.collection('users').doc(uid).update({
      isTestAccount: isTest,
      role: role,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`✅ テストアカウント設定完了:`, {
      email: userEmail,
      uid: uid,
      isTestAccount: isTest,
      role: role
    });
  } catch (error) {
    console.error('❌ エラー:', error);
  }
}

// 使用例
async function main() {
  // TODO: ここにあなたのメールアドレスを入力してください
  const yourEmail = 'YOUR_EMAIL_HERE'; // ← .envのDEVELOPER_EMAILSと同じメールアドレス
  
  if (yourEmail === 'YOUR_EMAIL_HERE') {
    console.log('❌ エラー: メールアドレスを設定してください');
    console.log('   scripts/setTestAccount.js の yourEmail 変数を編集してください');
    process.exit(1);
  }
  
  // あなたのアカウントをテストアカウントに設定
  await setTestAccount(yourEmail, true, 'tester');
  
  process.exit(0);
}

main(); 
// テストアカウント監査スクリプト（リリース前チェック用）
const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();

async function auditTestAccounts() {
  console.log('🔍 テストアカウント監査開始...\n');
  
  try {
    // すべてのユーザーをチェック
    const usersSnapshot = await db.collection('users').get();
    
    const testAccounts = [];
    const suspiciousAccounts = [];
    
    for (const doc of usersSnapshot.docs) {
      const userData = doc.data();
      const uid = doc.id;
      
      // テストアカウントの検出
      if (userData.isTestAccount === true || 
          userData.role === 'admin' || 
          userData.role === 'tester') {
        
        testAccounts.push({
          uid,
          email: userData.email,
          isTestAccount: userData.isTestAccount,
          role: userData.role,
          createdAt: userData.createdAt?.toDate() || 'Unknown'
        });
      }
      
      // 疑わしいメールアドレスの検出
      if (userData.email && (
        userData.email.includes('test') ||
        userData.email.includes('dev') ||
        userData.email.includes('demo') ||
        userData.email.includes('admin')
      )) {
        suspiciousAccounts.push({
          uid,
          email: userData.email,
          isTestAccount: userData.isTestAccount || false,
          role: userData.role || 'user'
        });
      }
    }
    
    // 結果表示
    console.log('📊 監査結果:');
    console.log(`総ユーザー数: ${usersSnapshot.size}`);
    console.log(`テストアカウント数: ${testAccounts.length}`);
    console.log(`疑わしいアカウント数: ${suspiciousAccounts.length}\n`);
    
    // テストアカウント詳細
    if (testAccounts.length > 0) {
      console.log('🧪 検出されたテストアカウント:');
      testAccounts.forEach((account, index) => {
        console.log(`${index + 1}. ${account.email}`);
        console.log(`   - UID: ${account.uid}`);
        console.log(`   - isTestAccount: ${account.isTestAccount}`);
        console.log(`   - role: ${account.role}`);
        console.log(`   - 作成日: ${account.createdAt}`);
        console.log('');
      });
    }
    
    // 疑わしいアカウント詳細
    if (suspiciousAccounts.length > 0) {
      console.log('⚠️ 疑わしいアカウント（要確認）:');
      suspiciousAccounts.forEach((account, index) => {
        console.log(`${index + 1}. ${account.email}`);
        console.log(`   - UID: ${account.uid}`);
        console.log(`   - テストフラグ: ${account.isTestAccount}`);
        console.log(`   - ロール: ${account.role}`);
        console.log('');
      });
    }
    
    // リリース可否判定
    const hasActiveTestAccounts = testAccounts.length > 0;
    
    if (hasActiveTestAccounts) {
      console.log('❌ リリース前警告:');
      console.log('   アクティブなテストアカウントが検出されました。');
      console.log('   リリース前にこれらのアカウントを無効化してください。');
      console.log('');
      console.log('📝 対処法:');
      console.log('   1. Firebase Console で手動無効化');
      console.log('   2. node scripts/cleanupTestData.js で一括処理');
      console.log('');
      process.exit(1); // CI/CDで検知可能
    } else {
      console.log('✅ リリース可能状態:');
      console.log('   アクティブなテストアカウントは検出されませんでした。');
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ 監査エラー:', error);
    process.exit(1);
  }
}

// AI使用量の異常検出
async function auditAIUsage() {
  console.log('🤖 AI使用量監査...\n');
  
  try {
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    // 今月の使用量サマリーを取得
    const summarySnapshot = await db.collection('aiUsageSummary')
      .where('month', '==', currentMonth)
      .get();
    
    const abnormalUsage = [];
    
    summarySnapshot.docs.forEach(doc => {
      const data = doc.data();
      
      // 異常に多い使用量を検出（目安: 100回以上）
      if (data.totalRequests > 100) {
        abnormalUsage.push({
          userId: data.userId,
          totalRequests: data.totalRequests,
          totalCost: data.totalCost,
          month: data.month
        });
      }
    });
    
    if (abnormalUsage.length > 0) {
      console.log('⚠️ 異常な使用量を検出:');
      for (const usage of abnormalUsage) {
        // ユーザー情報を取得
        const userDoc = await db.collection('users').doc(usage.userId).get();
        const userData = userDoc.data();
        
        console.log(`- ${userData?.email || 'Unknown'}`);
        console.log(`  使用回数: ${usage.totalRequests}回`);
        console.log(`  コスト: $${usage.totalCost.toFixed(4)}`);
        console.log('');
      }
    } else {
      console.log('✅ AI使用量に異常なし\n');
    }
    
  } catch (error) {
    console.error('❌ AI使用量監査エラー:', error);
  }
}

async function main() {
  await auditTestAccounts();
  await auditAIUsage();
}

main(); 
// テストデータクリーンアップスクリプト
const admin = require('firebase-admin');

// Firebase Admin SDK初期化
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();

async function cleanupTestAccountData(userEmail) {
  try {
    // ユーザー情報取得
    const userRecord = await admin.auth().getUserByEmail(userEmail);
    const uid = userRecord.uid;
    
    console.log(`🧹 テストデータクリーンアップ開始: ${userEmail} (${uid})`);
    
    // 1. テストアカウントフラグ無効化
    await db.collection('users').doc(uid).update({
      isTestAccount: false,
      role: 'user',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('✅ テストアカウントフラグを無効化');
    
    // 2. AI使用量記録の確認（削除は通常不要 - 統計用に残す）
    const aiUsageQuery = await db.collection('aiUsage')
      .where('userId', '==', uid)
      .get();
    console.log(`📊 AI使用記録: ${aiUsageQuery.size}件 (保持)`);
    
    // 3. テスト用の保存分析結果確認
    const savedAnalysesQuery = await db.collection('savedAnalyses')
      .where('userId', '==', uid)
      .get();
    console.log(`💾 保存分析結果: ${savedAnalysesQuery.size}件`);
    
    // 4. テスト用リンクの確認（必要に応じて削除）
    const linksQuery = await db.collection('links')
      .where('userId', '==', uid)
      .get();
    console.log(`🔗 リンク数: ${linksQuery.size}件`);
    
    // 5. テスト用タグの確認
    const tagsQuery = await db.collection('tags')
      .where('userId', '==', uid)
      .get();
    console.log(`🏷️ タグ数: ${tagsQuery.size}件`);
    
    console.log('✅ テストデータクリーンアップ完了');
    
    return {
      uid,
      aiUsageRecords: aiUsageQuery.size,
      savedAnalyses: savedAnalysesQuery.size,
      links: linksQuery.size,
      tags: tagsQuery.size
    };
    
  } catch (error) {
    console.error('❌ クリーンアップエラー:', error);
    throw error;
  }
}

// 危険: テストデータを完全削除（慎重に使用）
async function deleteTestData(userEmail, confirmDelete = false) {
  if (!confirmDelete) {
    console.warn('⚠️ データ削除は confirmDelete=true で実行してください');
    return;
  }
  
  try {
    const userRecord = await admin.auth().getUserByEmail(userEmail);
    const uid = userRecord.uid;
    
    console.log(`🗑️ テストデータ完全削除開始: ${userEmail}`);
    
    // バッチ削除処理
    const batch = db.batch();
    
    // AI使用記録削除
    const aiUsageSnapshot = await db.collection('aiUsage')
      .where('userId', '==', uid)
      .get();
    aiUsageSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    
    // 保存分析結果削除
    const analysesSnapshot = await db.collection('savedAnalyses')
      .where('userId', '==', uid)
      .get();
    analysesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    
    // AI使用サマリー削除
    const summarySnapshot = await db.collection('aiUsageSummary')
      .where('userId', '==', uid)
      .get();
    summarySnapshot.docs.forEach(doc => batch.delete(doc.ref));
    
    await batch.commit();
    console.log('✅ テストデータ完全削除完了');
    
  } catch (error) {
    console.error('❌ 削除エラー:', error);
  }
}

// 使用例
async function main() {
  const testEmail = 'test@19.com';
  
  // 1. 通常のクリーンアップ（推奨）
  await cleanupTestAccountData(testEmail);
  
  // 2. 完全削除（必要な場合のみ - 慎重に）
  // await deleteTestData(testEmail, true);
  
  process.exit(0);
}

main(); 
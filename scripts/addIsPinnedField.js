const admin = require('firebase-admin');

// Firebase Admin SDKを初期化（環境変数から設定を読み取り）
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'linkranger-b096e',
  });
}

const db = admin.firestore();

async function addIsPinnedField() {
  try {
    console.log('Adding isPinned field to existing links...');
    
    // 全てのリンクを取得
    const linksRef = db.collection('links');
    const snapshot = await linksRef.get();
    
    if (snapshot.empty) {
      console.log('No links found');
      return;
    }
    
    const batch = db.batch();
    let updateCount = 0;
    
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      // isPinnedフィールドがない場合のみ追加
      if (data.isPinned === undefined) {
        batch.update(doc.ref, { 
          isPinned: false,
          pinnedAt: null
        });
        updateCount++;
        console.log(`Updating link: ${data.title || data.url}`);
      }
    });
    
    if (updateCount > 0) {
      await batch.commit();
      console.log(`✅ Successfully updated ${updateCount} links with isPinned field`);
    } else {
      console.log('✅ All links already have isPinned field');
    }
  } catch (error) {
    console.error('❌ Error updating links:', error);
  }
}

// スクリプト実行
addIsPinnedField().then(() => {
  console.log('Script completed');
  process.exit(0);
}); 
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, query, where, getDocs, writeBatch } = require('firebase/firestore');

// Firebase設定（環境変数から読み込み）
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID
};

// Firebase初期化
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function updateExistingLinks() {
  try {
    console.log('Updating existing links with isPinned field...');
    
    // 全てのリンクを取得
    const linksRef = collection(db, 'links');
    const snapshot = await getDocs(linksRef);
    
    if (snapshot.empty) {
      console.log('No links found');
      return;
    }
    
    const batch = writeBatch(db);
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
updateExistingLinks().then(() => {
  console.log('Script completed');
  process.exit(0);
}); 
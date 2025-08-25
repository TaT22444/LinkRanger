import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, initializeAuth, setPersistence, browserLocalPersistence, inMemoryPersistence } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getFunctions, Functions } from 'firebase/functions';
import { Platform } from 'react-native';

// Firebase設定（環境変数必須）
const getFirebaseConfig = () => {
  // 🔒 セキュリティ: 環境変数必須、フォールバック値なし
  const config = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID
  };

  // 🔍 嚳密な設定検証（セキュリティ強化）
  const requiredFields = [
    { key: 'apiKey', value: config.apiKey, envVar: 'EXPO_PUBLIC_FIREBASE_API_KEY' },
    { key: 'authDomain', value: config.authDomain, envVar: 'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN' },
    { key: 'projectId', value: config.projectId, envVar: 'EXPO_PUBLIC_FIREBASE_PROJECT_ID' },
    { key: 'storageBucket', value: config.storageBucket, envVar: 'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET' },
    { key: 'messagingSenderId', value: config.messagingSenderId, envVar: 'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID' },
    { key: 'appId', value: config.appId, envVar: 'EXPO_PUBLIC_FIREBASE_APP_ID' }
  ];
  
  const missingFields = requiredFields.filter(field => !field.value || field.value.trim() === '');
  
  if (missingFields.length > 0) {
    const missingEnvVars = missingFields.map(field => field.envVar).join(', ');
    throw new Error(`🔒 Firebase設定エラー: 以下の環境変数が設定されていません - ${missingEnvVars}`);
  }

  // デバッグ用（APIキーは表示しない）
  console.log('🔥 Firebase設定確認:', {
    projectId: config.projectId,
    authDomain: config.authDomain,
    hasApiKey: !!config.apiKey,
    usingEnvVars: !!process.env.EXPO_PUBLIC_FIREBASE_API_KEY
  });

  return config;
};

// Firebase初期化（エラーハンドリング付き）
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let functions: Functions;

try {
  const firebaseConfig = getFirebaseConfig();
  
  console.log('🔥 Firebase初期化開始...');
  app = initializeApp(firebaseConfig);
  console.log('✅ Firebase App初期化完了');
  
  // Firebase Auth初期化
  try {
    auth = initializeAuth(app);
    console.log('✅ Firebase Auth初期化完了');
    
    // 認証状態の永続化設定
    if (Platform.OS === 'web') {
      // Webの場合はローカルストレージに永続化
      setPersistence(auth, browserLocalPersistence);
      console.log('✅ Web用認証永続化設定完了');
    } else {
      // モバイルの場合はデフォルト（永続化）
      console.log('✅ モバイル用認証永続化設定完了（デフォルト）');
    }
  } catch (error: any) {
    // 既に初期化されている場合はgetAuthを使用
    if (error.code === 'auth/already-initialized') {
      auth = getAuth(app);
      console.log('✅ Firebase Auth初期化完了（既存のAuth使用）');
      
      // 既存のAuthにも永続化設定を適用
      if (Platform.OS === 'web') {
        setPersistence(auth, browserLocalPersistence);
        console.log('✅ 既存Auth用Web認証永続化設定完了');
      }
    } else {
      throw error;
    }
  }
  
  db = getFirestore(app);
  console.log('✅ Firestore初期化完了');
  
  functions = getFunctions(app, 'asia-northeast1');
  console.log('✅ Firebase Functions初期化完了');
  
  console.log('🎉 Firebase全サービス初期化成功 - プロジェクトID:', firebaseConfig.projectId);
} catch (error: any) {
  console.error('❌ Firebase初期化エラー:', error);
  console.error('エラーメッセージ:', error.message);
  console.error('エラーコード:', error.code);
  console.error('設定内容:', JSON.stringify(getFirebaseConfig(), null, 2));
  throw new Error(`Firebase初期化に失敗しました: ${error.message || error.code || '不明なエラー'}`);
}

export { auth, db, functions };
export default app; 
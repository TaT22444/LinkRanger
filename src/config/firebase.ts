import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getFunctions, Functions } from 'firebase/functions';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Firebase設定（環境変数優先、フォールバックあり）
const getFirebaseConfig = () => {
  // 環境変数を優先、開発/本番環境でフォールバック値を使用
  const config = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyCy0GMV6rjbI5kuHlsikcjtmRAvh0fCoBw',
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'linkranger-b096e.firebaseapp.com',
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'linkranger-b096e',
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'linkranger-b096e.firebasestorage.app',
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '823369241471',
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:823369241471:ios:fbe4aabdbcff92f509c04a'
  };

  // 設定の検証
  const isValidConfig = config.apiKey && config.projectId && config.appId;
  
  if (!isValidConfig) {
    throw new Error('Firebase設定が不完全です。環境変数を確認してください。');
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
  
  // Firebase Auth初期化（AsyncStorage永続化付き）
  try {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });
    console.log('✅ Firebase Auth初期化完了（AsyncStorage永続化設定済み）');
  } catch (error: any) {
    // 既に初期化されている場合はgetAuthを使用
    if (error.code === 'auth/already-initialized') {
      auth = getAuth(app);
      console.log('✅ Firebase Auth初期化完了（既存のAuth使用）');
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
const { initializeApp } = require("firebase/app");
const { getFunctions, httpsCallable } = require("firebase/functions");

const firebaseConfig = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyCy0GMV6rjbI5kuHlsikcjtmRAvh0fCoBw',
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'linkranger-b096e.firebaseapp.com',
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'linkranger-b096e',
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'linkranger-b096e.firebasestorage.app',
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '823369241471',
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:823369241471:ios:fbe4aabdbcff92f509c04a'
};

const app = initializeApp(firebaseConfig);
const functions = getFunctions(app, "asia-northeast1");

const clearTagCache = httpsCallable(functions, 'clearTagCache');

console.log("Calling clearTagCache function...");

clearTagCache()
  .then((result) => {
    console.log("Function result:", result.data);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error calling function:", error);
    process.exit(1);
  });

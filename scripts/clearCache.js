const admin = require('firebase-admin');
const { getFunctions, httpsCallable } = require('firebase-functions/v2/admin');

// Firebase Admin SDKの初期化
admin.initializeApp();

const clearTagCache = httpsCallable(getFunctions(), 'clearTagCache');

clearTagCache()
  .then((result) => {
    console.log('Cache clear result:', result.data);
  })
  .catch((error) => {
    console.error('Error calling clearTagCache function:', error);
  });

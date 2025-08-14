import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { close, InitialProps } from 'expo-share-extension';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';

// ===================================================================
//
// Firebaseの初期化（一度だけ実行されるように保証）
//
// ===================================================================
let firebaseApp: FirebaseApp;
if (getApps().length === 0) {
  const firebaseConfig = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  };
  firebaseApp = initializeApp(firebaseConfig);
} else {
  firebaseApp = getApps()[0];
}

const functions = getFunctions(firebaseApp);
const auth = getAuth(firebaseApp);

// ===================================================================
//
// Share Extension 本体
//
// ===================================================================

// ✅ 修正点：ライブラリから渡されるprops (InitialProps) を直接受け取るように修正
const ShareExtension: React.FC<InitialProps> = (initialProps) => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'auth_required'>('loading');
  const [message, setMessage] = useState('リンクを処理しています...');
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    // 1. 認証状態を確認
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user) {
        setStatus('auth_required');
        setMessage('この機能を利用するには、Winkへのログインが必要です。');
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // 2. 認証が完了し、共有データ(initialProps)が存在する場合に処理を開始
    if (currentUser && initialProps) {
      processSharedContent(initialProps);
    }
  }, [currentUser, initialProps]);

  // 共有されたコンテンツを処理するメインロジック
  const processSharedContent = async (data: InitialProps) => {
    try {
      let sharedUrl: string | undefined;

      // 3. 共有されたデータからURLを抽出
      // 🔴 以前の間違い： `data.urls` ではなく `data.url` が正しい
      if (data.url) {
        sharedUrl = data.url;
      } else if (data.text) {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const urlMatch = data.text.match(urlRegex);
        if (urlMatch && urlMatch.length > 0) {
          sharedUrl = urlMatch[0];
        }
      }

      if (!sharedUrl) {
        throw new Error('共有可能なURLが見つかりませんでした。');
      }

      // 4. バックエンドのFirebase Functionを呼び出す
      const saveSharedLink = httpsCallable(functions, 'saveSharedLink');
      await saveSharedLink({ url: sharedUrl, title: '共有リンク' });

      setStatus('success');
      setMessage('リンクを保存しました！\nAIが自動でタグ付けと分析をしています。');

      // 5. 成功したら2秒後に自動で閉じる
      setTimeout(() => {
        close();
      }, 2000);

    } catch (error: any) {
      setStatus('error');
      setMessage(error.message || 'リンクの保存中にエラーが発生しました。');
    }
  };

  // メインアプリを開いてログインを促す
  const openMainApp = () => {
    Linking.openURL('wink://'); // あなたのアプリのURLスキーム
    close();
  };

  // UIの描画部分
  const renderContent = () => {
    switch (status) {
      case 'loading':
        return (
          <View style={styles.content}>
            <ActivityIndicator size="large" color="#8A2BE2" />
            <Text style={styles.message}>{message}</Text>
          </View>
        );

      case 'success':
        return (
          <View style={styles.content}>
            <Feather name="check-circle" size={48} color="#4CAF50" />
            <Text style={[styles.message, { color: '#4CAF50', fontWeight: '500' }]}>{message}</Text>
            <TouchableOpacity style={styles.button} onPress={close}>
              <Text style={styles.buttonText}>閉じる</Text>
            </TouchableOpacity>
          </View>
        );

      case 'error':
        return (
          <View style={styles.content}>
            <Feather name="alert-circle" size={48} color="#F44336" />
            <Text style={[styles.message, { color: '#F44336' }]}>{message}</Text>
            <TouchableOpacity style={styles.button} onPress={() => processSharedContent(initialProps)}>
              <Text style={styles.buttonText}>再試行</Text>
            </TouchableOpacity>
          </View>
        );

      case 'auth_required':
        return (
          <View style={styles.content}>
            <Feather name="user-x" size={48} color="#FF9800" />
            <Text style={[styles.message, { color: '#FF9800' }]}>{message}</Text>
            <TouchableOpacity style={styles.button} onPress={openMainApp}>
              <Text style={styles.buttonText}>アプリを開いてログイン</Text>
            </TouchableOpacity>
          </View>
        );
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Feather name="link" size={20} color="#333" />
        <Text style={styles.headerTitle}>Winkに保存</Text>
      </View>
      {renderContent()}
    </View>
  );
};

// ===================================================================
//
// スタイルシート
//
// ===================================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5E5',
    backgroundColor: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#333',
    marginLeft: 10,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  message: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 24,
  },
  button: {
    marginTop: 24,
    backgroundColor: '#8A2BE2',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ShareExtension;

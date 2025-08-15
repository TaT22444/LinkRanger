import { GoogleSignin } from '@react-native-google-signin/google-signin';
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';

import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { AuthScreen } from './src/screens/AuthScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { AccountScreen } from './src/screens/AccountScreen';
import { EditProfileScreen } from './src/screens/EditProfileScreen';
import { TagDetailScreen } from './src/screens/TagDetailScreen';
import { Tag } from './src/types';
import { GOOGLE_SIGN_IN_CONFIG } from './src/config/auth';
import { notificationService } from './src/services/notificationService';
import { backgroundTaskService } from './src/services/backgroundTaskService';
import { shareLinkService } from './src/services/shareLinkService';
import { IapService } from './src/services/applePayService';

type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

type MainStackParamList = {
  Home: undefined;
  Account: undefined;
  EditProfile: undefined;
  LinkList: undefined;
  TagManagement: undefined;
  TagDetail: { tag: Tag };
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();

const MainNavigator: React.FC = () => {
  return (
    <MainStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#121212' },
      }}
    >
      <MainStack.Screen name="Home" component={HomeScreen} />
      <MainStack.Screen 
        name="Account" 
        component={AccountScreen}
        options={{
          headerShown: true,
          headerTitle: 'アカウント',
          headerStyle: {
            backgroundColor: '#121212',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      />
      <MainStack.Screen 
        name="EditProfile" 
        component={EditProfileScreen}
        options={{
          headerShown: true,
          headerTitle: 'プロフィール編集',
          headerStyle: {
            backgroundColor: '#121212',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      />
      <MainStack.Screen 
        name="TagDetail" 
        component={TagDetailScreen}
        options={{
          headerShown: false,
          contentStyle: { backgroundColor: '#121212' },
        }}
      />
    </MainStack.Navigator>
  );
};

// 受け渡し用の最小データ型（サービス側の想定に合わせて必要なら項目を拡張してください）
type SharedLinkData = {
  url: string;
  title?: string;
  // description?: string; など必要に応じて
};

// wink://share?url=...&title=... / https://www.dot-wink.com/share?url=... に対応
const parseSharedLink = (incomingUrl: string): SharedLinkData | null => {
  try {
    const parsed = Linking.parse(incomingUrl);
    // クエリパラメータから取り出し
    const qp = parsed?.queryParams || {};
    const sharedUrl = typeof qp?.url === 'string' ? qp.url : '';

    // URL本体が直接来る（例: wink://share/https://example.com）のようなパターンにも一応配慮
    // path 末尾を URL として扱えるケースのみ利用（任意）
    const fallbackUrl =
      !sharedUrl && typeof parsed?.path === 'string' && parsed.path.startsWith('share/')
        ? parsed.path.replace(/^share\//, '')
        : '';

    const finalUrl = sharedUrl || fallbackUrl;
    if (!finalUrl) return null;

    return {
      url: finalUrl,
      title: typeof qp?.title === 'string' ? qp.title : undefined,
    };
  } catch (e) {
    console.warn('parseSharedLink failed:', e);
    return null;
  }
};

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();

  // Deep Link の初回URL & ランタイムイベントの両方を処理
  useEffect(() => {
    if (!user) return;

    let removeListener: (() => void) | undefined;

    (async () => {
      try {
        // ① cold start の初期URL
        const initialUrl = await Linking.getInitialURL();
        if (initialUrl) {
          const data = parseSharedLink(initialUrl);
          if (data) {
            console.log('🔗 初期URLから共有リンク受信:', data);
            await shareLinkService.handleSharedLink(data, user);
          }
        }
      } catch (e) {
        console.error('❌ initialURL 処理エラー:', e);
      }

      // ② ランタイムのURLイベント
      const onUrl = async ({ url }: { url: string }) => {
        try {
          const data = parseSharedLink(url);
          if (data) {
            console.log('🔗 ランタイムURLから共有リンク受信:', data);
            await shareLinkService.handleSharedLink(data, user);
          }
        } catch (e) {
          console.error('❌ 共有リンク処理エラー:', e);
        }
      };

      // 新API
      const subscription = Linking.addEventListener('url', onUrl);
      removeListener = () => subscription.remove();
    })();

    return () => {
      if (removeListener) removeListener();
    };
  }, [user]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00FFFF" />
        <Text style={styles.loadingText}>読み込み中...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer
      linking={{
        prefixes: ['wink://', 'https://www.dot-wink.com'],
        config: {
          screens: {
            Main: {
              screens: {
                Home: 'home',
                ShareLink: 'share', // 例: wink://share?url=...
              }
            }
          }
        }
      }}
      onStateChange={(state) => {
        console.log('Navigation state changed:', state);
      }}
      onReady={() => {
        console.log('Navigation ready');
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Auth" component={AuthScreen} />
        ) : (
          <Stack.Screen name="Main" component={MainNavigator} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const App: React.FC = () => {
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Google Sign-In設定
        GoogleSignin.configure(GOOGLE_SIGN_IN_CONFIG);
        console.log('✅ Google Sign-In設定完了');
        
        // 通知サービス初期化
        await notificationService.initializeNotifications();
        console.log('✅ 通知サービス初期化完了');
        
        // バックグラウンドタスクサービス初期化
        await backgroundTaskService.registerBackgroundTasks();
        console.log('✅ バックグラウンドタスクサービス初期化完了');
      } catch (error) {
        console.error('❌ アプリ初期化エラー:', error);
      }
    };
    
    initializeApp();

    // IAPサービスの初期化
    const iapService = IapService.getInstance();
    iapService.initialize();

    // アプリ終了時にIAP接続を終了
    return () => {
      iapService.terminate();
    };
  }, []);

  return (
    <GestureHandlerRootView style={styles.container}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
  },
  loadingText: {
    color: '#fff',
    fontSize: 18,
  },
});

export default App;
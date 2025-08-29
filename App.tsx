import { GoogleSignin } from '@react-native-google-signin/google-signin';
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, AppState, AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';

import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { AuthScreen } from './src/screens/AuthScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { AccountScreen } from './src/screens/AccountScreen';
import { EditProfileScreen } from './src/screens/EditProfileScreen';
import { TagDetailScreen } from './src/screens/TagDetailScreen';
import { AnnouncementsScreen } from './src/screens/AnnouncementsScreen';
import { AnnouncementDetailScreen } from './src/screens/AnnouncementDetailScreen';
import { Tag } from './src/types';
import { GOOGLE_SIGN_IN_CONFIG } from './src/config/auth';
import { notificationService } from './src/services/notificationService';
import { backgroundTaskService } from './src/services/backgroundTaskService';
import { fcmService } from './src/services/fcmService';
import { IapService } from './src/services/applePayService';

type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

// 共有リンク用のデータ型
type SharedLinkData = {
  url: string;
  title?: string;
  source: 'deep-link';
};

type MainStackParamList = {
  Home: undefined;
  Account: undefined;
  EditProfile: undefined;
  LinkList: undefined;
  TagManagement: undefined;
  TagDetail: { tag: Tag };
  Announcements: undefined;
  AnnouncementDetail: { announcementId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();

const MainNavigator: React.FC<{ sharedLinkData: SharedLinkData | null }> = ({ sharedLinkData }) => {
  const HomeScreenWrapper = () => <HomeScreen sharedLinkData={sharedLinkData} />;
  
  return (
    <MainStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#121212' },
      }}
    >
      <MainStack.Screen name="Home" component={HomeScreenWrapper} />
      <MainStack.Screen 
        name="Account" 
        component={AccountScreen}
        options={{
          headerShown: true,
          headerTitle: 'アカウント',
          headerStyle: { backgroundColor: '#121212' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      />
      <MainStack.Screen 
        name="EditProfile" 
        component={EditProfileScreen}
        options={{
          headerShown: true,
          headerTitle: 'プロフィール編集',
          headerStyle: { backgroundColor: '#121212' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
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
      <MainStack.Screen 
        name="Announcements" 
        component={AnnouncementsScreen}
        options={{
          headerTitle: 'お知らせ',
          headerShown: true,
          headerStyle: { backgroundColor: '#121212' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      />
      <MainStack.Screen 
        name="AnnouncementDetail" 
        component={AnnouncementDetailScreen}
        options={{
          headerTitle: 'お知らせ詳細',
          headerShown: true,
          headerStyle: { backgroundColor: '#121212' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
          contentStyle: { backgroundColor: '#121212' },
        }}
      />
    </MainStack.Navigator>
  );
};



// wink://share?url=...&title=... / https://www.dot-wink.com/share?url=... に対応
const parseSharedLink = (incomingUrl: string): SharedLinkData | null => {
  try {
    const parsed = Linking.parse(incomingUrl);
    const qp = parsed?.queryParams || {};
    const sharedUrl = typeof qp?.url === 'string' ? qp.url : '';

    // URL本体が直接来る（例: wink://share/https://example.com）へのフォールバック
    const fallbackUrl =
      !sharedUrl && typeof parsed?.path === 'string' && parsed.path.startsWith('share/')
        ? parsed.path.replace(/^share\//, '')
        : '';

    const finalUrl = sharedUrl || fallbackUrl;
    if (!finalUrl) return null;

    return {
      url: finalUrl,
      title: typeof qp?.title === 'string' ? qp.title : undefined,
      source: 'deep-link' as const,
    };
  } catch (e) {
    console.warn('parseSharedLink failed:', e);
    return null;
  }
};

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const [sharedLinkData, setSharedLinkData] = useState<SharedLinkData | null>(null);
  const navigationRef = useRef<any>(null);

  // MainNavigatorをメモ化してパフォーマンスを改善
  const MainNavigatorWrapper = useMemo(
    () => () => <MainNavigator sharedLinkData={sharedLinkData} />,
    [sharedLinkData]
  );

  // Deep Link の初回URL & ランタイムイベントの両方を処理（既存）
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
            setSharedLinkData(data);
            // 初期URLの場合は、HomeScreenへの強制遷移は不要（アプリ起動時）
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
            setSharedLinkData(data);
            
            // ランタイムURLの場合は、確実にHomeScreenに遷移
            if (navigationRef.current) {
              navigationRef.current.navigate('Main', { screen: 'Home' });
              console.log('🔄 ShareExtension遷移: HomeScreenに強制遷移');
            }
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
      linking={{ prefixes: ['wink://', 'https://www.dot-wink.com'] }}
      onStateChange={(state: any) => {
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
          <Stack.Screen name="Main" component={MainNavigatorWrapper} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const App: React.FC = () => {
  const [appInitialized, setAppInitialized] = useState(false);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Google Sign-In設定
        GoogleSignin.configure(GOOGLE_SIGN_IN_CONFIG);
        console.log('✅ Google Sign-In設定完了');
        
        // 通知サービス初期化
        await notificationService.initializeNotifications();
        console.log('✅ 通知サービス初期化完了');
        
        // 🔥 FCM初期化: AuthContext でユーザーログイン後に実行
        // 認証が必要なため、App.tsx では初期化せず AuthProvider で処理
        console.log('🔐 FCM初期化: ユーザーログイン後に AuthContext で実行されます');
        
        // バックグラウンドタスクサービス初期化（遅延実行で即座実行を防止）
        setTimeout(async () => {
          await backgroundTaskService.registerBackgroundTasks();
          console.log('✅ バックグラウンドタスクサービス初期化完了（遅延実行）');
        }, 5000); // 5秒遅延でアプリ起動時の即座実行を防止
        
        setAppInitialized(true);
      } catch (error) {
        console.error('❌ アプリ初期化エラー:', error);
        setAppInitialized(true); // エラー時も初期化完了として扱う
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

  // AppStateの変更を監視してバッジをリセット
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // アプリがアクティブになったらバッジをリセット
        await Notifications.setBadgeCountAsync(0);
        console.log('✅ バッジをリセットしました');
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    
    // 初回起動時にもバッジをリセット
    Notifications.setBadgeCountAsync(0);
    console.log('✅ アプリ起動時にバッジをリセットしました');

    return () => {
      subscription.remove();
    };
  }, []);

  if (!appInitialized) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00FFFF" />
        <Text style={styles.loadingText}>アプリを初期化中...</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </View>
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
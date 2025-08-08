import { GoogleSignin } from '@react-native-google-signin/google-signin';
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
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
import { shareLinkService } from './src/services/shareLinkService';

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

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();

  // Deep Linkingハンドリング
  useEffect(() => {
    if (!user) return;

    const cleanup = shareLinkService.setupDeepLinkListener(async (sharedData) => {
      console.log('🔗 共有リンク受信:', sharedData);
      
      try {
        await shareLinkService.handleSharedLink(sharedData, user);
      } catch (error) {
        console.error('❌ 共有リンク処理エラー:', error);
      }
    });

    return cleanup;
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
        prefixes: ['wink://', 'https://wink.app'],
        config: {
          screens: {
            Main: {
              screens: {
                Home: 'home'
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
      } catch (error) {
        console.error('❌ アプリ初期化エラー:', error);
      }
    };
    
    initializeApp();
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
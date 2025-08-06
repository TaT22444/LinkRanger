import { GoogleSignin } from '@react-native-google-signin/google-signin';
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StripeProvider } from '@stripe/stripe-react-native';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { AuthScreen } from './src/screens/AuthScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { AccountScreen } from './src/screens/AccountScreen';
import { EditProfileScreen } from './src/screens/EditProfileScreen';
import { TagDetailScreen } from './src/screens/TagDetailScreen';
import { Tag } from './src/types';

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

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00FFFF" />
        <Text style={styles.loadingText}>読み込み中...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
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
    GoogleSignin.configure({
      webClientId: '823369241471-e83vfndlcmqok4dv31o9vd1k08d7eja4.apps.googleusercontent.com',
      iosClientId: '823369241471-e83vfndlcmqok4dv31o9vd1k08d7eja4.apps.googleusercontent.com',
    });
  }, []);

  return (
    <GestureHandlerRootView style={styles.container}>
      <AuthProvider>
        <StripeProvider publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'pk_test_dummy'}>
          <AppContent />
        </StripeProvider>
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
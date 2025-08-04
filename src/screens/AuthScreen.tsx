import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';

export const AuthScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const { login, register, loginAnonymously, loading } = useAuth();

  // 🚀 入力フィールドのref管理
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const handleEmailAuth = async () => {
    if (!email || !password) {
      Alert.alert('エラー', 'メールアドレスとパスワードを入力してください');
      return;
    }

    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(email, password);
      }
    } catch (error) {
      Alert.alert('エラー', error instanceof Error ? error.message : '認証に失敗しました');
    }
  };

  const handleAnonymousLogin = async () => {
    try {
      await loginAnonymously();
    } catch (error) {
      Alert.alert('エラー', '匿名ログインに失敗しました');
    }
  };

  // 🚀 Enter キー処理
  const handleEmailSubmit = () => {
    if (email.trim()) {
      passwordRef.current?.focus();
    }
  };

  const handlePasswordSubmit = () => {
    if (password.trim() && email.trim()) {
      handleEmailAuth();
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <ScrollView 
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={styles.content}>
          {/* アプリタイトル */}
          <View style={styles.titleSection}>
            <Text style={styles.title}>LinkRanger</Text>
            <Text style={styles.subtitle}>あなただけの知の羅針盤</Text>
          </View>

          {/* 認証フォーム */}
          <View style={styles.form}>
            <Text style={styles.formTitle}>
              {isLogin ? 'ログイン' : 'アカウント作成'}
            </Text>

            <TextInput
              ref={emailRef}
              style={styles.input}
              placeholder="メールアドレス"
              placeholderTextColor="#666"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={handleEmailSubmit}
              blurOnSubmit={false}
            />

            <TextInput
              ref={passwordRef}
              style={styles.input}
              placeholder="パスワード"
              placeholderTextColor="#666"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={isLogin ? "password" : "password-new"}
              textContentType={isLogin ? "password" : "newPassword"}
              returnKeyType="go"
              onSubmitEditing={handlePasswordSubmit}
            />

            <TouchableOpacity
              style={[styles.button, styles.primaryButton]}
              onPress={handleEmailAuth}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? '処理中...' : (isLogin ? 'ログイン' : 'アカウント作成')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchButton}
              onPress={() => setIsLogin(!isLogin)}
            >
              <Text style={styles.switchText}>
                {isLogin ? 'アカウントを作成する' : 'ログインする'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* 匿名ログイン */}
          <View style={styles.anonymousSection}>
            <Text style={styles.orText}>または</Text>
            <TouchableOpacity
              style={[styles.button, styles.anonymousButton]}
              onPress={handleAnonymousLogin}
              disabled={loading}
            >
              <Text style={styles.anonymousButtonText}>ゲストとして始める</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  scrollContainer: {
    backgroundColor: '#121212',
    flexGrow: 1,
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    // minHeight: '100%',
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: 60,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#00FFFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
  },
  form: {
    width: '100%',
    maxWidth: 300,
    marginBottom: 40,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 30,
  },
  input: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 16,
    color: '#FFF',
    marginBottom: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  button: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#8A2BE2',
    shadowColor: '#8A2BE2',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  switchButton: {
    marginTop: 8,
    padding: 8,
  },
  switchText: {
    color: '#00FFFF',
    fontSize: 16,
    textAlign: 'center',
  },
  anonymousSection: {
    width: '100%',
    maxWidth: 300,
    alignItems: 'center',
  },
  orText: {
    color: '#666',
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  anonymousButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#666',
  },
  anonymousButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
  },
}); 
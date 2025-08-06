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
  ScrollView,
  Dimensions,
  Linking,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { FontAwesome, Ionicons } from '@expo/vector-icons';

export const AuthScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoginView, setIsLoginView] = useState(true);
  const [view, setView] = useState<'options' | 'email'>('options');
  const { login, register, loginAnonymously, loginWithGoogle, loading } = useAuth();

  const passwordRef = useRef<TextInput>(null);

  const handleEmailAuth = async () => {
    if (!email || !password) {
      Alert.alert('エラー', 'メールアドレスとパスワードを入力してください');
      return;
    }
    try {
      if (isLoginView) {
        await login(email, password);
      } else {
        await register(email, password);
      }
    } catch (error) {
      Alert.alert('認証エラー', error instanceof Error ? error.message : '予期せぬエラーが発生しました');
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch (error) {
      Alert.alert('Googleログインエラー', 'Googleでのログインに失敗しました');
    }
  };
  
  const handleAnonymousLogin = async () => {
    try {
      await loginAnonymously();
    } catch (error) {
      Alert.alert('エラー', 'ゲストとしての開始に失敗しました');
    }
  };

  const renderOptionsView = () => (
    <View style={styles.form}>
      <TouchableOpacity style={styles.optionButton} onPress={handleGoogleLogin} disabled={loading}>
        <FontAwesome name="google" size={20} style={styles.icon} />
        <Text style={styles.optionButtonText}>Googleで続行</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.optionButton} onPress={() => Alert.alert("近日公開！", "Appleでのログインは現在準備中です。")} disabled={loading}>
        <FontAwesome name="apple" size={24} style={styles.icon} />
        <Text style={styles.optionButtonText}>Appleで続行</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.optionButton} onPress={() => setView('email')} disabled={loading}>
        <FontAwesome name="envelope" size={20} style={styles.icon} />
        <Text style={styles.optionButtonText}>メールアドレスで続行</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.guestButton} onPress={handleAnonymousLogin} disabled={loading}>
        <Text style={styles.guestButtonText}>ゲストとして続行</Text>
      </TouchableOpacity>
      <View style={styles.termsContainer}>
        <Text style={styles.termsText}>
          続行することにより、Winkの{' '}
          <Text style={styles.termsLink} onPress={() => Linking.openURL('https://wink.app/terms')}>
            利用規約
          </Text>
          に同意したことになります。
        </Text>
      </View>
    </View>
  );

  const renderEmailView = () => (
    <View style={styles.form}>
      <View style={styles.formTitleContainer}>
        <TouchableOpacity onPress={() => setView('options')} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.formTitle}>
          {isLoginView ? 'ログイン' : 'アカウント作成'}
        </Text>
      </View>
      <TextInput
        style={styles.input}
        placeholder="メールアドレス"
        placeholderTextColor="#666"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
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
        returnKeyType="go"
        onSubmitEditing={handleEmailAuth}
      />
      <TouchableOpacity style={styles.primaryButton} onPress={handleEmailAuth} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? '処理中...' : (isLoginView ? 'ログイン' : 'アカウント作成')}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setIsLoginView(!isLoginView)}>
        <Text style={styles.switchText}>
          {isLoginView ? "アカウントをお持ちでないですか？ 作成する" : "すでにアカウントをお持ちですか？ ログイン"}
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <KeyboardAvoidingView style={styles.container} keyboardVerticalOffset={-30} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <View style={styles.titleSection}>
            <Text style={styles.title}>Wink</Text>
            <Text style={styles.subtitle}>あなたの知の羅針盤</Text>
          </View>
          {view === 'options' ? renderOptionsView() : renderEmailView()}
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
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  content: {
    alignItems: 'center',
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: 60,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#00FFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
  },
  form: {
    width: '100%',
    maxWidth: 320,
  },
  formTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    color: '#FFF',
    marginBottom: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  primaryButton: {
    backgroundColor: '#8A2BE2',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  switchText: {
    color: '#00FFFF',
    fontSize: 16,
    textAlign: 'center',
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  optionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 15,
  },
  icon: {
    color: '#FFFFFF',
    width: 24,
    textAlign: 'center',
  },
  guestButton: {
    marginTop: 8,
    padding: 8,
  },
  guestButtonText: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '500',
  },
  formTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  backButton: {
    position: 'absolute',
    left: 0,
    zIndex: 1,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#333',
    borderRadius: 12,
  },
  termsContainer: {
    marginTop: 20,
    paddingHorizontal: 20,
  },
  termsText: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  termsLink: {
    color: '#00FFFF',
    textDecorationLine: 'underline',
  },
});
 
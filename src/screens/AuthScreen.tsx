import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Linking,
  Image,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { FontAwesome } from '@expo/vector-icons';

export const AuthScreen: React.FC = () => {
  const { loginWithGoogle, loginWithApple, loading } = useAuth();

  const handleGoogleLogin = async () => {
    try {
      await loginWithGoogle();
    } catch (error) {
      Alert.alert('Googleログインエラー', 'Googleでのログインに失敗しました');
    }
  };

  const handleAppleLogin = async () => {
    try {
      await loginWithApple();
    } catch (error) {
      Alert.alert('Appleログインエラー', error instanceof Error ? error.message : 'Appleでのログインに失敗しました');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} keyboardVerticalOffset={-30} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.content}>
          <View style={styles.titleSection}>
            <Text style={styles.title}>.Wink</Text>
            <Text style={styles.subtitle}>「後で読む」を、忘れない。</Text>
          </View>
          <View style={styles.form}>
            <TouchableOpacity style={styles.optionButton} onPress={handleGoogleLogin} disabled={loading}>
              <FontAwesome name="google" size={20} style={styles.icon} />
              <Text style={styles.optionButtonText}>Googleで続行</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.optionButton} onPress={handleAppleLogin} disabled={loading}>
              <FontAwesome name="apple" size={24} style={styles.icon} />
              <Text style={styles.optionButtonText}>Appleで続行</Text>
            </TouchableOpacity>
            <View style={styles.termsContainer}>
              <Text style={styles.termsText}>
                続行することにより、
                <Text style={styles.termsLink} onPress={() => Linking.openURL('https://dot-wink.netlify.app/terms/')}>
                  利用規約
                </Text>
                および{'\n'}
                <Text style={styles.termsLink} onPress={() => Linking.openURL('https://dot-wink.netlify.app/privacy/')}>
                  プライバシーポリシー
                </Text>
                に同意したことになります。
              </Text>
            </View>
          </View>
        </View>
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
    flex: 1,
  },
  titleSection: {
    alignItems: 'center',
    flex: 1,
    marginTop: `70%`,
  },
  title: {
    fontSize: 56,
    fontWeight: 'bold',
    color: '#00FFFF',
    marginRight: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    marginTop: 10,
  },
  form: {
    width: '100%',
    maxWidth: 320,
    marginBottom: 80,
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
 
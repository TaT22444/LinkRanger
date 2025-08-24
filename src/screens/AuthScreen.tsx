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
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.content}>
          <View style={styles.titleSection}>
            <Text style={styles.title}>.Wink</Text>
            {/* <Text style={styles.subtitle}>あなたの知の羅針盤</Text> */}
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
                続行することにより.Winkの{' '}
                <Text style={styles.termsLink} onPress={() => Linking.openURL('https://wink.app/terms')}>
                  利用規約
                </Text>
                に同意したことになります。
              </Text>
            </View>
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
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  content: {
    marginTop: 80,
    alignItems: 'center',
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: 120,
  },
  title: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#00FFFF',
    marginRight: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
  },
  form: {
    width: '100%',
    maxWidth: 320,
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
 
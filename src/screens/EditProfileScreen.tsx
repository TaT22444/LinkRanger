import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { Feather } from '@expo/vector-icons';
import { AvatarSelector } from '../components/AvatarSelector';

type RootStackParamList = {
  Home: undefined;
  Account: undefined;
  EditProfile: undefined;
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export const EditProfileScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const { user, updateUserProfile, getUserEmail } = useAuth();
  
  const [displayName, setDisplayName] = useState(user?.username || getUserEmail() || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isAvatarSelectorVisible, setIsAvatarSelectorVisible] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState<{ id: string; icon: string } | null>(
    user?.avatarId && user?.avatarIcon ? { id: user.avatarId, icon: user.avatarIcon } : null
  );

  // 元の表示名を取得
  const getOriginalDisplayName = () => user?.username || getUserEmail() || '';

  // フォーカスが外れた時の処理
  const handleDisplayNameBlur = () => {
    if (!displayName.trim()) {
      setDisplayName(getOriginalDisplayName());
    }
  };

  // 変更をリセットする処理
  const handleReset = () => {
    setDisplayName(getOriginalDisplayName());
    setSelectedAvatar(
      user?.avatarId && user?.avatarIcon 
        ? { id: user.avatarId, icon: user.avatarIcon }
        : null
    );
  };

  // 変更があるかどうかをチェック
  const hasUnsavedChanges = () => {
    const displayNameChanged = displayName !== getOriginalDisplayName();
    const avatarChanged = (
      (selectedAvatar?.id !== user?.avatarId) ||
      (selectedAvatar?.icon !== user?.avatarIcon)
    );
    return displayNameChanged || avatarChanged;
  };

  // 戻る処理
  const handleGoBack = () => {
    if (hasUnsavedChanges()) {
      Alert.alert(
        '確認',
        '変更内容が保存されていません。\n変更を破棄してもよろしいですか？',
        [
          {
            text: 'キャンセル',
            style: 'cancel'
          },
          {
            text: '破棄',
            style: 'destructive',
            onPress: () => navigation.goBack()
          }
        ]
      );
    } else {
      navigation.goBack();
    }
  };

  const handleSave = async () => {
    if (isLoading || !displayName.trim()) {
      Alert.alert('エラー', '表示名を入力してください');
      return;
    }
    
    try {
      setIsLoading(true);
      
      const updateData: {
        displayName: string;
        avatarId?: string;
        avatarIcon?: string;
      } = {
        displayName: displayName.trim(),
      };

      // アバターが選択されている場合は更新データに含める
      if (selectedAvatar) {
        updateData.avatarId = selectedAvatar.id;
        updateData.avatarIcon = selectedAvatar.icon;
      }

      await updateUserProfile(updateData);

      Alert.alert(
        '成功',
        'プロフィールを更新しました',
        [
          {
            text: 'OK',
            onPress: () => {
              setIsLoading(false);
              navigation.goBack(); // navigate('Account')からgoBack()に変更
            },
          },
        ]
      );
    } catch (error: any) {
      setIsLoading(false);
      Alert.alert(
        'エラー',
        error.message || 'プロフィールの更新に失敗しました'
      );
    }
  };

  const handleAvatarSelect = (avatar: { id: string; icon: string }) => {
    setSelectedAvatar(avatar);
    setIsAvatarSelectorVisible(false);
  };

  // ナビゲーションヘッダーの右側に保存ボタンを設定
  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity
          onPress={handleGoBack}
          style={{ marginLeft: 8 }}
        >
          <Feather name="chevron-left" size={24} color="#FFF" />
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity
          onPress={handleSave}
          disabled={isLoading}
          style={{ marginRight: 16 }}
        >
          <Text style={{ color: '#8A2BE2', fontSize: 16, fontWeight: '600' }}>
            {isLoading ? '保存中...' : '保存'}
          </Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, handleSave, isLoading, hasUnsavedChanges]);

  // メールアドレスからイニシャルを取得
  const getInitial = () => {
    if (user?.username) {
      return user.username.charAt(0).toUpperCase();
    }
    const email = getUserEmail();
    if (email) {
      return email.charAt(0).toUpperCase();
    }
    return '?';
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.scrollView}>
        {/* プロフィールアイコン */}
        <View style={styles.iconSection}>
          <View style={styles.iconCircle}>
            {selectedAvatar ? (
              <Text style={styles.avatarIcon}>{selectedAvatar.icon}</Text>
            ) : user?.avatarIcon ? (
              <Text style={styles.avatarIcon}>{user.avatarIcon}</Text>
            ) : (
              <Text style={styles.iconText}>{getInitial()}</Text>
            )}
          </View>
          <TouchableOpacity 
            style={styles.changePhotoButton}
            onPress={() => setIsAvatarSelectorVisible(true)}
          >
            <Text style={styles.changePhotoText}>アイコンを変更</Text>
          </TouchableOpacity>
        </View>

        {/* 入力フォーム */}
        <View style={styles.formSection}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>表示名</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                onBlur={handleDisplayNameBlur}
                placeholder={getOriginalDisplayName()}
                placeholderTextColor="#666"
                autoCapitalize="words"
                autoCorrect={true}
                keyboardType="default"
                returnKeyType="done"
                editable={!isLoading}
                autoComplete="name"
                textContentType="name"
                clearButtonMode="while-editing"
                maxLength={50}
                onSubmitEditing={() => {
                  if (hasUnsavedChanges()) {
                    handleSave();
                  }
                }}
              />
              {hasUnsavedChanges() && (
                <TouchableOpacity
                  style={styles.resetButton}
                  onPress={handleReset}
                  disabled={isLoading}
                >
                  <Feather name="rotate-ccw" size={20} color="#666" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* メールアドレス（表示のみ） */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>メールアドレス</Text>
            <View style={[styles.inputContainer, styles.readOnlyInput]}>
              <Text style={styles.readOnlyText}>{getUserEmail()}</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <AvatarSelector
        visible={isAvatarSelectorVisible}
        onClose={() => setIsAvatarSelectorVisible(false)}
        onSelect={handleAvatarSelect}
        selectedAvatarId={selectedAvatar?.id || user?.avatarId}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  scrollView: {
    flex: 1,
  },
  iconSection: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconText: {
    fontSize: 40,
    color: '#8A2BE2',
    fontWeight: 'bold',
  },
  avatarIcon: {
    fontSize: 60,
  },
  changePhotoButton: {
    paddingVertical: 8,
  },
  changePhotoText: {
    color: '#8A2BE2',
    fontSize: 16,
    fontWeight: '600',
  },
  formSection: {
    paddingHorizontal: 16,
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    color: '#FFF',
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    paddingHorizontal: 16,
  },
  input: {
    flex: 1,
    color: '#FFF',
    fontSize: 16,
    paddingVertical: 12,
  },
  readOnlyInput: {
    backgroundColor: '#1A1A1A',
  },
  readOnlyText: {
    color: '#888',
    fontSize: 16,
    paddingVertical: 12,
  },
  resetButton: {
    padding: 8,
  },
}); 
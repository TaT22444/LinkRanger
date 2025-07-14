import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { Feather, AntDesign } from '@expo/vector-icons';

export const AccountScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { user, logout } = useAuth();
  const userEmail = user?.email || 'No Email';
  const userPlan = user?.subscription?.plan || 'free'; // サブスクリプション情報から取得

  // Freeプランかどうか
  const isFree = userPlan === 'free';

  // 各アクションのハンドラ（仮実装）
  const handleUpgrade = () => {
    Alert.alert('アップグレード', 'Proプランへのアップグレード画面へ遷移');
  };
  const handleEditProfile = () => {
    navigation.navigate('EditProfile');
  };
  const handlePlan = () => {
    Alert.alert('プラン', 'プラン詳細・変更画面へ遷移');
  };
  const handleChangePassword = () => {
    Alert.alert('パスワード変更', 'パスワード変更画面へ遷移');
  };
  const handleLinks = () => {
    navigation.navigate('LinkList');
  };
  const handleTags = () => {
    navigation.navigate('TagManagement');
  };
  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      Alert.alert('エラー', 'ログアウトに失敗しました');
    }
  };
  const handleDeleteAccount = () => {
    Alert.alert(
      'アカウント削除',
      'アカウントを削除すると、すべてのデータが完全に削除され、復元できません。本当に削除しますか？',
      [
        {
          text: 'キャンセル',
          style: 'cancel',
        },
        {
          text: '削除',
          style: 'destructive',
          onPress: () => {
            // TODO: アカウント削除の実装
            Alert.alert('注意', 'この機能は現在実装中です');
          },
        },
      ]
    );
  };
  const handleContact = () => {
    Alert.alert('お問い合わせ', 'サポートへのお問い合わせ画面へ遷移');
  };
  const handlePolicy = () => {
    Alert.alert('利用規約・プライバシーポリシー', 'WebViewや外部リンクへ遷移');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* アカウント情報 */}
      <View style={styles.profileSection}>
        <TouchableOpacity style={styles.profileHeader} onPress={handleEditProfile}>
          <View style={styles.iconContainer}>
            <View style={styles.iconCircle}>
              {user?.avatarIcon ? (
                <Text style={styles.avatarIcon}>{user.avatarIcon}</Text>
              ) : (
                <Text style={styles.iconText}>{user?.username?.charAt(0).toUpperCase() || userEmail.charAt(0).toUpperCase()}</Text>
              )}
            </View>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.email}>{user?.username || userEmail}</Text>
            <Text style={styles.plan}>プラン: {userPlan}</Text>
          </View>
          <View style={styles.profileEditButton}>
            <Text style={styles.profileEditButtonText}>プロフィールを編集</Text>
            <AntDesign name="right" size={16} color="#FFF" />
          </View>
        </TouchableOpacity>
      </View>

      {/* アップグレードボタン */}
      {isFree && (
        <TouchableOpacity style={styles.upgradeItem} onPress={handleUpgrade}>
          <Feather name="star" size={18} color="#FFF" style={styles.itemIcon} />
          <Text style={styles.upgradeItemText}>Proプランにアップグレード</Text>
        </TouchableOpacity>
      )}

      {/* アカウント */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>アカウント</Text>
        <TouchableOpacity style={styles.menuItem} onPress={handlePlan}>
          <Feather name="award" size={18} color="#8A2BE2" style={styles.itemIcon} />
          <Text style={styles.itemText}>プラン</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={handleChangePassword}>
          <Feather name="lock" size={18} color="#8A2BE2" style={styles.itemIcon} />
          <Text style={styles.itemText}>パスワード変更</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={handleLogout}>
          <Feather name="log-out" size={18} color="#8A2BE2" style={styles.itemIcon} />
          <Text style={styles.itemText}>ログアウト</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.menuItem, { borderBottomWidth: 0 }]} onPress={handleDeleteAccount}>
          <Feather name="user-x" size={18} color="#E53935" style={styles.itemIcon} />
          <Text style={[styles.itemText, { color: '#E53935' }]}>アカウント削除</Text>
        </TouchableOpacity>
      </View>

      {/* サポート・その他 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>サポート・その他</Text>
        <TouchableOpacity style={styles.menuItem} onPress={handleContact}>
          <Feather name="mail" size={18} color="#8A2BE2" style={styles.itemIcon} />
          <Text style={styles.itemText}>お問い合わせ</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={handlePolicy}>
          <Feather name="file-text" size={18} color="#8A2BE2" style={styles.itemIcon} />
          <Text style={styles.itemText}>利用規約・プライバシーポリシー</Text>
        </TouchableOpacity>
        <View style={[styles.menuItem, { borderBottomWidth: 0 }]}> 
          <Feather name="info" size={18} color="#8A2BE2" style={styles.itemIcon} />
          <Text style={styles.itemText}>アプリバージョン: 1.0.0</Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  content: {
    padding: 0,
    paddingBottom: 20,
  },
  profileSection: {
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  iconContainer: {
    position: 'relative',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: {
    fontSize: 24,
    color: '#8A2BE2',
    fontWeight: 'bold',
  },
  editButton: {
    position: 'absolute',
    right: -8,
    bottom: -8,
    backgroundColor: '#2A2A2A',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#121212',
  },
  profileInfo: {
    marginLeft: 16,
    flex: 1,
  },
  email: {
    fontSize: 16,
    color: '#FFF',
    marginBottom: 4,
  },
  plan: {
    fontSize: 14,
    color: '#AAA',
  },
  profileEditButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  profileEditButtonText: {
    color: '#AAA',
    fontSize: 12,
    fontWeight: 'bold',
  },
  section: {
    backgroundColor: '#181818',
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 16,
    // marginBottom: 8,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  sectionTitle: {
    color: '#AAA',
    fontSize: 13,
    fontWeight: 'bold',
    marginLeft: 20,
    marginTop: 8,
    marginBottom: 8,
    letterSpacing: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  itemIcon: {
    marginRight: 16,
  },
  itemText: {
    color: '#FFF',
    fontSize: 16,
  },
  upgradeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: '#8A2BE2',
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  upgradeItemText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 500,
  },
  avatarIcon: {
    fontSize: 32,
  },
}); 
import React, { useState, useEffect, useMemo, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { useUser } from '../hooks/useFirestore';
import { useLinks, useTags } from '../hooks/useFirestore';
import { Feather, AntDesign } from '@expo/vector-icons';
import { UserPlan } from '../types';
import { PlanService } from '../services/planService';
import { announcementService } from '../services/announcementService';

import { UpgradeModal } from '../components/UpgradeModal';
import { deleteUserAccount } from '../services/authService';
import * as Application from 'expo-application';
import * as MailComposer from 'expo-mail-composer';

export const AccountScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { user: authUser, logout, getUserEmail } = useAuth();
  // リアルタイムでユーザー情報を監視
  const { user: realtimeUser, loading: userLoading } = useUser(authUser?.uid || null);
  
  // リアルタイムユーザー情報を優先、なければ認証ユーザーを使用
  const user = realtimeUser || authUser;
  
  // 現在のリンクとタグの数を取得
  const { links } = useLinks(user?.uid || null);
  const { tags: userTags } = useTags(user?.uid || null);
  
  const userEmail = getUserEmail() || 'No Email';
  const [appVersion, setAppVersion] = useState('');
  
  // お知らせ関連のstate
  const [unreadAnnouncementsCount, setUnreadAnnouncementsCount] = useState(0);

  useEffect(() => {
    const version = Application.nativeApplicationVersion;
    const buildVersion = Application.nativeBuildVersion;
    setAppVersion(`${version} (${buildVersion})`);
  }, []);
  
  // お知らせの未読数を取得
  useEffect(() => {
    if (!user?.uid) return;
    
    // 実際のFirestoreプラン値を使用
    const actualPlan = user?.subscription?.plan === 'plus' ? 'plus' : 'free';
    
    const unsubscribe = announcementService.subscribeToAnnouncements(
      user.uid,
      actualPlan as UserPlan,
      (data) => {
        setUnreadAnnouncementsCount(data.unreadCount);
      }
    );
    
    return unsubscribe;
  }, [user?.uid, user?.subscription?.plan]);

  const handleAnnouncements = () => {
    navigation.navigate('Announcements');
  };

  // headerに通知アイコンを設定
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          style={styles.headerNotificationButton}
          onPress={handleAnnouncements}
        >
          <Feather name="bell" size={18} color="#fff" />
          {unreadAnnouncementsCount > 0 && (
            <View style={styles.headerNotificationBadge}>
              <Text style={styles.headerNotificationBadgeText}>
                {unreadAnnouncementsCount > 99 ? '99+' : unreadAnnouncementsCount.toString()}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      ),
    });
  }, [navigation, unreadAnnouncementsCount, handleAnnouncements]);
  
  // PlanServiceを使用してプラン情報を取得（useMemoで最適化）
  const userPlan = useMemo(() => PlanService.getDisplayPlan(user), [user]); // 表示用プラン
  const planLimits = useMemo(() => PlanService.getPlanLimits(user), [user]);

  // Freeプランかどうか
  const isFree = userPlan === 'free';



  // UpgradeModal表示状態
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);





  // 各アクションのハンドラ（仮実装）
  const handleUpgrade = () => {
    setShowUpgradeModal(true);
  };

  const handlePlan = () => {
    setShowUpgradeModal(true);
  };

  const handleContact = async () => {
    try {
      // メール送信が利用可能かチェック
      const isAvailable = await MailComposer.isAvailableAsync();
      
      if (!isAvailable) {
        Alert.alert(
          'メール送信不可',
          'このデバイスではメール送信が利用できません。',
          [{ text: 'OK' }]
        );
        return;
      }

      // メール送信画面を開く
      await MailComposer.composeAsync({
        recipients: ['official.app.wink@gmail.com'],
        subject: 'Wink お問い合わせ',
        body: `お問い合わせ内容：

ユーザーID: ${user?.uid || '不明'}
プラン: ${PlanService.getPlanDisplayName(user)}プラン
アプリバージョン: ${appVersion}

─────────────────
↓↓↓お問い合わせ内容↓↓↓


─────────────────

`,
      });
    } catch (error) {
      console.error('メール送信エラー:', error);
      Alert.alert(
        'エラー',
        'メール送信に失敗しました。',
        [{ text: 'OK' }]
      );
    }
  };

  const handlePolicy = () => {
    // TODO: 利用規約・プライバシーポリシー画面への遷移
    Alert.alert('利用規約・プライバシーポリシー', 'この機能は現在開発中です。');
  };


  const handleEditProfile = () => {
    navigation.navigate('EditProfile');
  };
  const handleLinks = () => {
    navigation.navigate('LinkList');
  };
  const handleTags = () => {
    navigation.navigate('TagManagement');
  };
  const handleLogout = async () => {
    Alert.alert(
      'ログアウト',
      '本当にログアウトしますか？',
      [
        {
          text: 'キャンセル',
          style: 'cancel',
        },
        {
          text: 'ログアウト',
          style: 'destructive',
          onPress: async () => {
            try {
              await logout();
            } catch (error) {
              Alert.alert('エラー', 'ログアウトに失敗しました');
            }
          },
        },
      ]
    );
  };
  const handleDeleteAccount = () => {
    Alert.alert(
      'アカウント削除',
      'アカウントを削除すると、すべてのデータが完全に削除され、復元できません。本当によろしいですか？',
      [
        {
          text: 'キャンセル',
          style: 'cancel',
        },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteUserAccount();
              Alert.alert('成功', 'アカウントが削除されました');
            } catch (error) {
              Alert.alert('エラー', 'アカウントの削除に失敗しました');
            }
          },
        },
      ]
    );
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
            <View style={styles.planContainer}>
              <View style={styles.planInfo}>
                <Text style={styles.plan}>
                  {PlanService.getPlanDisplayName(user)}プラン
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.profileEditButton}>
            <Text style={styles.profileEditButtonText}>プロフィールを編集</Text>
            <AntDesign name="right" size={16} color="#FFF" />
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <View style={styles.planSectionHeader}>
          <View style={styles.planHeaderInfo}>
            <Text style={styles.sectionTitle}>
              {PlanService.getPlanDisplayName(user)}プラン
            </Text>
            {/* Plusプランでダウングレード期間中でない場合のみ更新日を表示 */}
            {user?.subscription?.plan === 'plus' && 
             !user?.subscription?.downgradeTo && 
             user?.subscription?.expirationDate && (
              <Text style={styles.sectionRenewalDate}>
                次回お支払日: {PlanService.getNextRenewalDateFormatted(user)}
              </Text>
            )}
          </View>
          {PlanService.getDowngradeInfoText(user) && (
            <Text style={styles.downgradeInfo}>
              {PlanService.getDowngradeInfoText(user)}
            </Text>
          )}
        </View>

        {/* プラン制限情報 */}
        <View style={styles.planLimitsContainer}>
          <View style={styles.limitItem}>
            <Text style={styles.limitLabel}>タグ保持上限数</Text>
            <Text style={styles.limitValue}>
              {planLimits.maxTags === -1 
                ? `${userTags?.length || 0}個 / 無制限` 
                : `${userTags?.length || 0}個 / ${planLimits.maxTags.toLocaleString()}個`
              }
            </Text>
          </View>
          <View style={styles.limitItem}>
            <Text style={styles.limitLabel}>リンク保持上限数</Text>
            <Text style={styles.limitValue}>
              {planLimits.maxLinks === -1 
                ? `${links?.length || 0}個 / 無制限` 
                : `${links?.length || 0}個 / ${planLimits.maxLinks}個`
              }
            </Text>
          </View>
          <View style={styles.limitItem}>
            <Text style={styles.limitLabel}>今日のリンク追加</Text>
            <Text style={styles.limitValue}>
              {planLimits.maxLinksPerDay === -1 
                ? '無制限' 
                : `${user?.stats?.todayLinksAdded || 0}個 / ${planLimits.maxLinksPerDay}個`
              }
            </Text>
          </View>
        </View>
        {/* アップグレードボタン */}
        {userPlan !== 'plus' && (
          <TouchableOpacity style={styles.upgradeItem} onPress={handleUpgrade}>
            <Feather name="star" size={18} color="#FFF" style={styles.itemIcon} />
            <Text style={styles.upgradeItemText}>
              {userPlan === 'free' ? 'プランをアップグレード' : 'プランをアップグレード'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* アカウント */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>アカウント</Text>
        <TouchableOpacity style={styles.menuItem} onPress={handlePlan}>
          <Feather name="award" size={18} color="#8A2BE2" style={styles.itemIcon} />
          <Text style={styles.itemText}>プラン</Text>
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
          <Text style={styles.itemText}>アプリバージョン: {appVersion}</Text>
        </View>
      </View>
      
      {/* UpgradeModal */}
      <UpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        currentPlan={userPlan}
        heroTitle="より理想的なリンク管理を"
        heroDescription="Plusプランでより多くのリンクとタグを保存可能に！"
        sourceContext="account"
      />
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
    paddingVertical: 20,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  sectionTitle: {
    color: '#AAA',
    fontSize: 13,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
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

  planLimitsContainer: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  limitItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  limitLabel: {
    fontSize: 14,
    color: '#AAA',
  },
  limitValue: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '600',
  },
  upgradeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#8A2BE2',
    borderRadius: 12,
    marginTop: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  upgradeItemText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 600,
  },
  avatarIcon: {
    fontSize: 32,
  },

  planContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  testBadge: {
    backgroundColor: '#FF5252',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 8,
  },
  testBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '600',
  },
  planInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  renewalDate: {
    fontSize: 12,
    color: '#AAA',
    marginLeft: 8,
  },
  downgradeInfo: {
    fontSize: 12,
    color: '#FF5252',
  },
  planSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  planRenewalDate: {
    fontSize: 12,
    color: '#AAA',
    marginLeft: 8,
  },
  planHeaderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionRenewalDate: {
    fontSize: 12,
    color: '#AAA',
    marginLeft: 8,
  },
  
  // headerの通知アイコン用スタイル
  headerNotificationButton: {
    position: 'relative',
    height: 44,
    width: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 100,
  },
  headerNotificationBadge: {
    position: 'absolute',
    top: 4,
    right: 8,
    backgroundColor: '#e74c3c',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerNotificationBadgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: 'bold',
  },

});
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { Feather, AntDesign } from '@expo/vector-icons';
import { UserPlan } from '../types';
import { PlanService } from '../services/planService';
import { UpgradeModal } from '../components/UpgradeModal';
import { AIUsageManager } from '../services/aiUsageService';

export const AccountScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { user, logout } = useAuth();
  const userEmail = user?.email || 'No Email';
  
  // PlanServiceを使用してプラン情報を取得（useMemoで最適化）
  const userPlan = useMemo(() => PlanService.getUserPlan(user), [user]);
  const planLimits = useMemo(() => PlanService.getPlanLimits(user), [user]);
  const isTestAccount = useMemo(() => PlanService.isTestAccount(user), [user]);

  // Freeプランかどうか
  const isFree = userPlan === 'free';

  // AI使用状況の状態
  const [aiUsage, setAiUsage] = useState({
    used: 0,
    limit: 0,
    remaining: 0,
  });

  // AIタグ付与設定の状態
  const [aiTagSettings, setAiTagSettings] = useState({
    autoTagging: false,
    manualTagging: true,
  });

  // UpgradeModal表示状態
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // AI使用状況を取得
  useEffect(() => {
    const fetchAIUsage = async () => {
      if (!user?.uid) return;
      
      try {
        // PlanServiceから制限値を取得
        const limit = planLimits.aiUsageLimit;
        
        // 実際のAI使用量をFirebaseから取得
        const aiUsageManager = AIUsageManager.getInstance();
        const usageStats = await aiUsageManager.getUserUsageStats(user.uid);
        const used = usageStats.currentMonth.totalRequests;
        const remaining = Math.max(0, limit - used);
        
        console.log('🔍 AI使用状況取得:', {
          userId: user.uid,
          plan: userPlan,
          limit,
          used,
          remaining,
          monthlyStats: usageStats.currentMonth
        });
        
        setAiUsage({ used, limit, remaining });

        // AIタグ付与設定を取得（ダミー）
        setAiTagSettings({
          autoTagging: userPlan === 'pro', // Proプランのみ自動タグ付与がデフォルトでオン
          manualTagging: true,
        });
      } catch (error) {
        console.error('Failed to fetch AI usage:', error);
        // エラー時はデフォルト値を設定
        const limit = planLimits.aiUsageLimit;
        setAiUsage({ used: 0, limit, remaining: limit });
      }
    };

    fetchAIUsage();
  }, [user?.uid, userPlan, planLimits.aiUsageLimit]);

  // AIタグ付与設定を切り替える
  const toggleAutoTagging = async (enabled: boolean) => {
    try {
      setAiTagSettings(prev => ({ ...prev, autoTagging: enabled }));
      // TODO: 実際の設定保存処理
      console.log('AI auto tagging setting changed:', enabled);
    } catch (error) {
      console.error('Failed to update AI tagging setting:', error);
      Alert.alert('エラー', '設定の更新に失敗しました');
    }
  };

  // 各アクションのハンドラ（仮実装）
  const handleUpgrade = () => {
    setShowUpgradeModal(true);
  };

  const handlePlan = () => {
    setShowUpgradeModal(true);
  };

  const handleChangePassword = () => {
    navigation.navigate('ChangePassword');
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
            <View style={styles.planContainer}>
              <Text style={styles.plan}>
                {isTestAccount ? 'テストアカウント' : `${PlanService.getPlanDisplayName(user)}プラン`}
              </Text>
              {isTestAccount && (
                <View style={styles.testBadge}>
                  <Text style={styles.testBadgeText}>無制限</Text>
                </View>
              )}
            </View>
          </View>
          <View style={styles.profileEditButton}>
            <Text style={styles.profileEditButtonText}>プロフィールを編集</Text>
            <AntDesign name="right" size={16} color="#FFF" />
          </View>
        </TouchableOpacity>
      </View>

      {/* AIタグ自動付与 */}
      <View style={styles.section}>
        {/* <Text style={styles.sectionTitle}>AIタグ自動付与</Text> */}
        
        <View style={styles.aiUsageItem}>
          <View style={styles.aiUsageHeader}>
            <Text style={styles.aiUsageTitle}>
              {isTestAccount ? 'AI機能（テストモード）' : 'AI解説機能使用状況'}
            </Text>
            <Text style={styles.aiUsageCount}>
              {isTestAccount ? '無制限' : `${aiUsage.used} / ${aiUsage.limit}`}
            </Text>
          </View>
          
          {!isTestAccount && (
            <View style={styles.aiProgressBar}>
              <View 
                style={[
                  styles.aiProgressFill, 
                  { 
                    width: `${Math.min(100, (aiUsage.used / aiUsage.limit) * 100)}%`,
                    backgroundColor: aiUsage.remaining <= 0 ? '#FF5252' : '#8A2BE2'
                  }
                ]} 
              />
            </View>
          )}
          
          {/* プラン制限情報 */}
          <View style={styles.planLimitsContainer}>
            <View style={styles.limitItem}>
              <Text style={styles.limitLabel}>タグ保存</Text>
              <Text style={styles.limitValue}>
                {planLimits.maxTags === -1 ? '無制限' : `${planLimits.maxTags.toLocaleString()}個まで`}
              </Text>
            </View>
            <View style={styles.limitItem}>
              <Text style={styles.limitLabel}>リンク保存</Text>
              <Text style={styles.limitValue}>
                {planLimits.maxLinks === -1 ? '無制限' : `${planLimits.maxLinks}個まで`}
              </Text>
            </View>
          </View>
          
          {/* アップグレードボタン */}
          {!isTestAccount && userPlan !== 'pro' && (
            <TouchableOpacity style={styles.upgradeItem} onPress={handleUpgrade}>
              <Feather name="star" size={18} color="#FFF" style={styles.itemIcon} />
              <Text style={styles.upgradeItemText}>
                {userPlan === 'free' ? 'プランをアップグレード' : 'プランをアップグレード'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

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
      
      {/* UpgradeModal */}
      <UpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        currentPlan={userPlan}
        heroTitle="より理想的なリンク管理を"
        heroDescription="AI解説機能が多く使える「Proプラン」がおすすめ！"
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
  aiUsageItem: {
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  aiUsageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  aiUsageTitle: {
    color: '#FFF',
    fontSize: 14,
  },
  aiUsageCount: {
    color: '#8A2BE2',
    fontSize: 14,
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
  // AI使用状況の洗練されたスタイル
  aiSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 8,
  },
  aiPlanBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  aiPlanText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8A2BE2',
  },
  aiUsageDisplay: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  aiUsageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  aiUsageLabel: {
    fontSize: 14,
    color: '#CCC',
  },
  aiUsageValue: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '600',
  },

  aiProgressContainer: {
    marginBottom: 16,
  },
  aiProgressBar: {
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    marginTop: 4,
  },
  aiProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  aiRemainingLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 6,
    textAlign: 'right',
  },
  aiSettingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  aiSettingTitle: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '500',
  },
  aiToggleButton: {
    backgroundColor: '#444',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 48,
  },
  aiToggleButtonActive: {
    backgroundColor: '#8A2BE2',
  },
  aiToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
    textAlign: 'center',
  },
  aiToggleTextActive: {
    color: '#FFF',
  },
  aiWarningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 152, 0, 0.1)',
    borderRadius: 8,
    padding: 12,
    gap: 8,
    marginTop: 8,
  },
  aiWarningText: {
    fontSize: 12,
    color: '#FF9800',
    flex: 1,
  },
  aiErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 82, 82, 0.1)',
    borderRadius: 8,
    padding: 12,
    gap: 8,
    marginTop: 8,
  },
  aiErrorText: {
    fontSize: 12,
    color: '#FF5252',
    flex: 1,
  },
  aiFeatureDescription: {
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  aiFeatureText: {
    fontSize: 13,
    color: '#AAA',
    lineHeight: 18,
    textAlign: 'center',
  },
  aiUsageStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  aiUsageStat: {
    flex: 1,
    alignItems: 'center',
  },
  aiUsageNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 4,
  },
  // aiUsageLabel: {
  //   fontSize: 14,
  //   color: '#CCC',
  // },
  aiUsageDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#444',
    marginHorizontal: 8,
  },

  aiWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3A2E00',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  // aiWarningText: {
  //   fontSize: 12,
  //   color: '#FF9800',
  //   flex: 1,
  // },
  aiErrorWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3A1A1A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 12,
    gap: 8,
  },
  // aiErrorText: {
  //   fontSize: 11,
  //   color: '#FF5252',
  //   marginTop: 4,
  // },
  aiSettingsSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  aiSettingsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 12,
  },
  aiSettingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  aiSettingInfo: {
    flex: 1,
    marginRight: 16,
  },
  aiSettingLabel: {
    fontSize: 14,
    color: '#FFF',
    marginBottom: 4,
  },
  aiSettingDescription: {
    fontSize: 12,
    color: '#AAA',
    lineHeight: 16,
  },
  aiSettingStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aiSettingStatusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  toggleSwitch: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#444',
    padding: 2,
    justifyContent: 'center',
  },
  toggleSwitchActive: {
    backgroundColor: '#8A2BE2',
  },
  toggleSwitchDisabled: {
    backgroundColor: '#333',
    opacity: 0.5,
  },
  toggleSwitchThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleSwitchThumbActive: {
    transform: [{ translateX: 20 }],
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
  planLimitsContainer: {
    marginTop: 16,
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

}); 
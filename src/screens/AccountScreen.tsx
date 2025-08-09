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
import { deleteUserAccount } from '../services/authService';
import * as Application from 'expo-application';

export const AccountScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { user, logout } = useAuth();
  const userEmail = user?.email || 'No Email';
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    const version = Application.nativeApplicationVersion;
    const buildVersion = Application.nativeBuildVersion;
    setAppVersion(`${version} (${buildVersion})`);
  }, []);
  
  // PlanServiceを使用してプラン情報を取得（useMemoで最適化）
  const userPlan = useMemo(() => PlanService.getUserPlan(user), [user]);
  const planLimits = useMemo(() => PlanService.getPlanLimits(user), [user]);
  const isTestAccount = useMemo(() => PlanService.isTestAccount(user), [user]);

  // Freeプランかどうか
  const isFree = userPlan === 'free';

  // 1ヶ月後のリセット日を計算
  const renewalDate = useMemo(() => {
    if (!user) return null;
    
    try {
      // プラン開始日があればそれを使用、なければアカウント作成日を使用
      let baseDate = user.subscription?.startDate || user.createdAt;
      if (!baseDate) return null;
      
      // Firebase Timestampの処理
      let startDate: Date;
      if (baseDate && typeof baseDate === 'object' && 'seconds' in baseDate) {
        // Firebase Timestamp
        startDate = new Date((baseDate as any).seconds * 1000);
      } else if (baseDate && typeof baseDate === 'object' && 'toDate' in baseDate) {
        // Firebase Timestamp with toDate method
        startDate = (baseDate as any).toDate();
      } else if (baseDate instanceof Date) {
        startDate = new Date(baseDate);
      } else if (typeof baseDate === 'string') {
        startDate = new Date(baseDate);
      } else {
        console.warn('Unsupported date format:', baseDate);
        return null;
      }
      
      if (isNaN(startDate.getTime())) {
        console.warn('Invalid date:', baseDate);
        return null;
      }
      
      // 現在の日付を取得
      const now = new Date();
      
      // 次のリセット日を計算（startDateの同じ日付の次の月）
      const nextRenewal = new Date(startDate);
      nextRenewal.setMonth(startDate.getMonth() + 1);
      
      // 月末の調整（例：1/31 -> 2/28）
      if (nextRenewal.getDate() !== startDate.getDate()) {
        nextRenewal.setDate(0); // 前月の最後の日
      }
      
      // 既に過ぎている場合は、さらに1ヶ月後にする
      while (nextRenewal <= now) {
        const targetDay = startDate.getDate();
        nextRenewal.setMonth(nextRenewal.getMonth() + 1);
        
        // 月末の調整
        if (nextRenewal.getDate() !== targetDay) {
          nextRenewal.setDate(0);
        }
      }
      
      return nextRenewal;
    } catch (error) {
      console.error('リセット日計算エラー:', error);
      return null;
    }
  }, [user]);

  // リセット日テキストの生成
  const renewalDateText = useMemo(() => {
    if (isTestAccount) return '';
    if (!renewalDate) return '毎月1日にリセット';
    
    const options: Intl.DateTimeFormatOptions = { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    const formattedDate = renewalDate.toLocaleDateString('ja-JP', options);
    return `${formattedDate}にリセット`;
  }, [renewalDate, isTestAccount]);

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
        // テストアカウントの場合は特別扱い
        if (isTestAccount) {
          setAiUsage({ used: 0, limit: 999999, remaining: 999999 });
          return;
        }
        
        const limit = planLimits.aiUsageLimit > 0 ? planLimits.aiUsageLimit : 1;
        
        const aiUsageManager = AIUsageManager.getInstance();
        const usageStats = await aiUsageManager.getUserUsageStats(user.uid);
        
        // AI解説機能（analysis）の使用回数を取得
        const used = usageStats.analysisUsage || 0;
        const remaining = Math.max(0, limit - used);
        
        console.log('🔍 AI使用状況取得:', {
          userId: user.uid,
          plan: userPlan,
          limit,
          used,
          remaining,
          analysisUsage: usageStats.analysisUsage,
          monthlyStats: usageStats.currentMonth,
          renewalDate: renewalDate?.toISOString()
        });
        
        setAiUsage({ used, limit, remaining });

      } catch (error) {
        console.error('Failed to fetch AI usage:', error);
        const limit = planLimits.aiUsageLimit > 0 ? planLimits.aiUsageLimit : 1;
        setAiUsage({ used: 0, limit, remaining: limit });
      }
    };

    fetchAIUsage();
  }, [user?.uid, userPlan, planLimits.aiUsageLimit, renewalDate, isTestAccount]);

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
        {!isTestAccount && renewalDateText && (
          <Text style={styles.renewalDateText}>
            {renewalDateText}
          </Text>
        )}
      
        <View style={styles.aiUsageRow}>
          <Text style={styles.aiUsageLabel}>AI解説機能</Text>
          <Text style={styles.aiUsageValue}>
            {isTestAccount ? '無制限' : `${aiUsage.remaining} / ${aiUsage.limit}回`}
          </Text>
        </View>

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
    marginBottom: 8,
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
  aiUsageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  aiUsageLabel: {
    fontSize: 14,
    color: '#E5E5EA',
  },
  aiUsageValue: {
    fontSize: 14,
    color: '#E5E5EA',
    fontWeight: '600',
  },
  renewalDateText: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 16,
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
    backgroundColor: '#fff',
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
    backgroundColor: '#8A2BE2',
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

});
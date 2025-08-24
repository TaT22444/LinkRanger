import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

interface AIUsageData {
  current: {
    monthly: { used: number; limit: number; };
    daily: { used: number; limit: number; };
    cost: { spent: number; budget: number; };
  };
  plan: 'guest' | 'free' | 'plus';
  recommendations: string[];
}

interface AIUsageDashboardProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  userPlan: 'guest' | 'free' | 'plus';
}

// Cloud Functions
const getAIUsageFunction = httpsCallable(functions, 'getAIUsage');

export const AIUsageDashboard: React.FC<AIUsageDashboardProps> = ({
  visible,
  onClose,
  userId,
  userPlan,
}) => {
  const [usageData, setUsageData] = useState<AIUsageData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchUsageData = async () => {
    if (!userId) return;

    setLoading(true);
    try {
      // 実際のCloud Function呼び出し（未実装のため、ダミーデータを使用）
      // const result = await getAIUsageFunction({ userId, userPlan });
      // setUsageData(result.data as AIUsageData);

      // ダミーデータ
      const mockData: AIUsageData = {
        current: {
          monthly: { 
            used: userPlan === 'free' ? 8 : userPlan === 'plus' ? 45 : 0, 
            limit: userPlan === 'free' ? 20 : userPlan === 'plus' ? 200 : 0 
          },
          daily: { 
            used: userPlan === 'free' ? 2 : userPlan === 'plus' ? 5 : 0, 
            limit: userPlan === 'free' ? 3 : userPlan === 'plus' ? 15 : 0 
          },
          cost: { 
            spent: userPlan === 'free' ? 0.20 : userPlan === 'plus' ? 1.25 : 0, 
            budget: userPlan === 'free' ? 0.50 : userPlan === 'plus' ? 5.00 : 0 
          },
        },
        plan: userPlan,
        recommendations: generateRecommendations(userPlan),
      };

      setUsageData(mockData);
    } catch (error) {
      console.error('Failed to fetch AI usage data:', error);
      Alert.alert('エラー', 'AI使用量データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible && userId) {
      fetchUsageData();
    }
  }, [visible, userId, userPlan]);

  const generateRecommendations = (plan: 'guest' | 'free' | 'plus'): string[] => {
    switch (plan) {
      case 'guest':
        return [
          'アカウント登録で月20回まで無料でAI機能をご利用いただけます',
          'ログインして、より多くの機能をお楽しみください',
        ];
      case 'free':
        return [
          'Plusプランで月50回まで利用可能です',
          'キャッシュ機能により効率的にAI機能を活用しています',
          '類似コンテンツは自動的にキャッシュから取得されます',
        ];
      case 'plus':
        return [
          '十分な使用量の余裕があります',
          'AI機能を積極的にご活用ください',
          'コスト効率的にAI処理が実行されています',
        ];
      default:
        return [];
    }
  };

  const getUsagePercentage = (used: number, limit: number): number => {
    if (limit === 0) return 0;
    return Math.min((used / limit) * 100, 100);
  };

  const getProgressBarColor = (percentage: number): string => {
    if (percentage < 50) return '#4CAF50'; // 緑
    if (percentage < 80) return '#FF9800'; // オレンジ
    return '#F44336'; // 赤
  };

  const ProgressBar: React.FC<{ used: number; limit: number; label: string; unit: string }> = ({ 
    used, limit, label, unit 
  }) => {
    const percentage = getUsagePercentage(used, limit);
    const color = getProgressBarColor(percentage);

    return (
      <View style={styles.progressContainer}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>{label}</Text>
          <Text style={styles.progressText}>
            {used}{unit} / {limit}{unit}
          </Text>
        </View>
        <View style={styles.progressBarContainer}>
          <View style={[styles.progressBar, { width: `${percentage}%`, backgroundColor: color }]} />
        </View>
        <Text style={styles.progressPercentage}>{percentage.toFixed(1)}%</Text>
      </View>
    );
  };

  if (!usageData && !loading) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* ヘッダー */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Feather name="x" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>AI使用量ダッシュボード</Text>
          <TouchableOpacity style={styles.refreshButton} onPress={fetchUsageData}>
            <Feather name="refresh-cw" size={20} color="#8A2BE2" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#8A2BE2" />
              <Text style={styles.loadingText}>使用量データを読み込み中...</Text>
            </View>
          ) : usageData ? (
            <>
              {/* プラン情報 */}
              <View style={styles.planSection}>
                <View style={styles.planHeader}>
                  <Feather name="star" size={20} color="#8A2BE2" />
                  <Text style={styles.planTitle}>
                    {usageData.plan === 'guest' ? 'ゲスト' : 
                     usageData.plan === 'free' ? 'Freeプラン' : 'Plusプラン'}
                  </Text>
                </View>
                {usageData.plan === 'guest' && (
                  <Text style={styles.planDescription}>
                    アカウント登録でAI機能をご利用いただけます
                  </Text>
                )}
              </View>

              {/* 使用量セクション */}
              {usageData.plan !== 'guest' && (
                <>
                  <View style={styles.usageSection}>
                    <Text style={styles.sectionTitle}>📊 今月の使用状況</Text>
                    
                    <ProgressBar
                      used={usageData.current.monthly.used}
                      limit={usageData.current.monthly.limit}
                      label="月間AI処理回数"
                      unit="回"
                    />
                    
                    <ProgressBar
                      used={usageData.current.daily.used}
                      limit={usageData.current.daily.limit}
                      label="今日のAI処理回数"
                      unit="回"
                    />
                    
                    <ProgressBar
                      used={usageData.current.cost.spent}
                      limit={usageData.current.cost.budget}
                      label="月間コスト"
                      unit="$"
                    />
                  </View>

                  {/* 統計情報 */}
                  <View style={styles.statsSection}>
                    <Text style={styles.sectionTitle}>📈 詳細統計</Text>
                    
                    <View style={styles.statsGrid}>
                      <View style={styles.statCard}>
                        <Text style={styles.statValue}>
                          {((usageData.current.monthly.used / usageData.current.monthly.limit) * 100).toFixed(1)}%
                        </Text>
                        <Text style={styles.statLabel}>月間使用率</Text>
                      </View>
                      
                      <View style={styles.statCard}>
                        <Text style={styles.statValue}>
                          {usageData.current.monthly.limit - usageData.current.monthly.used}
                        </Text>
                        <Text style={styles.statLabel}>残り回数</Text>
                      </View>
                      
                      <View style={styles.statCard}>
                        <Text style={styles.statValue}>
                          ${(usageData.current.cost.budget - usageData.current.cost.spent).toFixed(2)}
                        </Text>
                        <Text style={styles.statLabel}>残り予算</Text>
                      </View>
                      
                      <View style={styles.statCard}>
                        <Text style={styles.statValue}>
                          {usageData.current.daily.limit - usageData.current.daily.used}
                        </Text>
                        <Text style={styles.statLabel}>今日の残り</Text>
                      </View>
                    </View>
                  </View>
                </>
              )}

              {/* 推奨事項 */}
              <View style={styles.recommendationsSection}>
                <Text style={styles.sectionTitle}>💡 推奨事項</Text>
                {usageData.recommendations.map((recommendation, index) => (
                  <View key={index} style={styles.recommendationItem}>
                    <Feather name="check-circle" size={16} color="#4CAF50" />
                    <Text style={styles.recommendationText}>{recommendation}</Text>
                  </View>
                ))}
              </View>

              {/* アップグレード案内（Freeプランの場合） */}
              {usageData.plan === 'free' && (
                <View style={styles.upgradeSection}>
                  <View style={styles.upgradeHeader}>
                    <Feather name="zap" size={20} color="#8A2BE2" />
                    <Text style={styles.upgradeTitle}>Plusプランのご案内</Text>
                  </View>
                  <Text style={styles.upgradeDescription}>
                    • 月50回のAI処理{'\n'}
                    • 高度なAI分析機能{'\n'}
                    • 優先サポート{'\n'}
                    • データエクスポート機能
                  </Text>
                  <TouchableOpacity style={styles.upgradeButton}>
                    <Text style={styles.upgradeButtonText}>アップグレード</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  
  // ヘッダー
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  closeButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
  },
  refreshButton: {
    padding: 8,
  },
  
  // コンテンツ
  content: {
    flex: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
  loadingText: {
    fontSize: 16,
    color: '#CCC',
    marginTop: 16,
  },
  
  // セクション
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 16,
  },
  
  // プラン
  planSection: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#8A2BE2',
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  planTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFF',
    marginLeft: 8,
  },
  planDescription: {
    fontSize: 14,
    color: '#CCC',
    lineHeight: 20,
  },
  
  // 使用量
  usageSection: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  progressContainer: {
    marginBottom: 20,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  progressText: {
    fontSize: 14,
    color: '#CCC',
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressBar: {
    height: '100%',
    borderRadius: 4,
  },
  progressPercentage: {
    fontSize: 12,
    color: '#888',
    textAlign: 'right',
  },
  
  // 統計
  statsSection: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    width: '48%',
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#8A2BE2',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#CCC',
    textAlign: 'center',
  },
  
  // 推奨事項
  recommendationsSection: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  recommendationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  recommendationText: {
    fontSize: 14,
    color: '#CCC',
    marginLeft: 8,
    flex: 1,
    lineHeight: 20,
  },
  
  // アップグレード
  upgradeSection: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#8A2BE2',
  },
  upgradeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  upgradeTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
    marginLeft: 8,
  },
  upgradeDescription: {
    fontSize: 14,
    color: '#CCC',
    lineHeight: 20,
    marginBottom: 16,
  },
  upgradeButton: {
    backgroundColor: '#8A2BE2',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  upgradeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
}); 
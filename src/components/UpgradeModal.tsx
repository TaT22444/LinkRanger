import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { UserPlan } from '../types';
import { PlanService } from '../services/planService';
import { useStripePayment } from '../services/stripeService';
import { useAuth } from '../contexts/AuthContext';

interface UpgradeModalProps {
  visible: boolean;
  onClose: () => void;
  currentPlan?: UserPlan;
  heroTitle?: string;
  heroDescription?: string;
  sourceContext?: 'link_limit' | 'tag_limit' | 'ai_limit' | 'account' | 'general';
}

interface PlanFeature {
  title: string;
  description: string;
  icon: keyof typeof Feather.glyphMap;
}

interface PlanOption {
  name: UserPlan;
  displayName: string;
  price: string;
  period: string;
  description: string;
  features: PlanFeature[];
  recommended?: boolean;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({
  visible,
  onClose,
  currentPlan = 'free',
  heroTitle = 'プランをアップグレード',
  heroDescription = 'より多くのリンクとタグを保存し、\nAI機能をさらに活用しましょう',
  sourceContext = 'general',
}) => {
  const { user } = useAuth();
  const { handleSubscription } = useStripePayment();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingPlan, setProcessingPlan] = useState<UserPlan | null>(null);

  // プラン詳細を動的に生成
  const generatePlanOptions = (): PlanOption[] => {
    const planTypes: UserPlan[] = ['free', 'plus', 'pro'];
    
    return planTypes.map((planType): PlanOption => {
      const details = PlanService.getPlanDetails(planType);
      const pricing = PlanService.getPlanPricing(planType);
      
      // プランごとの機能定義（sourceContextに応じて説明を調整）
      const features: PlanFeature[] = [];
      
      if (planType === 'free') {
        features.push(
          {
            title: `タグ保持数 ${details.limits.maxTags.toLocaleString()}個まで`,
            description: sourceContext === 'tag_limit' ? 
              'タグの整理で思考を構造化' : 
              '基本的なタグ管理機能',
            icon: 'tag',
          },
          {
            title: `リンク保持数 ${details.limits.maxLinks}個まで`,
            description: sourceContext === 'link_limit' ? 
              '重要なリンクをしっかり保存' : 
              '基本的なリンク管理機能',
            icon: 'link',
          },
          {
            title: `AI解説機能 月に${details.limits.aiUsageLimit}回`,
            description: sourceContext === 'ai_limit' ? 
              '保存したリンクの内容をAIが解説' : 
              '保存したリンクの内容をAIが解説',
            icon: 'cpu',
          },
          {
            title: '基本リマインド機能',
            description: '固定期間でのリマインド',
            icon: 'bell',
          }
        );
      }
      
      if (planType === 'plus') {
        features.push(
          {
            title: 'Freeプランの全機能',
            description: '基本機能はそのまま利用可能',
            icon: 'check',
          },
          {
            title: `リンク保持数 ${details.limits.maxLinks}個まで`,
            description: sourceContext === 'link_limit' ? 
              'さらに多くの重要リンクを整理' : 
              'Freeプランより多くのリンクを保存',
            icon: 'link',
          },
          {
            title: `AI解説機能 月に${details.limits.aiUsageLimit}回`,
            description: sourceContext === 'ai_limit' ? 
              '保存したリンクの内容をAIが解説' : 
              '保存したリンクの内容をAIが解説',
            icon: 'cpu',
          },
          {
            title: 'カスタムリマインド機能',
            description: sourceContext === 'account' ? 
              '独自のリマインド設定が可能' : 
              '独自のリマインド設定が可能',
            icon: 'clock',
          }
        );
      }
      
      if (planType === 'pro') {
        features.push(
          {
            title: 'Plusプランの全機能',
            description: 'これまでの機能はそのまま利用可能',
            icon: 'check',
          },
          {
            title: `タグ保持数 ${details.limits.maxTags.toLocaleString()}個まで`,
            description: sourceContext === 'tag_limit' ? 
              '複雑なカテゴリ分けも自由自在' : 
              '大量のタグを管理可能',
            icon: 'tag',
          },
          {
            title: `リンク保持数 ${details.limits.maxLinks}個まで`,
            description: sourceContext === 'link_limit' ? 
              '大規模なリンクライブラリを構築' : 
              '豊富なリンクライブラリ',
            icon: 'link',
          },
          {
            title: `AI解説機能 月に${details.limits.aiUsageLimit}回`,
            description: sourceContext === 'ai_limit' ? 
              '保存したリンクの内容をAIが解説' : 
              '保存したリンクの内容をAIが解説',
            icon: 'cpu',
          },
          {
            title: '高度なAIモデル',
            description: sourceContext === 'ai_limit' ? 
              'より詳細で正確な解説を生成' : 
              'より詳細なデータ分析',
            icon: 'search',
          }
        );
      }
      
      return {
        name: planType,
        displayName: details.displayName,
        price: pricing.price === 0 ? '¥0' : `¥${pricing.price.toLocaleString()}`,
        period: pricing.price === 0 ? '無料' : '月額',
        description: planType === 'free' ? '基本機能をお試し' :
                    planType === 'plus' ? 'Freeプランに加えて、より多くのリンクとAI解説' :
                    'Plusプランに加えて、大量データと高度機能',
        features,
        recommended: planType === 'pro',
      };
    });
  };

  const plans = generatePlanOptions();

  const handleUpgrade = async (planName: UserPlan) => {
    if (!user?.uid) {
      Alert.alert('エラー', 'ログインが必要です');
      return;
    }

    if (planName === 'free') {
      Alert.alert('情報', 'Freeプランは既に利用可能です');
      return;
    }

    try {
      setIsProcessing(true);
      setProcessingPlan(planName);

      console.log('🔄 支払い処理開始:', { planName, userId: user.uid });

      const result = await handleSubscription(planName, user.uid);

      if (result.success) {
        Alert.alert(
          '🎉 アップグレード完了',
          `${planName.charAt(0).toUpperCase() + planName.slice(1)}プランへのアップグレードが完了しました！\n\n新しい機能をお楽しみください。`,
          [
            {
              text: 'OK',
              onPress: () => {
                onClose();
                // アプリを再起動してプラン情報を更新
                // または、ユーザー情報を再取得する
              }
            }
          ]
        );
      } else if (result.canceled) {
        console.log('💳 支払いがキャンセルされました');
      }

    } catch (error) {
      console.error('❌ 支払い処理エラー:', error);
      Alert.alert(
        'エラー',
        '支払い処理中にエラーが発生しました。しばらく時間をおいて再度お試しください。',
        [{ text: 'OK' }]
      );
    } finally {
      setIsProcessing(false);
      setProcessingPlan(null);
    }
  };

  const renderFeature = (feature: PlanFeature) => (
    <View key={feature.title} style={styles.featureItem}>
      <View style={styles.featureIcon}>
        <Feather name={feature.icon} size={12} color="#8A2BE2" />
      </View>
      <View style={styles.featureContent}>
        <Text style={styles.featureTitle}>{feature.title}</Text>
        <Text style={styles.featureDescription}>{feature.description}</Text>
      </View>
    </View>
  );

  const renderPlan = (plan: PlanOption) => {
    const isCurrentPlan = plan.name === currentPlan;
    
    return (
      <View key={plan.name} style={[
        styles.planCard,
        plan.recommended && styles.recommendedPlan,
        isCurrentPlan && styles.currentPlan
      ]}>
        {plan.recommended && (
          <View style={styles.recommendedBadge}>
            <Text style={styles.recommendedText}>おすすめ</Text>
          </View>
        )}
        
        {isCurrentPlan && (
          <View style={styles.currentPlanBadge}>
            <Text style={styles.currentPlanText}>現在のプラン</Text>
          </View>
        )}
        
        <View style={styles.planHeader}>
          <Text style={styles.planName}>{plan.displayName}</Text>
          <View style={styles.priceContainer}>
            <Text style={styles.planPrice}>{plan.price}</Text>
            <Text style={styles.planPeriod}>{plan.period}</Text>
          </View>
          <Text style={styles.planDescription}>{plan.description}</Text>
        </View>

        <View style={styles.featuresContainer}>
          {plan.features.map(renderFeature)}
        </View>

        {!isCurrentPlan && (
          <TouchableOpacity
            style={[
              styles.upgradeButton,
              plan.recommended && styles.recommendedButton,
              (isProcessing && processingPlan === plan.name) && styles.processingButton
            ]}
            onPress={() => handleUpgrade(plan.name)}
            disabled={isProcessing}
          >
            {isProcessing && processingPlan === plan.name ? (
              <View style={styles.processingContainer}>
                <ActivityIndicator size="small" color="#FFF" style={styles.processingSpinner} />
                <Text style={[
                  styles.upgradeButtonText,
                  plan.recommended && styles.recommendedButtonText
                ]}>
                  処理中...
                </Text>
              </View>
            ) : (
              <Text style={[
                styles.upgradeButtonText,
                plan.recommended && styles.recommendedButtonText
              ]}>
                {plan.displayName}プランを選択
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
    >
      <View style={styles.container}>
        <View style={styles.modalContainer}>
          <SafeAreaView style={{ flex: 1 }}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Feather name="x" size={24} color="#FFF" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>プランをアップグレード</Text>
              <View style={styles.headerSpacer} />
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Hero Section */}
          <View style={styles.heroSection}>
            <Text style={styles.heroTitle}>
              {heroTitle}
            </Text>
            <Text style={styles.heroDescription}>
              {heroDescription}
            </Text>
          </View>

          {/* Plans */}
          <View style={styles.plansContainer}>
            {plans.map(renderPlan)}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              • いつでもプラン変更・キャンセル可能{'\n'}
              • 初回30日間返金保証{'\n'}
              • データは安全に暗号化して保存
            </Text>
          </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#121212',
    borderRadius: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
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
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  heroSection: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFF',
    textAlign: 'center',
    lineHeight: 30,
    marginBottom: 12,
  },
  heroDescription: {
    fontSize: 14,
    color: '#BBB',
    textAlign: 'center',
    lineHeight: 20,
  },
  plansContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  planCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
    position: 'relative',
  },
  recommendedPlan: {
    borderColor: '#8A2BE2',
    backgroundColor: 'rgba(138, 43, 226, 0.05)',
  },
  currentPlan: {
    borderColor: '#666',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  recommendedBadge: {
    position: 'absolute',
    top: -6,
    right: 16,
    backgroundColor: '#8A2BE2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  recommendedText: {
    fontSize: 10,
    color: '#FFF',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  currentPlanBadge: {
    position: 'absolute',
    top: -6,
    left: 16,
    backgroundColor: '#666',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  currentPlanText: {
    fontSize: 10,
    color: '#FFF',
    fontWeight: '600',
  },
  planHeader: {
    marginBottom: 16,
  },
  planName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 6,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  planPrice: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFF',
    marginRight: 4,
  },
  planPeriod: {
    fontSize: 14,
    color: '#AAA',
    fontWeight: '500',
  },
  planDescription: {
    fontSize: 12,
    color: '#BBB',
    lineHeight: 18,
  },
  featuresContainer: {
    marginBottom: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  featureIcon: {
    width: 24,
    height: 24,
    backgroundColor: 'rgba(138, 43, 226, 0.1)',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 1,
  },
  featureDescription: {
    fontSize: 11,
    color: '#AAA',
    lineHeight: 16,
  },
  upgradeButton: {
    backgroundColor: '#333',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#444',
  },
  recommendedButton: {
    backgroundColor: '#8A2BE2',
    borderColor: '#8A2BE2',
  },
  upgradeButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  recommendedButtonText: {
    color: '#FFF',
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#777',
    textAlign: 'center',
    lineHeight: 18,
  },
  processingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  processingSpinner: {
    marginRight: 8,
  },
  processingButton: {
    opacity: 0.7,
  },
}); 
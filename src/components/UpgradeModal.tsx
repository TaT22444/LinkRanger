import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

interface UpgradeModalProps {
  visible: boolean;
  onClose: () => void;
  currentPlan?: 'free' | 'standard' | 'pro';
  heroTitle?: string;
  heroDescription?: string;
}

interface PlanFeature {
  title: string;
  description: string;
  icon: keyof typeof Feather.glyphMap;
}

interface PlanOption {
  name: string;
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
  heroTitle = 'AI分析結果を\nいつでも見返そう',
  heroDescription = 'Proプランなら分析結果が永続保存され、\n過去の学習内容をいつでも確認できます',
}) => {
  const plans: PlanOption[] = [
    {
      name: 'Free',
      price: '¥0',
      period: '無料',
      description: '基本機能をお試し',
      features: [
        {
          title: 'AI分析 1回/月',
          description: '基本的なAI分析機能',
          icon: 'cpu',
        },
        {
          title: '一時的結果表示',
          description: 'アプリ内でのみ結果確認',
          icon: 'eye',
        },
        {
          title: '基本的なリンク管理',
          description: 'タグ付けと整理機能',
          icon: 'link',
        },
      ],
    },
    {
      name: 'Standard',
      price: '¥480',
      period: '月額',
      description: 'AIをもっと活用したい方に',
      features: [
        {
          title: 'AI分析 3回/月',
          description: 'より多くのタグでAI分析',
          icon: 'cpu',
        },
        {
          title: '高度な検索機能',
          description: 'フィルタリングや並び替え',
          icon: 'search',
        },
        {
          title: '優先サポート',
          description: '問い合わせの優先対応',
          icon: 'headphones',
        },
      ],
    },
    {
      name: 'Pro',
      price: '¥980',
      period: '月額',
      description: 'AI分析結果を保存し、いつでもアクセス',
      recommended: true,
      features: [
        {
          title: 'AI分析結果の永続保存',
          description: 'アプリを閉じても結果が残る',
          icon: 'save',
        },
        {
          title: 'AI分析 30回/月',
          description: '大量のタグを分析可能',
          icon: 'cpu',
        },
        {
          title: '自動AIタグ付け',
          description: 'リンク追加時に自動でタグ生成',
          icon: 'tag',
        },
      ],
    },
  ];

  const handleUpgrade = (planName: string) => {
    // TODO: プラン変更処理を実装
    console.log('Upgrade to:', planName);
    onClose();
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
    const isCurrentPlan = plan.name.toLowerCase() === currentPlan;
    
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
          <Text style={styles.planName}>{plan.name}</Text>
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
              plan.recommended && styles.recommendedButton
            ]}
            onPress={() => handleUpgrade(plan.name)}
          >
            <Text style={[
              styles.upgradeButtonText,
              plan.recommended && styles.recommendedButtonText
            ]}>
              {plan.name}プランを選択
            </Text>
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
    margin: 20,
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
}); 
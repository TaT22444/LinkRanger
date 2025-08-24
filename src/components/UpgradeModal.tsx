import React, { useState, useEffect } from 'react';
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
import { IapService } from '../services/applePayService'; // Updated import
import { useAuth } from '../contexts/AuthContext';
import { useUser } from '../hooks/useFirestore';
import { Product, Subscription } from 'react-native-iap';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

interface UpgradeModalProps {
  visible: boolean;
  onClose: () => void;
  currentPlan?: UserPlan;
  heroTitle?: string;
  heroDescription?: string;
  sourceContext?: 'link_limit' | 'tag_limit' | 'daily_limit' | 'account' | 'general';
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
  heroDescription = `より多くのリンクとタグを保存し、
効率的な情報管理を実現しましょう`,
  sourceContext = 'general',
}) => {
  const { user: authUser } = useAuth();
  // リアルタイムでユーザー情報を監視
  const { user: realtimeUser, loading: userLoading } = useUser(authUser?.uid || null);
  
  // リアルタイムユーザー情報を優先、なければ認証ユーザーを使用
  const user = realtimeUser || authUser;
  
  const iapService = IapService.getInstance();
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingPlan, setProcessingPlan] = useState<UserPlan | null>(null);
  const [products, setProducts] = useState<(Product | Subscription)[]>([]);
  const [isWaitingForUpdate, setIsWaitingForUpdate] = useState(false);
  const [waitingPlan, setWaitingPlan] = useState<UserPlan | null>(null);

  // 現在のプランをリアルタイムで取得
  const currentUserPlan = user ? PlanService.getDisplayPlan(user) : 'free';

  // ダウングレード期間中かどうかを判定
  const isInDowngradePeriod = user?.subscription?.downgradeTo && 
    user?.subscription?.downgradeEffectiveDate && 
    PlanService.getNextRenewalDate(user) && 
    new Date() < PlanService.getNextRenewalDate(user)!;

  // プラン変更完了後の状態監視
  useEffect(() => {
    if (isWaitingForUpdate && user) {
      // プラン変更が反映されたかチェック
      const checkPlanChange = () => {
        const newPlan = PlanService.getDisplayPlan(user);
        if (newPlan !== currentUserPlan) {
          // プラン変更が反映された
          setIsWaitingForUpdate(false);
          setWaitingPlan(null);
          // 少し待ってからモーダルを閉じる
          setTimeout(() => {
            onClose();
          }, 2000);
        }
      };

      // 3秒後にチェック
      const timer = setTimeout(checkPlanChange, 3000);
      return () => clearTimeout(timer);
    }
  }, [isWaitingForUpdate, user, currentUserPlan, onClose]);

  useEffect(() => {
    const fetchProducts = async () => {
      if (visible) {
        try {
          await iapService.initialize();
          const fetchedProducts = await iapService.getProducts();
          setProducts(fetchedProducts);
          console.log('🛒 UpgradeModal: Products loaded successfully', {
            count: fetchedProducts.length,
            isDevelopment: __DEV__,
            products: fetchedProducts.map(p => ({
              productId: p.productId,
              localizedPrice: (p as any).localizedPrice
            }))
          });
        } catch (error) {
          console.error('Failed to fetch products', error);
          
          // Development環境では警告のみ、本番環境ではエラー表示
          if (__DEV__) {
            console.warn('⚠️ Development mode: IAP products not available, using fallback pricing');
          } else {
            Alert.alert('エラー', 'プラン情報の取得に失敗しました。');
          }
        }
      }
    };
    fetchProducts();
  }, [visible, iapService]);

  const generatePlanOptions = (): PlanOption[] => {
    const planTypes: UserPlan[] = ['free', 'plus'];
    
    return planTypes.map((planType): PlanOption => {
      const details = PlanService.getPlanDetails(planType);
      // Apple Store Connectから取得した商品情報を使用
      const product = products.find(p => {
        if (planType === 'plus') return p.productId === 'com.tat22444.wink.plus.monthly';
        // pro プランは削除済み
        return false;
      });

      const features: PlanFeature[] = [];
      // ... (feature generation logic remains the same)

      const pricing = PlanService.getPlanPricing(planType);
      
      // プランごとの機能定義（sourceContextに応じて説明を調整）
      if (planType === 'free') {
        features.push(
          {
            title: `リンク保持数 ${details.limits.maxLinks}個まで`,
            description: sourceContext === 'link_limit' ? 
              '重要なリンクをしっかり保存' : 
              '基本的なリンク管理機能',
            icon: 'link',
          },
          {
            title: `1日リンク追加 ${details.limits.maxLinksPerDay}個まで`,
            description: '1日に追加できるリンク数に制限があります',
            icon: 'plus-circle',
          },
          {
            title: `タグ保持数 ${details.limits.maxTags.toLocaleString()}個まで`,
            description: sourceContext === 'tag_limit' ? 
              'タグの整理で思考を構造化' : 
              '基本的なタグ管理機能',
            icon: 'tag',
          },
          {
            title: 'リマインド機能',
            description: '3日間未読のリンクはリマインド！',
            icon: 'bell',
          }
        );
      }
      
      if (planType === 'plus') {
        features.push(
          {
            title: `リンク保持数 ${details.limits.maxLinks}個まで`,
            description: sourceContext === 'link_limit' ? 
              'さらに多くの重要リンクを整理' : 
              'Freeプランより多くのリンクを保存',
            icon: 'link',
          },
          {
            title: `1日リンク追加 ${details.limits.maxLinksPerDay}個まで`,
            description: '1日に多くのリンクを追加可能',
            icon: 'plus-circle',
          },
          {
            title: `タグ保持数 ${details.limits.maxTags.toLocaleString()}個まで`,
            description: sourceContext === 'tag_limit' ? 
              '複雑なカテゴリ分けも自由自在' : 
              '大量のタグを管理可能',
            icon: 'tag',
          },
          {
            title: 'リマインド機能',
            description: '3日間未読のリンクはリマインド！',
            icon: 'bell',
          }
        );
      }

      return {
        name: planType,
        displayName: details.displayName,
        // Apple Store Connect価格を優先、フォールバックでPlanService価格を使用
        price: product && (product as any).localizedPrice ? 
          (product as any).localizedPrice : 
          (pricing.price === 0 ? '¥0' : `¥${pricing.price.toLocaleString()}`),
        period: pricing.price === 0 ? '無料' : '月額',
        description: planType === 'free' ? '基本機能をお試し' :
                    planType === 'plus' ? 'Freeプランに加えて、より多くのリンクとタグを保存可能' :
                    'Plusプランに加えて、大量データと高度機能',
        features,
        recommended: planType === 'plus',
      };
    });
  };

  const plans = generatePlanOptions();

  const handleUpgrade = async (planName: UserPlan) => {
    if (!user?.uid) {
      Alert.alert('エラー', 'ログインが必要です');
      return;
    }

    try {
      setIsProcessing(true);
      setProcessingPlan(planName);
      
      if (planName === 'free') {
        // Freeプランへのダウングレード処理
        console.log('🔄 Freeプランへのダウングレード開始:', { userId: user.uid });
        
        // Firebase Functionsを呼び出してサブスクリプションをキャンセル
        const handleSubscriptionCancellation = httpsCallable(functions, 'handleSubscriptionCancellation');
        await handleSubscriptionCancellation();
        
        Alert.alert(
          'プラン変更完了',
          'Freeプランに変更されました。次回請求日から適用されます。\n\n変更内容が反映されるまで少し時間がかかる場合があります。',
          [{ text: 'OK' }] // onCloseを削除してモーダルを開いたままにする
        );
        
        // 完了メッセージを表示
        setIsWaitingForUpdate(true);
        setWaitingPlan(planName);
      } else if (planName === 'plus' && isInDowngradePeriod) {
        // Plusプラン継続処理（ダウングレードのキャンセル）
        console.log('🔄 Plusプラン継続処理開始:', { userId: user.uid });
        
        // Firebase Functionsを呼び出してダウングレードをキャンセル
        const cancelDowngradeFunction = httpsCallable(functions, 'cancelDowngrade');
        await cancelDowngradeFunction();
        
        Alert.alert(
          'プラン継続完了',
          'Plusプランの継続が完了しました。\n\n変更内容が反映されるまで少し時間がかかる場合があります。',
          [{ text: 'OK' }] // onCloseを削除してモーダルを開いたままにする
        );
        
        // 完了メッセージを表示
        setIsWaitingForUpdate(true);
        setWaitingPlan(planName);
      } else {
        // Plusプランへのアップグレード処理
        console.log('🔄 支払い処理開始:', { planName, userId: user.uid });
        await iapService.purchasePlan(planName);
        
        Alert.alert(
          '購入処理完了',
          '購入処理が完了しました。プランが反映されるまでしばらくお待ちください。\n\n変更内容が反映されるまで少し時間がかかる場合があります。',
          [{ text: 'OK' }] // onCloseを削除してモーダルを開いたままにする
        );
        
        // 完了メッセージを表示
        setIsWaitingForUpdate(true);
        setWaitingPlan(planName);
      }

    } catch (error: any) {
      console.error('❌ プラン変更処理エラー:', error);
      if (error.code === 'E_USER_CANCELLED') {
        Alert.alert('キャンセル', '処理がキャンセルされました。');
      } else {
        Alert.alert('エラー', `プラン変更処理中にエラーが発生しました: ${error.message}`);
      }
    } finally {
      setIsProcessing(false);
      setProcessingPlan(null);
    }
  };

  // ... (renderFeature and other render logic remains the same, but I will include it for a full file write)
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
    const isCurrentPlan = plan.name === currentUserPlan;
    
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
          <View style={styles.planNameContainer}>
            <Text style={styles.planName}>{plan.displayName}</Text>
          </View>
          <View style={styles.priceContainer}>
            <Text style={styles.planPrice}>{plan.price}</Text>
            <Text style={styles.planPeriod}>{plan.period}</Text>
          </View>
          <Text style={styles.planDescription}>{plan.description}</Text>
        </View>

        <View style={styles.featuresContainer}>
          {plan.features.map(renderFeature)}
        </View>

        {(!isCurrentPlan || (plan.name === 'plus' && isInDowngradePeriod)) && !isWaitingForUpdate && (
          <TouchableOpacity
            style={[ 
              styles.upgradeButton,
              plan.recommended && styles.recommendedButton,
              (isProcessing && processingPlan === plan.name) && styles.processingButton,
              // Freeプランでダウングレード期間中の場合は無効化スタイル
              plan.name === 'free' && currentUserPlan === 'plus' && !!isInDowngradePeriod && styles.disabledButton
            ]}
            onPress={() => handleUpgrade(plan.name)}
            disabled={isProcessing || (plan.name === 'free' && currentUserPlan === 'plus' && !!isInDowngradePeriod)}
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
                {plan.name === 'free' && currentUserPlan === 'plus' 
                  ? (isInDowngradePeriod 
                      ? `${PlanService.getNextRenewalDateFormatted(user)}までPlusプランをご利用できます`
                      : 'Freeプランに戻す'
                    )
                  : plan.name === 'plus' && isInDowngradePeriod
                  ? 'Plusプランを継続'
                  : `${plan.displayName}プランを選択`
                }
              </Text>
            )}
          </TouchableOpacity>
        )}

        {/* ローディング表示 */}
        {isWaitingForUpdate && waitingPlan === plan.name && (
          <View style={styles.loadingMessage}>
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#8A2BE2" style={styles.loadingSpinner} />
              <Text style={styles.loadingMessageText}>
                {waitingPlan === 'free' 
                  ? 'Freeプランへの変更を反映中...'
                  : waitingPlan === 'plus' && isInDowngradePeriod
                  ? 'Plusプランの継続を反映中...'
                  : 'Plusプランへのアップグレードを反映中...'
                }
              </Text>
            </View>
          </View>
        )}

        {/* Freeプランへの戻り説明 */}
        {plan.name === 'free' && (
          (currentUserPlan === 'plus' || 
           (user?.subscription?.downgradeTo === 'free' && user?.subscription?.plan === 'plus'))) && (
          <View style={styles.downgradeInfo}>
            <Text style={styles.downgradeInfoTitle}>⚠️ プラン変更時の注意事項</Text>
            <Text style={styles.downgradeInfoText}>
              • 次回更新日まではPlusプランの機能が利用可能です。
            </Text>
            <Text style={styles.downgradeInfoText}>
              • Freeプランに戻りましたら、自動的にリンクは追加日が新しいものを優先して3個まで保持、残りは削除されます。
            </Text>
            <Text style={styles.downgradeInfoText}>
              • Freeプランに戻りましたら、タグは使用中のリンクに付いているもの（上限15個）以外は削除されます。
            </Text>
          </View>
        )}

        {/* Plusプラン継続の説明（ダウングレード期間中のみ） */}
        {plan.name === 'plus' && isInDowngradePeriod && (
          <View style={styles.downgradeInfo}>
            <Text style={styles.downgradeInfoTitle}>Plusプラン継続</Text>
            <Text style={styles.downgradeInfoText}>
              • プランを継続することで、{PlanService.getNextRenewalDateFormatted(user)}以降もPlusプランの機能をご利用いただけます。
            </Text>
          </View>
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
            <View style={styles.header}>
              <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                <Feather name="x" size={20} color="#FFF" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>プランをアップグレード</Text>
              <View style={styles.headerSpacer} />
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
              <View style={styles.heroSection}>
                <Text style={styles.heroTitle}>{heroTitle}</Text>
                <Text style={styles.heroDescription}>{heroDescription}</Text>
              </View>

              <View style={styles.plansContainer}>
                {plans.map(renderPlan)}
              </View>

              <View style={styles.footer}>
                <TouchableOpacity onPress={() => Alert.alert('リストア', '過去の購入情報を復元します。よろしいですか？', [{text: 'キャンセル'}, {text: 'OK', onPress: () => iapService.restorePurchases()}])}>
                    <Text style={styles.footerLink}>購入の復元</Text>
                </TouchableOpacity>
                <Text style={styles.footerText}>
                  • いつでもプラン変更・キャンセル可能
  
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
    paddingHorizontal: 12,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#1A1A1A',
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
    marginBottom: 24,
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
  planNameContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  planName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  renewalDate: {
    fontSize: 12,
    color: '#AAA',
    marginLeft: 8,
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
    marginTop: 8,
  },
  footerLink: {
    fontSize: 13,
    color: '#8A2BE2',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  processingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  processingSpinner: {
    marginRight: 8,
  },
  processingButton: {
    opacity: 0.7,
  },
  disabledButton: {
    opacity: 0.5,
    backgroundColor: '#444',
    borderColor: '#444',
  },
  downgradeInfo: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  downgradeInfoTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#BBB',
    marginBottom: 8,
  },
  downgradeInfoText: {
    fontSize: 11,
    color: '#BBB',
    lineHeight: 16,
    marginBottom: 2,
  },
  loadingMessage: {
    backgroundColor: '#222',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#444',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingSpinner: {
    marginRight: 8,
  },
  loadingMessageText: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '600',
  },
});
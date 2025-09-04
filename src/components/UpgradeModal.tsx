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
  Linking,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { UserPlan } from '../types';
import { PlanService } from '../services/planService';
import { IapService } from '../services/applePayService';
import { useAuth } from '../contexts/AuthContext';
import { useUser } from '../hooks/useFirestore';
import { Product, Subscription } from 'react-native-iap';
import Constants from 'expo-constants';

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

  // プラン変更完了後の状態監視（TestFlightでは実行されない）
  useEffect(() => {
    if (isWaitingForUpdate && user && !__DEV__) {
      // 本番環境のみでプラン変更をチェック
      const initialPlan = currentUserPlan;
      
      const checkPlanChange = () => {
        const newPlan = PlanService.getDisplayPlan(user);

        
        if (newPlan !== initialPlan && newPlan === waitingPlan) {
          // プラン変更が反映された
          setIsWaitingForUpdate(false);
          setWaitingPlan(null);
          
          // 少し待ってからモーダルを閉じる
          setTimeout(() => {
            onClose();
          }, 1500);
        }
      };

      // 3秒後にチェック開始、その後は2秒間隔でチェック
      const initialTimer = setTimeout(() => {
        checkPlanChange();
        
        // 初回チェックで変更がない場合のみ継続チェック
        const intervalTimer = setInterval(checkPlanChange, 2000);
        
        // 30秒後にタイムアウト
        const timeoutTimer = setTimeout(() => {
          clearInterval(intervalTimer);
          setIsWaitingForUpdate(false);
          setWaitingPlan(null);
  
        }, 30000);
        
        return () => {
          clearInterval(intervalTimer);
          clearTimeout(timeoutTimer);
        };
      }, 3000);
      
      return () => {
        clearTimeout(initialTimer);
      };
    }
  }, [isWaitingForUpdate, waitingPlan]); // 依存配列を最小限に

  useEffect(() => {
    const fetchProducts = async () => {
      if (visible) {
        try {
          await iapService.initialize();
          const fetchedProducts = await iapService.getProducts();
          setProducts(fetchedProducts);

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
        return false;
      });

      const features: PlanFeature[] = [];
      
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
        period: pricing.price === 0 ? '無料' : '月額自動更新',
        description: planType === 'free' ? '基本機能をお試し' :
                    planType === 'plus' ? 'Freeプランに加えて、より多くのリンクとタグを保存可能' :
                    'Plusプランに加えて、大量データと高度機能',
        features,
        recommended: planType === 'plus',
      };
    });
  };

  const plans = generatePlanOptions();

  // Appleガイドラインに準拠: アプリ内でのサブスクリプションキャンセル機能を廃止
  const handleUpgrade = async (planName: UserPlan) => {
    const timestamp = new Date().toISOString();
    

    
    if (!user?.uid) {
      console.error('[SUB-MONITOR] [' + timestamp + '] handleUpgrade failed - no user ID');
      Alert.alert('エラー', 'ログインが必要です');
      return;
    }

    // ユーザーがアップグレードを選択した場合のみ処理
    if (planName !== 'plus') {

      // 'plus' 以外のプラン（現状'free'）への変更はここでは扱わない
      return;
    }

    // 開発環境のみ特別処理（TestFlight環境は除く）
    // TestFlight環境の判定: standaloneアプリで、開発モードではないが、TestFlightビルドである場合
    const isTestFlight = !__DEV__ && Constants.executionEnvironment === 'standalone' &&
                         process.env.EXPO_PUBLIC_ENABLE_TEST_ACCOUNTS === 'true';
    
    if (__DEV__ && !isTestFlight) {

      Alert.alert(
        'テストフライト環境',
        'TestFlight版では実際の購入処理は制限されています。\n\nApp Store正式リリース後に以下が可能になります：\n• 実際のプラン購入\n• Apple Payでの決済\n• サブスクリプション管理',
        [
          { text: 'OK', style: 'default' },
          {
            text: 'テスト用アップグレード',
            onPress: () => {

              // テスト環境用の模擬アップグレード
              Alert.alert(
                'テスト用機能',
                'テスト用のプランアップグレードを実行するには、Firebase Consoleから手動でユーザー情報を編集してください。\n\n手順：\n1. Firebase Consoleを開く\n2. Firestore Databaseでユーザーを検索\n3. subscription.planを"plus"に変更',
                [{ text: '了解' }]
              );
            }
          }
        ]
      );
      return;
    }

    // TestFlight環境と本番環境での実際の購入処理
    try {
      setIsProcessing(true);
      setProcessingPlan(planName);
      

      
      await iapService.purchasePlan(planName);
      

      
      // TestFlight環境では特別なメッセージを表示
      if (isTestFlight) {
        Alert.alert(
          'TestFlight環境',
          'TestFlight版では実際の課金は行われませんが、購入処理が正常に完了しました。\n\nApp Store正式リリース後には実際の課金が行われます。',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          '購入処理完了',
          '購入処理が完了しました。プランが反映されるまでしばらくお待ちください。\n\n変更内容が反映されるまで少し時間がかかる場合があります。',
          [{ text: 'OK' }]
        );
      }
      
      // 完了メッセージを表示
      setIsWaitingForUpdate(true);
      setWaitingPlan(planName);

    } catch (error: any) {
      const errorTimestamp = new Date().toISOString();
      console.error('[SUB-MONITOR] [' + errorTimestamp + '] Purchase plan failed', {
        planName,
        userId: user.uid,
        environment: isTestFlight ? 'testflight' : 'production',
        errorCode: error.code,
        errorMessage: error.message,
        processingState: 'failed'
      });
      
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

  // App Storeのサブスクリプション管理ページにリダイレクト
  const handleManageSubscription = () => {
    // TestFlight環境の判定: standaloneアプリで、開発モードではないが、TestFlightビルドである場合
    const isTestFlight = !__DEV__ && Constants.executionEnvironment === 'standalone' &&
                         process.env.EXPO_PUBLIC_ENABLE_TEST_ACCOUNTS === 'true';
    
    // TestFlight環境での適切な案内
    if (__DEV__ && !isTestFlight) {
      Alert.alert(
        'サブスクリプション管理',
        'サブスクリプションの管理は以下の方法で行えます：\n\n【キャンセル方法】\n1. iPhoneの「設定」アプリを開く\n2. 上部のApple IDをタップ\n3. 「サブスクリプション」を選択\n4. 「.Wink」を選択してキャンセル\n\n【注意事項】\n• キャンセル後も現在の期間終了までご利用いただけます\n• 自動更新は各期間終了の24時間前に停止されます',
        [
          { text: 'OK', style: 'default' },
          { 
            text: 'App Storeで確認', 
            onPress: () => {
              const url = 'https://apps.apple.com/account/subscriptions';
              Linking.openURL(url).catch(() => {
                Alert.alert('エラー', 'App Storeを開けませんでした。');
              });
            }
          }
        ]
      );
      return;
    }
    
    // TestFlight環境と本番環境: 通常のサブスクリプション管理ページ
    const url = 'https://apps.apple.com/account/subscriptions';
    

    
    Linking.canOpenURL(url).then(supported => {
      if (supported) {
        Linking.openURL(url);
      } else {
        Alert.alert('エラー', 'App Storeを開けませんでした。');
      }
    });
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

        {/* Freeプランのカード内に表示させるメッセージ */}
        {plan.name === 'free' && (
          <View style={styles.freePlanNotice}>
            <Text style={styles.freePlanNoticeText}>
              サブスクリプションをキャンセルしてFreeプランに戻った際、以下のルールでリンクとタグが自動削除されます。
            </Text>
            <View style={styles.freePlanNoticeRules}>
              <Text style={styles.freePlanNoticeRule}>
                • リンク: 追加日が新しい上位3つのリンク以外が自動削除されます。
              </Text>
              <Text style={styles.freePlanNoticeRule}>
                • タグ: 残されたリンクに付与されているタグを優先し、最大15個になるよう削除されます。
              </Text>
            </View>
          </View>
        )}

        {/* Plusプランの場合 */}
        {plan.name === 'plus' && (
          <>
            {/* 自動更新サブスクリプションの詳細説明 */}
            <View style={styles.subscriptionDetails}>
              <Text style={styles.subscriptionDetailsTitle}>自動更新サブスクリプションについて</Text>
              <Text style={styles.subscriptionDetailsText}>
                • サブスクリプションは月額自動更新されます
              </Text>
              <Text style={styles.subscriptionDetailsText}>
                • キャンセルは設定アプリから行えます
              </Text>
              <Text style={styles.subscriptionDetailsText}>
                • 現在の期間終了までサービスをご利用いただけます
              </Text>
            </View>

            {isCurrentPlan ? (
              <TouchableOpacity
                style={[styles.upgradeButton, styles.manageButton]}
                onPress={handleManageSubscription}
              >
                <Text style={styles.upgradeButtonText}>プランを管理する</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[ 
                  styles.upgradeButton,
                  plan.recommended && styles.recommendedButton,
                  (isProcessing && processingPlan === plan.name) && styles.processingButton,
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
                    {`${plan.displayName}プランを選択`}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </>
        )}

        {/* ローディング表示 */}
        {isWaitingForUpdate && waitingPlan === plan.name && (
          <View style={styles.loadingMessage}>
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#8A2BE2" style={styles.loadingSpinner} />
              <Text style={styles.loadingMessageText}>
                {'Plusプランへのアップグレードを反映中...'}
              </Text>
            </View>
          </View>
        )}

        {/* サブスクリプション管理に関する注意書き */}
        {currentUserPlan === 'plus' && (
          <View style={styles.downgradeInfo}>
            <Text style={styles.downgradeInfoTitle}>⚠️ プラン変更について</Text>
            <Text style={styles.downgradeInfoText}>
              • プランのアップグレード、キャンセル、支払い情報の更新は、App Storeのアカウント設定から行えます。
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
  manageButton: {
    backgroundColor: '#666',
    borderColor: '#666',
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
  // Freeプラン注意事項のスタイル
  freePlanNotice: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  freePlanNoticeText: {
    fontSize: 13,
    color: '#CCC',
    lineHeight: 18,
  },
  freePlanNoticeRules: {
    marginTop: 8,
  },
  freePlanNoticeRule: {
    fontSize: 11,
    color: '#AAA',
    lineHeight: 16,
  },
  // サブスクリプション詳細のスタイル
  subscriptionDetails: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  subscriptionDetailsTitle: {
    fontSize: 13,
    color: '#FFF',
    fontWeight: '600',
    marginBottom: 8,
  },
  subscriptionDetailsText: {
    fontSize: 12,
    color: '#CCC',
    lineHeight: 16,
    marginTop: 2,
  },
});
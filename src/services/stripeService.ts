import { initStripe, useStripe } from '@stripe/stripe-react-native';
import { UserPlan } from '../types';

// Stripe設定
export class StripeService {
  private static instance: StripeService;
  private initialized = false;

  static getInstance(): StripeService {
    if (!StripeService.instance) {
      StripeService.instance = new StripeService();
    }
    return StripeService.instance;
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      // Stripe初期化（本番環境では本番キーを使用）
      const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
      
      if (!publishableKey) {
        throw new Error('Stripe publishable key not found');
      }

      await initStripe({
        publishableKey,
        merchantIdentifier: 'merchant.com.linkranger.app', // iOS用
      });

      this.initialized = true;
      console.log('✅ Stripe初期化完了');
    } catch (error) {
      console.error('❌ Stripe初期化エラー:', error);
      throw error;
    }
  }

  // プラン別の価格ID（Stripeダッシュボードで作成）
  private static readonly PRICE_IDS = {
    plus: {
      monthly: process.env.EXPO_PUBLIC_STRIPE_PLUS_MONTHLY_PRICE_ID || 'price_plus_monthly',
    },
    pro: {
      monthly: process.env.EXPO_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID || 'price_pro_monthly',
    },
  };

  // 価格ID取得
  static getPriceId(plan: UserPlan, interval: 'monthly' = 'monthly'): string | null {
    switch (plan) {
      case 'plus':
        return this.PRICE_IDS.plus.monthly;
      case 'pro':
        return this.PRICE_IDS.pro.monthly;
      default:
        return null;
    }
  }

  // 支払いインテント作成（Firebase Functionsを呼び出し）
  async createPaymentIntent(priceId: string, userId: string): Promise<{
    clientSecret: string;
    subscriptionId?: string;
  }> {
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_URL}/createPaymentIntent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId,
          userId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('❌ 支払いインテント作成エラー:', error);
      throw error;
    }
  }

  // サブスクリプション作成（Firebase Functionsを呼び出し）
  async createSubscription(priceId: string, userId: string): Promise<{
    clientSecret: string;
    subscriptionId: string;
  }> {
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_URL}/createSubscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          priceId,
          userId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('❌ サブスクリプション作成エラー:', error);
      throw error;
    }
  }

  // サブスクリプションキャンセル
  async cancelSubscription(subscriptionId: string): Promise<void> {
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_URL}/cancelSubscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscriptionId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      console.log('✅ サブスクリプションキャンセル完了');
    } catch (error) {
      console.error('❌ サブスクリプションキャンセルエラー:', error);
      throw error;
    }
  }

  // 顧客ポータルセッション作成
  async createCustomerPortalSession(customerId: string): Promise<{ url: string }> {
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_URL}/createCustomerPortal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('❌ 顧客ポータルセッション作成エラー:', error);
      throw error;
    }
  }
}

// Stripe支払いフック
export const useStripePayment = () => {
  const { initPaymentSheet, presentPaymentSheet, confirmPayment } = useStripe();

  const handleSubscription = async (plan: UserPlan, userId: string) => {
    try {
      console.log('🔄 サブスクリプション開始:', { plan, userId });

      // Stripe初期化
      await StripeService.getInstance().initialize();

      // 価格ID取得
      const priceId = StripeService.getPriceId(plan);
      if (!priceId) {
        throw new Error(`Invalid plan: ${plan}`);
      }

      // サブスクリプション作成
      const { clientSecret, subscriptionId } = await StripeService.getInstance().createSubscription(priceId, userId);

      // PaymentSheet初期化
      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'LinkRanger',
        paymentIntentClientSecret: clientSecret,
        defaultBillingDetails: {
          name: 'LinkRanger User',
        },
        allowsDelayedPaymentMethods: true,
        returnURL: 'linkranger://payment-result',
      });

      if (initError) {
        throw initError;
      }

      // PaymentSheet表示
      const { error: presentError } = await presentPaymentSheet();
      
      if (presentError) {
        if (presentError.code === 'Canceled') {
          console.log('💳 支払いがキャンセルされました');
          return { success: false, canceled: true };
        }
        throw presentError;
      }

      console.log('✅ 支払い完了:', { subscriptionId });
      return { success: true, subscriptionId };

    } catch (error) {
      console.error('❌ サブスクリプション処理エラー:', error);
      throw error;
    }
  };

  return {
    handleSubscription,
  };
};

// プラン価格情報
export const PLAN_PRICING = {
  free: {
    price: 0,
    currency: 'JPY',
    interval: 'month' as const,
  },
  plus: {
    price: 580,
    currency: 'JPY',
    interval: 'month' as const,
  },
  pro: {
    price: 1480,
    currency: 'JPY',
    interval: 'month' as const,
  },
} as const; 
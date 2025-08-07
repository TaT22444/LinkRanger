import { UserPlan } from '../types';

// Apple課金サービス（一時的に無効化）
export class ApplePayService {
  private static instance: ApplePayService;
  private initialized = false;

  static getInstance(): ApplePayService {
    if (!ApplePayService.instance) {
      ApplePayService.instance = new ApplePayService();
    }
    return ApplePayService.instance;
  }

  // 初期化（一時的に無効化）
  async initialize() {
    if (this.initialized) return;
    
    try {
      // 一時的にApple課金を無効化
      console.log('⚠️ Apple課金は一時的に無効化されています');
      this.initialized = true;
    } catch (error) {
      console.error('❌ Apple課金初期化エラー:', error);
      this.initialized = true;
    }
  }

  // プラン別の商品ID（App Store Connectで設定）
  private static readonly PRODUCT_IDS = {
    plus: {
      monthly: 'com.tat22444.wink.plus.monthly',
    },
    pro: {
      monthly: 'com.tat22444.wink.pro.monthly',
    },
  };

  // 商品ID取得
  static getProductId(plan: UserPlan, interval: 'monthly' = 'monthly'): string | null {
    switch (plan) {
      case 'plus':
        return this.PRODUCT_IDS.plus.monthly;
      case 'pro':
        return this.PRODUCT_IDS.pro.monthly;
      default:
        return null;
    }
  }

  // 商品情報取得（一時的に無効化）
  async getProducts(plan: UserPlan): Promise<any[]> {
    console.log('⚠️ Apple課金機能は一時的に無効化されています');
    return [];
  }

  // 購入実行（一時的に無効化）
  async purchaseProduct(plan: UserPlan): Promise<any> {
    console.log('⚠️ Apple課金機能は一時的に無効化されています');
    throw new Error('Apple課金機能は一時的に無効化されています');
  }

  // 利用可能な購入履歴取得（一時的に無効化）
  async getAvailablePurchases(): Promise<any[]> {
    console.log('⚠️ Apple課金機能は一時的に無効化されています');
    return [];
  }

  // 購入状態確認（一時的に無効化）
  async checkSubscriptionStatus(): Promise<{
    hasActiveSubscription: boolean;
    currentPlan: UserPlan | null;
    expirationDate?: Date;
  }> {
    console.log('⚠️ Apple課金機能は一時的に無効化されています');
    return {
      hasActiveSubscription: false,
      currentPlan: null,
    };
  }
}

// Apple課金フック（一時的に無効化）
export const useApplePay = () => {
  const handleSubscription = async (plan: UserPlan, userId: string) => {
    try {
      console.log('⚠️ Apple課金機能は一時的に無効化されています');
      throw new Error('Apple課金機能は一時的に無効化されています。後で実装予定です。');
    } catch (error) {
      console.error('❌ Apple課金エラー:', error);
      throw error;
    }
  };

  return { handleSubscription };
}; 
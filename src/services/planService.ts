// プラン管理統一サービス
import { User, UserPlan } from '../types';

interface PlanLimits {
  maxTags: number;
  maxLinks: number;
  aiUsageLimit: number;
  aiDailyLimit: number;
  hasBasicAlerts: boolean;
  hasCustomReminders: boolean;
  hasAdvancedSearch: boolean;
  hasDataExport: boolean;
}

export class PlanService {
  
  // プラン制限の定義
  private static readonly PLAN_LIMITS: Record<UserPlan, PlanLimits> = {
    'free': {
      maxTags: 500,
      maxLinks: 15,
      aiUsageLimit: 5,
      aiDailyLimit: 5,
      hasBasicAlerts: true,
      hasCustomReminders: false,
      hasAdvancedSearch: false,
      hasDataExport: false,
    },
    'plus': {
      maxTags: 500,
      maxLinks: 50,
      aiUsageLimit: 80,
      aiDailyLimit: 10,
      hasBasicAlerts: true,
      hasCustomReminders: true,
      hasAdvancedSearch: false,
      hasDataExport: false,
    },
    'pro': {
      maxTags: 3000,
      maxLinks: 200,
      aiUsageLimit: 150,
      aiDailyLimit: 50,
      hasBasicAlerts: true,
      hasCustomReminders: true,
      hasAdvancedSearch: true,
      hasDataExport: true,
    },
  };

  // プラン価格の定義
  private static readonly PLAN_PRICING = {
    'free': { price: 0, currency: 'JPY', period: 'month' },
    'plus': { price: 580, currency: 'JPY', period: 'month' },
    'pro': { price: 1480, currency: 'JPY', period: 'month' },
  };
  
  // プラン取得（統一アクセスポイント）
  static getUserPlan(user: User | null): UserPlan {
    if (!user) return 'free';
    
    const subscription = user.subscription;
    if (!subscription) return 'free';
    
    // ダウングレードされたプランがある場合の処理
    if (subscription.downgradeTo) {
      const now = new Date();
      const downgradeDate = this.getDateFromFirebaseTimestamp(subscription.downgradeEffectiveDate);
      
      // ダウングレード有効日が過ぎていれば、ダウングレード先のプランを返す
      if (downgradeDate && now >= downgradeDate) {
        return subscription.downgradeTo;
      }
      // まだダウングレード有効日前なら、現在のプランを継続
    }
    
    return subscription.plan || 'free';
  }
  
  // Firebase Timestampを Dateに変換するヘルパー
  private static getDateFromFirebaseTimestamp(timestamp: any): Date | null {
    if (!timestamp) return null;
    
    try {
      if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp) {
        return new Date(timestamp.seconds * 1000);
      } else if (timestamp && typeof timestamp === 'object' && 'toDate' in timestamp) {
        return timestamp.toDate();
      } else if (timestamp instanceof Date) {
        return timestamp;
      } else if (typeof timestamp === 'string') {
        return new Date(timestamp);
      }
      return null;
    } catch (error) {
      console.error('Timestamp conversion error:', error);
      return null;
    }
  }

  // テストアカウント判定
  static isTestAccount(user: User | null): boolean {
    if (!user) return false;
    
    // Firestoreフラグベースの判定
    const isTestByFlag = user.isTestAccount === true || user.role === 'admin' || user.role === 'tester';
    
    // メールアドレスベースの判定
    const developerEmails = process.env.EXPO_PUBLIC_DEVELOPER_EMAILS?.split(',').map((email: string) => email.trim()) || [];
    const isTestByEmail = user.email && developerEmails.includes(user.email);
    
    return isTestByFlag || isTestByEmail;
  }

  // 実効プラン（テストアカウントは特別扱い）
  static getEffectivePlan(user: User | null): UserPlan {
    if (this.isTestAccount(user)) {
      return 'pro'; // テストアカウントは最高プランとして扱う
    }
    return this.getUserPlan(user);
  }

  // プラン制限取得
  static getPlanLimits(user: User | null): PlanLimits {
    const effectivePlan = this.getEffectivePlan(user);
    const limits = this.PLAN_LIMITS[effectivePlan];
    
    // テストアカウントは特別扱い
    if (this.isTestAccount(user)) {
      return {
        ...limits,
        maxTags: -1, // 無制限
        maxLinks: -1, // 無制限
        aiUsageLimit: 999999, // 実質無制限
      };
    }
    
    return limits;
  }

  // 個別制限チェック関数
  static getMaxTags(user: User | null): number {
    return this.getPlanLimits(user).maxTags;
  }

  static getMaxLinks(user: User | null): number {
    return this.getPlanLimits(user).maxLinks;
  }

  static getAIUsageLimit(user: User | null): number {
    return this.getPlanLimits(user).aiUsageLimit;
  }

  static getAIDailyLimit(user: User | null): number {
    return this.getPlanLimits(user).aiDailyLimit;
  }

  // 制限チェック関数
  static canCreateTag(user: User | null, currentTagCount: number): boolean {
    const maxTags = this.getMaxTags(user);
    return maxTags === -1 || currentTagCount < maxTags;
  }

  static canCreateLink(user: User | null, currentLinkCount: number): boolean {
    const maxLinks = this.getMaxLinks(user);
    return maxLinks === -1 || currentLinkCount < maxLinks;
  }

  static canUseAI(user: User | null, currentUsage: number): boolean {
    const limit = this.getAIUsageLimit(user);
    return limit === -1 || limit === 999999 || currentUsage < limit;
  }

  // 機能チェック関数
  static hasCustomReminders(user: User | null): boolean {
    return this.getPlanLimits(user).hasCustomReminders;
  }

  static hasAdvancedSearch(user: User | null): boolean {
    return this.getPlanLimits(user).hasAdvancedSearch;
  }

  static hasDataExport(user: User | null): boolean {
    return this.getPlanLimits(user).hasDataExport;
  }

  // AI分析結果保存可能かチェック（全プランで可能）
  static canSaveAnalysis(user: User | null): boolean {
    // 全プランでAI分析結果の保存が可能
    return true;
  }

  // プラン表示名取得
  static getPlanDisplayName(user: User | null): string {
    if (this.isTestAccount(user)) {
      return 'テスト';
    }
    
    const plan = this.getUserPlan(user);
    const displayNames: Record<UserPlan, string> = {
      'free': 'Free',
      'plus': 'Plus', 
      'pro': 'Pro',
    };
    
    return displayNames[plan];
  }

  // プラン価格情報取得
  static getPlanPricing(plan: UserPlan) {
    return this.PLAN_PRICING[plan];
  }

  // プラン比較用の詳細情報取得
  static getPlanDetails(plan: UserPlan) {
    const limits = this.PLAN_LIMITS[plan];
    const pricing = this.PLAN_PRICING[plan];
    
    return {
      name: plan,
      displayName: plan.charAt(0).toUpperCase() + plan.slice(1),
      price: pricing.price,
      currency: pricing.currency,
      period: pricing.period,
      limits,
      features: this.getPlanFeaturesList(plan)
    };
  }

  // プラン機能リスト取得
  private static getPlanFeaturesList(plan: UserPlan): string[] {
    const limits = this.PLAN_LIMITS[plan];
    const features: string[] = [];
    
    // タグ制限
    if (limits.maxTags === -1) {
      features.push('タグ保存 無制限');
    } else {
      features.push(`タグ保存 ${limits.maxTags.toLocaleString()}個まで`);
    }
    
    // リンク制限
    if (limits.maxLinks === -1) {
      features.push('リンク保存 無制限');
    } else {
      features.push(`リンク保存 ${limits.maxLinks}個まで`);
    }
    
    // AI使用制限
    features.push(`AI解説機能 月に${limits.aiUsageLimit}回（1日${limits.aiDailyLimit}回まで）`);
    
    // 基本機能
    if (limits.hasBasicAlerts) {
      features.push('基本アラート機能');
    }
    
    // 追加機能
    if (limits.hasCustomReminders) {
      features.push('カスタムリマインド機能');
    }
    
    if (limits.hasAdvancedSearch) {
      features.push('高度な検索機能');
    }
    
    if (limits.hasDataExport) {
      features.push('データエクスポート機能');
    }
    
    return features;
  }

  // 制限超過メッセージ取得
  static getLimitExceededMessage(user: User | null, type: 'tags' | 'links' | 'ai' | 'ai_daily'): string {
    const plan = this.getUserPlan(user);
    const limits = this.getPlanLimits(user);
    
    switch (type) {
      case 'tags':
        return `タグの上限（${limits.maxTags.toLocaleString()}個）に達しました。上位プランにアップグレードしてください。`;
      case 'links':
        return `リンクの上限（${limits.maxLinks}個）に達しました。上位プランにアップグレードしてください。`;
      case 'ai':
        return `今月のAI解説回数（${limits.aiUsageLimit}回）に達しました。来月まで待つか、上位プランにアップグレードしてください。`;
      case 'ai_daily':
        return `今日のAI解説回数（${limits.aiDailyLimit}回）に達しました。明日まで待つか、上位プランにアップグレードしてください。`;
      default:
        return 'プランの制限に達しました。';
    }
  }

  // アップグレード推奨プラン取得
  static getRecommendedUpgrade(user: User | null): UserPlan | null {
    const currentPlan = this.getUserPlan(user);
    
    switch (currentPlan) {
      case 'free':
        return 'plus';
      case 'plus':
        return 'pro';
      case 'pro':
      default:
        return null;
    }
  }

  // プラン変更（将来の実装用）
  static async updateUserPlan(userId: string, newPlan: UserPlan): Promise<void> {
    // TODO: Firestore更新処理
    console.log(`プラン変更: ${userId} → ${newPlan}`);
  }

  // デバッグ情報取得
  static getDebugInfo(user: User | null) {
    const limits = this.getPlanLimits(user);
    return {
      actualPlan: this.getUserPlan(user),
      effectivePlan: this.getEffectivePlan(user),
      isTestAccount: this.isTestAccount(user),
      limits,
      displayName: this.getPlanDisplayName(user),
      canSaveAnalysis: this.canSaveAnalysis(user),
    };
  }
} 
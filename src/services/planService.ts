// プラン管理統一サービス
import { User, UserPlan } from '../types';
import { getTestAccountPlan, isTestAccount as isTestAccountUtil } from '../utils/testAccountUtils';

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
      aiUsageLimit: 50,
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
    'plus': { price: 480, currency: 'JPY', period: 'month' },
    'pro': { price: 1280, currency: 'JPY', period: 'month' },
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
    if (!timestamp) {
      console.log('🔍 getDateFromFirebaseTimestamp - timestamp is null/undefined');
      return null;
    }
    
    console.log('🔍 getDateFromFirebaseTimestamp - input:', timestamp, 'type:', typeof timestamp);
    
    try {
      // Firebase Timestamp (seconds + nanoseconds)
      if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp) {
        const date = new Date(timestamp.seconds * 1000);
        console.log('📅 Converted from seconds:', date);
        return date;
      } 
      // Firebase Timestamp with toDate method
      else if (timestamp && typeof timestamp === 'object' && 'toDate' in timestamp) {
        const date = timestamp.toDate();
        console.log('📅 Converted from toDate:', date);
        return date;
      } 
      // Already a Date object
      else if (timestamp instanceof Date) {
        console.log('📅 Already Date object:', timestamp);
        return timestamp;
      } 
      // String format
      else if (typeof timestamp === 'string') {
        const date = new Date(timestamp);
        console.log('📅 Converted from string:', date, 'isValid:', !isNaN(date.getTime()));
        return !isNaN(date.getTime()) ? date : null;
      }
      // Number (milliseconds)
      else if (typeof timestamp === 'number') {
        const date = new Date(timestamp);
        console.log('📅 Converted from number:', date);
        return date;
      }
      
      console.warn('🔍 Unsupported timestamp format:', timestamp);
      return null;
    } catch (error) {
      console.error('❌ Timestamp conversion error:', error, 'for timestamp:', timestamp);
      return null;
    }
  }

  // プラン開始日または最後の変更日を取得
  static getPlanStartDate(user: User | null): Date | null {
    if (!user) return null;

    console.log('🔍 getPlanStartDate - user:', user.uid, 'createdAt:', user.createdAt, 'subscription:', user.subscription);

    // テストアカウントの場合はアカウント作成日を返す
    if (this.isTestAccount(user)) {
      const date = this.getDateFromFirebaseTimestamp(user.createdAt) || new Date();
      console.log('📅 TestAccount date:', date);
      return date;
    }

    const subscription = user.subscription;
    if (!subscription) {
      // サブスクリプション情報がない場合はアカウント作成日を返す
      const date = this.getDateFromFirebaseTimestamp(user.createdAt) || new Date();
      console.log('📅 No subscription, using createdAt:', date);
      return date;
    }

    // ダウングレード予定がある場合の処理
    if (subscription.downgradeTo) {
      const now = new Date();
      const downgradeDate = this.getDateFromFirebaseTimestamp(subscription.downgradeEffectiveDate);
      
      // ダウングレード日が過ぎている場合はダウングレード日を返す
      if (downgradeDate && now >= downgradeDate) {
        console.log('📅 Using downgrade date:', downgradeDate);
        return downgradeDate;
      }
    }

    // プラン開始日を返す（Firebase Timestampの変換）
    const startDate = this.getDateFromFirebaseTimestamp(subscription.startDate);
    const finalDate = startDate || this.getDateFromFirebaseTimestamp(user.createdAt) || new Date();
    console.log('📅 Final date:', finalDate, 'from startDate:', startDate, 'createdAt conversion:', this.getDateFromFirebaseTimestamp(user.createdAt));
    return finalDate;
  }

  // AI使用回数のリセット日を計算
  static getAIUsageResetDate(user: User | null): Date | null {
    if (!user) return null;

    let startDate = this.getPlanStartDate(user);
    
    // startDateが無効な場合のフォールバック処理を改善
    if (!startDate || isNaN(startDate.getTime())) {
      console.log('📅 Invalid startDate, trying alternative approaches...');
      
      // フォールバック1: 現在の月の11日を基準にする（多くのユーザーが8/11登録のため）
      const now = new Date();
      let fallbackDate = new Date(now.getFullYear(), now.getMonth(), 11);
      
      // 今月の11日が過ぎていれば来月の11日
      if (fallbackDate <= now) {
        fallbackDate = new Date(now.getFullYear(), now.getMonth() + 1, 11);
      }
      
      console.log('📅 Using fallback date (11th of month):', fallbackDate);
      return fallbackDate;
    }

    console.log('📅 Start date for reset calculation:', startDate);
    const now = new Date();
    
    // 開始日と同じ日付の次の月を計算
    let nextReset = new Date(now.getFullYear(), now.getMonth(), startDate.getDate());
    console.log('📅 Initial next reset (same month):', nextReset);
    
    // 既に今月のリセット日を過ぎている場合は、来月の同日にする
    if (nextReset <= now) {
      nextReset = new Date(now.getFullYear(), now.getMonth() + 1, startDate.getDate());
      console.log('📅 Reset date passed, using next month:', nextReset);
    }
    
    // 月末の調整（例：1/31登録 → 2/28リセット）
    if (nextReset.getDate() !== startDate.getDate()) {
      // 指定した日付が存在しない場合（例：2/31）は月末に調整
      nextReset = new Date(nextReset.getFullYear(), nextReset.getMonth() + 1, 0);
      console.log('📅 Adjusted for month end:', nextReset);
    }
    
    console.log('📅 Final reset date:', nextReset);
    return nextReset;
  }

  // AI使用回数リセット日のテキストを生成
  static getAIUsageResetDateText(user: User | null): string {
    // テストアカウントは表示しない
    if (this.isTestAccount(user)) {
      return '';
    }

    const resetDate = this.getAIUsageResetDate(user);
    if (!resetDate) return '毎月1日にリセット';

    const options: Intl.DateTimeFormatOptions = { 
      month: 'long', 
      day: 'numeric' 
    };
    const formattedDate = resetDate.toLocaleDateString('ja-JP', options);
    return `${formattedDate}にリセット`;
  }

  // プラン開始日のテキストを生成（従来の機能）
  static getPlanStartDateText(user: User | null): string {
    const startDate = this.getPlanStartDate(user);
    if (!startDate) return '';

    // 日付が有効かチェック
    if (isNaN(startDate.getTime())) {
      console.error('Invalid startDate:', startDate, 'for user:', user?.uid);
      // フォールバック: 現在の日付を使用
      const fallbackDate = new Date();
      const options: Intl.DateTimeFormatOptions = { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      };
      const formattedDate = fallbackDate.toLocaleDateString('ja-JP', options);
      return `${formattedDate}から利用開始`;
    }

    // テストアカウントの場合は特別な表示
    if (this.isTestAccount(user)) {
      const options: Intl.DateTimeFormatOptions = { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      };
      const formattedDate = startDate.toLocaleDateString('ja-JP', options);
      return `${formattedDate}からテスト利用中`;
    }

    const subscription = user?.subscription;
    const now = new Date();
    
    // ダウングレード予定がある場合
    if (subscription?.downgradeTo) {
      const downgradeDate = this.getDateFromFirebaseTimestamp(subscription.downgradeEffectiveDate);
      
      if (downgradeDate && now >= downgradeDate) {
        // ダウングレード後
        const options: Intl.DateTimeFormatOptions = { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric' 
        };
        const formattedDate = downgradeDate.toLocaleDateString('ja-JP', options);
        return `${formattedDate}に${subscription.downgradeTo.toUpperCase()}プランに変更`;
      } else if (downgradeDate) {
        // ダウングレード予定
        const options: Intl.DateTimeFormatOptions = { 
          month: 'short', 
          day: 'numeric' 
        };
        const formattedDate = downgradeDate.toLocaleDateString('ja-JP', options);
        return `${formattedDate}に${subscription.downgradeTo.toUpperCase()}プランに変更予定`;
      }
    }

    // 通常のプラン開始日
    const options: Intl.DateTimeFormatOptions = { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    };
    const formattedDate = startDate.toLocaleDateString('ja-JP', options);
    const currentPlan = this.getUserPlan(user);
    
    if (currentPlan === 'free') {
      return `${formattedDate}から利用開始`;
    } else {
      return `${formattedDate}から${currentPlan.toUpperCase()}プラン`;
    }
  }

  // テストアカウント判定
  static isTestAccount(user: User | null): boolean {
    if (!user) return false;
    
    // testAccountUtils.tsの統一ロジックを使用
    return isTestAccountUtil({
      email: user.email,
      isTestAccount: user.isTestAccount,
      role: user.role
    });
  }

  // 実効プラン（テストアカウントは特別扱い）
  static getEffectivePlan(user: User | null): UserPlan {
    if (this.isTestAccount(user)) {
      // テストアカウントのプランタイプを取得
      const testPlan = getTestAccountPlan(user?.email || null);
      
      if (testPlan === 'unlimited') {
        return 'pro'; // 無制限テストアカウントは最高プランとして扱う
      } else if (testPlan === 'plus' || testPlan === 'pro') {
        return testPlan; // 指定されたプランを返す
      }
      
      // フォールバック：従来通り最高プランとして扱う
      return 'pro';
    }
    return this.getUserPlan(user);
  }

  // プラン制限取得
  static getPlanLimits(user: User | null): PlanLimits {
    const effectivePlan = this.getEffectivePlan(user);
    const limits = this.PLAN_LIMITS[effectivePlan];
    
    // テストアカウントは特別扱い
    if (this.isTestAccount(user)) {
      const testPlan = getTestAccountPlan(user?.email || null);
      
      // 無制限テストアカウントのみ制限を無制限に設定
      if (testPlan === 'unlimited') {
        return {
          ...limits,
          maxTags: -1, // 無制限
          maxLinks: -1, // 無制限
          aiUsageLimit: 999999, // 実質無制限
        };
      }
      
      // plus/proテストアカウントは通常の制限を適用
      return limits;
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
  static canSaveAnalysis(): boolean {
    // 全プランでAI分析結果の保存が可能
    return true;
  }

  // プラン表示名取得
  static getPlanDisplayName(user: User | null): string {
    if (this.isTestAccount(user)) {
      const testPlan = getTestAccountPlan(user?.email || null);
      
      if (testPlan === 'unlimited') {
        return 'テスト(無制限)';
      } else if (testPlan === 'plus') {
        return 'テスト(Plus)';
      } else if (testPlan === 'pro') {
        return 'テスト(Pro)';
      }
      
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
      canSaveAnalysis: this.canSaveAnalysis(),
    };
  }
} 
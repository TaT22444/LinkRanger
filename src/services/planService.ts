// プラン管理統一サービス
import { User, UserPlan } from '../types';
import { getTestAccountPlan, isTestAccount as isTestAccountUtil } from '../utils/testAccountUtils';

interface PlanLimits {
  maxTags: number;
  maxLinks: number;
  hasBasicAlerts: boolean;
  hasCustomReminders: boolean;
  hasAdvancedSearch: boolean;
  hasDataExport: boolean;
}

export class PlanService {
  
  // プラン制限の定義
  private static readonly PLAN_LIMITS: Record<UserPlan, PlanLimits> = {
    'free': {
      maxTags: 50,
      maxLinks: 5,
      hasBasicAlerts: true,
      hasCustomReminders: false,
      hasAdvancedSearch: false,
      hasDataExport: false,
    },
    'plus': {
      maxTags: 500,
      maxLinks: 50,
      hasBasicAlerts: true,
      hasCustomReminders: true,
      hasAdvancedSearch: false,
      hasDataExport: false,
    },
  };

  // プラン価格の定義
  private static readonly PLAN_PRICING = {
    'free': { price: 0, currency: 'JPY', period: 'month' },
    'plus': { price: 480, currency: 'JPY', period: 'month' },
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
      uid: user.uid,
      isTestAccount: user.isTestAccount,
      role: user.role
    });
  }

  // 実効プラン（テストアカウントは特別扱い）
  static getEffectivePlan(user: User | null): UserPlan {
    if (this.isTestAccount(user)) {
      // テストアカウントのプランタイプを取得
      const testPlan = getTestAccountPlan(user?.uid || null);
      
      if (testPlan === 'unlimited') {
        return 'plus'; // 無制限テストアカウントは最高プランとして扱う
      } else if (testPlan === 'plus') {
        return testPlan; // 指定されたプランを返す
      }
      
      // フォールバック：従来通り最高プランとして扱う
      return 'plus';
    }
    return this.getUserPlan(user);
  }

  // プラン制限取得
  static getPlanLimits(user: User | null): PlanLimits {
    const effectivePlan = this.getEffectivePlan(user);
    const limits = this.PLAN_LIMITS[effectivePlan];
    
    // テストアカウントは特別扱い
    if (this.isTestAccount(user)) {
      const testPlan = getTestAccountPlan(user?.uid || null);
      
      // 無制限テストアカウントのみ制限を無制限に設定
      if (testPlan === 'unlimited') {
        return {
          ...limits,
          maxTags: -1, // 無制限
          maxLinks: -1, // 無制限
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



  // 制限チェック関数
  static canCreateTag(user: User | null, currentTagCount: number): boolean {
    const maxTags = this.getMaxTags(user);
    return maxTags === -1 || currentTagCount < maxTags;
  }

  static canCreateLink(user: User | null, currentLinkCount: number): boolean {
    const maxLinks = this.getMaxLinks(user);
    return maxLinks === -1 || currentLinkCount < maxLinks;
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
      const testPlan = getTestAccountPlan(user?.uid || null);
      
      if (testPlan === 'unlimited') {
        return 'テスト(無制限)';
      } else if (testPlan === 'plus') {
        return 'テスト(Plus)';
      }
      
      return 'テスト';
    }
    
    const plan = this.getUserPlan(user);
    const displayNames: Record<UserPlan, string> = {
      'free': 'Free',
      'plus': 'Plus',
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
  static getLimitExceededMessage(user: User | null, type: 'tags' | 'links'): string {
    const limits = this.getPlanLimits(user);
    
    switch (type) {
      case 'tags':
        return `タグの上限（${limits.maxTags.toLocaleString()}個）に達しました。上位プランにアップグレードしてください。`;
      case 'links':
        return `リンクの上限（${limits.maxLinks}個）に達しました。上位プランにアップグレードしてください。`;
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
      default:
        return null;
    }
  }

  // プラン変更とダウングレード時のデータクリーンアップ
  static async updateUserPlan(userId: string, newPlan: UserPlan): Promise<void> {
    // TODO: Firestore更新処理
    console.log(`プラン変更: ${userId} → ${newPlan}`);
  }

  // ダウングレード時のデータクリーンアップ
  static async enforceNewPlanLimits(userId: string, newPlan: UserPlan, showNotification = true): Promise<{ deletedLinks: number; deletedTags: number }> {
    console.log('🔧 プラン制限の適用を開始:', { userId, newPlan });
    
    const newLimits = this.PLAN_LIMITS[newPlan];
    
    let deletedLinks = 0;
    let deletedTags = 0;
    
    try {
      // 1. 現在のリンク・タグ数を取得
      const { totalLinks, totalTags } = await this.getCurrentDataCounts(userId);
      
      console.log('📊 現在のデータ数:', { totalLinks, totalTags });
      console.log('📏 新しい制限:', { maxLinks: newLimits.maxLinks, maxTags: newLimits.maxTags });
      
      // 2. リンクの削除処理（新しいもの優先で残す）
      if (totalLinks > newLimits.maxLinks) {
        const excessCount = totalLinks - newLimits.maxLinks;
        console.log(`🗑️ リンク削除実行: ${excessCount}個を削除`);
        
        if (showNotification) {
          await this.showDeletionNotification('links', excessCount, newPlan);
        }
        
        deletedLinks = await this.deleteExcessLinks(userId, newLimits.maxLinks);
        console.log(`✅ リンク削除完了: ${deletedLinks}個削除`);
      }
      
      // 3. タグの削除処理（使用頻度優先で残す）
      if (totalTags > newLimits.maxTags) {
        const excessCount = totalTags - newLimits.maxTags;
        console.log(`🗑️ タグ削除実行: ${excessCount}個を削除`);
        
        if (showNotification) {
          await this.showDeletionNotification('tags', excessCount, newPlan);
        }
        
        deletedTags = await this.deleteExcessTags(userId, newLimits.maxTags);
        console.log(`✅ タグ削除完了: ${deletedTags}個削除`);
      }
      
      // 4. ユーザー統計の更新
      if (deletedLinks > 0 || deletedTags > 0) {
        const { userService } = await import('./userService');
        if (deletedLinks > 0) {
          await userService.updateUserStats(userId, { totalLinks: -deletedLinks });
        }
        if (deletedTags > 0) {
          await userService.updateUserStats(userId, { totalTags: -deletedTags });
        }
      }
      
      console.log('🎉 プラン制限適用完了:', { deletedLinks, deletedTags });
      
      // 5. 完了通知
      if (showNotification && (deletedLinks > 0 || deletedTags > 0)) {
        await this.showCompletionNotification(deletedLinks, deletedTags, newPlan);
      }
      
      return { deletedLinks, deletedTags };
      
    } catch (error) {
      console.error('❌ プラン制限適用エラー:', error);
      throw error;
    }
  }

  // ダウングレード時の個別削除処理

  // リンク削除（新しいもの優先で残す）
  private static async deleteExcessLinks(userId: string, keepCount: number): Promise<number> {
    try {
      const { getDocs, query, collection, where, orderBy } = await import('firebase/firestore');
      const { db } = await import('../config/firebase');
      const { batchService } = await import('./firestoreService');
      
      // 古いリンクから順に削除対象を取得
      const q = query(
        collection(db, 'links'),
        where('userId', '==', userId),
        orderBy('createdAt', 'asc') // 古い順（削除対象）
      );
      
      const snapshot = await getDocs(q);
      const totalLinks = snapshot.size;
      const deleteCount = totalLinks - keepCount;
      
      if (deleteCount <= 0) return 0;
      
      // 削除対象のリンクIDを取得
      const linksToDelete = snapshot.docs.slice(0, deleteCount).map(doc => doc.id);
      
      console.log(`🔗 リンク削除対象: ${linksToDelete.length}個`, {
        total: totalLinks,
        keep: keepCount,
        delete: deleteCount
      });
      
      // 一括削除実行
      await batchService.bulkDeleteLinks(linksToDelete, userId);
      
      return linksToDelete.length;
      
    } catch (error) {
      console.error('❌ リンク削除エラー:', error);
      throw error;
    }
  }

  // タグ削除（使用頻度優先で残す）
  private static async deleteExcessTags(userId: string, keepCount: number): Promise<number> {
    try {
      const { getDocs, query, collection, where, orderBy } = await import('firebase/firestore');
      const { db } = await import('../config/firebase');
      const { batchService } = await import('./firestoreService');
      
      // 使用頻度の低いタグから順に削除対象を取得
      const q = query(
        collection(db, 'tags'),
        where('userId', '==', userId),
        orderBy('linkCount', 'asc'), // 使用頻度の低い順（削除対象）
        orderBy('lastUsedAt', 'asc') // 同じlinkCountの場合は古い使用日順
      );
      
      const snapshot = await getDocs(q);
      const totalTags = snapshot.size;
      const deleteCount = totalTags - keepCount;
      
      if (deleteCount <= 0) return 0;
      
      // 削除対象のタグIDを取得
      const tagsToDelete = snapshot.docs.slice(0, deleteCount).map(doc => doc.id);
      
      console.log(`🏷️ タグ削除対象: ${tagsToDelete.length}個`, {
        total: totalTags,
        keep: keepCount,
        delete: deleteCount
      });
      
      // 一括削除実行
      await batchService.bulkDeleteTags(tagsToDelete, userId);
      
      return tagsToDelete.length;
      
    } catch (error) {
      console.error('❌ タグ削除エラー:', error);
      throw error;
    }
  }

  // 現在のデータ数を取得
  private static async getCurrentDataCounts(userId: string): Promise<{ totalLinks: number; totalTags: number }> {
    try {
      const { getDocs, query, collection, where, getCountFromServer } = await import('firebase/firestore');
      const { db } = await import('../config/firebase');
      
      // リンク数を取得
      const linksQuery = query(collection(db, 'links'), where('userId', '==', userId));
      const linksSnapshot = await getCountFromServer(linksQuery);
      const totalLinks = linksSnapshot.data().count;
      
      // タグ数を取得
      const tagsQuery = query(collection(db, 'tags'), where('userId', '==', userId));
      const tagsSnapshot = await getCountFromServer(tagsQuery);
      const totalTags = tagsSnapshot.data().count;
      
      return { totalLinks, totalTags };
      
    } catch (error) {
      // getCountFromServerが使えない場合のフォールバック

      
      const { getDocs, query, collection, where } = await import('firebase/firestore');
      const { db } = await import('../config/firebase');
      
      const [linksSnapshot, tagsSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'links'), where('userId', '==', userId))),
        getDocs(query(collection(db, 'tags'), where('userId', '==', userId)))
      ]);
      
      return {
        totalLinks: linksSnapshot.size,
        totalTags: tagsSnapshot.size
      };
    }
  }

  // ユーザー通知関数

  // 削除実行前の通知
  private static async showDeletionNotification(type: 'links' | 'tags', deleteCount: number, newPlan: UserPlan): Promise<void> {
    const { Alert } = await import('react-native');
    
    const typeText = type === 'links' ? 'リンク' : 'タグ';
    const planText = newPlan === 'free' ? 'Freeプラン' : 'Plusプラン';
    
    return new Promise((resolve) => {
      Alert.alert(
        `${planText}への変更`,
        `プラン制限により、${typeText}を${deleteCount}個削除します。\n\n${type === 'links' ? '新しいリンクが優先的に保持されます。' : '使用頻度の高いタグが優先的に保持されます。'}`,
        [
          {
            text: 'OK',
            onPress: () => resolve()
          }
        ]
      );
    });
  }

  // 削除完了後の通知
  private static async showCompletionNotification(deletedLinks: number, deletedTags: number, newPlan: UserPlan): Promise<void> {
    const { Alert } = await import('react-native');
    
    const planText = newPlan === 'free' ? 'Freeプラン' : 'Plusプラン';
    let message = `${planText}への変更が完了しました。\n\n`;
    
    if (deletedLinks > 0) {
      message += `• リンク ${deletedLinks}個を削除\n`;
    }
    if (deletedTags > 0) {
      message += `• タグ ${deletedTags}個を削除\n`;
    }
    
    message += '\n重要なデータは保持されています。';
    
    return new Promise((resolve) => {
      Alert.alert(
        'プラン変更完了',
        message,
        [
          {
            text: 'OK',
            onPress: () => resolve()
          }
        ]
      );
    });
  }

  // ダウングレード検出とクリーンアップの実行
  static async checkAndApplyDowngrade(user: User | null): Promise<{ applied: boolean; deletedLinks: number; deletedTags: number }> {
    if (!user?.subscription?.downgradeTo) {
      return { applied: false, deletedLinks: 0, deletedTags: 0 };
    }
    
    const now = new Date();
    const downgradeDate = this.getDateFromFirebaseTimestamp(user.subscription.downgradeEffectiveDate);
    
    // ダウングレード日が過ぎているかチェック
    if (downgradeDate && now >= downgradeDate) {
      const currentPlan = this.getUserPlan(user);
      const intendedPlan = user.subscription.downgradeTo;
      
      // まだダウングレード処理が実行されていない場合
      if (currentPlan !== intendedPlan) {
        console.log('🔄 ダウングレード実行:', { 
          userId: user.uid, 
          from: currentPlan, 
          to: intendedPlan, 
          downgradeDate 
        });
        
        const result = await this.enforceNewPlanLimits(user.uid, intendedPlan, true);
        
        // subscription情報を更新（ダウングレード完了をマーク）
        await this.markDowngradeCompleted(user.uid, intendedPlan);
        
        return { applied: true, ...result };
      }
    }
    
    return { applied: false, deletedLinks: 0, deletedTags: 0 };
  }

  // ダウングレード完了のマーク
  private static async markDowngradeCompleted(userId: string, newPlan: UserPlan): Promise<void> {
    try {
      const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('../config/firebase');
      
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        'subscription.plan': newPlan,
        'subscription.downgradeTo': null,
        'subscription.downgradeEffectiveDate': null,
        'subscription.lastUpdated': serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      console.log('✅ ダウングレード完了マーク:', { userId, newPlan });
      
    } catch (error) {
      console.error('❌ ダウングレード完了マークエラー:', error);
      throw error;
    }
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
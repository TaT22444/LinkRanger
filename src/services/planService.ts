// プラン管理統一サービス
import { User, UserPlan } from '../types';
import { 
  doc, 
  getDoc, 
  updateDoc, 
  serverTimestamp, 
  increment, 
  runTransaction,
  getDocs, 
  query, 
  collection, 
  where, 
  orderBy, 
  writeBatch, 
  getCountFromServer 
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Alert } from 'react-native';

interface PlanLimits {
  maxTags: number;
  maxLinks: number;
  maxLinksPerDay: number; // 1日のリンク追加制限
  hasBasicAlerts: boolean;
  hasCustomReminders: boolean;
  hasAdvancedSearch: boolean;
  hasDataExport: boolean;
}

export class PlanService {
  
  // プラン制限の定義
  private static readonly PLAN_LIMITS: Record<UserPlan, PlanLimits> = {
    'free': {
      maxTags: 15,
      maxLinks: 3,
      maxLinksPerDay: 5, // Freeプランの1日リンク追加制限
      hasBasicAlerts: true,
      hasCustomReminders: false,
      hasAdvancedSearch: false,
      hasDataExport: false,
    },
    'plus': {
      maxTags: 500,
      maxLinks: 50,
      maxLinksPerDay: 25, // Plusプランの1日リンク追加制限
      hasBasicAlerts: true,
      hasCustomReminders: true,
      hasAdvancedSearch: false,
      hasDataExport: false,
    },
  };

  // プラン価格の定義
  private static readonly PLAN_PRICING = {
    'free': { price: 0, currency: 'JPY', period: 'month' },
    'plus': { price: 500, currency: 'JPY', period: 'month' },
  };

  // AI使用量制限の定義
  private static readonly AI_USAGE_LIMITS: Record<UserPlan, { monthly: number; daily: number }> = {
    'free': { monthly: 3, daily: 5 },
    'plus': { monthly: 50, daily: 25 },
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
      return null;
    }
    

    
    try {
      // Firebase Timestamp (seconds + nanoseconds)
      if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp) {
        const date = new Date(timestamp.seconds * 1000);

        return date;
      } 
      // Firebase Timestamp with toDate method
      else if (timestamp && typeof timestamp === 'object' && 'toDate' in timestamp) {
        const date = timestamp.toDate();

        return date;
      } 
      // Already a Date object
      else if (timestamp instanceof Date) {

        return timestamp;
      } 
      // String format
      else if (typeof timestamp === 'string') {
        const date = new Date(timestamp);

        return !isNaN(date.getTime()) ? date : null;
      }
      // Number (milliseconds)
      else if (typeof timestamp === 'number') {
        const date = new Date(timestamp);

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

    const subscription = user.subscription;
    if (!subscription) {
      // サブスクリプション情報がない場合はアカウント作成日を返す
      const date = this.getDateFromFirebaseTimestamp(user.createdAt) || new Date();
      return date;
    }

    // ダウングレード予定がある場合の処理
    if (subscription.downgradeTo) {
      const now = new Date();
      const downgradeDate = this.getDateFromFirebaseTimestamp(subscription.downgradeEffectiveDate);
      
      // ダウングレード日が過ぎている場合はダウングレード日を返す
      if (downgradeDate && now >= downgradeDate) {
        return downgradeDate;
      }
    }

    // プラン開始日を返す（Firebase Timestampの変換）
    const startDate = this.getDateFromFirebaseTimestamp(subscription.startDate);
    const finalDate = startDate || this.getDateFromFirebaseTimestamp(user.createdAt) || new Date();
    return finalDate;
  }



  // プラン開始日のテキストを生成（従来の機能）
  static getPlanStartDateText(user: User | null): string {
    const startDate = this.getPlanStartDate(user);
    if (!startDate) return '不明';
    
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return '今日';
    if (diffDays === 1) return '昨日';
    if (diffDays < 7) return `${diffDays}日前`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}週間前`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}ヶ月前`;
    return `${Math.floor(diffDays / 365)}年前`;
  }

  // 次の更新日を取得
  static getNextRenewalDate(user: User | null): Date | null {
    if (!user?.subscription) return null;
    
    const subscription = user.subscription;
    
    // ダウングレード予定がある場合
    if (subscription.downgradeTo && subscription.downgradeEffectiveDate) {
      const downgradeDate = this.getDateFromFirebaseTimestamp(subscription.downgradeEffectiveDate);
      if (downgradeDate) return downgradeDate;
    }
    
    // 通常の更新日（有効期限）
    if (subscription.expirationDate) {
      const expirationDate = this.getDateFromFirebaseTimestamp(subscription.expirationDate);
      if (expirationDate) return expirationDate;
    }
    
    return null;
  }

  // 次の更新日の表示テキストを生成
  static getNextRenewalDateText(user: User | null): string {
    const nextDate = this.getNextRenewalDate(user);
    if (!nextDate) return '';
    
    const now = new Date();
    const diffTime = nextDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return '期限切れ';
    if (diffDays === 0) return '今日まで';
    if (diffDays === 1) return '明日まで';
    if (diffDays < 7) return `あと${diffDays}日`;
    if (diffDays < 30) return `あと${Math.floor(diffDays / 7)}週間`;
    if (diffDays < 365) return `あと${Math.floor(diffDays / 30)}ヶ月`;
    return `あと${Math.floor(diffDays / 365)}年`;
  }

  // 次の更新日の具体的な日付を取得（フォーマット済み）
  static getNextRenewalDateFormatted(user: User | null): string {
    const nextDate = this.getNextRenewalDate(user);
    if (!nextDate) return '';
    
    const now = new Date();
    const diffTime = nextDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return '期限切れ';
    
    // 年を除いた具体的な日付を返す
    const month = nextDate.getMonth() + 1;
    const day = nextDate.getDate();
    
    return `${month}月${day}日`;
  }

  // ダウングレード情報の表示テキストを生成
  static getDowngradeInfoText(user: User | null): string | null {
    // `downgradeTo`ではなく、`status`が`canceled`（自動更新オフ）の場合にメッセージを表示する
    if (user?.subscription?.status !== 'canceled') {
      // 既存のdowngradeToロジックも念のため残しておく
      if (!user?.subscription?.downgradeTo) return null;
    }
    
    const subscription = user.subscription;
    const nextDate = this.getNextRenewalDate(user);
    
    if (!nextDate) return null;
    
    const now = new Date();
    const diffTime = nextDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 0) return null;
    
    // 具体的な日付を含むメッセージを返す
    const formattedDate = this.getNextRenewalDateFormatted(user);
    return `${formattedDate}まで、Plusプランを利用可能です。`;
  }

  // 表示用プラン（ユーザーに表示されるプラン名）
  static getDisplayPlan(user: User | null): UserPlan {
    if (!user) return 'free';
    
    const subscription = user.subscription;
    if (!subscription) return 'free';
    
    // ダウングレードされたプランがある場合の処理
    if (subscription.downgradeTo) {
      // ダウングレードボタンを押した瞬間から、プラン表記はFreeプラン
      return subscription.downgradeTo; // Freeプランを表示
    }
    
    return subscription.plan || 'free';
  }

  // 実効プラン（機能制限に使用されるプラン）
  static getEffectivePlan(user: User | null): UserPlan {
    if (!user) return 'free';
    
    const subscription = user.subscription;
    if (!subscription) return 'free';
    
    // ダウングレードされたプランがある場合の処理
    if (subscription.downgradeTo) {
      const now = new Date();
      const downgradeDate = this.getDateFromFirebaseTimestamp(subscription.downgradeEffectiveDate);
      
      // ダウングレード有効日が過ぎていても、機能制限はPlusプランのまま
      // 次のサブスク支払日までPlusプランの機能を提供
      if (downgradeDate && now >= downgradeDate) {
        // 機能制限はPlusプランのまま（表示のみFree）
        return 'plus';
      }
      // まだダウングレード有効日前なら、現在のプランを継続
    }
    
    return subscription.plan || 'free';
  }

  // プラン制限取得
  static getPlanLimits(user: User | null): PlanLimits {
    const effectivePlan = this.getEffectivePlan(user);
    const limits = this.PLAN_LIMITS[effectivePlan];
    

    
    return limits;
  }

  // 個別制限チェック関数
  static getMaxTags(user: User | null): number {
    return this.getPlanLimits(user).maxTags;
  }

  static getMaxLinks(user: User | null): number {
    return this.getPlanLimits(user).maxLinks;
  }

  static getMaxLinksPerDay(user: User | null): number {
    return this.getPlanLimits(user).maxLinksPerDay;
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

  // 1日リンク追加制限のチェック（日付リセット機能付き）
  static canCreateLinkPerDay(user: User | null, todayLinkCount: number): boolean {
    const maxLinksPerDay = this.getMaxLinksPerDay(user);
    return maxLinksPerDay === -1 || todayLinkCount < maxLinksPerDay;
  }

  // ユーザーの現地時間での今日の日付を取得
  private static getTodayDateString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // 今日のリンク追加数を取得（日付リセット機能付き）
  static async getTodayLinksAddedCount(userId: string): Promise<number> {
    try {
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        return 0;
      }
      
      const userData = userDoc.data();
      const stats = userData.stats || {};
      const today = this.getTodayDateString(); // ユーザーのローカルタイムゾーンで日付取得
      const lastLinkAddedDate = stats.lastLinkAddedDate;
      
      // 日付が変わった場合はリセット
      if (lastLinkAddedDate !== today) {
        // 今日の日付でリセット
        await updateDoc(userRef, {
          'stats.todayLinksAdded': 0,
          'stats.lastLinkAddedDate': today,
          updatedAt: serverTimestamp()
        });
        return 0;
      }
      
      return stats.todayLinksAdded || 0;
      
    } catch (error) {
      console.error('❌ 今日のリンク追加数取得エラー:', error);
      return 0; // エラー時は0を返す
    }
  }

  // 今日のリンク追加数を増加（競合状態に対応）
  static async incrementTodayLinksAdded(userId: string): Promise<void> {
    try {
      const userRef = doc(db, 'users', userId);
      const today = this.getTodayDateString(); // ユーザーのローカルタイムゾーンで日付取得
      
      // トランザクションを使用して競合状態を防ぐ
      await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        
        if (!userDoc.exists()) {
          // ユーザードキュメントが存在しない場合は作成
          transaction.set(userRef, {
            stats: {
              todayLinksAdded: 1,
              lastLinkAddedDate: today,
              totalLinks: 1,
              totalTags: 0,
            },
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          return;
        }
        
        const userData = userDoc.data();
        const stats = userData.stats || {};
        const lastLinkAddedDate = stats.lastLinkAddedDate;
        
        // 日付が変わった場合はリセット
        if (lastLinkAddedDate !== today) {
          transaction.update(userRef, {
            'stats.todayLinksAdded': 1,
            'stats.lastLinkAddedDate': today,
            updatedAt: serverTimestamp()
          });
        } else {
          transaction.update(userRef, {
            'stats.todayLinksAdded': increment(1),
            'stats.lastLinkAddedDate': today,
            updatedAt: serverTimestamp()
          });
        }
      });
      

      
    } catch (error) {
      console.error('❌ 今日のリンク追加数増加エラー:', error);
      throw error;
    }
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



  // プラン表示名取得
  static getPlanDisplayName(user: User | null): string {
    const plan = this.getDisplayPlan(user);
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

    if (limits.maxLinksPerDay !== -1) {
      features.push(`1日あたりのリンク追加 ${limits.maxLinksPerDay}個まで`);
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
  static getLimitExceededMessage(user: User | null, type: 'tags' | 'links' | 'linksPerDay'): string {
    const limits = this.getPlanLimits(user);
    
    switch (type) {
      case 'tags':
        return `タグの上限（${limits.maxTags.toLocaleString()}個）に達しました。上位プランにアップグレードしてください。`;
      case 'links':
        return `リンクの上限（${limits.maxLinks}個）に達しました。上位プランにアップグレードしてください。`;
      case 'linksPerDay':
        return `1日あたりのリンク追加上限（${limits.maxLinksPerDay}個）に達しました。上位プランにアップグレードしてください。`;
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
  }

  // ダウングレード時のデータクリーンアップ
  static async enforceNewPlanLimits(userId: string, newPlan: UserPlan, showNotification = true): Promise<{ deletedLinks: number; deletedTags: number }> {
    const newLimits = this.PLAN_LIMITS[newPlan];
    
    let deletedLinks = 0;
    let deletedTags = 0;
    
    try {
      // 1. 現在のリンク・タグ数を取得
      const { totalLinks, totalTags } = await this.getCurrentDataCounts(userId);
      
      // 2. リンクの削除処理（新しいもの優先で残す）
      if (totalLinks > newLimits.maxLinks) {
        const excessCount = totalLinks - newLimits.maxLinks;
        
        try {
          if (showNotification) {
            await this.showDeletionNotification('links', excessCount, newPlan);
          }
          
          deletedLinks = await this.deleteExcessLinks(userId, newLimits.maxLinks);
        } catch (error) {
          console.error('❌ リンク削除処理でエラー:', error);
          throw error;
        }
      }
      
      // 3. タグの削除処理（使用頻度優先で残す）
      if (totalTags > newLimits.maxTags) {
        const excessCount = totalTags - newLimits.maxTags;
        
        try {
          if (showNotification) {
            await this.showDeletionNotification('tags', excessCount, newPlan);
          }
          
          deletedTags = await this.deleteExcessTags(userId, newLimits.maxTags);
        } catch (error) {
          console.error('❌ タグ削除処理でエラー:', error);
          throw error;
        }
      }
      
      // 4. タグ削除後のクリーンアップ：削除されたタグのIDをリンクから除去
      if (deletedTags > 0) {
        try {
          await this.cleanupDeletedTagReferences(userId);
        } catch (error) {
          console.error('❌ タグ参照のクリーンアップエラー:', error);
          // クリーンアップエラーは致命的ではないので、処理を続行
        }
      }
      
      // 4. ユーザー統計の更新（統計更新は後で別途実行）
      if (deletedLinks > 0 || deletedTags > 0) {
        // 統計更新は削除処理完了後に別途実行
      }
      
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
      // インデックスなしでクエリを実行
      const q = query(
        collection(db, 'links'),
        where('userId', '==', userId)
      );
      
      const snapshot = await getDocs(q);
      const totalLinks = snapshot.size;
      const deleteCount = totalLinks - keepCount;
      
      if (deleteCount <= 0) return 0;
      
      // メモリ上でソートして古いリンクから削除対象を取得
      const sortedDocs = snapshot.docs.sort((a, b) => {
        const aCreatedAt = a.data().createdAt?.toDate?.() || new Date(0);
        const bCreatedAt = b.data().createdAt?.toDate?.() || new Date(0);
        return aCreatedAt.getTime() - bCreatedAt.getTime(); // 古い順
      });
      
      // 削除対象のリンクIDを取得（古いものから）
      const linksToDelete = sortedDocs.slice(0, deleteCount).map(doc => doc.id);
      

      
      // 直接削除処理を実行
      const batch = writeBatch(db);
      linksToDelete.forEach(linkId => {
        const linkRef = doc(db, 'links', linkId);
        batch.delete(linkRef);
      });
      
      await batch.commit();

      
      return linksToDelete.length;
      
    } catch (error) {
      console.error('❌ リンク削除エラー:', error);
      throw error;
    }
  }

  // タグ削除（使用頻度優先で残す）
  private static async deleteExcessTags(userId: string, keepCount: number): Promise<number> {
    try {
      // インデックスなしでクエリを実行
      const q = query(
        collection(db, 'tags'),
        where('userId', '==', userId)
      );
      
      const snapshot = await getDocs(q);
      const totalTags = snapshot.size;
      const deleteCount = totalTags - keepCount;
      
      if (deleteCount <= 0) return 0;
      
      // メモリ上でソートして使用頻度の低いタグから削除対象を取得
      const sortedDocs = snapshot.docs.sort((a, b) => {
        const aData = a.data();
        const bData = b.data();
        
        // まずlinkCountで比較
        const aLinkCount = aData.linkCount || 0;
        const bLinkCount = bData.linkCount || 0;
        
        if (aLinkCount !== bLinkCount) {
          return aLinkCount - bLinkCount; // 使用頻度の低い順
        }
        
        // linkCountが同じ場合はlastUsedAtで比較
        const aLastUsedAt = aData.lastUsedAt?.toDate?.() || new Date(0);
        const bLastUsedAt = bData.lastUsedAt?.toDate?.() || new Date(0);
        return aLastUsedAt.getTime() - bLastUsedAt.getTime(); // 古い順
      });
      
      // 削除対象のタグIDを取得（使用頻度の低いものから）
      const tagsToDelete = sortedDocs.slice(0, deleteCount).map(doc => doc.id);
      

      
      // 直接削除処理を実行
      const batch = writeBatch(db);
      tagsToDelete.forEach(tagId => {
        const tagRef = doc(db, 'tags', tagId);
        batch.delete(tagRef);
      });
      
      await batch.commit();

      
      return tagsToDelete.length;
      
    } catch (error) {
      console.error('❌ タグ削除エラー:', error);
      throw error;
    }
  }

  // 現在のデータ数を取得
  private static async getCurrentDataCounts(userId: string): Promise<{ totalLinks: number; totalTags: number }> {
    try {
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
    // サーバーサイドのWebhook処理に一本化されたため、クライアントサイドの処理は原則として不要。
    // Webhookの遅延などを考慮したフェイルセーフとして残しているが、一旦ログ出力に留める。
    if (user?.subscription?.downgradeTo) {
        // [DEPRECATED] Client-side downgrade check triggered. This process is now handled by the server.
    }
    return { applied: false, deletedLinks: 0, deletedTags: 0 };
    /*
    if (!user?.subscription?.downgradeTo) {
      return { applied: false, deletedLinks: 0, deletedTags: 0 };
    }
    
    const subscription = user.subscription;
    const now = new Date();
    const downgradeDate = this.getDateFromFirebaseTimestamp(subscription.downgradeEffectiveDate);
    
    // 🔧 ダウングレード処理が既に完了している場合はスキップ
    if (subscription.downgradeCompletedAt) {
      return { applied: false, deletedLinks: 0, deletedTags: 0 };
    }
    
    // ダウングレード日が過ぎているかチェック
    if (downgradeDate && now >= downgradeDate) {
      const intendedPlan = subscription.downgradeTo;
      
      // intendedPlanが存在し、まだダウングレード処理が実行されていない場合
      if (intendedPlan && subscription.plan !== intendedPlan) {

        
        const result = await this.enforceNewPlanLimits(user.uid, intendedPlan, true);
        
        // 🔧 強制的なタグ参照クリーンアップ（削除処理が不要でも実行）
        try {
          await this.cleanupDeletedTagReferences(user.uid);
        } catch (error) {
          console.error('❌ 強制タグ参照クリーンアップエラー:', error);
        }
        
        // 🔧 権限エラー回避のため、ダウングレード完了マークを一時的にスキップ
        try {
          await this.markDowngradeCompleted(user.uid, intendedPlan);
        } catch (error) {
          console.warn('⚠️ ダウングレード完了マークをスキップ（権限エラー）:', error);
          // 権限エラーが発生しても処理を続行
        }
        
        return { applied: true, ...result };
      }
    }
    
    return { applied: false, deletedLinks: 0, deletedTags: 0 };
    */
  }

  // 削除されたタグのIDをリンクからクリーンアップ
  private static async cleanupDeletedTagReferences(userId: string): Promise<void> {
    try {
      // 1. 現在存在するタグIDのセットを取得
      const tagsQuery = query(collection(db, 'tags'), where('userId', '==', userId));
      const tagsSnapshot = await getDocs(tagsQuery);
      const existingTagIds = new Set(tagsSnapshot.docs.map(doc => doc.id));
      

      
      // 2. リンクから削除されたタグのIDを除去
      const linksQuery = query(collection(db, 'links'), where('userId', '==', userId));
      const linksSnapshot = await getDocs(linksQuery);
      
      const batch = writeBatch(db);
      let updatedLinks = 0;
      
      linksSnapshot.docs.forEach(linkDoc => {
        const linkData = linkDoc.data();
        const tagIds = linkData.tagIds || [];
        
        // 存在しないタグIDをフィルタリング
        const validTagIds = tagIds.filter((tagId: string) => existingTagIds.has(tagId));
        
        // タグIDが変更された場合のみ更新
        if (validTagIds.length !== tagIds.length) {
          const linkRef = doc(db, 'links', linkDoc.id);
          batch.update(linkRef, { tagIds: validTagIds });
          updatedLinks++;
          

        }
      });
      
      if (updatedLinks > 0) {
        await batch.commit();
      }
    } catch (error) {
      console.error('❌ タグ参照クリーンアップエラー:', error);
      throw error;
    }
  }

  // ダウングレード完了のマーク
  private static async markDowngradeCompleted(userId: string, newPlan: UserPlan): Promise<void> {
    try {

      
      const userRef = doc(db, 'users', userId);
      
      // 🔧 ダウングレード完了を確実にマーク（これによりuseEffectの依存関係が変わる）
      const updateData = {
        'subscription.plan': newPlan,
        'subscription.downgradeTo': null,
        'subscription.downgradeEffectiveDate': null,
        'subscription.downgradeCompletedAt': serverTimestamp(), // 完了時刻を記録
        'subscription.lastUpdated': serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      

      
      await updateDoc(userRef, updateData);
      

      
    } catch (error) {
      console.error('❌ ダウングレード完了マークエラー:', error);
      console.error('❌ エラー詳細:', {
        userId,
        newPlan,
        errorCode: (error as any)?.code,
        errorMessage: (error as any)?.message,
        errorDetails: error
      });
      throw error;
    }
  }

  // デバッグ情報取得
  static getDebugInfo(user: User | null) {
    const limits = this.getPlanLimits(user);
    return {
      actualPlan: this.getUserPlan(user),
      displayPlan: this.getDisplayPlan(user),
      effectivePlan: this.getEffectivePlan(user),
      limits,
      displayName: this.getPlanDisplayName(user),
    };
  }

  // AI使用量制限取得
  static getAIUsageLimit(user: { subscription: { plan: UserPlan } }): number {
    const plan = user.subscription.plan;
    return this.AI_USAGE_LIMITS[plan]?.monthly || 5;
  }

  // AI日次使用量制限取得
  static getAIDailyLimit(user: { subscription: { plan: UserPlan } }): number {
    const plan = user.subscription.plan;
    return this.AI_USAGE_LIMITS[plan]?.daily || 5;
  }
} 
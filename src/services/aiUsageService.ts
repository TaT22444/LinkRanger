import {
  collection,
  doc,
  addDoc,
  updateDoc,
  setDoc, // setDocを追加
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  increment,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { UserPlan } from '../types';
import { PlanService } from './planService';

// AI使用量記録型
interface AIUsageRecord {
  id?: string;
  userId: string;
  type: 'summary' | 'tags' | 'analysis';
  tokensUsed: number;
  cost: number; // USD
  timestamp: Date;
  month: string; // YYYY-MM形式
  day: string;   // YYYY-MM-DD形式
}

// 月次使用量サマリー型
interface MonthlyUsage {
  userId: string;
  month: string;
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  lastUpdated: Date;
}

export class AIUsageManager {
  private static instance: AIUsageManager;
  
  static getInstance(): AIUsageManager {
    if (!this.instance) {
      this.instance = new AIUsageManager();
    }
    return this.instance;
  }

  // 使用可能かチェック
  async checkUsageLimit(
    userId: string, 
    plan: UserPlan, 
    type: 'summary' | 'tags' | 'analysis'
  ): Promise<{ allowed: boolean; reason?: string }> {
    const monthlyLimit = PlanService.getAIUsageLimit({ subscription: { plan } } as any);
    const dailyLimit = PlanService.getAIDailyLimit({ subscription: { plan } } as any);

    // 月次制限チェック
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const monthlyUsage = await this.getMonthlyUsage(userId, currentMonth);
    
    if (monthlyUsage.totalRequests >= monthlyLimit) {
      return {
        allowed: false,
        reason: `月間利用制限に達しました（${monthlyLimit}回/月）`
      };
    }

    // 日次制限チェック
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const dailyUsage = await this.getDailyUsage(userId, today);
    
    if (dailyUsage >= dailyLimit) {
      return {
        allowed: false,
        reason: `日間利用制限に達しました（${dailyLimit}回/日）`
      };
    }

    return { allowed: true };
  }

  // 使用量を記録
  async recordUsage(
    userId: string,
    type: 'summary' | 'tags' | 'analysis',
    tokensUsed: number,
    cost: number
  ): Promise<void> {
    const now = new Date();
    const month = now.toISOString().slice(0, 7);
    const day = now.toISOString().slice(0, 10);

    // 個別使用記録
    const usageRecord: Omit<AIUsageRecord, 'id'> = {
      userId,
      type,
      tokensUsed,
      cost,
      timestamp: now,
      month,
      day,
    };

    const usageRef = collection(db, 'aiUsage');
    await addDoc(usageRef, {
      ...usageRecord,
      timestamp: serverTimestamp(),
    });

    // 月次サマリー更新
    await this.updateMonthlySummary(userId, month, tokensUsed, cost);
  }

  // 月次使用量を取得
  private async getMonthlyUsage(userId: string, month: string): Promise<MonthlyUsage> {
    const summaryRef = doc(db, 'aiUsageSummary', `${userId}_${month}`);
    const summaryDoc = await getDoc(summaryRef);
    
    if (summaryDoc.exists()) {
      const data = summaryDoc.data();
      return {
        userId,
        month,
        totalRequests: data.totalRequests || 0,
        totalTokens: data.totalTokens || 0,
        totalCost: data.totalCost || 0,
        lastUpdated: data.lastUpdated?.toDate() || new Date(),
      };
    }

    return {
      userId,
      month,
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      lastUpdated: new Date(),
    };
  }

  // 日次使用量を取得
  private async getDailyUsage(userId: string, day: string): Promise<number> {
    const q = query(
      collection(db, 'aiUsage'),
      where('userId', '==', userId),
      where('day', '==', day)
    );
    
    const snapshot = await getDocs(q);
    return snapshot.size;
  }

  // 月次サマリーを更新
  private async updateMonthlySummary(
    userId: string,
    month: string,
    tokensUsed: number,
    cost: number
  ): Promise<void> {
    const summaryRef = doc(db, 'aiUsageSummary', `${userId}_${month}`);
    
    try {
      await updateDoc(summaryRef, {
        totalRequests: increment(1),
        totalTokens: increment(tokensUsed),
        totalCost: increment(cost),
        lastUpdated: serverTimestamp(),
      });
    } catch (error) {
      // ドキュメントが存在しない場合は新規作成
      if (error && typeof error === 'object' && 'code' in error && error.code === 'not-found') {
        await setDoc(summaryRef, {
          userId,
          month,
          totalRequests: 1,
          totalTokens: tokensUsed,
          totalCost: cost,
          lastUpdated: serverTimestamp(),
        });
      } else {
        throw error;
      }
    }
  }

  // ユーザーの使用状況を取得（ダッシュボード用）
  async getUserUsageStats(userId: string): Promise<{
    currentMonth: MonthlyUsage;
    todayUsage: number;
    recentUsage: AIUsageRecord[];
    analysisUsage: number;
  }> {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const today = new Date().toISOString().slice(0, 10);

    const [monthlyUsage, dailyUsage, recentUsage] = await Promise.all([
      this.getMonthlyUsage(userId, currentMonth),
      this.getDailyUsage(userId, today),
      this.getRecentUsage(userId, 10)
    ]);

    // 月間のAI解説機能（analysis）の使用回数を正確に取得
    const analysisUsage = await this.getMonthlyAnalysisUsage(userId, currentMonth);

    return {
      currentMonth: monthlyUsage,
      todayUsage: dailyUsage,
      recentUsage,
      analysisUsage,
    };
  }

  // 月間のAI解説機能使用回数を取得
  private async getMonthlyAnalysisUsage(userId: string, month: string): Promise<number> {
    const q = query(
      collection(db, 'aiUsage'),
      where('userId', '==', userId),
      where('type', '==', 'analysis'),
      where('month', '==', month)
    );

    const snapshot = await getDocs(q);
    return snapshot.size;
  }

  // 最近の使用履歴を取得
  private async getRecentUsage(userId: string, limitCount: number): Promise<AIUsageRecord[]> {
    const q = query(
      collection(db, 'aiUsage'),
      where('userId', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        timestamp: data.timestamp?.toDate() || new Date(),
      } as AIUsageRecord;
    });
  }

  // プラン制限情報を取得
  getPlanLimits(plan: UserPlan) {
    const monthlyLimit = PlanService.getAIUsageLimit({ subscription: { plan } } as any);
    const dailyLimit = PlanService.getAIDailyLimit({ subscription: { plan } } as any);
    return { monthly: monthlyLimit, daily: dailyLimit };
  }

  // 使用量に基づく推奨アクション
  getUsageRecommendations(usage: MonthlyUsage, plan: UserPlan): string[] {
    const monthlyLimit = PlanService.getAIUsageLimit({ subscription: { plan } } as any);
    const usagePercentage = (usage.totalRequests / monthlyLimit) * 100;
    const recommendations: string[] = [];

    if (usagePercentage > 80) {
      recommendations.push('月間利用制限の80%に達しています。');
          if (plan === 'free') {
      recommendations.push('Plusプランへのアップグレードをご検討ください。');
    }
    }

    if (usage.totalCost > 10) {
      recommendations.push('月間コストが$10を超えています。');
    }

    if (usagePercentage > 50 && plan === 'free') {
      recommendations.push('より多くのAI機能をご利用いただくには、Proプランがお得です。');
    }

    return recommendations;
  }
}

// シングルトンインスタンスをエクスポート
export const aiUsageManager = AIUsageManager.getInstance(); 
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
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

// Firebase Functions呼び出し用の型定義
interface CheckUsageLimitRequest {
  userId: string;
  plan: UserPlan;
  type: 'summary' | 'tags' | 'analysis';
}

interface CheckUsageLimitResponse {
  allowed: boolean;
  reason?: string;
}

interface RecordUsageRequest {
  userId: string;
  type: 'summary' | 'tags' | 'analysis';
  tokensUsed: number;
  cost: number;
}

interface GetUsageStatsResponse {
  currentMonth: {
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
  };
  todayUsage: number;
  analysisUsage: number;
}

// Firebase Functions
const checkAIUsageLimitFn = httpsCallable<CheckUsageLimitRequest, CheckUsageLimitResponse>(functions, 'checkAIUsageLimit');
const recordAIUsageFn = httpsCallable<RecordUsageRequest, {success: boolean}>(functions, 'recordAIUsage');
const getAIUsageStatsFn = httpsCallable<{}, GetUsageStatsResponse>(functions, 'getAIUsageStats');

export class AIUsageManager {
  private static instance: AIUsageManager;
  
  static getInstance(): AIUsageManager {
    if (!this.instance) {
      this.instance = new AIUsageManager();
    }
    return this.instance;
  }

  // 使用可能かチェック（サーバー側で実行）
  async checkUsageLimit(
    userId: string, 
    plan: UserPlan, 
    type: 'summary' | 'tags' | 'analysis'
  ): Promise<{ allowed: boolean; reason?: string }> {
    try {
      const result = await checkAIUsageLimitFn({ userId, plan, type });
      return result.data;
    } catch (error) {
      console.error('❌ AI使用制限チェックエラー（サーバー側）:', error);
      // エラー時はとりあえず制限に引っかかったものとして扱う
      return {
        allowed: false,
        reason: 'サーバーエラーが発生しました。しばらく時間をおいてから再度お試しください。'
      };
    }
  }

  // 使用量を記録（サーバー側で実行）
  async recordUsage(
    userId: string,
    type: 'summary' | 'tags' | 'analysis',
    tokensUsed: number,
    cost: number
  ): Promise<void> {
    try {
      const result = await recordAIUsageFn({ userId, type, tokensUsed, cost });
    } catch (error) {
      console.error('❌ AI使用量記録エラー（サーバー側）:', error);
      throw error;
    }
  }

  // ユーザーの使用状況を取得（サーバー側で実行）
  async getUserUsageStats(userId: string): Promise<{
    currentMonth: MonthlyUsage;
    todayUsage: number;
    recentUsage: AIUsageRecord[];
    analysisUsage: number;
  }> {
    try {
      const result = await getAIUsageStatsFn({});
      const stats = result.data;
      
      // レスポンス形式を既存のインターフェースに合わせる
      return {
        currentMonth: {
          userId,
          month: new Date().toISOString().slice(0, 7),
          totalRequests: stats.currentMonth.totalRequests,
          totalTokens: stats.currentMonth.totalTokens,
          totalCost: stats.currentMonth.totalCost,
          lastUpdated: new Date(),
        },
        todayUsage: stats.todayUsage,
        recentUsage: [], // サーバー側では最近の使用履歴は取得しない（パフォーマンス向上のため）
        analysisUsage: stats.analysisUsage,
      };
    } catch (error) {
      console.error('❌ AI使用量統計取得エラー（サーバー側）:', error);
      // エラー時はデフォルト値を返す
      return {
        currentMonth: {
          userId,
          month: new Date().toISOString().slice(0, 7),
          totalRequests: 0,
          totalTokens: 0,
          totalCost: 0,
          lastUpdated: new Date(),
        },
        todayUsage: 0,
        recentUsage: [],
        analysisUsage: 0,
      };
    }
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
      recommendations.push('より多くのAI機能をご利用いただくには、Plusプランがお得です。');
    }

    return recommendations;
  }
}

// シングルトンインスタンスをエクスポート
export const aiUsageManager = AIUsageManager.getInstance(); 
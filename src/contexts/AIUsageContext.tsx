import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { AIUsageManager } from '../services/aiUsageService';
import { PlanService } from '../services/planService';
import { isUnlimitedTestAccount } from '../utils/testAccountUtils';

interface AIUsageState {
  used: number;
  limit: number;
  remaining: number;
  renewalDate: Date | null;
  isLoading: boolean;
  lastUpdated: Date | null;
}

interface AIUsageContextType extends AIUsageState {
  refreshUsage: () => Promise<void>;
  incrementUsage: () => void;
  canUseAI: boolean;
}

const AIUsageContext = createContext<AIUsageContextType | undefined>(undefined);

interface AIUsageProviderProps {
  children: ReactNode;
}

export const AIUsageProvider: React.FC<AIUsageProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const [state, setState] = useState<AIUsageState>({
    used: 0,
    limit: 0,
    remaining: 0,
    renewalDate: null,
    isLoading: false,
    lastUpdated: null,
  });

  // リセット日の計算
  const calculateRenewalDate = (user: any): Date | null => {
    if (!user) return null;
    
    let baseDate = user.subscription?.startDate || user.createdAt;
    
    // Firebase Timestampの変換処理
    if (user.subscription?.startDate && typeof user.subscription.startDate === 'object') {
      if ('seconds' in user.subscription.startDate) {
        baseDate = new Date((user.subscription.startDate as any).seconds * 1000);
      } else if ('toDate' in user.subscription.startDate) {
        baseDate = (user.subscription.startDate as any).toDate();
      }
    }
    
    if (!baseDate) return null;
    
    let startDate: Date;
    try {
      if (baseDate instanceof Date) {
        startDate = new Date(baseDate);
      } else if (typeof baseDate === 'string') {
        startDate = new Date(baseDate);
      } else if (baseDate && typeof baseDate === 'object' && 'seconds' in baseDate) {
        startDate = new Date((baseDate as any).seconds * 1000);
      } else if (baseDate && typeof baseDate === 'object' && 'toDate' in baseDate) {
        startDate = (baseDate as any).toDate();
      } else {
        throw new Error(`Unsupported date format: ${typeof baseDate}`);
      }
      
      if (isNaN(startDate.getTime())) {
        throw new Error('Invalid date');
      }
    } catch (error) {
      console.error('❌ 日付変換エラー:', error);
      return null;
    }
    
    const nextRenewal = new Date(startDate);
    const now = new Date();
    const startDay = startDate.getDate();
    
    nextRenewal.setMonth(startDate.getMonth() + 1);
    
    if (nextRenewal.getDate() !== startDay) {
      nextRenewal.setDate(0);
    }
    
    while (nextRenewal <= now) {
      const targetDay = startDay;
      nextRenewal.setMonth(nextRenewal.getMonth() + 1);
      
      if (nextRenewal.getDate() !== targetDay) {
        nextRenewal.setDate(0);
      }
    }
    
    return nextRenewal;
  };

  // AI使用状況の取得
  const refreshUsage = async () => {
    if (!user?.uid) return;
    
    setState(prev => ({ ...prev, isLoading: true }));
    
    try {
      const isTestAccount = PlanService.isTestAccount(user);
      const planLimits = PlanService.getPlanLimits(user);
      const limit = planLimits.aiUsageLimit;
      const renewalDate = calculateRenewalDate(user);
      
      console.log('🔄 AIUsageContext: 使用状況更新開始', {
        userId: user.uid,
        isTestAccount,
        limit,
        renewalDate: renewalDate?.toISOString(),
        now: new Date().toISOString()
      });
      
      if (isUnlimitedTestAccount(user?.email || null)) {
        setState({
          used: 0,
          limit: 999999,
          remaining: 999999,
          renewalDate,
          isLoading: false,
          lastUpdated: new Date(),
        });
        return;
      }
      
      const aiUsageManager = AIUsageManager.getInstance();
      
      // 従来の使用量取得を使用（正確な値を取得するため）
      const usageStats = await aiUsageManager.getUserUsageStats(user.uid);
      const used = usageStats.currentMonth.totalRequests || 0; // 実際の使用回数
      const remaining = Math.max(0, limit - used);
      
      console.log('✅ AIUsageContext: 使用状況更新完了', {
        userId: user.uid,
        used,
        limit,
        remaining,
        renewalDate: renewalDate?.toISOString(),
        usageStats: {
          analysisUsage: usageStats.analysisUsage
        }
      });
      
      setState({
        used,
        limit,
        remaining,
        renewalDate,
        isLoading: false,
        lastUpdated: new Date(),
      });
      
    } catch (error) {
      console.error('❌ AI使用状況取得エラー:', error);
      const planLimits = PlanService.getPlanLimits(user);
      const limit = planLimits.aiUsageLimit;
      setState({
        used: 0,
        limit,
        remaining: limit,
        renewalDate: calculateRenewalDate(user),
        isLoading: false,
        lastUpdated: new Date(),
      });
    }
  };

  // 使用回数の手動インクリメント（AI使用時に呼び出し）
  const incrementUsage = () => {
    setState(prev => ({
      ...prev,
      used: prev.used + 1,
      remaining: Math.max(0, prev.remaining - 1),
    }));
  };

  // AI使用可能判定
  const canUseAI = PlanService.isTestAccount(user) || state.remaining > 0;

  // 初回読み込みとユーザー変更時の更新
  useEffect(() => {
    if (user?.uid) {
      refreshUsage();
    } else {
      setState({
        used: 0,
        limit: 0,
        remaining: 0,
        renewalDate: null,
        isLoading: false,
        lastUpdated: null,
      });
    }
  }, [user?.uid]);

  // 定期的な更新（5分ごと）
  useEffect(() => {
    if (!user?.uid) return;
    
    const interval = setInterval(() => {
      refreshUsage();
    }, 5 * 60 * 1000); // 5分
    
    return () => clearInterval(interval);
  }, [user?.uid]);

  const contextValue: AIUsageContextType = {
    ...state,
    refreshUsage,
    incrementUsage,
    canUseAI,
  };

  return (
    <AIUsageContext.Provider value={contextValue}>
      {children}
    </AIUsageContext.Provider>
  );
};

export const useAIUsage = () => {
  const context = useContext(AIUsageContext);
  if (!context) {
    throw new Error('useAIUsage must be used within an AIUsageProvider');
  }
  return context;
};
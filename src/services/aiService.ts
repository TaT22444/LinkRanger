/**
 * AIサービス
 * Google Gemini APIを使用してタグ生成とコスト制御を行う
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
import { UserPlan } from '../types';
import { LinkMetadata } from './metadataService';

// Cloud Functions
const generateAITagsFunction = httpsCallable(functions, 'generateAITags');
const clearTagCacheFunction = httpsCallable(functions, 'clearTagCache');
const generateEnhancedAITagsFunction = httpsCallable(functions, 'generateEnhancedAITags');

interface AIResponse {
  tags: string[];
  fromCache: boolean;
  tokensUsed: number;
  cost: number;
}

interface AIUsageCheck {
  allowed: boolean;
  reason?: string;
  remainingQuota?: number;
}

export const aiService = {
  /**
   * 従来のAIタグ生成（後方互換性）
   */
  async generateTags(
    title: string,
    description: string,
    url: string,
    userId: string,
    plan: UserPlan
  ): Promise<AIResponse> {
    try {
      const result = await generateAITagsFunction({
        title,
        description,
        url,
        userId,
        plan,
      });

      const data = result.data as AIResponse;
      
      return data;
    } catch (error) {
      console.error('AI tag generation error:', error);
      // エラー時は空のタグ配列を返す
      return {
        tags: [],
        fromCache: false,
        tokensUsed: 0,
        cost: 0,
      };
    }
  },

  /**
   * AI使用制限をチェック（将来の拡張用）
   */
  async checkUsageLimit(
    userId: string,
    userPlan: 'guest' | 'free' | 'pro' = 'free'
  ): Promise<AIUsageCheck> {
    // 現在はクライアント側での制限チェックは実装せず、
    // サーバーサイドでのチェックに依存
    return {
      allowed: true,
    };
  },

  /**
   * タグキャッシュをクリア
   */
  async clearTagCache(): Promise<{success: boolean; deletedCount: number; message: string}> {
    try {
      const result = await clearTagCacheFunction();
      const data = result.data as {success: boolean; deletedCount: number; message: string};
      
      return data;
    } catch (error) {
      console.error('Failed to clear tag cache:', error);
      throw error;
    }
  },

  /**
   * 拡張AIタグ生成
   */
  async generateEnhancedTags(
    metadata: LinkMetadata,
    userId: string,
    plan: UserPlan
  ): Promise<AIResponse> {
    try {
      const result = await generateEnhancedAITagsFunction({
        metadata,
        userId,
        userPlan: plan,
      });
      const data = result.data as AIResponse;
      return data;
    } catch (error) {
      console.error('AI enhanced tag generation error:', error);
      return {
        tags: [],
        fromCache: false,
        tokensUsed: 0,
        cost: 0,
      };
    }
  },
};

// 既存のコードとの互換性を保つためのエクスポート
export const {
  generateTags,
  generateEnhancedTags,
  checkUsageLimit,
  clearTagCache,
} = aiService;
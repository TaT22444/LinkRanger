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
const generateAIAnalysisFunction = httpsCallable(functions, 'generateAIAnalysis');
const generateAnalysisSuggestionsFunction = httpsCallable(functions, 'generateAnalysisSuggestions');
const evaluateThemeRelevanceFunction = httpsCallable(functions, 'evaluateThemeRelevance');

interface AIResponse {
  tags: string[];
  fromCache: boolean;
  tokensUsed: number;
  cost: number;
}

export interface AIAnalysisResponse {
  analysis: string;
  fromCache: boolean;
  tokensUsed: number;
  cost: number;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    inputCost: number;
    outputCost: number;
    model: string;
    hasActualUsage?: boolean;
    promptCharacterCount?: number;
    responseCharacterCount?: number;
  };
}

export interface AnalysisSuggestion {
  title: string;
  description: string;
  keywords: string[];
  relatedLinkIndices?: number[]; // テーマ生成に寄与したリンクのインデックス
}

export interface AnalysisSuggestionsResponse {
  suggestions: AnalysisSuggestion[];
  fromCache: boolean;
  tokensUsed: number;
  cost: number;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    inputCost: number;
    outputCost: number;
    model: string;
    hasActualUsage?: boolean;
  };
}

export interface ThemeRelevanceResponse {
  relevanceScore: number;
  matchedConcepts: string[];
  explanation: string;
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
   * AI分析候補を生成
   */
  async generateSuggestions(
    tagName: string,
    linkTitles: string[],
    userId: string,
    userPlan: UserPlan,
    excludedThemes?: string[]
  ): Promise<AnalysisSuggestionsResponse> {
    try {
      const result = await generateAnalysisSuggestionsFunction({
        tagName,
        linkTitles,
        userId,
        userPlan,
        excludedThemes: excludedThemes || [],
      });

      const data = result.data as AnalysisSuggestionsResponse;
      
      return data;
    } catch (error) {
      console.error('AI suggestions error:', error);
      // フォールバック候補を返す
      return {
        suggestions: [
          {
            title: `${tagName}とは`,
            description: '基本的な概念について',
            keywords: ['基本', '概念'],
            relatedLinkIndices: [0, 1]
          },
          {
            title: `${tagName}の活用法`,
            description: '実践的な使い方について',
            keywords: ['活用', '実践'],
            relatedLinkIndices: [1, 2]
          },
          {
            title: `${tagName}のコツ`,
            description: '効果的な方法について',
            keywords: ['コツ', '効果的'],
            relatedLinkIndices: [0, 2]
          }
        ],
        fromCache: false,
        tokensUsed: 0,
        cost: 0,
      };
    }
  },

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

  /**
   * AI分析（文章による詳細分析）
   */
  async generateAnalysis(
    title: string,
    analysisPrompt: string,
    userId: string,
    userPlan: UserPlan
  ): Promise<AIAnalysisResponse> {
    try {
      const result = await generateAIAnalysisFunction({
        title,
        analysisPrompt,
        userId,
        userPlan,
      });

      const data = result.data as AIAnalysisResponse;
      
      return data;
    } catch (error) {
      console.error('AI analysis error:', error);
      // エラー時は空の分析結果を返す
      return {
        analysis: '分析に失敗しました。しばらく時間をおいてから再度お試しください。',
        fromCache: false,
        tokensUsed: 0,
        cost: 0,
      };
    }
  },

  /**
   * テーマとリンクの関連性をGemini APIで動的に評価
   */
  async evaluateThemeRelevance(
    theme: string,
    linkTitle: string,
    linkDescription: string,
    userId: string,
    userPlan: UserPlan
  ): Promise<ThemeRelevanceResponse> {
    try {
      const result = await evaluateThemeRelevanceFunction({
        theme,
        linkTitle,
        linkDescription,
        userId,
        userPlan,
      });

      const data = result.data as ThemeRelevanceResponse;
      
      return data;
    } catch (error) {
      console.error('Theme relevance evaluation error:', error);
      // フォールバック: 基本的な文字列マッチング
      const content = `${linkTitle} ${linkDescription}`.toLowerCase();
      const themeLower = theme.toLowerCase();
      const themeWords = themeLower.split(/\s+/).filter(word => word.length > 2);
      
      let relevanceScore = 0;
      const matchedConcepts: string[] = [];
      
      themeWords.forEach(word => {
        if (content.includes(word)) {
          relevanceScore += 1;
          matchedConcepts.push(word);
        }
      });
      
      return {
        relevanceScore,
        matchedConcepts,
        explanation: 'フォールバック評価（AI API エラー）',
        fromCache: false,
        tokensUsed: 0,
        cost: 0
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
/**
 * AIサービス
 * Google Gemini APIを使用してタグ生成とコスト制御を行う
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
import { UserPlan } from '../types';

// Cloud Functions
const generateAITagsFunction = httpsCallable(functions, 'generateAITags');

interface AIResponse {
  tags: string[];
  fromCache: boolean;
  tokensUsed: number;
  cost: number;
}

interface AIUsageCheck {
  allowed: boolean;
  reason?: string;
  remainingQuota?: {
    monthly: number;
    daily: number;
    cost: number;
  };
}

export const aiService = {
  /**
   * AIタグを生成
   * @param title リンクのタイトル
   * @param description リンクの説明
   * @param url リンクのURL
   * @param userId ユーザーID
   * @param plan ユーザープラン
   * @returns AI生成されたタグ
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
      
      console.log('AI tags generated via Gemini:', data);
      
      return data;
    } catch (error) {
      console.error('AI tag generation error:', error);
      
      // エラー時のフォールバック処理
      return {
        tags: this.generateFallbackTags(title, description, plan),
        fromCache: false,
        tokensUsed: 0,
        cost: 0,
      };
    }
  },

  /**
   * フォールバック用のタグ生成（ドメインベース + キーワード）
   * @param url URL
   * @param title タイトル
   * @param description 説明
   * @returns 生成されたタグ
   */
  generateFallbackTags(url: string, title: string, description: string): string[] {
    const tags: string[] = [];
    
    // ドメインベースのタグ
    const domainTags = this.getDomainBasedTags(url);
    tags.push(...domainTags);
    
    // キーワードベースのタグ
    const keywordTags = this.getKeywordBasedTags(title, description);
    tags.push(...keywordTags);
    
    // 重複を除去
    const uniqueTags = [...new Set(tags)];
    
    // 最大3個まで
    const selectedTags = uniqueTags.slice(0, 3);
    
    // 最低1個のタグを保証
    if (selectedTags.length === 0) {
      selectedTags.push('その他');
    }
    
    return selectedTags;
  },

  /**
   * ドメインベースのタグ生成
   * @param url URL
   * @returns ドメインベースのタグ
   */
  getDomainBasedTags(url: string): string[] {
    const DOMAIN_TAGS: { [key: string]: string[] } = {
      'github.com': ['プログラミング', 'ツール', 'コード'],
      'youtube.com': ['動画', 'エンターテイメント'],
      'youtu.be': ['動画', 'エンターテイメント'],
      'qiita.com': ['プログラミング', '技術', '記事'],
      'note.com': ['記事', 'ブログ'],
      'medium.com': ['記事', 'ブログ'],
      'dev.to': ['プログラミング', '技術'],
      'stackoverflow.com': ['プログラミング', 'Q&A'],
      'reddit.com': ['コミュニティ', 'ディスカッション'],
      'twitter.com': ['SNS', 'ニュース'],
      'x.com': ['SNS', 'ニュース'],
      'instagram.com': ['SNS', '写真'],
      'linkedin.com': ['ビジネス', 'キャリア'],
      'amazon.co.jp': ['ショッピング', '商品'],
      'amazon.com': ['ショッピング', '商品'],
      'netflix.com': ['動画', '映画', 'ドラマ'],
      'spotify.com': ['音楽', 'ポッドキャスト'],
      'wikipedia.org': ['百科事典', '知識'],
    };
    
    try {
      const domain = new URL(url).hostname.toLowerCase();
      return DOMAIN_TAGS[domain] || [];
    } catch {
      return [];
    }
  },

  /**
   * キーワードベースのタグ生成
   * @param title タイトル
   * @param description 説明
   * @returns キーワードベースのタグ
   */
  getKeywordBasedTags(title: string, description: string): string[] {
    const KEYWORD_TAGS: { [key: string]: string[] } = {
      'プログラミング': ['プログラミング', '技術'],
      'プログラム': ['プログラミング', '技術'],
      'コード': ['プログラミング', 'コード'],
      'JavaScript': ['プログラミング', 'JavaScript'],
      'Python': ['プログラミング', 'Python'],
      'React': ['プログラミング', 'React'],
      'AI': ['AI', '技術'],
      '人工知能': ['AI', '技術'],
      'ビジネス': ['ビジネス'],
      'マーケティング': ['マーケティング', 'ビジネス'],
      'デザイン': ['デザイン'],
      'UI': ['デザイン', 'UI'],
      'UX': ['デザイン', 'UX'],
      '動画': ['動画', 'エンターテイメント'],
      '映画': ['映画', 'エンターテイメント'],
      '音楽': ['音楽', 'エンターテイメント'],
      'ゲーム': ['ゲーム', 'エンターテイメント'],
      '健康': ['健康', 'ライフスタイル'],
      '料理': ['料理', 'ライフスタイル'],
      '旅行': ['旅行', 'ライフスタイル'],
      'ニュース': ['ニュース'],
      '教育': ['教育'],
      '学習': ['教育', '学習'],
    };
    
    const text = `${title} ${description}`.toLowerCase();
    const tags: string[] = [];
    
    Object.entries(KEYWORD_TAGS).forEach(([keyword, relatedTags]) => {
      if (text.includes(keyword.toLowerCase())) {
        tags.push(...relatedTags);
      }
    });
    
    return tags;
  },

  /**
   * AI使用制限をチェック（将来の拡張用）
   * @param userId ユーザーID
   * @param userPlan ユーザープラン
   * @returns 使用可能かどうか
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
}; 
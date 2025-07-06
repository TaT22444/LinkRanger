// ユーザープラン型
export type UserPlan = 'free' | 'pro' | 'premium';

// ユーザープラン情報型
export interface UserSubscription {
  plan: UserPlan;
  startDate: Date;
  endDate?: Date; // pro/premiumの場合の有効期限
  isActive: boolean;
  features: {
    maxLinks: number; // -1 = unlimited
    autoAISummary: boolean; // 自動AI要約
    manualAISummary: boolean; // 手動AI要約
    advancedSearch: boolean; // 高度な検索
    exportData: boolean; // データエクスポート
    prioritySupport: boolean; // 優先サポート
  };
}

// ユーザー型
export interface User {
  uid: string;
  email: string | null;
  username?: string;
  isAnonymous: boolean;
  createdAt: Date;
  // ユーザー設定
  preferences?: {
    theme: 'dark' | 'light';
    defaultSort: 'createdAt' | 'title' | 'lastModified';
    autoTagging: boolean;
    autoSummary: boolean;
  };
  // 統計情報
  stats?: {
    totalLinks: number;
    totalTags: number;
  };
  // サブスクリプション情報
  subscription?: UserSubscription;
}

// リンクステータス型
export type LinkStatus = 'pending' | 'processing' | 'completed' | 'error';

// リンク型（拡張版）
export interface Link {
  id: string;
  userId: string;
  url: string;
  title: string;
  description?: string;
  summary?: string; // AI生成要約
  imageUrl?: string; // OGP画像URL
  favicon?: string; // ファビコンURL
  status: LinkStatus;
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt?: Date;
  
  // 分類・整理
  tagIds: string[]; // タグIDの配列（ユーザー固有のタグID）
  folderId?: string; // 所属フォルダID
  
  // メタデータ
  metadata?: {
    domain: string;
    author?: string;
    publishedDate?: Date;
    readingTime?: number; // 推定読了時間（分）
    wordCount?: number;
    language?: string;
  };
  
  // AI解析結果
  aiAnalysis?: {
    sentiment: 'positive' | 'negative' | 'neutral';
    category: string;
    keywords: string[];
    confidence: number; // 0-1の信頼度
  };
  
  // エラー情報
  error?: {
    message: string;
    code: string;
    timestamp: Date;
  };
  
  // ユーザー操作
  isBookmarked: boolean;
  isArchived: boolean;
  priority: 'low' | 'medium' | 'high';
  notes?: string; // ユーザーメモ
  
  // ピン留め機能
  isPinned: boolean;
  pinnedAt?: Date;
}

// タグ型（新設計）
export interface Tag {
  id: string;
  userId: string;
  name: string;
  color?: string; // タグの色（HEXコード）
  emoji?: string; // タグの絵文字
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  
  // 統計情報
  linkCount: number;
  lastUsedAt: Date;
  firstUsedAt: Date; // 初回使用日時
  
  // タグの種類
  type: 'manual' | 'ai' | 'recommended'; // 作成方法
  source?: string; // AI/推奨タグの場合の元情報
}

// UI表示用のタグ情報
export interface TagWithInfo {
  id: string;
  name: string;
  color?: string;
  count: number;
  type: 'manual' | 'ai' | 'recommended';
}

// リンクとタグ情報を結合した型（UI表示用）
export interface LinkWithTags extends Omit<Link, 'tagIds'> {
  tags: Tag[];  // UI表示用のタグ情報
}

// タグ統計型（シンプル版）
export interface TagStats {
  name: string;
  count: number;
  lastUsed: Date;
}

// フォルダ型（拡張版）
export interface Folder {
  id: string;
  userId: string;
  name: string;
  description?: string;
  color?: string;
  emoji?: string;
  createdAt: Date;
  updatedAt: Date;
  
  // 階層構造
  parentId?: string; // 親フォルダID（サブフォルダ対応）
  order: number; // 表示順序
  
  // 統計情報
  linkCount: number;
  isDefault: boolean; // デフォルトフォルダかどうか
}

// 検索履歴型
export interface SearchHistory {
  id: string;
  userId: string;
  query: string;
  timestamp: Date;
  resultCount: number;
}

// アプリ設定型
export interface AppSettings {
  userId: string;
  theme: 'dark' | 'light';
  language: 'ja' | 'en';
  notifications: {
    aiProcessingComplete: boolean;
    weeklyDigest: boolean;
    tagSuggestions: boolean;
  };
  privacy: {
    shareAnalytics: boolean;
    autoBackup: boolean;
  };
  updatedAt: Date;
}

// 認証状態型
export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

// リンク一覧のフィルター・ソート型
export interface LinkFilter {
  tags?: string[]; // 選択されたタグ名の配列
  status?: LinkStatus;
  isBookmarked?: boolean;
  isArchived?: boolean;
  priority?: 'low' | 'medium' | 'high';
  folderId?: string; // フォルダでのフィルタリング
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface LinkSort {
  field: 'createdAt' | 'updatedAt' | 'title' | 'lastAccessedAt';
  direction: 'asc' | 'desc';
}

// API レスポンス型
export interface PaginatedResponse<T> {
  data: T[];
  hasMore: boolean;
  nextCursor?: string;
  total: number;
} 
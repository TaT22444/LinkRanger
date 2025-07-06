# LinkRanger - Firestore データベース設計

## 📊 概要

LinkRangerアプリ用に最適化されたFirestoreデータベース構造。開発指示書の要件に基づき、効率的なクエリ、リアルタイム同期、セキュリティを重視した設計。

## 🗄️ コレクション構造

### 1. `users` コレクション

**用途**: ユーザー基本情報と設定の管理

```typescript
{
  // ドキュメントID: Firebase Auth UID
  uid: string;
  email: string | null;
  username?: string;
  isAnonymous: boolean;
  createdAt: Timestamp;
  
  // ユーザー設定
  preferences?: {
    theme: 'dark' | 'light';
    defaultSort: 'createdAt' | 'title' | 'lastModified';
    autoTagging: boolean;
    autoSummary: boolean;
  };
  
  // 統計情報（パフォーマンス向上のため）
  stats?: {
    totalLinks: number;
    totalTags: number;
    totalFolders: number;
  };
}
```

**インデックス**:
- `uid` (自動)
- `email`（ソーシャルログイン対応）

---

### 2. `links` コレクション

**用途**: 保存されたリンクの管理（メイン機能）

```typescript
{
  // ドキュメントID: 自動生成
  id: string;
  userId: string;
  url: string;
  title: string;
  description?: string;
  summary?: string; // AI生成要約
  imageUrl?: string; // OGP画像URL
  favicon?: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastAccessedAt?: Timestamp;
  
  // 分類・整理
  folderId?: string;
  tags: string[]; // タグIDの配列
  
  // メタデータ（AI解析結果）
  metadata?: {
    domain: string;
    author?: string;
    publishedDate?: Timestamp;
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
    timestamp: Timestamp;
  };
  
  // ユーザー操作
  isBookmarked: boolean;
  isArchived: boolean;
  priority: 'low' | 'medium' | 'high';
  notes?: string; // ユーザーメモ
}
```

**インデックス（複合インデックス）**:
- `userId` + `createdAt` (desc) - 新着順表示
- `userId` + `updatedAt` (desc) - 更新順表示
- `userId` + `status` - ステータス別フィルタ
- `userId` + `folderId` - フォルダ別表示
- `userId` + `isBookmarked` - ブックマーク表示
- `userId` + `isArchived` - アーカイブ表示
- `userId` + `priority` - 優先度別表示

---

### 3. `tags` コレクション

**用途**: タグ管理（自動生成 + 手動作成）

```typescript
{
  // ドキュメントID: 自動生成
  id: string;
  userId: string;
  name: string;
  color?: string; // HEXコード
  emoji?: string;
  description?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  
  // 統計情報
  linkCount: number;
  lastUsedAt: Timestamp;
  
  // タグの種類
  type: 'auto' | 'manual'; // AI自動生成 or ユーザー手動作成
  isSystem: boolean; // システム予約タグ
}
```

**インデックス（複合インデックス）**:
- `userId` + `name` (unique) - 重複防止
- `userId` + `lastUsedAt` (desc) - 使用頻度順
- `userId` + `type` - タイプ別表示

---

### 4. `folders` コレクション

**用途**: フォルダ管理（階層構造対応）

```typescript
{
  // ドキュメントID: 自動生成
  id: string;
  userId: string;
  name: string;
  description?: string;
  color?: string;
  emoji?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  
  // 階層構造
  parentId?: string; // 親フォルダID
  order: number; // 表示順序
  
  // 統計情報
  linkCount: number;
  isDefault: boolean; // デフォルトフォルダ
}
```

**インデックス（複合インデックス）**:
- `userId` + `order` (asc) - 順序表示
- `userId` + `parentId` - 階層表示

---

### 5. `searchHistory` コレクション

**用途**: 検索履歴の管理

```typescript
{
  // ドキュメントID: 自動生成
  id: string;
  userId: string;
  query: string;
  timestamp: Timestamp;
  resultCount: number;
}
```

**インデックス（複合インデックス）**:
- `userId` + `timestamp` (desc) - 最新順表示

---

### 6. `appSettings` コレクション

**用途**: アプリ設定の管理

```typescript
{
  // ドキュメントID: userId
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
  updatedAt: Timestamp;
}
```

**インデックス**:
- `userId` (自動)

---

## 🔒 セキュリティルール

Firestore Security Rulesにより以下を実現：

- **ユーザー分離**: 各ユーザーは自分のデータのみアクセス可能
- **データ検証**: 不正なデータ構造の書き込みを防止
- **認証必須**: 全ての操作に認証が必要

## ⚡ パフォーマンス最適化

### インデックス戦略
- 頻繁なクエリパターンに対応した複合インデックス
- ページネーション対応
- リアルタイムリスナーの効率化

### データ構造最適化
- 非正規化による読み取り性能向上
- 統計情報の事前計算
- 適切なフィールド型の選択

### クエリ最適化
- `where` + `orderBy` + `limit` の組み合わせ
- `startAfter` によるページネーション
- `onSnapshot` によるリアルタイム更新

---

## 🔄 データフロー

### 1. リンク保存フロー
```
1. ユーザーがリンクを共有
2. `links` コレクションに `status: 'pending'` で保存
3. Cloud Functions がトリガー
4. AI解析実行（メタデータ取得、要約生成、タグ生成）
5. `links` ドキュメントを `status: 'completed'` で更新
6. 新しいタグがあれば `tags` コレクションに追加
7. ユーザー統計を更新
```

### 2. 検索フロー
```
1. ユーザーが検索クエリを入力
2. `links` コレクションを検索（title, description, summary, tags）
3. 検索結果を表示
4. `searchHistory` に履歴を保存
```

---

## 📈 スケーラビリティ考慮

### 将来の拡張性
- **共有機能**: `sharedLinks` コレクションの追加
- **コラボレーション**: `teams` / `workspaces` コレクション
- **AI機能拡張**: `aiInsights` コレクション
- **外部連携**: `integrations` コレクション

### パフォーマンス監視
- Firestore使用量の監視
- クエリ性能の定期的な見直し
- インデックス最適化

---

## 🛠️ 開発・運用ツール

### サービス層
- `src/services/firestoreService.ts` - CRUD操作の抽象化
- `src/hooks/useFirestore.ts` - React Hooks による状態管理

### 型安全性
- TypeScript による型定義
- `src/types/index.ts` での一元管理

### テスト
- Firestore Emulator での開発・テスト
- セキュリティルールのテスト

---

この設計により、LinkRangerアプリは効率的で安全、かつスケーラブルなデータベース基盤を持つことができます。 
# 開発ワークフロー - リリース後の運用ガイド

## 🏗️ **環境構成**

### **1. 推奨環境分離**

```
Production (本番)     → linkranger-prod
Staging (検証)       → linkranger-staging  
Development (開発)   → linkranger-dev
Testing (テスト)     → linkranger-test
```

### **2. Firebase プロジェクト分離**

#### **本番環境 (linkranger-prod)**
- ユーザーデータ保護
- 高可用性設定
- バックアップ自動化
- セキュリティルール厳格

#### **開発環境 (linkranger-dev)**
- テストアカウント有効
- ログレベル詳細
- 実験的機能テスト
- コスト制限緩い

## 🔄 **開発フロー**

### **1. 新機能開発**

```bash
# 1. 開発環境で作業
NODE_ENV=development npm run dev

# 2. 機能ブランチ作成
git checkout -b feature/new-ai-analysis

# 3. 開発・テスト
npm run test
npm run e2e:dev

# 4. ステージング環境でテスト
NODE_ENV=staging npm run build:staging
npm run deploy:staging

# 5. 本番デプロイ
NODE_ENV=production npm run build:production
npm run deploy:production
```

### **2. バグ修正フロー**

```bash
# 緊急度に応じた対応

# 🚨 緊急バグ（本番即時対応）
git checkout -b hotfix/critical-bug
# → 修正 → テスト → 即座に本番デプロイ

# ⚠️ 通常バグ（次回リリース）
git checkout -b bugfix/normal-issue
# → 修正 → ステージングテスト → 次回リリースに含める
```

## 🧪 **テスト戦略**

### **1. テストアカウント運用**

#### **開発環境でのテスト**
```javascript
// .env.development
EXPO_PUBLIC_ENABLE_TEST_ACCOUNTS=true

// テストアカウント作成
await setTestAccount('dev-test@company.com', true, 'tester');
```

#### **本番環境での検証**
```javascript
// .env.production
EXPO_PUBLIC_ENABLE_TEST_ACCOUNTS=false

// 本番では一般ユーザーアカウントでテスト
// または限定ベータテスター招待
```

### **2. A/Bテスト実装**

```javascript
// 段階的機能ロールアウト
const useNewFeature = useMemo(() => {
  if (user?.role === 'beta_tester') return true;
  if (user?.email?.includes('@company.com')) return true;
  
  // 一般ユーザーの10%に新機能提供
  return user?.uid?.slice(-1) === '0';
}, [user]);
```

## 📊 **モニタリング & アラート**

### **1. 重要メトリクス監視**

```javascript
// 使用量監視
const monitorAIUsage = () => {
  // 異常な使用パターン検出
  if (dailyRequests > threshold) {
    sendAlert('AI usage spike detected');
  }
};

// エラー率監視
const monitorErrorRate = () => {
  if (errorRate > 5%) {
    sendAlert('High error rate detected');
  }
};
```

### **2. ユーザーフィードバック収集**

```javascript
// アプリ内フィードバック機能
const FeedbackModal = () => {
  const submitFeedback = (type, message) => {
    // Firebase Analytics or Crashlytics
    analytics().logEvent('user_feedback', {
      type,
      message,
      version: Constants.expoConfig?.version
    });
  };
};
```

## 🔧 **運用タスク**

### **1. 定期メンテナンス**

#### **週次タスク**
- [ ] AI使用量レポート確認
- [ ] エラーログ分析
- [ ] パフォーマンス指標確認

#### **月次タスク**
- [ ] テストアカウント監査
- [ ] データベース最適化
- [ ] セキュリティ更新確認

### **2. 緊急時対応**

#### **サービス停止時**
```bash
# 1. 状況確認
firebase projects:list
firebase functions:log --limit 50

# 2. ロールバック準備
git tag v1.2.3-rollback
npm run build:emergency

# 3. 緊急デプロイ
npm run deploy:emergency
```

## 📱 **デプロイメント戦略**

### **1. 段階的リリース**

```bash
# Phase 1: ベータテスター (1%)
expo publish --channel beta

# Phase 2: 早期アクセス (10%)
expo publish --channel staging

# Phase 3: 全ユーザー (100%)
expo publish --channel production
```

### **2. フィーチャーフラグ**

```javascript
// リモート設定でフィーチャー制御
const useNewAIAnalysis = useRemoteConfig('enable_new_ai_analysis', false);

if (useNewAIAnalysis) {
  // 新しいAI分析機能
} else {
  // 既存の機能
}
```

## 🛡️ **セキュリティ運用**

### **1. 定期セキュリティチェック**

```bash
# 月次実行
node scripts/auditTestAccounts.js
node scripts/securityAudit.js
```

### **2. アクセス制御**

```javascript
// 管理者権限チェック
const requireAdmin = (user) => {
  if (user?.role !== 'admin') {
    throw new Error('管理者権限が必要です');
  }
};
```

## 📈 **パフォーマンス最適化**

### **1. 継続的最適化**

- バンドルサイズ監視
- 起動時間測定
- メモリ使用量チェック
- API レスポンス時間監視

### **2. ユーザーエクスペリエンス向上**

- クラッシュ率 < 0.1%
- 起動時間 < 3秒
- API レスポンス < 2秒
- バッテリー消費最小化 
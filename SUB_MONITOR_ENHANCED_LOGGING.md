# 🔍 [SUB-MONITOR] ログシステム強化

## 📊 **開発環境でのサブスクリプション監視ログ実装完了**

Development Build の iOS シミュレータでも **[SUB-MONITOR]** プレフィックス付きの詳細なサブスクリプション監視ログが表示されるようになりました。

## ✅ **実装された [SUB-MONITOR] ログ**

### **1. IAP サービス初期化**
```javascript
[SUB-MONITOR] [2025-01-XX XX:XX:XX] IAP Service: Initializing... {
  platform: "ios",
  productSkus: ["com.tat22444.wink.plus.monthly"],
  skuCount: 1,
  environment: "development"
}

[SUB-MONITOR] [2025-01-XX XX:XX:XX] Development mode - using mock IAP functionality
[SUB-MONITOR] [2025-01-XX XX:XX:XX] Setting up development mock listeners
```

### **2. プロダクト情報取得**
```javascript
[SUB-MONITOR] [2025-01-XX XX:XX:XX] Fetching products... {
  environment: "development",
  platform: "ios",
  requestedSKUs: ["com.tat22444.wink.plus.monthly"]
}

[SUB-MONITOR] [2025-01-XX XX:XX:XX] Mock products loaded {
  count: 2,
  environment: "development",
  products: [
    { productId: "com.tat22444.wink.plus.monthly", localizedPrice: "¥480" },
    { productId: "com.tat22444.wink.pro.monthly", localizedPrice: "¥1,280" }
  ]
}
```

### **3. UpgradeModal での購入フロー**
```javascript
[SUB-MONITOR] UpgradeModal: Products loaded successfully {
  count: 2,
  environment: "development",
  products: [...]
}

[SUB-MONITOR] [2025-01-XX XX:XX:XX] handleUpgrade initiated {
  planName: "plus",
  userId: "user123",
  currentPlan: "free",
  environment: "development",
  sourceContext: "general"
}
```

### **4. 購入処理（開発環境）**
```javascript
[SUB-MONITOR] [2025-01-XX XX:XX:XX] Purchase request initiated {
  plan: "plus",
  sku: "com.tat22444.wink.plus.monthly",
  environment: "development",
  platform: "ios"
}

[SUB-MONITOR] [2025-01-XX XX:XX:XX] Development mode - simulating purchase flow {
  plan: "plus",
  sku: "com.tat22444.wink.plus.monthly",
  mockDuration: "2 seconds",
  willSucceed: true
}

[SUB-MONITOR] [2025-01-XX XX:XX:XX] Mock purchase completed successfully {
  plan: "plus",
  sku: "com.tat22444.wink.plus.monthly",
  transactionId: "mock_1234567890",
  environment: "development",
  status: "completed"
}
```

### **5. リストア処理**
```javascript
[SUB-MONITOR] [2025-01-XX XX:XX:XX] Restore purchases initiated {
  environment: "development",
  platform: "ios"
}

[SUB-MONITOR] [2025-01-XX XX:XX:XX] Development mode - simulating restore purchases {
  foundPurchases: 0,
  message: "No previous purchases found in development mode"
}
```

## 🛠️ **Development Build での確認方法**

### **1. Metro Bundler Console**
```bash
# アプリ起動時
npx expo start --dev-client

# [SUB-MONITOR] でフィルタリング
# ターミナルで Cmd+F → "[SUB-MONITOR]" で検索
```

### **2. Safari Developer Tools (iOS シミュレータ)**
```bash
# Safari > 開発 > iOS シミュレータ > [アプリ名]
# Console タブで [SUB-MONITOR] をフィルタリング
```

### **3. React Native Debugger**
```bash
# React Native Debugger の Console で
# フィルタ: [SUB-MONITOR]
```

## 📱 **開発環境での動作確認手順**

### **ステップ 1: アプリ起動**
1. `npm run start:dev` または `yarn start:dev`
2. iOS シミュレータでアプリを起動
3. コンソールで初期化ログを確認

### **ステップ 2: UpgradeModal を開く**
1. アカウント画面 → プランアップグレード
2. または制限に達した際のアップグレードプロンプト
3. プロダクト読み込みログを確認

### **ステップ 3: Plus プラン選択**
1. "Plus プランを選択" ボタンをタップ
2. 開発環境用のアラートが表示される
3. 購入フローのログを確認

### **ステップ 4: リストア機能テスト**
1. "購入の復元" をタップ
2. リストア処理のログを確認

## 🔍 **ログフィルタリング方法**

### **Metro Bundler Console**
```bash
# ターミナルで検索
grep -i "\[SUB-MONITOR\]"

# または単純にページ内検索
Cmd+F → "[SUB-MONITOR]"
```

### **Safari Developer Console**
```javascript
// Console で JavaScript フィルタリング
console.log = function(originalLog) {
  return function(...args) {
    if (args[0].includes('[SUB-MONITOR]')) {
      originalLog.apply(console, args);
    }
  };
}(console.log);
```

## 🎯 **期待される出力例**

開発環境で UpgradeModal を開くと、以下のような詳細ログが表示されます：

```
🛒 IAP Service: Already initialized
[SUB-MONITOR] [2025-01-XX 14:30:15] Fetching products... { environment: "development", platform: "ios" }
[SUB-MONITOR] [2025-01-XX 14:30:15] Development mode - returning mock products
[SUB-MONITOR] [2025-01-XX 14:30:15] Mock products loaded { count: 2, environment: "development" }
[SUB-MONITOR] UpgradeModal: Products loaded successfully { count: 2, environment: "development" }
```

Plus プランを選択すると：

```
[SUB-MONITOR] [2025-01-XX 14:31:20] handleUpgrade initiated { planName: "plus", environment: "development" }
[SUB-MONITOR] [2025-01-XX 14:31:20] Development mode - showing TestFlight guidance
```

## 💡 **トラブルシューティング**

### **ログが表示されない場合**
1. **Metro Bundler の再起動**: `r` キーを押して reload
2. **キャッシュクリア**: `npx expo start --clear`
3. **シミュレータ再起動**: iOS シミュレータを再起動

### **本番環境との比較**
- **Development**: Mock data, TestFlight guidance
- **Production**: Real IAP, actual purchase flow
- **ログ形式**: 両環境で同じ [SUB-MONITOR] プレフィックス

## 🚀 **次のステップ**

1. **Development Build** で動作確認
2. **TestFlight Build** で実際の購入フロー確認
3. **Production** で最終動作確認

これで、開発環境でも包括的なサブスクリプション監視が可能になり、問題の早期発見と詳細な動作確認ができるようになりました。
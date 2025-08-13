# 正しいビルドコマンド

## ✅ 使用すべきコマンド
```bash
eas build --profile testflight --platform ios
```

## 🎯 testflight プロファイルを選ぶ理由

### 1. **配布方法**
- `testflight`: **Store配布** → TestFlightで配信可能
- `development`: Internal配布 → 開発者のみ

### 2. **テスト環境設定**
```json
"testflight": {
  "EXPO_PUBLIC_ENABLE_TEST_ACCOUNTS": "true",  ← テストアカウント有効
  "EXPO_PUBLIC_DEVELOPER_EMAILS": "...",      ← 開発者メール設定
}
```

### 3. **Universal Links対応**
- Store配布ビルドは本番同等の設定
- Associated Domainsが正しく機能
- Apple App Site Associationの検証が確実

## 🚀 実行手順

### 1. ビルド実行
```bash
cd /Users/tat/Dev/Link/LinkRanger
eas build --profile testflight --platform ios
```

### 2. TestFlightアップロード
- EASが自動でApp Store Connectにアップロード
- TestFlight処理完了まで5-10分

### 3. TestFlightからインストール
- TestFlightアプリで新バージョンをインストール

## 🧪 テスト可能な機能

### ✅ 即座にテスト可能
- Universal Links: `https://www.dot-wink.com/share?url=xxx`
- Deep Links: `wink://share?url=xxx`  
- 外部アプリからの共有

### 📱 テスト手順
1. **Universal Linksテスト**
   ```
   https://www.dot-wink.com/share?url=https://google.com&title=Google
   ```

2. **外部アプリ共有テスト**
   - Safari → 共有ボタン → Wink選択

3. **Deep Linksテスト**
   ```bash
   npx uri-scheme open "wink://share?url=https://google.com&title=Google" --ios
   ```

## 📋 app.json確認

buildNumber が更新されているのも確認しました：
```json
"buildNumber": "22"  // 最新番号
```

**結論: `eas build --profile testflight --platform ios` が正解です！**
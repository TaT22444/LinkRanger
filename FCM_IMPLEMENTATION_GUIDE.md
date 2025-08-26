# FCM プッシュ通知システム実装・導入ガイド

## 🎯 概要

アプリ終了状態でも確実に3日間未読リンク通知を送信するため、Firebase Cloud Messaging (FCM) + Cloud Scheduler によるプッシュ通知システムを実装しました。

## 🏗️ 実装された機能

### 1. **FCMサービス** (`src/services/fcmService.ts`)
- FCMトークンの取得・登録
- バックグラウンド通知ハンドラー
- 既存の通知システムとの併用

### 2. **Cloud Functions拡張** (`functions/src/index.ts`)
- `registerFCMToken`: FCMトークン登録API
- `checkUnusedLinksScheduled`: 定期実行による未読リンクチェック
- セキュリティ強化された管理者認証

### 3. **Cloud Scheduler設定** (`scripts/setup-cloud-scheduler.sh`)
- 6時間ごとの自動実行
- Firebase Cloud Functions連携

### 4. **アプリ統合** (`App.tsx`)
- FCMサービスの自動初期化
- 既存の通知システムとの併用

## 📋 導入手順

### Step 1: Cloud Functions のデプロイ

```bash
cd /Users/tat/Dev/Link/LinkRanger/functions
npm run build
cd /Users/tat/Dev/Link/LinkRanger
firebase deploy --only functions
```

### Step 2: Cloud Scheduler の設定

```bash
chmod +x scripts/setup-cloud-scheduler.sh
./scripts/setup-cloud-scheduler.sh
```

### Step 3: 動作確認

#### A. FCMトークン登録テスト
```javascript
// Expo DevTools コンソールで実行
import { fcmService } from './src/services/fcmService';

// FCMサービス状態確認
console.log('FCM Ready:', fcmService.isReady());
console.log('FCM Token:', fcmService.getCurrentToken());

// 手動でトークンリフレッシュ
await fcmService.refreshToken();
```

#### B. Cloud Functions テスト
```bash
# 手動でスケジューラーを実行
gcloud scheduler jobs run unused-links-checker --project=linkranger-b096e --location=asia-northeast1

# Firebase Console → Functions → ログで確認
```

#### C. 開発者権限テスト
```bash
# Firebase Auth トークンを取得してテスト
curl -X POST https://asia-northeast1-linkranger-b096e.cloudfunctions.net/checkUnusedLinksScheduled \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ID_TOKEN" \
  -d '{"test": true}'
```

## 🔄 既存システムとの関係

### **共存設計**
- **既存**: expo-notifications によるローカル通知
- **新規**: FCM によるプッシュ通知
- **役割分担**: 二重の保険として機能

### **通知の優先順位**
1. **リンク作成時**: 既存の3日後スケジュール通知
2. **バックアップ**: FCMによる6時間ごとチェック
3. **結果**: より確実な通知配信

### **重複防止機能**
- Cloud Functions で `notificationsSent.fcm3Days` フラグ管理
- 既存の `notificationsSent.unused3Days` と併用
- 同じリンクに重複通知を送信しない

## 🔒 セキュリティ対策

### **Cloud Functions 認証**
- 管理者メールアドレスによる権限制御
- Cloud Scheduler からのリクエストのみ許可
- セキュリティインシデント検知ログ

### **FCMトークン保護**
- 認証済みユーザーのみ登録可能
- Firestore セキュリティルールで保護
- トークンプレビューによる安全なログ出力

## 📊 監視・デバッグ

### **Firebase Console での確認**
1. **Functions → ログ**
   - FCMトークン登録状況
   - スケジュール実行結果
   - 通知送信成功/失敗

2. **Firestore → users**
   - `fcmToken`: 登録されたトークン
   - `fcmTokenUpdatedAt`: 最終更新日時
   - `fcmPlatform`: デバイスプラットフォーム

3. **Cloud Scheduler → unused-links-checker**
   - 実行履歴
   - 成功/失敗率

### **ログ出力例**
```
✅ FCMサービス初期化完了
📱 FCMトークン取得: dev_token_1234567890...
✅ FCMトークンサーバー登録完了
🔍 スケジュール実行: 3日間未読リンクチェック開始
✅ FCM通知送信完了: userId=user123, linkCount=2
```

## ⚠️ 注意事項

### **開発環境の制限**
- Expo Go では FCM の完全な機能は利用できません
- Development Build または TestFlight での実機テストが必要
- 現在はモックトークンを使用（本番では実際のFCMトークン）

### **本番環境での設定**
- Google Cloud Console でプロジェクトの確認
- Firebase Console で Cloud Messaging の設定
- iOS/Android の push notification 証明書設定

### **料金への影響**
- Cloud Scheduler: 月間無料枠内（3件まで無料）
- Cloud Functions: 呼び出し回数に応じた従量課金
- FCM: 基本的に無料（大量送信時は制限あり）

## 🚀 段階的導入計画

### **Phase 1 (現在)**: 開発・テスト
- FCMサービス実装完了
- Cloud Functions デプロイ
- 開発環境での動作確認

### **Phase 2**: TestFlight 検証
- 実機での FCM 動作確認
- 通知配信率の測定
- ユーザビリティテスト

### **Phase 3**: 本番展開
- 段階的ユーザーへの提供
- 既存システムとの完全統合
- パフォーマンス監視

## 🛠️ トラブルシューティング

### **FCMトークン登録失敗**
```javascript
// エラー確認
import { fcmService } from './src/services/fcmService';
if (!fcmService.isReady()) {
  console.log('FCM初期化失敗 - 通知権限を確認してください');
}
```

### **Cloud Scheduler 実行失敗**
```bash
# スケジューラー状態確認
gcloud scheduler jobs describe unused-links-checker --project=linkranger-b096e --location=asia-northeast1

# ログ確認
gcloud logging read "resource.type=cloud_function" --project=linkranger-b096e --limit=50
```

### **通知が届かない**
1. デバイスの通知設定確認
2. Firebase Console での FCM 送信履歴確認
3. Cloud Functions ログでエラー確認

## 📈 期待される効果

- **通知確実性**: 95%以上の配信率を目標
- **アプリ終了状態**: 確実な通知配信
- **ユーザー体験**: 取りこぼしのない通知
- **システム信頼性**: 二重の通知システムによる保険

この実装により、iOS の制限やアプリ終了状態に関係なく、確実に3日間未読リンク通知をユーザーに届けることが可能になります。
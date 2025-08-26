# 🌩️ Cloud Scheduler 手動設定ガイド

## 📋 Firebase Console での手動設定手順

### 1. **Google Cloud Console にアクセス**
1. [Google Cloud Console](https://console.cloud.google.com/) を開く
2. プロジェクト「linkranger-b096e」を選択

### 2. **Cloud Scheduler の有効化**
1. 左側メニューから「Cloud Scheduler」を選択
2. API が無効の場合は「APIを有効にする」をクリック

### 3. **スケジューラージョブの作成**

**基本設定：**
- **名前**: `unused-links-checker`
- **リージョン**: `asia-northeast1`
- **説明**: `3日間未読リンクのFCM通知チェック（3時間ごと）`
- **頻度**: `0 */3 * * *` （3時間ごと実行）
- **タイムゾーン**: `Asia/Tokyo`

**ターゲット設定：**
- **ターゲットタイプ**: `HTTP`
- **URL**: `https://asia-northeast1-linkranger-b096e.cloudfunctions.net/checkUnusedLinksScheduled`
- **HTTPメソッド**: `POST`

**ヘッダー：**
```
Content-Type: application/json
User-Agent: Google-Cloud-Scheduler
```

**ボディ：**
```json
{
  "source": "cloud-scheduler",
  "timestamp": "2025-01-01T00:00:00Z"
}
```

### 4. **設定確認**
1. 「作成」ボタンをクリック
2. スケジューラー一覧で「unused-links-checker」が表示されることを確認
3. 「今すぐ実行」ボタンで手動テスト可能

## 🔍 動作確認

### **Firebase Console でログ確認**
1. Firebase Console → Functions → ログ
2. 「checkUnusedLinksScheduled」の実行ログを確認
3. 以下のログが表示されれば成功：
   ```
   🔍 スケジュール実行: 3日間未読リンクチェック開始
   ✅ スケジュール実行完了: totalUsersProcessed=X, totalNotificationsSent=Y
   ```

### **エラーの場合**
- 認証エラー: Cloud Schedulerのサービスアカウント権限確認
- 実行エラー: Cloud Functions のログでエラー詳細確認

## 📊 期待される動作

1. **3時間ごと**: 自動的にスケジューラーが実行
2. **FCMトークン取得**: 登録済みユーザーを検索
3. **未読リンクチェック**: 3日間未読のリンクを特定
4. **FCM通知送信**: 該当ユーザーにプッシュ通知
5. **重複防止**: 通知送信済みフラグで管理

## ⚠️ 重要な注意点

- **FCMトークン**: アプリでユーザーがログインした時に自動登録
- **初回通知**: ユーザーがアプリを使い始めてから3日後以降に開始
- **テスト**: 手動実行で動作確認を推奨

設定完了後、アプリでユーザーがログインすると自動的にFCMトークンが登録され、3日間未読リンクの通知システムが開始されます。
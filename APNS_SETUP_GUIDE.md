# 🍎 APNs証明書設定ガイド - App Store公開必須設定

## 📋 概要

App Store公開時にFCM通知を正常に動作させるため、Apple Push Notification service (APNs) 証明書の設定が必須です。

## ⚠️ 重要な注意事項

**APNs証明書なしの場合**:
- FCMトークンは取得できる ✅
- 通知送信は完全に失敗する ❌
- ユーザーに通知が一切届かない ❌

## 🔧 設定手順

### **Step 1: Apple Developer Portalでの証明書生成**

#### **オプション A: APNs証明書 (.p12)**

1. **Apple Developer Portal** (https://developer.apple.com/account/) にログイン
2. **Certificates, Identifiers & Profiles** → **Certificates** 
3. **Create a Certificate** (+ボタン)
4. **Apple Push Notification service SSL (Production)** を選択
5. **App ID**: `com.tat22444.wink` を選択
6. **CSR (Certificate Signing Request)** をアップロード
   - Keychain Access → Certificate Assistant → Request from CA
7. 証明書をダウンロード (.cer)
8. **Keychain Accessで証明書をインストール**
9. **右クリック** → **Export** → **Personal Information Exchange (.p12)**
10. パスワードを設定してエクスポート

#### **オプション B: APNs認証キー (.p8) - 推奨**

1. **Apple Developer Portal** → **Keys**
2. **Create a Key** (+ボタン)
3. **Key Name**: `LinkRanger APNs Key`
4. **Apple Push Notifications service (APNs)** にチェック
5. **Register** でキー生成
6. **.p8ファイルをダウンロード**
7. **Key ID** と **Team ID** をメモ

### **Step 2: Firebase Consoleでの設定**

1. **Firebase Console** (https://console.firebase.google.com/) を開く
2. **linkranger-b096e** プロジェクトを選択
3. **Project Settings** (⚙️) → **Cloud Messaging** タブ
4. **iOS app configuration** セクション

#### **APNs証明書の場合 (.p12)**:
- **APNs Certificates** → **Upload Certificate**
- **.p12ファイルを選択**
- **パスワードを入力**
- **Upload**

#### **APNs認証キーの場合 (.p8) - 推奨**:
- **APNs Authentication Keys** → **Upload**
- **.p8ファイルを選択**
- **Key ID** を入力 (Apple Developer Portalで確認)
- **Team ID** を入力 (Apple Developer Portalで確認)
- **Upload**

### **Step 3: Bundle ID確認**

Firebase Console で以下が正しく設定されていることを確認：
- **iOS Bundle ID**: `com.tat22444.wink`
- **App Store App ID**: App Store Connectの設定と一致

### **Step 4: 動作確認**

#### **開発環境テスト**:
```bash
# Development Buildで確認
npm run build:dev
```

#### **TestFlightテスト**:
```bash
# TestFlightビルド
eas build --profile testflight --platform ios
```

#### **本番環境テスト**:
```bash
# Productionビルド
eas build --profile production --platform ios
```

## 🚨 トラブルシューティング

### **FCMトークンは取得できるが通知が届かない**
- APNs証明書が未設定または期限切れ
- Bundle IDが一致していない
- 証明書タイプが間違っている (Development vs Production)

### **Firebase Console エラー**
- **"Invalid certificate"**: .p12ファイルのパスワード間違い
- **"Invalid key"**: Key IDまたはTeam ID間違い
- **"Bundle ID mismatch"**: App IDの設定確認

### **実機で通知が来ない**
- デバイスの通知設定を確認
- アプリの通知権限を確認
- Firebase Console → Cloud Messaging → Send test message

## 📊 設定後の期待される動作

### **✅ 正常な場合**:
```
LOG  🔥 FCMサービス初期化開始
LOG  📱 Firebase MessagingでFCMトークン取得開始...
LOG  📱 FCMトークン取得成功 (Firebase Messaging): token: APA91bH... platform: ios, isRealToken: true
LOG  ✅ FCMトークンサーバー登録完了
LOG  ✅ FCMサービス初期化完了
```

### **❌ APNs未設定の場合**:
```
LOG  📱 Firebase MessagingでFCMトークン取得開始...
ERROR Firebase Messaging エラー: APNs certificate not configured
LOG  📱 本番環境フォールバックトークン: production_fallback_...
```

### **通知送信テスト**:
Firebase Console → Cloud Messaging → **Send your first message** で手動テスト可能

## 🎯 本番環境での確認ポイント

1. **FCMトークン**: 実際のデバイストークンが取得されている
2. **Cloud Functions**: checkUnusedLinksScheduled が正常実行
3. **通知配信**: ユーザーデバイスに通知が届く
4. **ログ確認**: Firebase Console Functionsログで送信成功を確認

## 📝 チェックリスト

### **App Store公開前**
- [ ] APNs証明書または認証キーをFirebase Consoleに設定
- [ ] Bundle ID `com.tat22444.wink` の確認
- [ ] TestFlightでの通知テスト実行
- [ ] Firebase Console でテスト通知送信確認

### **本番環境**
- [ ] Production用APNs証明書を使用
- [ ] 3日間未読リンク通知の動作確認
- [ ] Cloud Scheduler実行ログの監視

## 🚀 App Store公開後の運用

### **監視項目**:
- Firebase Console → Functions → Logs
- 通知送信成功率の確認
- ユーザーからの通知に関するフィードバック

### **メンテナンス**:
- APNs証明書の期限管理 (年1回更新)
- Cloud Scheduler実行状況の定期確認

---

## 📞 サポート

設定で問題が発生した場合:
1. Firebase Console のエラーログを確認
2. Apple Developer Portal の証明書状況を確認
3. Bundle IDの整合性を再確認

**このガイドに従って設定完了後、FCM通知システムはApp Store環境で完全に動作します。**
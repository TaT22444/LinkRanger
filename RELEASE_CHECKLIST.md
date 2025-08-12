# リリース前チェックリスト

## TestFlightリリース用

### ビルド前
- [ ] `eas build --profile testflight --platform ios` でビルド
- [ ] テストアカウント機能が有効 (`EXPO_PUBLIC_ENABLE_TEST_ACCOUNTS=true`)
- [ ] 以下のテストアカウントが動作すること：
  - [ ] `tatsu0823takasago@icloud.com` - 無制限プラン
  - [ ] `plus.test@linkranger.com` - Plusプラン（50 AI使用/月）
  - [ ] `pro.test@linkranger.com` - Proプラン（150 AI使用/月）

### TestFlightアップロード後
- [ ] TestFlightでテストアカウントログインが正常に動作
- [ ] プラン表示が正しく表示される
  - [ ] Plus: "テスト(Plus)プラン"
  - [ ] Pro: "テスト(Pro)プラン"
- [ ] AI使用量制限が正しく表示される
  - [ ] Plus: "remaining / 50回"
  - [ ] Pro: "remaining / 150回"

## プロダクションリリース用

### ビルド前
- [ ] `eas build --profile production --platform ios` でビルド
- [ ] テストアカウント機能が無効 (`EXPO_PUBLIC_ENABLE_TEST_ACCOUNTS=false`)
- [ ] デバッグモードが無効 (`EXPO_PUBLIC_DEBUG_MODE=false`)

### 本番環境確認
- [ ] テストアカウントでログインできない（通常のユーザーとして扱われる）
- [ ] すべての機能が通常ユーザーとして正常動作
- [ ] プラン制限が正しく適用される
- [ ] 課金フローが正常に動作

### App Store提出前
- [ ] app.json の version を更新
- [ ] プライバシーポリシーの確認
- [ ] 利用規約の確認
- [ ] アプリ内購入設定の確認
- [ ] App Storeスクリーンショットの更新

## コード確認

### セキュリティ
- [ ] 本番環境でテストアカウントが無効化されている
- [ ] API キーが適切に設定されている
- [ ] Firebase設定が正しい

### 機能テスト
- [ ] 新規ユーザー登録
- [ ] ログイン/ログアウト
- [ ] リンク保存・削除
- [ ] AI機能
- [ ] プラン制限
- [ ] 課金フロー（TestFlightでは制限あり）

## 環境固有の設定

### 開発環境 (development)
- テストアカウント: 有効
- デバッグモード: 有効
- 開発者メール: `tatsu0823takasago@icloud.com`

### TestFlight (testflight)
- テストアカウント: 有効
- デバッグモード: 有効
- 開発者メール: `tatsu0823takasago@icloud.com`

### 本番環境 (production)
- テストアカウント: **無効**
- デバッグモード: **無効**
- 開発者メール: **空**

## ビルドコマンド

```bash
# TestFlight用ビルド
eas build --profile testflight --platform ios --non-interactive

# 本番用ビルド
eas build --profile production --platform ios --non-interactive
```
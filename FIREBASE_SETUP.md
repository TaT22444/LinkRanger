# Firebase設定手順

## 1. Firebaseプロジェクトの作成

1. [Firebase Console](https://console.firebase.google.com/) にアクセス
2. 「プロジェクトを追加」をクリック
3. プロジェクト名を「LinkRanger」として作成
4. Google Analyticsは任意で設定

## 2. Webアプリの追加

1. プロジェクトの概要から「アプリを追加」→「Web」を選択
2. アプリのニックネームを「LinkRanger」として登録
3. Firebase SDK設定をコピー

## 3. 認証の設定

1. Authentication → Sign-in method に移動
2. 以下のプロバイダーを有効化：
   - メール/パスワード
   - 匿名認証

## 4. Firestoreの設定

1. Firestore Database → データベースを作成
2. セキュリティルールを本番環境用に設定（開発中はテストモードでも可）

## 5. 環境変数の設定

プロジェクトルートに `.env` ファイルを作成し、以下の値を設定：

```
EXPO_PUBLIC_FIREBASE_API_KEY=your-api-key-here
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
EXPO_PUBLIC_FIREBASE_APP_ID=your-app-id
```

## 6. テスト

アプリを起動して認証機能が正常に動作することを確認してください。 
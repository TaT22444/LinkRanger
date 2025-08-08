# LinkRanger - 開発コマンド

## 開発サーバー起動
```bash
npm run start                 # Expo開発サーバー起動
npx expo start --ios         # iOSシミュレーター指定で起動
npx expo start --port 8082   # ポート指定で起動
```

## ビルド関連
```bash
# Development build
eas build --profile development --platform ios

# TestFlight用ビルド
eas build --profile testflight --platform ios

# プレビュービルド
eas build --profile preview --platform ios
```

## 送信・デプロイ
```bash
# App Store Connect に送信
npx eas submit --platform ios --latest
```

## プロジェクト管理
```bash
# プリビルド（ネイティブモジュール追加後）
npx expo prebuild --clean

# 依存関係インストール
npx expo install <package-name>
```

## Firebase関連
- Firestore ルール: firestore.rules
- Firebase設定: src/config/firebase.ts
- 環境変数: env.example を参考に .env を作成

## コード品質
- TypeScript使用（tsconfig.json で設定）
- 型定義: src/types/index.ts で一元管理
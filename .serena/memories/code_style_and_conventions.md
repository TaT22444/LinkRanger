# LinkRanger - コードスタイルと規約

## ファイル構成
```
src/
├── components/     # 再利用可能UIコンポーネント
├── screens/       # 画面単位のコンポーネント
├── services/      # ビジネスロジック、API呼び出し
├── contexts/      # React Context
├── types/         # TypeScript型定義
├── config/        # 設定ファイル
└── utils/         # ユーティリティ関数
```

## 命名規則
- **ファイル名**: PascalCase (例: AccountScreen.tsx, LinkCard.tsx)
- **コンポーネント**: PascalCase (例: AccountScreen, LinkCard)
- **Service クラス**: PascalCase (例: PlanService, AIUsageManager)
- **関数/変数**: camelCase (例: getUserPlan, renewalDateText)
- **定数**: UPPER_SNAKE_CASE (例: PLAN_LIMITS)

## TypeScript規約
- 型定義は src/types/index.ts で一元管理
- インターfaces は英語で記述
- コメントは日本語可
- 必要に応じて JSDoc コメント追加

## React 規約
- 関数コンポーネントを使用
- Hooks を活用 (useState, useEffect, useMemo)
- Context API で状態管理
- styled-components ではなく StyleSheet を使用

## Services 層
- Singleton パターンを多用 (例: AIUsageManager.getInstance())
- static メソッドでユーティリティ機能提供
- Firebase操作の抽象化
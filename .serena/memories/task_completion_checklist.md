# LinkRanger - タスク完了時のチェックリスト

## コード変更後の確認事項
1. **TypeScript エラーチェック**
   - IDE でエラーが出ていないか確認
   - 型定義が正しく適用されているか

2. **動作テスト**
   - Development build で動作確認
   - 主要機能の動作テスト
   - エラーハンドリングの確認

3. **TestFlight ビルド（本格テスト時）**
   ```bash
   eas build --profile testflight --platform ios
   npx eas submit --platform ios --latest
   ```

4. **ログ確認**
   - Console.log でデバッグ情報確認
   - Firebase コンソールでデータ確認

## 特別な注意事項
- **expo-notifications**: Development build では動作しない場合がある。TestFlight で最終確認
- **ビルド番号**: App Store Connect 送信時は必ず buildNumber を増加
- **環境変数**: .env ファイルの設定を確認

## Firebase 関連
- Firestore セキュリティルールの確認
- データ構造の整合性確認
- インデックスの最適化

## パフォーマンス
- useMemo の適切な使用
- 不要な re-render の防止
- メモリリークの防止
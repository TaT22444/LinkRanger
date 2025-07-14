# Gemini API設定手順

## 1. Google AI StudioでAPIキーを取得

1. [Google AI Studio](https://aistudio.google.com/)にアクセス
2. Googleアカウントでログイン
3. 左側のメニューから「API keys」を選択
4. 「Create API key」をクリック
5. 「Create API key in new project」または既存のプロジェクトを選択
6. 生成されたAPIキーをコピー

## 2. Firebase環境変数に設定

### 方法1: Firebase CLI（推奨）
```bash
cd LinkRanger/functions
firebase functions:config:set gemini.api_key="YOUR_GEMINI_API_KEY"
firebase deploy --only functions
```

### 方法2: 環境変数ファイル（開発用）
```bash
cd LinkRanger/functions
echo "GEMINI_API_KEY=your_actual_gemini_api_key_here" > .env
```

**注意**: `.env`ファイルは`.gitignore`に含まれているため、本番環境では使用されません。

## 3. 本番環境での設定

本番環境では、Firebase Functionsの環境変数を使用します：

```bash
# 現在の設定を確認
firebase functions:config:get

# APIキーを設定
firebase functions:config:set gemini.api_key="YOUR_ACTUAL_API_KEY"

# 設定を反映
firebase deploy --only functions
```

## 4. APIキーの確認

設定が正しく行われているか確認：

```bash
firebase functions:config:get gemini
```

出力例：
```json
{
  "api_key": "AIzaSy..."
}
```

## 5. セキュリティ上の注意事項

- APIキーは絶対にクライアントサイドコードに含めない
- GitHubなどのリポジトリにAPIキーをコミットしない
- 定期的にAPIキーをローテーションする
- 使用量制限を設定する

## 6. 使用量制限の設定

Google AI Studioで以下を設定することを推奨：

1. **日次制限**: 1日あたりのリクエスト数を制限
2. **月次制限**: 月あたりのリクエスト数を制限
3. **アラート**: 使用量が一定値を超えた場合の通知

## 7. トラブルシューティング

### エラー: "GEMINI_API_KEY is not set"
- 環境変数が正しく設定されているか確認
- Firebase Functionsをデプロイし直す

### エラー: "API key not valid"
- APIキーが正しいか確認
- APIキーが有効化されているか確認

### エラー: "Quota exceeded"
- Google AI Studioで使用量制限を確認
- 制限を増やすか、時間をおいて再試行

## 8. 実装確認

以下のコマンドでCloud Functionsが正しく動作するか確認：

```bash
# ヘルスチェック
curl -X POST https://asia-northeast1-linkranger-b096e.cloudfunctions.net/healthCheck

# AI機能テスト（実際のAPIキーが必要）
# Firebase Functionsコンソールでテスト実行
```

## 9. コスト最適化

- 入力テキストを1000文字に制限
- キャッシュ機能を活用
- フォールバック処理で不要なAPI呼び出しを削減
- ユーザープランによる使用量制限

Gemini APIは比較的低コストですが、適切な制限を設けることで予期しないコスト増加を防げます。 
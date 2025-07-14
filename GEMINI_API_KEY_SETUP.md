# 🔑 Gemini APIキー設定手順

## 1. Google AI StudioでAPIキーを取得

### ステップ1: Google AI Studioにアクセス
1. [Google AI Studio](https://aistudio.google.com/)にアクセス
2. Googleアカウントでログイン

### ステップ2: APIキーを作成
1. 左側のメニューから「API keys」を選択
2. 「Create API key」ボタンをクリック
3. 「Create API key in new project」を選択（または既存のプロジェクトを選択）
4. 生成されたAPIキーをコピー（例：`AIzaSyDx...`）

## 2. Firebase環境変数に設定

### 現在のプレースホルダーを削除
```bash
cd LinkRanger/functions
firebase functions:config:unset gemini.api_key
```

### 実際のAPIキーを設定
```bash
firebase functions:config:set gemini.api_key="AIzaSyDx_YOUR_ACTUAL_API_KEY_HERE"
```

### 設定確認
```bash
firebase functions:config:get gemini
```

出力例：
```json
{
  "api_key": "AIzaSyDx..."
}
```

## 3. Cloud Functionsを再デプロイ

```bash
cd LinkRanger
firebase deploy --only functions
```

## 4. 動作確認

### Firebase Functionsログを確認
```bash
firebase functions:log --only generateAITags
```

### テスト実行
アプリでリンクを保存して、以下のログが出力されることを確認：
- `Sending request to Gemini API`
- `Received response from Gemini API`
- `Gemini tags generated successfully`

## 5. トラブルシューティング

### エラー: "Gemini API key not configured"
```bash
# APIキーが設定されているか確認
firebase functions:config:get gemini

# 設定されていない場合
firebase functions:config:set gemini.api_key="YOUR_ACTUAL_API_KEY"
firebase deploy --only functions
```

### エラー: "API key not valid"
1. Google AI Studioで新しいAPIキーを生成
2. 古いAPIキーを削除
3. 新しいAPIキーを設定

### エラー: "Quota exceeded"
1. Google AI Studioで使用量を確認
2. 必要に応じて制限を増やす

## 6. セキュリティ設定

### APIキーの制限設定（推奨）
1. Google Cloud Consoleにアクセス
2. 「APIs & Services」→「Credentials」
3. 作成したAPIキーを選択
4. 「Restrict key」で以下を設定：
   - Application restrictions: None（Cloud Functionsの場合）
   - API restrictions: Generative Language API

### 使用量アラート設定
1. Google Cloud Consoleで「Billing」
2. 「Budgets & alerts」
3. 新しい予算を作成（例：月$10）
4. アラートを設定

## 7. 実際のAPIキー例

❌ **間違い（プレースホルダー）:**
```
YOUR_GEMINI_API_KEY_HERE
```

✅ **正しい（実際のAPIキー）:**
```
AIzaSyDx1234567890abcdefghijklmnopqrstuvwxyz
```

## 8. 最終確認

設定が完了したら、以下を確認：

1. **環境変数確認**
   ```bash
   firebase functions:config:get gemini
   ```

2. **デプロイ確認**
   ```bash
   firebase deploy --only functions
   ```

3. **動作確認**
   - アプリでリンクを保存
   - 「その他」以外のタグが生成されることを確認
   - エラーが発生しないことを確認

これで実際のGemini APIを使用してAIタグ生成が動作するはずです！ 
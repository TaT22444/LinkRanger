#!/bin/bash

# Cloud Scheduler設定スクリプト
# 3日間未読リンク通知のためのスケジュール設定

echo "🕐 Cloud Scheduler設定開始..."

# プロジェクトID
PROJECT_ID="linkranger-b096e"
REGION="asia-northeast1"
FUNCTION_URL="https://${REGION}-${PROJECT_ID}.cloudfunctions.net/checkUnusedLinksScheduled"

# Cloud Scheduler API を有効化
echo "📡 Cloud Scheduler API を有効化中..."
gcloud services enable cloudscheduler.googleapis.com --project=$PROJECT_ID

# Cloud Functions API を有効化（確認）
echo "⚡ Cloud Functions API を有効化中..."
gcloud services enable cloudfunctions.googleapis.com --project=$PROJECT_ID

# 既存のジョブがあるかチェック
EXISTING_JOB=$(gcloud scheduler jobs list --project=$PROJECT_ID --filter="name:unused-links-checker" --format="value(name)")

if [ ! -z "$EXISTING_JOB" ]; then
    echo "🗑️ 既存のスケジューラージョブを削除中..."
    gcloud scheduler jobs delete unused-links-checker --project=$PROJECT_ID --location=$REGION --quiet
fi

# スケジューラージョブを作成
echo "📅 スケジューラージョブを作成中..."
gcloud scheduler jobs create http unused-links-checker \
    --project=$PROJECT_ID \
    --location=$REGION \
    --schedule="0 */3 * * *" \
    --uri=$FUNCTION_URL \
    --http-method=POST \
    --headers="Content-Type=application/json" \
    --headers="User-Agent=Google-Cloud-Scheduler" \
    --body='{"source":"cloud-scheduler","timestamp":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}' \
    --description="3日間未読リンクのFCM通知チェック（3時間ごと）"

if [ $? -eq 0 ]; then
    echo "✅ Cloud Scheduler設定完了!"
    echo "📊 設定内容:"
    echo "   - ジョブ名: unused-links-checker"
    echo "   - 実行間隔: 3時間ごと (0 */3 * * *)"
    echo "   - 対象URL: $FUNCTION_URL"
    echo "   - リージョン: $REGION"
    
    # 設定を確認
    echo ""
    echo "🔍 作成されたジョブを確認中..."
    gcloud scheduler jobs describe unused-links-checker --project=$PROJECT_ID --location=$REGION
    
    echo ""
    echo "🚀 手動でテスト実行するには:"
    echo "   gcloud scheduler jobs run unused-links-checker --project=$PROJECT_ID --location=$REGION"
else
    echo "❌ Cloud Scheduler設定に失敗しました"
    exit 1
fi
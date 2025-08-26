#!/bin/bash

# Cloud Functions 本番環境テストスクリプト
# App Store公開前の最終動作確認用

echo "🧪 Cloud Functions 本番環境テスト開始"
echo "======================================"

# 設定
PROJECT_ID="linkranger-b096e"
REGION="asia-northeast1"
BASE_URL="https://${REGION}-${PROJECT_ID}.cloudfunctions.net"

# 色付きログ関数
log_success() {
    echo "✅ $1"
}

log_error() {
    echo "❌ $1"
}

log_info() {
    echo "ℹ️  $1"
}

log_warning() {
    echo "⚠️  $1"
}

# テスト関数
test_cloud_scheduler() {
    echo ""
    echo "📅 Cloud Scheduler テスト"
    echo "------------------------"
    
    log_info "checkUnusedLinksScheduled関数をテスト実行中..."
    
    # Cloud Schedulerシミュレーション（User-Agentヘッダー付き）
    RESPONSE=$(curl -s -w "%{http_code}" -X POST \
        "${BASE_URL}/checkUnusedLinksScheduled" \
        -H "Content-Type: application/json" \
        -H "User-Agent: Google-Cloud-Scheduler" \
        -d '{"source": "cloud-scheduler", "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'"}' \
        2>/dev/null)
    
    HTTP_CODE="${RESPONSE: -3}"
    BODY="${RESPONSE%???}"
    
    if [ "$HTTP_CODE" = "200" ]; then
        log_success "Cloud Scheduler関数テスト成功 (HTTP $HTTP_CODE)"
        log_info "レスポンス: $BODY"
    else
        log_error "Cloud Scheduler関数テスト失敗 (HTTP $HTTP_CODE)"
        log_error "レスポンス: $BODY"
    fi
}

test_apple_webhook() {
    echo ""
    echo "🍎 Apple Webhook テスト"
    echo "------------------------"
    
    log_info "appleWebhookHandler関数の認証テスト中..."
    
    # 不正なリクエスト（署名なし）
    RESPONSE=$(curl -s -w "%{http_code}" -X POST \
        "${BASE_URL}/appleWebhookHandler" \
        -H "Content-Type: application/json" \
        -d '{"test": "invalid_request"}' \
        2>/dev/null)
    
    HTTP_CODE="${RESPONSE: -3}"
    
    if [ "$HTTP_CODE" = "400" ] || [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
        log_success "Apple Webhook セキュリティチェック成功 (不正リクエストを適切に拒否: HTTP $HTTP_CODE)"
    else
        log_warning "Apple Webhook セキュリティチェック: 予期しないレスポンス (HTTP $HTTP_CODE)"
    fi
}

test_fcm_registration() {
    echo ""
    echo "🔥 FCM Token Registration テスト"
    echo "--------------------------------"
    
    log_info "registerFCMToken関数の認証チェック中..."
    
    # 認証なしのリクエスト
    RESPONSE=$(curl -s -w "%{http_code}" -X POST \
        "${BASE_URL}/registerFCMToken" \
        -H "Content-Type: application/json" \
        -d '{"fcmToken": "test_token", "platform": "ios"}' \
        2>/dev/null)
    
    HTTP_CODE="${RESPONSE: -3}"
    
    if [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "403" ]; then
        log_success "FCM Token Registration セキュリティチェック成功 (未認証リクエストを適切に拒否: HTTP $HTTP_CODE)"
    else
        log_warning "FCM Token Registration: 予期しないレスポンス (HTTP $HTTP_CODE)"
    fi
}

test_firebase_functions_status() {
    echo ""
    echo "☁️ Firebase Functions 状態確認"
    echo "-------------------------------"
    
    # Firebase CLIでデプロイ状況確認
    if command -v firebase &> /dev/null; then
        log_info "Firebase Functions デプロイ状況を確認中..."
        firebase functions:list --project=$PROJECT_ID 2>/dev/null | grep -E "(registerFCMToken|checkUnusedLinksScheduled|appleWebhookHandler)" || {
            log_warning "Firebase CLI でのFunctions確認に失敗"
        }
    else
        log_warning "Firebase CLI が見つかりません"
    fi
}

check_environment_variables() {
    echo ""
    echo "🔧 環境変数チェック"
    echo "------------------"
    
    # .env ファイルの本番設定確認
    if [ -f ".env.production" ]; then
        log_info "本番環境変数ファイル (.env.production) を確認中..."
        
        if grep -q "EXPO_PUBLIC_ENABLE_TEST_ACCOUNTS=false" .env.production; then
            log_success "テストアカウント無効化: 正常"
        else
            log_error "テストアカウントが有効になっている可能性があります"
        fi
        
        if grep -q "EXPO_PUBLIC_DEBUG_MODE=false" .env.production; then
            log_success "デバッグモード無効化: 正常"
        else
            log_error "デバッグモードが有効になっている可能性があります"
        fi
    else
        log_warning ".env.production ファイルが見つかりません"
    fi
    
    # eas.json の本番設定確認
    if [ -f "eas.json" ]; then
        log_info "EAS 本番設定 (eas.json) を確認中..."
        
        if grep -A 10 '"production"' eas.json | grep -q '"EXPO_PUBLIC_ENABLE_TEST_ACCOUNTS": "false"'; then
            log_success "EAS本番ビルド: テストアカウント無効化正常"
        else
            log_error "EAS本番ビルドでテストアカウントが有効になっている可能性があります"
        fi
    fi
}

generate_test_report() {
    echo ""
    echo "📊 テスト結果レポート"
    echo "===================="
    
    echo "実行日時: $(date)"
    echo "プロジェクト: $PROJECT_ID"
    echo "リージョン: $REGION"
    echo ""
    echo "📝 App Store 公開前チェックリスト:"
    echo "- [ ] Cloud Scheduler 正常動作確認"
    echo "- [ ] Apple Webhook セキュリティ確認"  
    echo "- [ ] FCM Token Registration セキュリティ確認"
    echo "- [ ] APNs証明書設定 (Firebase Console)"
    echo "- [ ] 本番環境変数設定確認"
    echo ""
    echo "📋 追加で実行すべきテスト:"
    echo "1. TestFlightでの実機FCM通知テスト"
    echo "2. Firebase Console → Functions → Logs でエラー確認"
    echo "3. 実際のユーザーでの3日間未読リンク通知テスト"
}

# メイン実行
main() {
    log_info "プロジェクト: $PROJECT_ID"
    log_info "ベースURL: $BASE_URL"
    
    test_firebase_functions_status
    test_cloud_scheduler
    test_apple_webhook
    test_fcm_registration
    check_environment_variables
    generate_test_report
    
    echo ""
    log_success "Cloud Functions 本番環境テスト完了"
    echo "詳細なログはFirebase Console → Functions → Logs で確認してください"
}

# 実行
main
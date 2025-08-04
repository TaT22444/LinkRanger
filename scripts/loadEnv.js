// 環境変数自動読み込みスクリプト
const fs = require('fs');
const path = require('path');

function loadEnvironmentVariables() {
  const environment = process.env.NODE_ENV || 'development';
  const envFile = `.env.${environment}`;
  const envPath = path.join(__dirname, '..', envFile);
  
  console.log(`🔧 環境設定読み込み: ${environment}`);
  console.log(`📁 設定ファイル: ${envFile}`);
  
  if (fs.existsSync(envPath)) {
    console.log(`✅ ${envFile} を読み込み中...`);
    
    // 環境変数ファイルの内容を読み込み
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    
    lines.forEach(line => {
      if (line.trim() && !line.startsWith('#')) {
        const [key, value] = line.split('=');
        if (key && value) {
          process.env[key.trim()] = value.trim();
        }
      }
    });
    
    console.log(`✅ 環境変数読み込み完了`);
    
    // 重要な設定の確認
    const testAccountsEnabled = process.env.EXPO_PUBLIC_ENABLE_TEST_ACCOUNTS;
    const debugMode = process.env.EXPO_PUBLIC_DEBUG_MODE;
    
    console.log(`🧪 テストアカウント: ${testAccountsEnabled}`);
    console.log(`🐛 デバッグモード: ${debugMode}`);
    
    if (environment === 'production' && testAccountsEnabled === 'true') {
      console.warn('⚠️  警告: 本番環境でテストアカウントが有効になっています！');
    }
    
  } else {
    console.warn(`⚠️  ${envFile} が見つかりません`);
    console.log(`📁 デフォルト設定を使用します`);
  }
}

module.exports = { loadEnvironmentVariables };

// 直接実行された場合
if (require.main === module) {
  loadEnvironmentVariables();
} 
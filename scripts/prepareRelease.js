// リリース準備スクリプト - 環境変数を本番用に変更
const fs = require('fs');
const path = require('path');

function prepareForRelease() {
  const envPath = path.join(__dirname, '..', '.env');
  
  if (!fs.existsSync(envPath)) {
    console.error('❌ .envファイルが見つかりません');
    process.exit(1);
  }

  console.log('🚀 本番リリース準備開始...');

  // .envファイルを読み込み
  let envContent = fs.readFileSync(envPath, 'utf8');

  // 本番用設定に変更
  const changes = [
    {
      from: /EXPO_PUBLIC_ENABLE_TEST_ACCOUNTS=true/g,
      to: 'EXPO_PUBLIC_ENABLE_TEST_ACCOUNTS=false',
      description: 'テストアカウント機能を無効化'
    },
    {
      from: /EXPO_PUBLIC_DEBUG_MODE=true/g,
      to: 'EXPO_PUBLIC_DEBUG_MODE=false', 
      description: 'デバッグモードを無効化'
    }
  ];

  let changesMade = 0;
  
  changes.forEach(change => {
    if (change.from.test(envContent)) {
      envContent = envContent.replace(change.from, change.to);
      console.log(`✅ ${change.description}`);
      changesMade++;
    }
  });

  if (changesMade === 0) {
    console.log('✅ 既に本番用設定になっています');
    return;
  }

  // バックアップ作成
  const backupPath = `${envPath}.backup.${Date.now()}`;
  fs.writeFileSync(backupPath, fs.readFileSync(envPath));
  console.log(`💾 バックアップ作成: ${path.basename(backupPath)}`);

  // 変更を保存
  fs.writeFileSync(envPath, envContent);
  console.log('✅ 本番用設定に変更完了');

  // 設定確認
  console.log('\n📋 現在の設定:');
  const lines = envContent.split('\n');
  lines.forEach(line => {
    if (line.includes('EXPO_PUBLIC_ENABLE_TEST_ACCOUNTS') || 
        line.includes('EXPO_PUBLIC_DEBUG_MODE')) {
      console.log(`   ${line}`);
    }
  });

  console.log('\n⚠️  重要: リリース後は開発用設定に戻すことを忘れずに！');
  console.log('   元に戻すコマンド: node scripts/prepareRelease.js --restore');
}

function restoreFromBackup() {
  const envPath = path.join(__dirname, '..', '.env');
  const backupDir = path.dirname(envPath);
  
  // 最新のバックアップファイルを探す
  const backupFiles = fs.readdirSync(backupDir)
    .filter(file => file.startsWith('.env.backup.'))
    .sort()
    .reverse();

  if (backupFiles.length === 0) {
    console.error('❌ バックアップファイルが見つかりません');
    process.exit(1);
  }

  const latestBackup = path.join(backupDir, backupFiles[0]);
  console.log(`🔄 設定を復元中: ${backupFiles[0]}`);

  // バックアップから復元
  fs.copyFileSync(latestBackup, envPath);
  console.log('✅ 開発用設定に復元完了');

  // 確認
  const envContent = fs.readFileSync(envPath, 'utf8');
  console.log('\n📋 復元された設定:');
  const lines = envContent.split('\n');
  lines.forEach(line => {
    if (line.includes('EXPO_PUBLIC_ENABLE_TEST_ACCOUNTS') || 
        line.includes('EXPO_PUBLIC_DEBUG_MODE')) {
      console.log(`   ${line}`);
    }
  });
}

// CLI実行
const command = process.argv[2];

if (command === '--restore') {
  restoreFromBackup();
} else {
  prepareForRelease();
}

console.log('\n💡 使用方法:');
console.log('   本番準備: node scripts/prepareRelease.js');
console.log('   開発復帰: node scripts/prepareRelease.js --restore'); 
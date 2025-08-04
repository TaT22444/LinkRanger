// デプロイメント支援スクリプト
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class DeploymentHelper {
  constructor() {
    this.environments = ['development', 'staging', 'production'];
  }

  // 環境別ビルド・デプロイ
  async deployToEnvironment(environment) {
    if (!this.environments.includes(environment)) {
      throw new Error(`無効な環境: ${environment}`);
    }

    console.log(`🚀 ${environment} 環境へのデプロイを開始...`);

    try {
      // 1. 環境変数チェック
      this.validateEnvironment(environment);

      // 2. テストアカウント監査（本番のみ）
      if (environment === 'production') {
        console.log('🔍 本番デプロイ前チェック...');
        await this.runProductionChecks();
      }

      // 3. ビルド
      console.log('🔨 ビルド開始...');
      execSync(`NODE_ENV=${environment} npm run build`, { stdio: 'inherit' });

      // 4. Firebase Functions デプロイ
      console.log('☁️ Cloud Functions デプロイ...');
      execSync(`firebase deploy --only functions --project ${this.getFirebaseProject(environment)}`, { stdio: 'inherit' });

      // 5. Expo アプリデプロイ
      console.log('📱 Expo アプリデプロイ...');
      const channel = this.getExpoChannel(environment);
      execSync(`expo publish --channel ${channel}`, { stdio: 'inherit' });

      console.log(`✅ ${environment} デプロイ完了！`);

    } catch (error) {
      console.error(`❌ デプロイ失敗:`, error.message);
      process.exit(1);
    }
  }

  // 環境変数バリデーション
  validateEnvironment(environment) {
    const envFile = `.env.${environment}`;
    const envPath = path.join(__dirname, '..', envFile);

    if (!fs.existsSync(envPath)) {
      throw new Error(`環境設定ファイルが見つかりません: ${envFile}`);
    }

    const envContent = fs.readFileSync(envPath, 'utf8');
    
    // 必須環境変数チェック
    const requiredVars = [
      'EXPO_PUBLIC_FIREBASE_API_KEY',
      'EXPO_PUBLIC_FIREBASE_PROJECT_ID', 
      'GEMINI_API_KEY',
      'EXPO_PUBLIC_ENABLE_TEST_ACCOUNTS'
    ];

    for (const varName of requiredVars) {
      if (!envContent.includes(varName)) {
        throw new Error(`必須環境変数が不足: ${varName}`);
      }
    }

    // 本番環境の特別チェック
    if (environment === 'production') {
      if (envContent.includes('EXPO_PUBLIC_ENABLE_TEST_ACCOUNTS=true')) {
        throw new Error('本番環境でテストアカウントが有効になっています！');
      }
    }

    console.log(`✅ 環境変数バリデーション完了: ${environment}`);
  }

  // 本番デプロイ前チェック
  async runProductionChecks() {
    console.log('🔐 セキュリティチェック...');
    
    try {
      // テストアカウント監査
      execSync('node scripts/auditTestAccounts.js', { stdio: 'inherit' });
      
      // TODO: 追加のセキュリティチェック
      // - API キーの漏洩チェック
      // - 不要なデバッグコードの確認
      // - バンドルサイズチェック
      
      console.log('✅ 本番デプロイ前チェック完了');
    } catch (error) {
      throw new Error('本番デプロイ前チェックに失敗しました');
    }
  }

  // Firebase プロジェクト名取得
  getFirebaseProject(environment) {
    const projects = {
      development: 'linkranger-dev',
      staging: 'linkranger-staging',
      production: 'linkranger-prod'
    };
    return projects[environment];
  }

  // Expo チャンネル取得
  getExpoChannel(environment) {
    const channels = {
      development: 'dev',
      staging: 'staging',
      production: 'production'
    };
    return channels[environment];
  }

  // 緊急ロールバック
  async emergencyRollback(version) {
    console.log(`🚨 緊急ロールバック開始: ${version}`);
    
    try {
      // Git タグからロールバック
      execSync(`git checkout ${version}`, { stdio: 'inherit' });
      
      // 緊急ビルド・デプロイ
      execSync('NODE_ENV=production npm run build', { stdio: 'inherit' });
      execSync('firebase deploy --only functions --project linkranger-prod', { stdio: 'inherit' });
      execSync('expo publish --channel production', { stdio: 'inherit' });
      
      console.log(`✅ ロールバック完了: ${version}`);
    } catch (error) {
      console.error(`❌ ロールバック失敗:`, error.message);
    }
  }

  // デプロイ履歴記録
  recordDeployment(environment, version, success) {
    const deploymentLog = {
      timestamp: new Date().toISOString(),
      environment,
      version,
      success,
      deployer: process.env.USER || 'unknown'
    };

    const logFile = path.join(__dirname, '..', 'deployments.log');
    fs.appendFileSync(logFile, JSON.stringify(deploymentLog) + '\n');
  }
}

// CLI インターフェース
async function main() {
  const helper = new DeploymentHelper();
  const command = process.argv[2];
  const environment = process.argv[3];

  switch (command) {
    case 'deploy':
      if (!environment) {
        console.error('使用法: node deploymentHelper.js deploy <environment>');
        process.exit(1);
      }
      await helper.deployToEnvironment(environment);
      break;

    case 'rollback':
      const version = process.argv[3];
      if (!version) {
        console.error('使用法: node deploymentHelper.js rollback <version>');
        process.exit(1);
      }
      await helper.emergencyRollback(version);
      break;

    case 'validate':
      if (!environment) {
        console.error('使用法: node deploymentHelper.js validate <environment>');
        process.exit(1);
      }
      helper.validateEnvironment(environment);
      break;

    default:
      console.log('使用可能なコマンド:');
      console.log('  deploy <environment>     - 指定環境にデプロイ');
      console.log('  rollback <version>       - 緊急ロールバック');
      console.log('  validate <environment>   - 環境設定検証');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = DeploymentHelper; 
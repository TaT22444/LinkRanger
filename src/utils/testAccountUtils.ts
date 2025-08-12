// テストアカウント判定ユーティリティ

// テストアカウントとして扱うメールドメインのリスト
// const TEST_EMAIL_DOMAINS = [
//   'test.linkranger.com',
//   'dev.linkranger.com',
//   'staging.linkranger.com',
// ];

// // テストアカウントとして扱う特定のメールアドレス
// const TEST_EMAIL_ADDRESSES = [
//   'test@example.com',
//   'demo@linkranger.com',
//   'development@linkranger.com',
// ];

// プラン別テストアカウント（メールアドレス -> プラン のマッピング）
const TEST_ACCOUNT_PLANS: Record<string, 'free' | 'plus' | 'pro' | 'unlimited'> = {
  // 無制限テストアカウント
  'tatsu0823takasago@icloud.com': 'unlimited',
  
  // Plusプランテストアカウント
  'plus.test@linkranger.com': 'plus',
  'test.plus@example.com': 'plus',
  
  // Proプランテストアカウント
  'pro.test@linkranger.com': 'pro',
  'test.pro@example.com': 'pro',
  
  // 従来のテストアカウント（無制限扱い）
  'test@example.com': 'unlimited',
  'demo@linkranger.com': 'unlimited',
  'development@linkranger.com': 'unlimited',
};

// 開発者アカウント（環境変数で制御）
const DEVELOPER_EMAILS = process.env.EXPO_PUBLIC_DEVELOPER_EMAILS?.split(',') || [];

/**
 * メールアドレスベースでテストアカウントかどうかを判定
 */
export function isTestAccountByEmail(email: string | null): boolean {
  if (!email) return false;
  
  // 特定のメールアドレス
  // if (TEST_EMAIL_ADDRESSES.includes(email.toLowerCase())) {
  //   return true;
  // }
  
  // 開発者メールアドレス（環境変数）
  if (DEVELOPER_EMAILS.includes(email.toLowerCase())) {
    return true;
  }
  
  // ドメインベースの判定
  // const domain = email.split('@')[1]?.toLowerCase();
  // if (domain && TEST_EMAIL_DOMAINS.includes(domain)) {
  //   return true;
  // }
  
  return false;
}

/**
 * 開発環境かどうかの判定
 */
export function isDevelopmentMode(): boolean {
  return __DEV__ || process.env.NODE_ENV === 'development';
}

/**
 * テストアカウントのプランタイプを取得
 */
export function getTestAccountPlan(email: string | null): 'free' | 'plus' | 'pro' | 'unlimited' | null {
  if (!email) return null;
  
  const lowerEmail = email.toLowerCase();
  
  // プラン別テストアカウントをチェック
  if (TEST_ACCOUNT_PLANS[lowerEmail]) {
    return TEST_ACCOUNT_PLANS[lowerEmail];
  }
  
  // 環境変数の開発者メールアドレスをチェック（無制限扱い）
  if (DEVELOPER_EMAILS.includes(lowerEmail)) {
    return 'unlimited';
  }
  
  // ドメインベースのテストアカウントは無制限扱い
  // const domain = email.split('@')[1]?.toLowerCase();
  // if (domain && TEST_EMAIL_DOMAINS.includes(domain)) {
  //   return 'unlimited';
  // }
  
  return null;
}

/**
 * 無制限テストアカウントかどうかを判定
 */
export function isUnlimitedTestAccount(email: string | null): boolean {
  const testPlan = getTestAccountPlan(email);
  return testPlan === 'unlimited';
}

/**
 * 統合テストアカウント判定（複数の方法を組み合わせ）
 */
export function isTestAccount(user: {
  email: string | null;
  isTestAccount?: boolean;
  role?: 'user' | 'admin' | 'tester';
}): boolean {
  // 1. Firestoreフラグベース（最優先）
  if (user.isTestAccount === true || user.role === 'admin' || user.role === 'tester') {
    return true;
  }
  
  // 2. メールアドレスベース
  if (isTestAccountByEmail(user.email)) {
    return true;
  }
  
  // 3. プラン別テストアカウント
  if (getTestAccountPlan(user.email) !== null) {
    return true;
  }
  
  // 4. 開発環境での特別扱い（オプション）
  if (isDevelopmentMode() && user.email?.includes('dev')) {
    return true;
  }
  
  return false;
}

/**
 * テストアカウント情報をログ出力
 */
export function logTestAccountInfo(user: {
  uid?: string;
  email: string | null;
  isTestAccount?: boolean;
  role?: 'user' | 'admin' | 'tester';
}): void {
  const testStatus = isTestAccount(user);
  
  if (testStatus) {
    console.log('🧪 テストアカウント検出:', {
      uid: user.uid,
      email: user.email,
      isTestAccount: user.isTestAccount,
      role: user.role,
      emailBasedTest: isTestAccountByEmail(user.email),
      developmentMode: isDevelopmentMode()
    });
  }
} 
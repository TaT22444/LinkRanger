// テストアカウント判定ユーティリティ

// テストアカウントとして扱うメールドメインのリスト
const TEST_EMAIL_DOMAINS = [
  'test.linkranger.com',
  'dev.linkranger.com',
  'staging.linkranger.com',
];

// テストアカウントとして扱う特定のメールアドレス
const TEST_EMAIL_ADDRESSES = [
  'test@example.com',
  'demo@linkranger.com',
  'development@linkranger.com',
];

// 開発者アカウント（環境変数で制御）
const DEVELOPER_EMAILS = process.env.EXPO_PUBLIC_DEVELOPER_EMAILS?.split(',') || [];

/**
 * メールアドレスベースでテストアカウントかどうかを判定
 */
export function isTestAccountByEmail(email: string | null): boolean {
  if (!email) return false;
  
  // 特定のメールアドレス
  if (TEST_EMAIL_ADDRESSES.includes(email.toLowerCase())) {
    return true;
  }
  
  // 開発者メールアドレス（環境変数）
  if (DEVELOPER_EMAILS.includes(email.toLowerCase())) {
    return true;
  }
  
  // ドメインベースの判定
  const domain = email.split('@')[1]?.toLowerCase();
  if (domain && TEST_EMAIL_DOMAINS.includes(domain)) {
    return true;
  }
  
  return false;
}

/**
 * 開発環境かどうかの判定
 */
export function isDevelopmentMode(): boolean {
  return __DEV__ || process.env.NODE_ENV === 'development';
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
  
  // 3. 開発環境での特別扱い（オプション）
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
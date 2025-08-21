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
 * UIDベースでテストアカウントかどうかを判定
 */
export function isTestAccountByUID(uid: string | null): boolean {
  if (!uid) return false;
  
  // 特定のテストアカウントUID（必要に応じて追加）
  const TEST_UIDS: string[] = [
    // 'uid1',
    // 'uid2',
  ];
  
  return TEST_UIDS.includes(uid);
}

/**
 * 開発環境かどうかの判定
 */
export function isDevelopmentMode(): boolean {
  return __DEV__ || process.env.NODE_ENV === 'development';
}

/**
 * テストアカウントのプランタイプを取得
 * UIDベースまたはFirestoreのフラグベース
 */
export function getTestAccountPlan(uid: string | null): 'free' | 'plus' | 'pro' | 'unlimited' | null {
  if (!uid) return null;
  
  // 特定のテストアカウントUIDのプランマッピング
  const UID_PLAN_MAP: { [key: string]: 'free' | 'plus' | 'pro' | 'unlimited' } = {
    // サンドボックス用のUIDを追加する場合はここに記述
    // 'sandbox_uid_1': 'unlimited',
    // 'test_uid_2': 'plus',
  };
  
  return UID_PLAN_MAP[uid] || null;
}

/**
 * 無制限テストアカウントかどうかを判定
 */
export function isUnlimitedTestAccount(uid: string | null): boolean {
  const testPlan = getTestAccountPlan(uid);
  return testPlan === 'unlimited';
}

/**
 * 統合テストアカウント判定（Firestore フラグベース + UIDベース）
 */
export function isTestAccount(user: {
  uid?: string;
  isTestAccount?: boolean;
  role?: 'user' | 'admin' | 'tester';
}): boolean {
  // 1. Firestoreフラグベース（最優先）
  if (user.isTestAccount === true || user.role === 'admin' || user.role === 'tester') {
    return true;
  }
  
  // 2. UIDベース
  if (user.uid && isTestAccountByUID(user.uid)) {
    return true;
  }
  
  // 3. プラン別テストアカウント（UIDベース）
  if (user.uid && getTestAccountPlan(user.uid) !== null) {
    return true;
  }
  
  return false;
}

/**
 * テストアカウント情報をログ出力
 */
export function logTestAccountInfo(user: {
  uid?: string;
  isTestAccount?: boolean;
  role?: 'user' | 'admin' | 'tester';
}): void {
  const testStatus = isTestAccount(user);
  
  if (testStatus) {
    console.log('🧪 テストアカウント検出:', {
      uid: user.uid,
      isTestAccount: user.isTestAccount,
      role: user.role,
      uidBasedTest: user.uid ? isTestAccountByUID(user.uid) : false,
      developmentMode: isDevelopmentMode()
    });
  }
} 
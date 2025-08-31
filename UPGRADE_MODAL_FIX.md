# 📱 UpgradeModal.tsx 修正の現状と対応案

## 🔍 **修正の現状**

### ✅ **既に実装済みの改善点**

1. **既存購読の事前チェック機能**
   - `PlanService.getEffectivePlan(user)`を使用して既存プランをチェック
   - Plusプランに既に加入済みの場合は適切な案内を表示
   - 購入処理への進行を防止

2. **環境判定の改善**
   - TestFlight環境の判定ロジックが明確化
   - 開発環境での適切な案内が追加

3. **開発環境でのユーザー案内**
   - TestFlight版での制限事項を説明
   - テスト用アップグレードの手順を案内

### 📍 **現在のコードの該当箇所**

```typescript
// 既存購読チェック（261-272行目）
const currentEffectivePlan = PlanService.getEffectivePlan(user);
if (currentEffectivePlan === 'plus' && planName === 'plus') {
  Alert.alert(
    '登録済み',
    '既にPlusプランにご登録済みです。プランの管理はApp Storeのアカウント設定から行えます。',
    [
      { text: 'OK' },
      { text: 'プランを管理', onPress: handleManageSubscription },
    ]
  );
  return;
}

// 環境判定（289-290行目）
const isTestFlight = !__DEV__ && Constants.executionEnvironment === 'standalone' &&
                     process.env.EXPO_PUBLIC_ENABLE_TEST_ACCOUNTS === 'true';
```

## ⚠️ **改善が必要な点**

### **1. 既存購読チェックのロジック問題**

**現状の問題**:
- `getEffectivePlan`は機能制限用のプランを返す
- 表示用プランとの整合性が取れない可能性
- ダウングレード予定がある場合の処理が不適切

**修正案**:
```typescript
// 表示用プランでチェック
const currentDisplayPlan = PlanService.getDisplayPlan(user);
if (currentDisplayPlan === 'plus' && planName === 'plus') {
  // 既にPlusプランに加入済み
}
```

### **2. TestFlight環境での処理が不完全**

**現状の問題**:
- 実際のIAP処理の実装が不完全
- エラーハンドリングが不十分
- 適切なユーザーメッセージが不足

**必要な処理**:
- 実際のIAP処理の実行
- 包括的なエラーハンドリング
- 環境別の適切なユーザーメッセージ

### **3. 環境判定の改善**

**現状の問題**:
- `process.env.EXPO_PUBLIC_ENABLE_TEST_ACCOUNTS`の値が設定されていない可能性
- 環境変数に依存した判定が不安定

**修正案**:
```typescript
// 環境変数への依存を削除
const isTestFlight = !__DEV__ && Constants.executionEnvironment === 'standalone';
```

## 🔧 **完全な修正案**

### **修正後のhandleUpgrade関数**

```typescript
const handleUpgrade = async (planName: UserPlan) => {
  const timestamp = new Date().toISOString();
  
  console.log('[SUB-MONITOR] [' + timestamp + '] handleUpgrade initiated', {
    planName,
    userId: user?.uid || 'unknown',
    currentPlan: currentUserPlan,
    environment: __DEV__ ? 'development' : 'production',
    sourceContext
  });

  // 修正: 既存購読チェック（表示用プランで判定）
  const currentDisplayPlan = PlanService.getDisplayPlan(user);
  if (currentDisplayPlan === 'plus' && planName === 'plus') {
    Alert.alert(
      '登録済み',
      '既にPlusプランにご登録済みです。プランの管理はApp Storeのアカウント設定から行えます。',
      [
        { text: 'OK' },
        { text: 'プランを管理', onPress: handleManageSubscription },
      ]
    );
    return;
  }
  
  if (!user?.uid) {
    console.error('[SUB-MONITOR] [' + timestamp + '] handleUpgrade failed - no user ID');
    Alert.alert('エラー', 'ログインが必要です');
    return;
  }

  if (planName !== 'plus') {
    console.log('[SUB-MONITOR] [' + timestamp + '] handleUpgrade skipped - not plus plan', { planName });
    return;
  }

  // 環境判定の改善
  const isTestFlight = !__DEV__ && Constants.executionEnvironment === 'standalone';
  
  if (__DEV__ && !isTestFlight) {
    // 開発環境での処理（既存のまま）
    console.log('[SUB-MONITOR] [' + timestamp + '] Development mode - showing TestFlight guidance');
    // ... 既存の開発環境用アラート
    return;
  }

  // TestFlight環境と本番環境での実際の購入処理
  try {
    console.log('[SUB-MONITOR] [' + timestamp + '] Starting actual IAP process', {
      environment: isTestFlight ? 'TestFlight' : 'Production',
      userId: user.uid
    });

    // 実際のIAP処理を実行
    await iapService.purchasePlan(planName);
    
    if (isTestFlight) {
      Alert.alert(
        'TestFlight環境',
        'TestFlight版では実際のsandbox環境での購入処理が実行されます。\n\n購入完了後、プランが更新されます。',
        [{ text: 'OK' }]
      );
    } else {
      Alert.alert(
        '購入完了',
        'Plusプランの購入が完了しました。プランが更新されます。',
        [{ text: 'OK' }]
      );
    }
    
  } catch (error) {
    console.error('[SUB-MONITOR] [' + timestamp + '] IAP process failed:', error);
    
    if (isTestFlight) {
      Alert.alert(
        'TestFlight環境での購入エラー',
        'sandbox環境での購入処理中にエラーが発生しました。\n\nエラー内容: ' + (error.message || '不明なエラー'),
        [{ text: 'OK' }]
      );
    } else {
      Alert.alert(
        '購入エラー',
        '購入処理中にエラーが発生しました。\n\nエラー内容: ' + (error.message || '不明なエラー'),
        [{ text: 'OK' }]
      );
    }
  }
};
```

## 📋 **実装すべき修正内容**

### **優先度: 高**
1. **既存購読チェックの修正**
   - `getEffectivePlan` → `getDisplayPlan`に変更
   - ダウングレード予定がある場合の適切な処理

2. **TestFlight環境での処理完了**
   - 実際のIAP処理の実装
   - エラーハンドリングの追加

### **優先度: 中**
3. **環境判定の改善**
   - 環境変数への依存を削除
   - より安定した環境判定ロジック

4. **ユーザーメッセージの改善**
   - 環境別の分かりやすい説明
   - エラー時の適切な案内

### **優先度: 低**
5. **ログ出力の改善**
   - より詳細なデバッグ情報
   - 環境別のログレベル調整

## 🎯 **修正後の期待される動作**

### **TestFlight環境**
- 既存購読の事前チェックで「既に登録済み」エラーを回避
- 実際のsandbox環境でのIAP処理を実行
- 適切なエラーハンドリングとユーザー案内
- 購入完了後の分かりやすい説明

### **開発環境**
- 既存の開発用案内を維持
- TestFlight版での制限事項を説明
- テスト用アップグレードの手順を案内

### **本番環境**
- 既存購読の事前チェック
- 実際のIAP処理を実行
- 適切なエラーハンドリング
- 購入完了後の説明

## 📝 **次のステップ**

1. **既存購読チェックの修正**を実装
2. **TestFlight環境での処理**を完了
3. **環境判定の改善**を実装
4. **テスト環境での動作確認**
5. **必要に応じて追加の改善**

この修正により、TestFlight環境でも適切にsandbox環境でのIAPテストが行え、ユーザーにも分かりやすい体験を提供できます。

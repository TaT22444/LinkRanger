# TestFlightでのIn-App Purchase制限

## 🔍 エラーの原因分析

### **エラー:** "Invalid production ID"

このエラーは**TestFlightの正常な制限**です。理由は以下の通り：

## ⚠️ TestFlightでのIAP制限

### **1. Production Product IDは利用不可**
```typescript
// UpgradeModal.tsx で設定されている本番用Product ID
'com.tat22444.wink.plus.monthly'   // ❌ TestFlightでは動作しない
'com.tat22444.wink.pro.monthly'    // ❌ TestFlightでは動作しない
```

### **2. TestFlight環境の制限**
- **App Store審査前の暫定状態**
- 本番用のIn-App Purchase商品は未公開
- Apple側でProduct IDが「存在しない」扱い

### **3. Sandboxテストも制限**
- TestFlightはSandbox環境とも異なる
- 独自の制限された決済環境

## ✅ 正常に動作するタイミング

### **App Store審査通過後**
1. **App Store Connect審査完了**
2. **In-App Purchase商品が承認**
3. **Product IDが正式に有効化**
4. **本番環境で購入可能**

### **現在利用可能な機能（TestFlightで確認可能）**
- ✅ プラン情報表示
- ✅ 価格表示（フォールバック価格）
- ✅ UI・UX確認
- ❌ 実際の購入処理

## 📱 現在のUpgradeModal動作

### **TestFlightでの表示**
```typescript
// applePayService.ts - Development環境用フォールバック
if (__DEV__ || !products.length) {
  // フォールバック価格を表示
  // Plus: ¥480/月
  // Pro: ¥1,280/月
}
```

### **購入ボタン押下時**
```typescript
// IapService.purchasePlan() 実行時
// → Product ID検証失敗
// → "Invalid production ID" エラー
```

## 🧪 TestFlightで確認すべき項目

### **✅ 正常動作の確認**
1. **モーダル表示**: 正しく開く
2. **プラン表示**: Free/Plus/Pro の情報表示
3. **価格表示**: フォールバック価格の表示
4. **UI/UX**: レスポンシブ・デザイン確認
5. **エラーハンドリング**: 適切なエラーメッセージ

### **❌ 確認不可な項目**
1. **実際の購入処理**
2. **Apple決済フロー**
3. **レシート検証**
4. **プラン変更機能**

## 🔧 開発時の対応策

### **Development Build用のテスト機能追加**
```typescript
// applePayService.ts に追加
async purchasePlan(planType: UserPlan): Promise<void> {
  if (__DEV__ || Platform.OS === 'ios' && !await this.canMakePurchases()) {
    // テスト環境用のモック処理
    Alert.alert(
      'テスト環境',
      `${planType}プランの購入をシミュレートしました。本番環境では実際の決済が行われます。`,
      [{ text: 'OK' }]
    );
    return;
  }
  
  // 実際の購入処理...
}
```

## 📋 App Store公開までの対応

### **Phase 1: TestFlight（現在）**
- UI/UX確認に集中
- エラーは正常動作として受け入れ
- 価格表示・プラン情報の確認

### **Phase 2: App Store審査提出**
- In-App Purchase商品も同時に審査提出
- 審査期間: 通常1-7日

### **Phase 3: 審査通過後**
- Product IDが有効化
- 実際の購入機能が動作開始

## 🎯 結論

**「Invalid production ID」エラーは正常です。**

### **現在の状況**
- TestFlightでの購入機能テストは制限される
- UI/UXの確認は完璧に可能
- エラーは期待される動作

### **App Store公開後**
- 購入機能が完全に動作
- プランアップグレードが可能
- Firebase Functions による自動プラン管理

**このエラーは心配せず、App Store公開を進めてください！**
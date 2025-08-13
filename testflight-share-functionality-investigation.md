# TestFlightでの外部アプリ共有機能 - 詳細調査

## 🔍 現在の設定確認

### iOS設定 (app.json)
```json
"infoPlist": {
  "CFBundleURLTypes": [
    {
      "CFBundleURLName": "wink.share",
      "CFBundleURLSchemes": ["wink"]
    }
  ],
  "NSUserActivityTypes": [
    "com.tat22444.wink.share-link"
  ],
  "NSExtensionActivationRule": {
    "NSExtensionActivationSupportsWebURLWithMaxCount": 1,
    "NSExtensionActivationSupportsWebPageWithMaxCount": 1
  }
}
```

### Android設定 (app.json)
```json
"intentFilters": [
  {
    "action": "SEND",
    "category": "DEFAULT", 
    "data": "text/plain"
  }
]
```

## ❓ TestFlightでの外部アプリ共有の実際

### 考えられる制限要因

#### 1. **Share Extension未実装**
現在の設定は `NSExtensionActivationRule` のみで、実際の **Share Extension** が実装されていない可能性

#### 2. **iOS Content Blocking**
TestFlightアプリがシステムレベルでの共有先リストに登録されない制限

#### 3. **Provisioning Profile制限**
開発/テスト用プロファイルでは一部のシステム統合機能が制限される

## 🧪 TestFlightでの検証方法

### **確実に試すべきテスト**

#### 1. **Universal Links** (確実に動作するはず)
```
https://www.dot-wink.com/share?url=https://google.com&title=Google
```

#### 2. **Custom URL Scheme** (確実に動作するはず)  
```
wink://share?url=https://google.com&title=Google
```

#### 3. **外部アプリ共有** (不明確)
- Twitter共有ボタン → Winkが表示されるか？
- Safari共有ボタン → Winkが表示されるか？

### **検証のお願い**
以下を実際にTestFlightで試していただけますか？

1. **Safariで適当なWebページを開く**
2. **共有ボタンをタップ**  
3. **共有先一覧にWinkがあるか確認**

## 🏪 App Store公開後の想定挙動

### **外部アプリからの共有フロー**

#### **Twitter → Wink共有の場合**
```
1. Twitter投稿の共有ボタンタップ
2. 共有先一覧に「Wink」アイコンが表示
3. Winkを選択
4. Winkアプリが起動
5. shareLinkService.ts が URL を解析
6. 「リンクを保存しました」のアラート表示
7. AIが自動でタグ付け・要約を開始
```

#### **Safari → Wink共有の場合**
```
1. SafariでWebページを表示
2. 共有ボタンタップ
3. 共有先一覧に「Wink」表示
4. Winkを選択
5. Winkアプリが起動
6. 現在のページURLとタイトルを取得
7. shareLinkService.handleSharedLink() 実行
8. linkService.createLink() でFirestoreに保存
9. 「AIが自動でタグ付けと要約を生成しています」アラート
```

### **技術的な処理フロー**

#### 1. **iOS側の受信処理**
```typescript
// App.tsx の NavigationContainer
linking={{
  prefixes: ['wink://', 'https://www.dot-wink.com'],
  config: { /* ... */ }
}}

// AppContent の useEffect
shareLinkService.setupDeepLinkListener(async (sharedData) => {
  await shareLinkService.handleSharedLink(sharedData, user);
});
```

#### 2. **URL解析処理**
```typescript
// shareLinkService.ts
parseSharedUrl(url: string): SharedLinkData | null {
  // 直接URLの場合（他のアプリからの共有）
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return {
      url,
      source: 'share-extension'
    };
  }
}
```

#### 3. **Firestore保存処理**
```typescript
// linkService.createLink()
const linkData = {
  userId: user.uid,
  url: sharedData.url,
  title: sharedData.title || 'リンクを取得中...',
  status: 'pending',
  // ... AI処理開始
}
```

## 🤔 TestFlightでの共有先表示について

### **私の推測（要検証）**

#### **動作する可能性が高い**
- `NSExtensionActivationRule` の設定あり
- `intentFilters` の SEND アクション設定あり
- カスタム URL スキーム設定済み

#### **動作しない可能性もある**
- 実際の Share Extension コード未実装
- TestFlight特有の制限
- Apple Developer Certificate の認証レベル

## 📋 結論と次のアクション

### **確認が必要**
TestFlightで実際に以下をテストしてください：

1. **Safari → 共有ボタン → Wink表示の有無**
2. **Twitter → 共有ボタン → Wink表示の有無**  
3. **Universal Links動作確認**

### **もし外部アプリ共有が動作しない場合**
Share Extension の実装が必要かもしれません。その場合は追加実装を検討します。

**お手数ですが、実際の動作を教えてください！**
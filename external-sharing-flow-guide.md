# 外部アプリ共有機能 - 具体的な流れとデプロイ手順

## 🔄 具体的な動作フロー

### フロー1: SNS・他アプリからの直接共有
```
[Twitter/Safari/YouTube等] 
    ↓ 
[共有ボタンタップ] 
    ↓ 
[共有先一覧にWinkアプリが表示]
    ↓ 
[Winkを選択] 
    ↓ 
[Winkアプリが起動してリンク保存画面表示]
```

**技術的仕組み:**
- iOS: `CFBundleURLSchemes` + Intent Filters
- Android: `intent-filters` でWinkが共有先として認識
- `shareLinkService.ts`がURLを解析してリンク作成

### フロー2: Universal Linksからの起動
```
[www.dot-wink.com/share?url=xxx のリンクを受信]
    ↓ 
[iOSがWinkアプリの関連付けを確認]
    ↓ 
[Apple App Site Associationで検証]
    ↓ 
[Winkアプリが自動起動]
    ↓ 
[URLパラメータを解析してリンク保存]
```

**技術的仕組み:**
- `com.apple.developer.associated-domains` でドメイン関連付け
- `www.dot-wink.com/.well-known/apple-app-site-association` で検証
- `App.tsx`の`NavigationContainer`で URL handling

### フロー3: Deep Links (Custom URL Scheme)
```
[wink://share?url=xxx のリンク]
    ↓ 
[iOSがwink://スキームを認識]
    ↓ 
[Winkアプリが起動]
    ↓ 
[shareLinkService.tsでURL解析]
```

---

## ⚠️ デプロイ・ビルドが必要な理由

### 現在の状況
- ✅ Firebase Hosting: デプロイ済み
- ❌ iOSアプリ: 設定変更後未ビルド

### 必要な作業

#### 1. iOS App Development Build更新
```bash
# EAS Build で Development Build作成
npx eas build --profile development --platform ios
```

**理由:**
- app.jsonの`associated-domains`変更が反映されていない
- `www.dot-wink.com`への関連付けが有効になっていない

#### 2. TestFlight Build更新（本格テスト用）
```bash
# TestFlight用ビルド
npx eas build --profile production --platform ios
```

#### 3. App Store Connect設定確認
- Associated Domains: `applinks:www.dot-wink.com`
- URL Schemes: `wink`

---

## 🧪 テスト手順

### Phase 1: Deep Linksテスト（すぐ可能）
```bash
# 実機でアプリ起動中に実行
npx uri-scheme open "wink://share?url=https://google.com&title=Google" --ios
```

### Phase 2: Universal Linksテスト（ビルド後）
1. 新しいDevelopment Buildを実機にインストール
2. Safari等で `https://www.dot-wink.com/share?url=https://google.com&title=Google` にアクセス
3. Winkアプリが自動起動することを確認

### Phase 3: 外部アプリ共有テスト（ビルド後）
1. Safari で適当なWebページを開く
2. 共有ボタンタップ
3. 共有先一覧に「Wink」が表示されることを確認
4. Winkを選択してアプリが起動することを確認

---

## 📋 優先度別タスク

### 🚨 必須（Universal Links動作に必要）
1. **EAS Development Build実行**
   ```bash
   npx eas build --profile development --platform ios
   ```

2. **実機にインストール**
   - EASで生成されるQRコードからインストール

### ⚡ 推奨（完全テスト用）
1. **TestFlight Build作成**
2. **App Store Connect確認**
3. **各フローの動作テスト**

### 🔮 将来対応
1. **Android対応** (`intent-filters`設定済み)
2. **本番App Store公開**

---

## 🛠 今すぐ実行すべきコマンド

```bash
# 1. EAS Development Build
npx eas build --profile development --platform ios

# 2. ビルド完了後、実機インストール
# （EASダッシュボードのQRコードを使用）

# 3. テスト実行
# Universal Links: https://www.dot-wink.com/share?url=https://google.com&title=Google
# Deep Links: wink://share?url=https://google.com&title=Google
```

---

## ❓ よくある疑問

### Q: Firebase Hostingは再デプロイ必要？
**A:** 不要。すでにTeam ID設定済みでデプロイ完了。

### Q: 既存のDevelopment Buildで動作する？
**A:** 部分的にのみ。Deep Linksは動作するが、Universal Linksは新ビルドが必要。

### Q: App Store Connectの設定変更は必要？
**A:** Associated Domainsの設定確認は推奨だが、app.json設定で自動反映される。

**結論: 完全な外部共有機能にはEAS Buildが必須です！**
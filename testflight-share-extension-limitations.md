# TestFlightでの外部アプリ共有機能の制限

## ❌ TestFlightで動作しないもの

### 1. **外部アプリの共有先リスト**
- Twitter → 共有ボタン → **Winkが表示されない**
- Safari → 共有ボタン → **Winkが表示されない**
- YouTube → 共有ボタン → **Winkが表示されない**

### 理由
- **App Store審査前の暫定状態**
- iOS システムが「正式アプリ」として認識していない
- Share Extension、Intent Filters が iOS レベルで無効

## ✅ TestFlightで動作するもの

### 1. **Universal Links**
```
https://www.dot-wink.com/share?url=https://google.com&title=Google
```
- Safari でアクセス → アプリが起動する ✅

### 2. **Deep Links (Custom URL Scheme)**
```bash
npx uri-scheme open "wink://share?url=https://google.com&title=Google" --ios
```
- 直接 wink:// スキームでアプリ起動 ✅

### 3. **アプリ内機能**
- AI解説機能 ✅
- タグ分類 ✅
- 通知機能 ✅

## 🏪 App Store公開後に動作するもの

### **外部アプリ共有**
```
Twitter → 共有ボタン → Wink表示 → 選択 → アプリ起動
Safari → 共有ボタン → Wink表示 → 選択 → アプリ起動
YouTube → 共有ボタン → Wink表示 → 選択 → アプリ起動
```

## 🧪 TestFlightでの検証方法

### 1. **Universal Linksテスト**
- Safari で `https://www.dot-wink.com/share?url=https://google.com&title=Google` にアクセス
- Winkアプリが起動し、リンクが保存されることを確認

### 2. **アプリ内でのテスト**
- アプリ内の「リンク追加」機能で URL を手動入力
- AIタグ付け機能が動作することを確認

### 3. **Deep Linksテスト**
- メモアプリ等に `wink://share?url=https://google.com&title=Google` を記載
- タップしてアプリが起動することを確認

## 📱 外部共有機能の代替テスト方法

### **方法1: メモアプリ経由**
1. メモアプリに Universal Link を記載
2. `https://www.dot-wink.com/share?url=https://google.com&title=Google`
3. タップしてアプリ起動を確認

### **方法2: メール経由**
1. 自分にメールを送信（Universal Link含む）
2. メール内のリンクタップでアプリ起動確認

### **方法3: QRコード経由**
1. Universal Link の QRコード作成
2. カメラアプリでスキャン → アプリ起動確認

## 🚀 完全な検証タイミング

### **App Store 審査通過後**
- 外部アプリの共有先リストに表示
- Twitter、Safari、YouTube等からの共有が可能
- Intent Filters が完全に機能

### **現在可能な検証範囲**
- ✅ Universal Links 動作確認
- ✅ Deep Links 動作確認  
- ✅ アプリ内機能全般
- ❌ 外部アプリ共有先表示

## 💡 まとめ

**私の説明が不正確でした。**

- **TestFlight**: Universal Links、Deep Links のみ動作
- **App Store公開後**: 外部アプリ共有も完全動作

TestFlightでは Universal Links（`https://www.dot-wink.com/share?url=xxx`）のテストに集中し、外部アプリ共有は App Store 公開後の検証となります。
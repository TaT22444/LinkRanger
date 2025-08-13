# Firebase DNS キャッシュクリア対処法

## 現状
Firebase側で古いDNS情報（199.36.158.100）が強くキャッシュされている

## 対処法（優先順）

### 方法1: より長い待機時間
- **24時間待機**が最も確実
- Firebase側のTTLが長い可能性

### 方法2: Firebase CLI強制リセット
```bash
# Firebase CLI で強制削除・追加
firebase hosting:channel:delete dot-wink --force
firebase hosting:sites:get
```

### 方法3: Google Cloud DNS flush（上級者向け）
```bash
# Google Public DNS でのキャッシュクリア
curl "https://dns.google/resolve?name=dot-wink.com&type=A"
```

### 方法4: 一時的な別名使用
1. **www サブドメイン使用**
   ```
   Cloudflareで設定:
   CNAME www linkranger-b096e.web.app
   ```

2. **Firebase で www.dot-wink.com を追加**
   - メインドメインではなくwwwサブドメインから開始

### 方法5: Firebase Support 直接連絡
1. Firebase Console → サポート
2. 「DNS verification failed with cached old IP」として報告
3. ドメイン: dot-wink.com
4. 問題: 古いIP（199.36.158.100）がキャッシュされている

## 推奨アプローチ
1. **まず方法4（wwwサブドメイン）を試す**
2. 並行して24時間待機
3. 改善しなければFirebase Supportに連絡

## 確認方法
```bash
# 様々なDNSサーバーで確認
dig @8.8.8.8 dot-wink.com
dig @1.1.1.1 dot-wink.com  
dig @208.67.222.222 dot-wink.com
```

すべて151.101.x.x を返すなら、Firebase側の問題確定
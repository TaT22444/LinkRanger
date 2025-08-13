# Firebase Hosting DNS エラー対応

## 問題
Firebase HostingがXサーバーの古いIP（199.36.158.100）を要求している。
これは**間違った指示**です。

## 原因
Firebase HostingがXサーバーの古いDNS情報をキャッシュしている可能性

## 正しい対処法

### ❌ やってはいけないこと
- Cloudflareで199.36.158.100のAレコードを追加
- Firebase用IP（151.101.x.x）を削除

### ✅ 正しい対処法

#### 1. Firebase Console でドメイン削除・再追加
1. **カスタムドメイン削除**
   - Firebase Console → Hosting
   - dot-wink.com の「削除」をクリック

2. **15分待機**
   - Firebase側のキャッシュクリア待機

3. **ドメイン再追加**
   - 「カスタムドメインを追加」
   - dot-wink.com を再入力

#### 2. DNS設定確認（変更不要）
現在のCloudflare設定は正しいので**変更しない**:
```
A dot-wink.com 151.101.1.195
A dot-wink.com 151.101.65.195
```

#### 3. 代替手段: Firebase Support
Firebase Console → サポート → 「カスタムドメインでDNS検証エラー」報告

## なぜこのエラーが発生するか
1. Firebase側の古いDNS情報キャッシュ
2. Xサーバーから移行時の情報混在
3. DNS伝播の遅延による混乱

## 確認コマンド
```bash
# 現在のDNS（正しい状態）
dig dot-wink.com
# → 151.101.1.195, 151.101.65.195 が表示されるはず
```

## 重要
Firebase が要求している 199.36.158.100 は**無視**してください。
これはXサーバーのパーキングページ用IPで、Firebase Hostingとは無関係です。
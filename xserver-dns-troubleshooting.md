# Xサーバー DNS設定トラブルシューティング

## 現在の状況
- ドメイン登録: ✅ 確認済み (2025-08-12 登録)
- ネームサーバー: NS1-3.XDOMAIN.NE.JP 設定済み
- DNS応答: ❌ SERVFAILエラー

## 1. Xサーバーでの設定確認事項

### A. DNS設定（Xドメイン管理パネル）
1. https://www.xdomain.ne.jp/ にログイン
2. 「ドメイン設定」→「DNS設定」
3. 以下のレコードが必要:

```
種別: A
ホスト名: @ (または空欄/root)
値: 151.101.1.195

種別: A  
ホスト名: @
値: 151.101.65.195

種別: AAAA
ホスト名: @
値: 2a04:4e42::223

種別: AAAA
ホスト名: @  
値: 2a04:4e42:200::223
```

### B. 代替設定（CNAMEの場合）
```
種別: CNAME
ホスト名: @ (またはwww)
値: linkranger-b096e.web.app
```

## 2. よくある問題

### A. 設定反映時間
- DNS設定後、反映まで最大48時間
- 通常は1-6時間程度

### B. @記号の扱い
- Xサーバーでは「@」を使わず空欄にする場合あり
- 「root」や「apex」と表記する場合あり

### C. TTL設定
- TTL値を短く設定（300秒程度）で反映を早める

## 3. Firebase Hostingでの要求事項
Firebase HostingのカスタムドメインはApex domain（dot-wink.com）に対してAレコードまたはALIASレコードを要求します。

## 4. 確認コマンド
```bash
# DNS確認
dig dot-wink.com
nslookup dot-wink.com

# 特定のネームサーバーで確認
dig @ns1.xdomain.ne.jp dot-wink.com
```

## 5. 緊急時の代替案
一時的にFirebase HostingのデフォルトURL（linkranger-b096e.web.app）を使用し、DNS設定完了後にカスタムドメインに移行。
# dot-wink.com セットアップガイド

## 1. ドメイン取得後の手順

### A. Firebase Hostingにカスタムドメイン追加
```bash
# Firebase Console → Hosting → カスタムドメインで設定
# または CLI で
firebase hosting:channel:list
```

### B. DNS設定
dot-wink.comのDNS設定で以下を追加:
```
A     @           151.101.1.195
A     @           151.101.65.195  
AAAA  @           2a04:4e42::223
AAAA  @           2a04:4e42:200::223
```

または CNAMEレコード:
```
CNAME dot-wink.com linkranger-b096e.web.app
```

### C. SSL証明書の自動取得
Firebase Hostingが自動でLet's Encryptの証明書を取得

## 2. 現在の設定状況
✅ app.json - Universal Links設定完了
✅ App.tsx - Navigation prefixes更新完了  
✅ shareLinkService.ts - URL解析ロジック更新完了
✅ Apple App Site Association設定済み

## 3. テスト用のURL
Development Build実機テスト:
- Deep Link: `wink://share?url=https://google.com&title=Google`
- Universal Link (将来): `https://dot-wink.com/share?url=https://google.com&title=Google`

## 4. iOS シミュレータについて
- iOSシミュレータではUniversal Linksの完全なテストはできません
- 実機でのテストが必要です
- Custom URL Schemes (wink://) はシミュレータでも動作しますが、外部アプリからの共有テストには実機が必要

## 5. 次のステップ
1. dot-wink.comドメイン取得
2. Firebase HostingでCustom Domain設定
3. DNS設定
4. 実機でUniversal Linksテスト

## 6. 暫定テスト方法
現在はFirebase Hostingの一時URL `https://linkranger-b096e.web.app/share` でテスト可能
# Firebase Hosting カスタムドメイン設定手順

## 1. Firebase Console でカスタムドメイン追加

### A. Firebase Console にアクセス
1. https://console.firebase.google.com/project/linkranger-b096e にアクセス
2. 左メニューから「Hosting」を選択
3. 「カスタムドメインを追加」ボタンをクリック

### B. ドメイン設定
1. ドメイン名に `dot-wink.com` を入力
2. 「続行」をクリック
3. 所有権確認の指示に従う

## 2. DNS設定（ドメイン管理画面で設定）

Firebase Consoleで表示される指示に従って以下のDNSレコードを設定:

### パターンA: Aレコード
```
タイプ: A
名前: @（またはroot/空欄）
値: [Firebase提供のIPアドレス]
```

### パターンB: CNAMEレコード
```
タイプ: CNAME  
名前: @（またはroot）
値: linkranger-b096e.web.app
```

## 3. SSL証明書
- Firebase Hostingが自動でLet's Encryptの証明書を取得
- 設定完了後、数分〜1時間で有効化

## 4. 設定完了後のテスト
```
https://dot-wink.com/share?url=https://google.com&title=Google
```

## 5. トラブルシューティング
- DNS伝播まで最大48時間かかる場合あり
- `dig dot-wink.com` で設定確認可能
- Firebase Consoleで設定状況確認可能

## 6. 設定完了の確認
- Firebase Console「Hosting」で「接続済み」表示
- `https://dot-wink.com` でサイトアクセス可能
- SSL証明書有効化（緑の鍵マーク）
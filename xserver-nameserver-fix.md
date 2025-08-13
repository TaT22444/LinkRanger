# Xサーバードメイン ネームサーバー設定修正

## 問題
Firebase Hostingにカスタムドメインを設定する場合、「Xサーバードメイン」のネームサーバーではなく、外部DNS管理が必要です。

## 解決方法の選択肢

### 選択肢1: 「他のサービスで利用する」設定
1. **Xドメイン管理パネルにログイン**
   - https://www.xdomain.ne.jp/

2. **ドメイン設定変更**
   - 「ドメイン一覧」→「dot-wink.com」
   - 「ネームサーバー設定」
   - 「他のサービスで利用する」を選択

3. **外部DNSサービス利用**
   - Cloudflare (推奨・無料)
   - Google Cloud DNS  
   - Route 53
   - など

### 選択肢2: Cloudflare DNS (推奨)
1. **Cloudflare アカウント作成**
   - https://cloudflare.com で無料アカウント作成

2. **ドメイン追加**
   - Cloudflareに dot-wink.com を追加
   - 提供されるネームサーバーをメモ (例: `ns1.cloudflare.com`)

3. **Xドメインでネームサーバー変更**
   ```
   ネームサーバー1: ns1.cloudflare.com
   ネームサーバー2: ns2.cloudflare.com
   ```

4. **CloudflareでDNSレコード設定**
   ```
   種別: A
   名前: @
   内容: 151.101.1.195
   
   種別: A
   名前: @  
   内容: 151.101.65.195
   ```

### 選択肢3: Google Cloud DNS
Firebase プロジェクトと同じGoogle Cloudで管理する場合

## 推奨アプローチ
**Cloudflare DNS** が最も簡単で信頼性が高いです：
- 無料
- 高速なDNS応答
- 簡単な管理画面
- Firebase Hostingとの相性良好

## 設定後の確認
```bash
# ネームサーバー確認
dig ns dot-wink.com

# Aレコード確認  
dig dot-wink.com
```

## 注意
- ネームサーバー変更後、DNS伝播まで24-48時間かかる場合あり
- 変更中は一時的にサイトがアクセスできなくなる可能性あり
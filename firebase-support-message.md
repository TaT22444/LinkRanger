# Firebase Support 問い合わせ文章

## 英語版

**Subject:**: Custom Domain DNS Verification Requesting Wrong IP Addresses

**Message:**
Hello Firebase Support Team,

I'm experiencing a critical issue with custom domain setup for Firebase Hosting that appears to be a system-level problem on Firebase's side.

**Project Details:**
- Firebase Project ID: linkranger-b096e  
- Domain: dot-wink.com
- Issue: DNS verification requesting incorrect IP addresses

**Problem Description:**
When attempting to add dot-wink.com as a custom domain, Firebase Hosting is requesting completely wrong DNS records:

**Firebase is requesting (INCORRECT):**
- A, dot-wink.com, 199.36.158.100 (This is an old Xserver parking page IP)

**Firebase is asking to delete (CORRECT Firebase IPs):**
- A, dot-wink.com, 151.101.1.195  
- A, dot-wink.com, 151.101.65.195

**Current DNS Configuration (CORRECT):**
```
$ dig dot-wink.com
dot-wink.com. 300 IN A 151.101.1.195
dot-wink.com. 300 IN A 151.101.65.195
```

**Verification Commands:**
- `dig @8.8.8.8 dot-wink.com` → Returns correct Firebase IPs
- `dig @1.1.1.1 dot-wink.com` → Returns correct Firebase IPs  
- All major DNS servers return the correct Firebase IPs

**Domain History:**
- Domain was initially registered with Xserver (199.36.158.100)
- Nameservers changed to Cloudflare  
- DNS records properly configured with Firebase IPs
- DNS propagation completed successfully

**What I've Tried:**
1. Waited 48+ hours for DNS propagation
2. Deleted and re-added the domain multiple times
3. Verified Apple App Site Association with correct Team ID
4. Confirmed DNS settings on multiple resolvers

**Issue Impact:**
This prevents our iOS app's Universal Links functionality from working with our custom domain.

**Request:**
Please clear any cached DNS information for dot-wink.com on Firebase's side and investigate why the system is requesting incorrect IP addresses.

Thank you for your assistance.

---

## 日本語版

**件名:** 緊急案件：カスタムドメインDNS検証で誤ったIPアドレスが要求される問題

**メッセージ:**
Firebase サポートチーム 様

Firebase Hosting のカスタムドメイン設定で、Firebase側のシステムレベルの問題と思われる重大な問題が発生しております。

**プロジェクト詳細:**
- Firebase プロジェクトID: linkranger-b096e
- ドメイン: dot-wink.com
- 問題: DNS検証で誤ったIPアドレスが要求される

**問題内容:**
dot-wink.com をカスタムドメインとして追加しようとすると、Firebase Hosting が完全に間違ったDNSレコードを要求しています：

**Firebaseが要求している内容（間違い）:**
- A, dot-wink.com, 199.36.158.100（これは古いXサーバーのパーキングページ用IP）

**Firebaseが削除を要求している内容（正しいFirebase用IP）:**
- A, dot-wink.com, 151.101.1.195
- A, dot-wink.com, 151.101.65.195

**現在のDNS設定（正しい）:**
```
$ dig dot-wink.com
dot-wink.com. 300 IN A 151.101.1.195
dot-wink.com. 300 IN A 151.101.65.195
```

**検証結果:**
- Google DNS、Cloudflare DNS等、全ての主要DNSサーバーで正しいFirebase用IPが返される
- DNS伝播は正常に完了済み

**試行した対応:**
1. 48時間以上のDNS伝播待機
2. ドメインの削除・再追加を複数回実行
3. Apple App Site Association の Team ID 設定確認
4. 複数のDNSリゾルバーでの設定確認

**影響:**
iOSアプリのUniversal Links機能が カスタムドメインで動作しない状況です。

**お願い:**
dot-wink.com に関するFirebase側のDNSキャッシュ情報をクリアし、システムが誤ったIPアドレスを要求している原因の調査をお願いいたします。

よろしくお願いいたします。
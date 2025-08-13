# Firebase Hosting CNAME設定

## 正しいCNAME設定

### Firebase Hostingの場合
```
Type: CNAME
Name: www
Target: dot-wink.com
Proxy: DNS only (灰色)
```

**理由:**
- Firebase HostingはApex domain（dot-wink.com）を基準とする
- wwwサブドメインはメインドメインにCNAMEする
- linkranger-b096e.web.app は一時URLなので使用しない

## 代替設定（より確実）
```
Type: A
Name: www  
IPv4: 151.101.1.195

Type: A
Name: www
IPv4: 151.101.65.195
```

この方法なら確実にFirebase用IPを指定できます。

## 推奨アプローチ
1. **まずAレコード方式を試す**（上記の代替設定）
2. Firebase Console で www.dot-wink.com を追加
3. 成功したらCNAME方式に変更検討

## 確認方法
```bash
dig www.dot-wink.com
```

Firebase用IP（151.101.x.x）が返されることを確認
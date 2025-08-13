# Apple Developer Team ID確認方法

## 1. Apple Developer Portal
1. https://developer.apple.com/account/ にアクセス
2. 「Membership」セクションでTeam ID確認

## 2. App Store Connect  
1. https://appstoreconnect.apple.com にアクセス
2. 「ユーザーとアクセス」→「キー」でTeam ID表示

## 3. Xcode
1. Xcodeでプロジェクトを開く  
2. Project Settings → Signing & Capabilities でTeam確認

## 4. 暫定対応
Team IDが不明な場合、Apple App Site Associationファイルを以下で更新:
```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "[TEAM_ID].com.tat22444.wink",
        "paths": ["/share", "/share/*", "*"]
      }
    ]
  }
}
```

Team IDは10文字の英数字（例: A1B2C3D4E5）

## 5. 設定後の再デプロイ
```bash
firebase deploy --only hosting
```
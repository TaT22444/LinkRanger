# Firebase Hosting で Universal Links テスト

## 1. Firebase Hosting 設定
```bash
# Firebase CLI インストール（既にあるかも）
npm install -g firebase-tools

# プロジェクトにHosting設定を追加
cd /Users/tat/Dev/Link/LinkRanger
firebase init hosting
```

## 2. Apple App Site Association ファイル作成
public/.well-known/apple-app-site-association
```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "YOUR_TEAM_ID.com.tat22444.wink",
        "paths": [
          "/share",
          "/share/*",
          "*"
        ]
      }
    ]
  }
}
```

## 3. app.json を Firebase Hosting URL に変更
```json
"prefixes": ["wink://", "https://linkranger-b096e.web.app"]
```

## 4. デプロイ
```bash
firebase deploy --only hosting
```
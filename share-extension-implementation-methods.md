# Share Extension実装方法の詳細

## ❓ Swiftコード修正が必要かどうか

### **結論: 場合による**

## 🛠 実装方法による違い

### **方法1: Expo Managed Workflow（推奨）**
**Swift修正:** ❌ 不要
```json
// app.json
{
  "expo": {
    "ios": {
      "extensions": [
        {
          "targetName": "ShareExtension",
          "bundleIdentifier": "com.tat22444.wink.share-extension",
          "extensionType": "share",
          "entryPoint": "./src/share-extension/index.js"
        }
      ]
    }
  }
}
```

```javascript
// src/share-extension/index.js
import { shareAsync } from 'expo-sharing';
import { sendToFirebase } from './api';

export default async function ShareExtension({ url, title }) {
  try {
    // Firebase Functions経由で保存
    await sendToFirebase(url, title);
    
    // 通知表示
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🔗 リンクを保存しました',
        body: 'AIが自動でタグ付けしています'
      },
      trigger: { seconds: 1 }
    });
    
    // Share Extension終了
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
}
```

### **方法2: Expo Development Build + Config Plugin**
**Swift修正:** ❌ 不要（一部制限あり）
```javascript
// app.config.js
module.exports = {
  expo: {
    plugins: [
      [
        "expo-share-extension",
        {
          bundleIdentifier: "com.tat22444.wink.share-extension",
          activationRules: {
            NSExtensionActivationSupportsWebURLWithMaxCount: 1
          }
        }
      ]
    ]
  }
};
```

### **方法3: Expo Bare Workflow / React Native CLI**
**Swift修正:** ✅ 必要
```swift
// ios/ShareExtension/ShareViewController.swift
import UIKit
import Social

class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        
        // 共有されたデータを取得
        guard let extensionItem = extensionContext?.inputItems.first as? NSExtensionItem,
              let itemProvider = extensionItem.attachments?.first else {
            return
        }
        
        // URLを取得
        if itemProvider.hasItemConformingToTypeIdentifier("public.url") {
            itemProvider.loadItem(forTypeIdentifier: "public.url") { (url, error) in
                if let shareURL = url as? URL {
                    self.handleSharedURL(shareURL.absoluteString)
                }
            }
        }
    }
    
    private func handleSharedURL(_ urlString: String) {
        // Firebase Functions APIを呼び出し
        let apiURL = URL(string: "https://us-central1-linkranger-b096e.cloudfunctions.net/saveSharedLink")!
        var request = URLRequest(url: apiURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body = ["url": urlString]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        URLSession.shared.dataTask(with: request) { _, _, _ in
            DispatchQueue.main.async {
                // Share Extension終了
                self.extensionContext?.completeRequest(returningItems: [])
            }
        }.resume()
    }
}
```

## 🎯 現在のプロジェクト構成での推奨方法

### **あなたのプロジェクトの場合**
- ✅ Expo Managed Workflow使用中
- ✅ EAS Build使用中
- ❌ Bare Workflowではない

### **推奨: Expo Config Plugin使用**
```bash
# 1. プラグインインストール
npx expo install expo-share-extension

# 2. app.json設定追加
# 3. EAS Build実行
npx eas build --profile testflight --platform ios
```

## 📋 各方法の比較

| 方法 | Swift修正 | 実装難易度 | 機能制限 | Expo互換性 |
|------|-----------|-----------|----------|-----------|
| Expo Plugin | ❌ 不要 | 低 | あり | ✅ 完全 |
| Development Build | ❌ 不要 | 中 | 少し | ✅ 高 |
| Bare Workflow | ✅ 必要 | 高 | なし | ❌ 制限あり |

## 🚀 実装手順（Swift修正なし）

### **Step 1: Config Plugin追加**
```json
// app.json
{
  "expo": {
    "plugins": [
      [
        "expo-share-extension",
        {
          "bundleIdentifier": "com.tat22444.wink.share-extension",
          "activationRules": {
            "NSExtensionActivationSupportsWebURLWithMaxCount": 1,
            "NSExtensionActivationSupportsWebPageWithMaxCount": 1
          },
          "mainStoryboard": "ShareExtension"
        }
      ]
    ]
  }
}
```

### **Step 2: JavaScript Handler実装**
```typescript
// src/share-extension/ShareHandler.ts
import { functions } from '../config/firebase';

export async function handleSharedLink(url: string, title?: string) {
  try {
    const saveSharedLink = functions.httpsCallable('saveSharedLink');
    await saveSharedLink({ url, title });
    
    return { success: true };
  } catch (error) {
    console.error('Share Extension Error:', error);
    return { success: false, error };
  }
}
```

### **Step 3: Firebase Function実装**
```typescript
// functions/src/index.ts
export const saveSharedLink = functions.https.onCall(async (data, context) => {
  const { url, title } = data;
  const uid = context.auth?.uid;
  
  if (!uid) throw new functions.https.HttpsError('unauthenticated', 'User must be logged in');
  
  // Firestoreに保存
  const linkData = {
    userId: uid,
    url,
    title: title || 'Shared Link',
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  };
  
  const docRef = await admin.firestore().collection('links').add(linkData);
  
  // Push Notification送信
  await admin.messaging().sendToTopic(`user_${uid}`, {
    notification: {
      title: '🔗 リンクを保存しました',
      body: 'AIが自動でタグ付けしています'
    }
  });
  
  return { linkId: docRef.id };
});
```

## 🎯 結論

**あなたのプロジェクトでは Swift修正は不要です！**

Expo Config Pluginを使用することで、JavaScriptのみで Share Extension を実装できます。

**進め方:**
1. expo-share-extension プラグイン追加
2. app.json設定
3. JavaScript Handler実装
4. EAS Build実行

**Swift修正が必要になる場合:**
- より高度なカスタマイズが必要
- Expo Bare Workflowに移行する場合

現在のExpo Managed Workflowなら、**JavaScript/TypeScriptのみで実装可能**です！
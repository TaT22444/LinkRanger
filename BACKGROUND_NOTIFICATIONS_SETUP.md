# 3日間未読リンク通知システムの実装ガイド

## 概要

このドキュメントでは、リンク保存時の即座通知を削除し、3日間未読だった場合のみ通知を送信するシステムの実装について説明します。

## アーキテクチャ

### クライアント側（実装済み）

1. **AddLinkModal**: リンク保存時の即座通知呼び出しを削除
2. **HomeScreen**: リンク作成時の即座通知呼び出しを削除
3. **BackgroundTaskService**: iOSバックグラウンドフェッチ機能を使用して24時間ごとにCloud Functionsを呼び出し
4. **NotificationService**: 即座通知から遅延通知システムへの変更

### サーバーサイド（要実装）

Firebase Cloud Functions（`checkUnusedLinks`関数）が必要です。

## Firebase Cloud Functions実装

以下の関数をFirebase Functionsプロジェクトに追加する必要があります：

### functions/src/checkUnusedLinks.ts

```typescript
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

const db = getFirestore();

export const checkUnusedLinks = onCall(async (request) => {
  try {
    const { auth } = request;
    
    if (!auth) {
      throw new HttpsError('unauthenticated', 'ユーザー認証が必要です');
    }
    
    const userId = auth.uid;
    logger.info('3日間未読リンクチェック開始', { userId });
    
    // 3日前の日時を計算
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    
    // 3日間未読のリンクを検索
    const linksQuery = db.collection('links')
      .where('userId', '==', userId)
      .where('isRead', '==', false)
      .where('isArchived', '==', false);
    
    const snapshot = await linksQuery.get();
    const unusedLinks = [];
    
    for (const doc of snapshot.docs) {
      const link = doc.data();
      const lastAccessedAt = link.lastAccessedAt?.toDate() || link.createdAt?.toDate();
      
      // 3日間未アクセスかチェック
      if (lastAccessedAt && lastAccessedAt < threeDaysAgo) {
        // 既に通知を送信済みかチェック
        if (!link.notificationsSent?.unused3Days) {
          unusedLinks.push({
            id: doc.id,
            title: link.title,
            url: link.url,
            userId: link.userId,
            lastAccessedAt: lastAccessedAt,
            createdAt: link.createdAt?.toDate()
          });
          
          // 通知送信フラグを更新
          await doc.ref.update({
            'notificationsSent.unused3Days': true,
            updatedAt: Timestamp.now()
          });
        }
      }
    }
    
    logger.info('3日間未読リンクチェック完了', {
      userId,
      unusedLinksCount: unusedLinks.length
    });
    
    return {
      unusedLinks,
      notificationsSent: unusedLinks.length
    };
  } catch (error) {
    logger.error('3日間未読リンクチェックエラー', error);
    throw new HttpsError('internal', 'サーバーエラーが発生しました');
  }
});
```

### functions/src/index.ts

```typescript
// 既存のimportに追加
import { checkUnusedLinks } from './checkUnusedLinks';

// 既存のexportに追加
export { checkUnusedLinks };
```

## 必要なパッケージ

以下のパッケージが自動的にpackage.jsonに追加されました：

- `expo-background-fetch`: ~13.2.4
- `expo-task-manager`: ~12.2.5

## app.json設定

以下の設定が自動的にapp.jsonに追加されました：

```json
{
  "expo": {
    "ios": {
      "backgroundModes": ["background-fetch"]
    },
    "plugins": [
      "expo-background-fetch",
      "expo-task-manager"
    ]
  }
}
```

## 動作フロー

1. **リンク保存時**: 通知は送信されません
2. **バックグラウンドタスク**: 24時間ごとに実行され、Cloud Functionsを呼び出します
3. **Cloud Functions**: 3日間未読リンクをチェックし、該当するリンクのリストを返します
4. **ローカル通知**: バックグラウンドタスクがCloud Functionsの結果を受けて、即座に通知をスケジュールします
5. **リンクアクセス時**: 通知をキャンセルし、lastAccessedAtを更新します

## TestFlight vs Development Build

- **Development Build**: バックグラウンドフェッチが動作しない場合があります
- **TestFlight/App Store**: 完全に動作します

## 手動テスト

デバッグ用に手動でチェックを実行できます：

```typescript
import { backgroundTaskService } from '../services/backgroundTaskService';

// 手動で3日間未読リンクをチェック
await backgroundTaskService.checkUnusedLinksManually();
```

## トラブルシューティング

### バックグラウンドタスクが動作しない場合

1. **Development Build**: バックグラウンドフェッチは無効化される場合があります
2. **TestFlight**: Appleの審査を通った場合のみ動作します
3. **権限**: アプリがバックグラウンド実行権限を持っているか確認してください

### Cloud Functions接続エラー

1. Firebase設定が正しいか確認
2. Functions regionが`asia-northeast1`に設定されているか確認
3. 認証状態が正しいか確認

### 通知が表示されない場合

1. 通知権限が許可されているか確認
2. Development Buildでは通知機能が無効化される場合があります
3. TestFlightで最終確認を行ってください

## セキュリティ考慮事項

1. Cloud Functions認証の確認
2. ユーザーIDベースのデータアクセス制限
3. レート制限の実装（必要に応じて）

## パフォーマンス考慮事項

1. バックグラウンドタスクの実行時間制限（iOS: 30秒）
2. Cloud Functions実行時間の最適化
3. 大量のリンクがある場合のページネーション実装

## 今後の拡張

1. **時間帯指定**: 通知送信時間を設定可能にする
2. **通知頻度設定**: ユーザーが通知頻度をカスタマイズできるようにする
3. **カテゴリ別通知**: タグやカテゴリに基づいた通知の分類
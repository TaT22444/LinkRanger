# LinkRanger タグアーキテクチャ移行ガイド

## 🔄 移行概要

このガイドは、LinkRangerアプリを従来の文字列ベースのタグシステムから新しいID参照ベースのタグシステムに移行する手順を説明します。

## 📋 変更点

### **データ構造の変更**

#### **Before (文字列ベース)**
```typescript
// Link
{
  tags: ["プログラミング", "AI", "ツール"]  // 文字列配列
}

// カスタムタグはローカル状態のみ
const [customTags, setCustomTags] = useState<string[]>([]);
```

#### **After (ID参照ベース)**
```typescript
// Link
{
  tagIds: ["tag_abc123", "tag_def456", "tag_ghi789"]  // タグID配列
}

// Tag
{
  id: "tag_abc123",
  userId: "user123",
  name: "プログラミング",
  type: "manual",
  linkCount: 5,
  lastUsedAt: Date,
  firstUsedAt: Date
}
```

## 🔧 実装の変更

### **1. 型定義の更新**
- `Link.tags: string[]` → `Link.tagIds: string[]`
- `Tag.type: 'auto' | 'manual'` → `Tag.type: 'manual' | 'ai' | 'recommended'`
- `Tag.isSystem: boolean` → 削除
- `Tag.firstUsedAt: Date` → 追加

### **2. サービスの更新**
- `tagService.createOrGetTag()` → 新機能追加
- `tagService.deleteTag()` → 完全なユーザー分離対応
- `tagService.generateRecommendedTags()` → 新機能追加
- `linkService.getLinksWithTags()` → 新機能追加

### **3. Hooksの更新**
- `useTags()` → 新規追加
- `useLinksWithTags()` → 新規追加

### **4. UIの更新**
- HomeScreen: customTags削除、useTags使用
- TagFilter: タグID対応
- AddTagModal: ID参照方式対応

## 📊 データ移行スクリプト

### **移行スクリプトの実行**

```bash
# 移行スクリプトを実行
cd LinkRanger
node scripts/migrateTagsToNewArchitecture.js
```

### **移行スクリプトの内容**

```javascript
// scripts/migrateTagsToNewArchitecture.js
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrateTagsToNewArchitecture() {
  console.log('🔄 タグアーキテクチャの移行を開始します...');
  
  const batch = db.batch();
  const linksSnapshot = await db.collection('links').get();
  const userTagMaps = new Map(); // userId -> Map<tagName, tagId>
  
  console.log(`📊 ${linksSnapshot.size} 件のリンクを処理します`);
  
  // Step 1: 各ユーザーのタグを作成
  for (const linkDoc of linksSnapshot.docs) {
    const linkData = linkDoc.data();
    const userId = linkData.userId;
    const tags = linkData.tags || [];
    
    if (!userTagMaps.has(userId)) {
      userTagMaps.set(userId, new Map());
    }
    
    const userTagMap = userTagMaps.get(userId);
    
    for (const tagName of tags) {
      if (!userTagMap.has(tagName)) {
        // 新しいタグを作成
        const tagRef = db.collection('tags').doc();
        const tagId = tagRef.id;
        
        batch.set(tagRef, {
          userId,
          name: tagName,
          type: 'manual',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          linkCount: 0,
          lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
          firstUsedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        userTagMap.set(tagName, tagId);
      }
    }
  }
  
  // Step 2: リンクのtagsをtagIdsに変換
  for (const linkDoc of linksSnapshot.docs) {
    const linkData = linkDoc.data();
    const userId = linkData.userId;
    const tags = linkData.tags || [];
    const userTagMap = userTagMaps.get(userId);
    
    const tagIds = tags.map(tagName => userTagMap.get(tagName)).filter(Boolean);
    
    // リンクを更新
    batch.update(linkDoc.ref, {
      tagIds,
      // tagsフィールドは削除
      tags: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // タグの使用回数を更新
    for (const tagId of tagIds) {
      const tagRef = db.collection('tags').doc(tagId);
      batch.update(tagRef, {
        linkCount: admin.firestore.FieldValue.increment(1),
        lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }
  
  // バッチ実行
  await batch.commit();
  
  console.log('✅ 移行が完了しました！');
  console.log(`📊 統計:`);
  console.log(`   - 処理したリンク: ${linksSnapshot.size} 件`);
  console.log(`   - 作成したタグ: ${Array.from(userTagMaps.values()).reduce((total, map) => total + map.size, 0)} 件`);
  console.log(`   - 対象ユーザー: ${userTagMaps.size} 人`);
}

// 実行
migrateTagsToNewArchitecture()
  .then(() => {
    console.log('🎉 移行処理が正常に完了しました');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ 移行処理中にエラーが発生しました:', error);
    process.exit(1);
  });
```

## 🔍 移行後の確認

### **1. データの確認**
```javascript
// 移行後のデータ確認スクリプト
async function verifyMigration() {
  const linksSnapshot = await db.collection('links').get();
  const tagsSnapshot = await db.collection('tags').get();
  
  console.log('📊 移行後の統計:');
  console.log(`   - リンク総数: ${linksSnapshot.size}`);
  console.log(`   - タグ総数: ${tagsSnapshot.size}`);
  
  // tagsフィールドが残っているリンクをチェック
  const linksWithOldTags = linksSnapshot.docs.filter(doc => doc.data().tags);
  if (linksWithOldTags.length > 0) {
    console.warn(`⚠️  ${linksWithOldTags.length} 件のリンクにまだ古いtagsフィールドが残っています`);
  }
  
  // tagIdsフィールドがないリンクをチェック
  const linksWithoutTagIds = linksSnapshot.docs.filter(doc => !doc.data().tagIds);
  if (linksWithoutTagIds.length > 0) {
    console.warn(`⚠️  ${linksWithoutTagIds.length} 件のリンクにtagIdsフィールドがありません`);
  }
}
```

### **2. アプリの動作確認**
- [ ] タグの作成・削除が正常に動作する
- [ ] リンクのフィルタリングが正常に動作する
- [ ] おすすめタグの生成が正常に動作する
- [ ] ユーザー間でタグが分離されている
- [ ] 再起動後もタグが保持される

## 🚨 注意事項

### **移行前の準備**
1. **データベースのバックアップ**を作成
2. **テスト環境**で移行スクリプトを実行
3. **ユーザーへの事前通知**

### **移行中の注意点**
- 移行中はアプリの使用を停止
- 大量のデータがある場合は分割実行を検討
- エラーが発生した場合は即座に停止

### **移行後の対応**
- 旧フィールド（`tags`）の削除は移行完了後に実行
- ユーザーフィードバックの収集
- パフォーマンスの監視

## 🔄 ロールバック手順

移行に問題が発生した場合のロールバック手順：

```javascript
// ロールバックスクリプト
async function rollbackMigration() {
  const batch = db.batch();
  const linksSnapshot = await db.collection('links').get();
  
  for (const linkDoc of linksSnapshot.docs) {
    const linkData = linkDoc.data();
    const tagIds = linkData.tagIds || [];
    
    // タグIDからタグ名を取得
    const tagNames = [];
    for (const tagId of tagIds) {
      const tagDoc = await db.collection('tags').doc(tagId).get();
      if (tagDoc.exists) {
        tagNames.push(tagDoc.data().name);
      }
    }
    
    // リンクを元に戻す
    batch.update(linkDoc.ref, {
      tags: tagNames,
      tagIds: admin.firestore.FieldValue.delete(),
    });
  }
  
  await batch.commit();
  
  // タグコレクションを削除
  const tagsSnapshot = await db.collection('tags').get();
  for (const tagDoc of tagsSnapshot.docs) {
    batch.delete(tagDoc.ref);
  }
  
  await batch.commit();
  console.log('✅ ロールバックが完了しました');
}
```

## 📈 期待される効果

### **機能面**
- ✅ ユーザー間でのタグ名重複問題の解決
- ✅ タグの完全なユーザー分離
- ✅ 再起動後もタグが保持される
- ✅ 統一されたタグ管理システム

### **技術面**
- ✅ データの一意性保証
- ✅ 効率的なクエリ実行
- ✅ スケーラブルなアーキテクチャ
- ✅ 参照整合性の維持

### **ユーザー体験**
- ✅ 一貫したタグ操作
- ✅ より高速なフィルタリング
- ✅ 安定したアプリ動作
- ✅ 将来的な機能拡張の基盤

この移行により、LinkRangerアプリのタグシステムは大幅に改善され、より安定で使いやすいものになります。 
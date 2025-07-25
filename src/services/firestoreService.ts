import {
  collection,
  doc,
  addDoc,
  updateDoc,
  setDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  serverTimestamp,
  increment,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { 
  User, 
  Link, 
  Tag, 
  Folder, 
  SearchHistory, 
  AppSettings,
  LinkFilter,
  LinkSort,
  PaginatedResponse,
  LinkWithTags
} from '../types';

import { getDefaultPlatformTags } from '../utils/platformDetector';

// コレクション名
const COLLECTIONS = {
  USERS: 'users',
  LINKS: 'links',
  TAGS: 'tags',
  FOLDERS: 'folders',
  SEARCH_HISTORY: 'searchHistory',
  APP_SETTINGS: 'appSettings',
} as const;

// Firestoreデータを安全なLinkオブジェクトに変換
const convertToLink = (doc: any): Link => {
  const data = doc.data();
  return {
    ...data,
    id: doc.id,
    tagIds: data.tagIds || [], // tagIdsが未定義の場合は空配列に
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
    lastAccessedAt: data.lastAccessedAt?.toDate(),
    expiresAt: data.expiresAt?.toDate() || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // デフォルト7日後
    isRead: data.isRead || false,
    isExpired: data.isExpired || false,
    notificationsSent: data.notificationsSent || {
      threeDays: false,
      oneDay: false,
      oneHour: false,
    },
  } as Link;
};

// ===== ユーザー関連 =====
export const userService = {
  async createUser(userData: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const docRef = doc(db, COLLECTIONS.USERS, userData.uid);
    
    await setDoc(docRef, {
      ...userData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      stats: {
        totalLinks: 0,
        totalTags: 0,
        totalFolders: 0,
        linksReadToday: 0,
        lastActiveAt: serverTimestamp(),
      },
    });

    console.log('User profile created successfully:', userData.uid);
    return userData.uid;
  },

  async createDefaultPlatformTags(userId: string): Promise<void> {
    console.log('Creating default platform tags for user:', userId);
    
    try {
      const defaultPlatformTagNames = getDefaultPlatformTags();
      const batch = writeBatch(db);
      let createdCount = 0;
      
      for (const tagName of defaultPlatformTagNames) {
        // 既存タグのチェック（念のため）
        const existingTag = await tagService.getTagByName(userId, tagName);
        if (existingTag) {
          console.log(`Tag "${tagName}" already exists, skipping`);
          continue;
        }

        // 新しいタグを作成
        const tagRef = doc(collection(db, COLLECTIONS.TAGS));
        batch.set(tagRef, {
          userId,
          name: tagName,
          type: 'recommended', // プラットフォームタグは推奨タグとして分類
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          linkCount: 0,
          lastUsedAt: serverTimestamp(),
          firstUsedAt: serverTimestamp(),
        });
        
        createdCount++;
        console.log(`Queued default platform tag: "${tagName}"`);
      }
      
      if (createdCount > 0) {
        await batch.commit();
        console.log(`Created ${createdCount} default platform tags for user ${userId}`);
        
        // ユーザー統計を更新
        await this.updateUserStats(userId, { totalTags: createdCount });
      } else {
        console.log('No new platform tags to create');
      }
      
    } catch (error) {
      console.error('Error creating default platform tags:', error);
      // エラーが発生してもユーザー作成は継続
      throw error; // エラーを上位に伝播（バックグラウンド実行なので影響なし）
    }
  },

  async getUser(uid: string): Promise<User | null> {
    const userRef = doc(db, COLLECTIONS.USERS, uid);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      const data = userSnap.data();
      return {
        ...data,
        uid: userSnap.id,
        createdAt: data.createdAt?.toDate() || new Date(),
      } as User;
    }
    return null;
  },

  async updateUserStats(uid: string, stats: Partial<User['stats']>): Promise<void> {
    if (!stats) return;
    const userRef = doc(db, COLLECTIONS.USERS, uid);
    const key = Object.keys(stats)[0];
    const value = Object.values(stats)[0] as number;
    await updateDoc(userRef, {
      [`stats.${key}`]: increment(value),
    });
  },
};

// ===== リンク関連 =====
export const linkService = {
  async createLink(linkData: Omit<Link, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7日後
    
    const docRef = await addDoc(collection(db, COLLECTIONS.LINKS), {
      ...linkData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(expiresAt),
      isRead: false,
      isExpired: false,
      notificationsSent: {
        threeDays: false,
        oneDay: false,
        oneHour: false,
      },
    });
    
    // ユーザー統計を更新
    await userService.updateUserStats(linkData.userId, { totalLinks: 1 });
    
    return docRef.id;
  },

  // 同じURLの既存リンクを検索（期限切れも含む）
  async findExistingLinkByUrl(userId: string, url: string): Promise<Link | null> {
    try {
      const q = query(
        collection(db, COLLECTIONS.LINKS),
        where('userId', '==', userId),
        where('url', '==', url),
        limit(1)
      );
      
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        return convertToLink(snapshot.docs[0]);
      }
      return null;
    } catch (error) {
      console.error('Error finding existing link by URL:', error);
      // インデックスエラーの場合はnullを返して処理を継続
      return null;
    }
  },

  // 期限切れリンクを復活させる
  async reviveExpiredLink(linkId: string): Promise<void> {
    const now = new Date();
    const newExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    await updateDoc(doc(db, COLLECTIONS.LINKS, linkId), {
      isExpired: false,
      expiresAt: Timestamp.fromDate(newExpiresAt),
      updatedAt: serverTimestamp(),
      notificationsSent: {
        threeDays: false,
        oneDay: false,
        oneHour: false,
      },
    });
  },

  // リンクを既読にする
  async markAsRead(linkId: string): Promise<void> {
    await updateDoc(doc(db, COLLECTIONS.LINKS, linkId), {
      isRead: true,
      lastAccessedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  },

  // 期限切れ対象のリンクを取得（Cloud Functions用）
  async getLinksForExpiration(): Promise<Link[]> {
    const now = new Date();
    const q = query(
      collection(db, COLLECTIONS.LINKS),
      where('isRead', '==', false),
      where('isExpired', '==', false),
      where('expiresAt', '<=', Timestamp.fromDate(now))
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(convertToLink);
  },

  // 通知対象のリンクを取得（Cloud Functions用）
  async getLinksForNotification(hoursBeforeExpiry: number): Promise<Link[]> {
    const now = new Date();
    const targetTime = new Date(now.getTime() + hoursBeforeExpiry * 60 * 60 * 1000);
    
    let notificationField: string;
    switch (hoursBeforeExpiry) {
      case 72: // 3日前
        notificationField = 'notificationsSent.threeDays';
        break;
      case 24: // 1日前
        notificationField = 'notificationsSent.oneDay';
        break;
      case 1: // 1時間前
        notificationField = 'notificationsSent.oneHour';
        break;
      default:
        return [];
    }
    
    const q = query(
      collection(db, COLLECTIONS.LINKS),
      where('isRead', '==', false),
      where('isExpired', '==', false),
      where(notificationField, '==', false),
      where('expiresAt', '<=', Timestamp.fromDate(targetTime))
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(convertToLink);
  },

  async updateLink(linkId: string, updates: Partial<Link>): Promise<void> {
    const linkRef = doc(db, COLLECTIONS.LINKS, linkId);
    await updateDoc(linkRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  },

  async deleteLink(linkId: string, userId: string): Promise<void> {
    const linkRef = doc(db, COLLECTIONS.LINKS, linkId);
    await deleteDoc(linkRef);
    
    // ユーザー統計を更新
    await userService.updateUserStats(userId, { totalLinks: -1 });
  },

  async getLink(linkId: string): Promise<Link | null> {
    const linkRef = doc(db, COLLECTIONS.LINKS, linkId);
    const linkSnap = await getDoc(linkRef);
    
    if (linkSnap.exists()) {
      return convertToLink(linkSnap);
    }
    return null;
  },

  async getUserLinks(
    userId: string,
    filter?: LinkFilter,
    sort?: LinkSort,
    pageSize: number = 20,
    lastDoc?: any
  ): Promise<PaginatedResponse<Link>> {
    let q = query(
      collection(db, COLLECTIONS.LINKS),
      where('userId', '==', userId),
      where('isExpired', '==', false) // 期限切れリンクを除外
    );

    // フィルター適用
    if (filter) {
      if (filter.folderId) {
        q = query(q, where('folderId', '==', filter.folderId));
      }
      if (filter.status) {
        q = query(q, where('status', '==', filter.status));
      }
      if (filter.isBookmarked !== undefined) {
        q = query(q, where('isBookmarked', '==', filter.isBookmarked));
      }
      if (filter.isArchived !== undefined) {
        q = query(q, where('isArchived', '==', filter.isArchived));
      }
      if (filter.priority) {
        q = query(q, where('priority', '==', filter.priority));
      }
    }

    // ソート適用
    const sortField = sort?.field || 'createdAt';
    const sortDirection = sort?.direction || 'desc';
    q = query(q, orderBy(sortField, sortDirection));

    // ページネーション
    if (lastDoc) {
      q = query(q, startAfter(lastDoc));
    }
    q = query(q, limit(pageSize + 1)); // +1で次ページの有無を確認

    const snapshot = await getDocs(q);
    const links = snapshot.docs.slice(0, pageSize).map(convertToLink);

    return {
      data: links,
      hasMore: snapshot.docs.length > pageSize,
      nextCursor: snapshot.docs.length > pageSize ? snapshot.docs[pageSize - 1].id : undefined,
      total: links.length, // 実際の実装では別途カウントクエリが必要
    };
  },

  // タグ情報付きでリンクを取得（新機能）
  async getLinksWithTags(userId: string): Promise<LinkWithTags[]> {
    const links = await this.getUserLinks(userId);
    const tags = await tagService.getUserTags(userId);
    const tagMap = new Map(tags.map(tag => [tag.id, tag]));
    
    return links.data.map(link => ({
      ...link,
      tags: (link.tagIds || [])
        .map(tagId => tagMap.get(tagId))
        .filter(Boolean) as Tag[]
    }));
  },

  // リアルタイムリスナー
  subscribeToUserLinks(
    userId: string,
    callback: (links: Link[]) => void,
    filter?: LinkFilter,
    sort?: LinkSort
  ): () => void {
    let q = query(
      collection(db, COLLECTIONS.LINKS),
      where('userId', '==', userId)
    );

    // フィルター・ソート適用（上記と同様）
    const sortField = sort?.field || 'createdAt';
    const sortDirection = sort?.direction || 'desc';
    q = query(q, orderBy(sortField, sortDirection));

    return onSnapshot(q, (snapshot) => {
      const links = snapshot.docs.map(convertToLink);
      callback(links);
    });
  },
};

// ===== タグ関連 =====
export const tagService = {
  // タグを作成または既存タグIDを取得（新設計の中核機能）
  async createOrGetTag(userId: string, tagName: string, type: 'manual' | 'ai' | 'recommended' = 'manual'): Promise<string> {
    // 既存タグをチェック
    const existingTag = await this.getTagByName(userId, tagName);
    if (existingTag) {
      // 使用統計を更新
      await this.updateTagUsage(existingTag.id);
      return existingTag.id;
    }

    // 新規タグを作成
    const tagData = {
      userId,
      name: tagName,
      type,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      linkCount: 1,
      lastUsedAt: serverTimestamp(),
      firstUsedAt: serverTimestamp(),
    };

    const tagsRef = collection(db, COLLECTIONS.TAGS);
    const docRef = await addDoc(tagsRef, tagData);
    
    await userService.updateUserStats(userId, { totalTags: 1 });
    
    return docRef.id;
  },

  // 従来のcreateTag（後方互換性のため）
  async createTag(tagData: Omit<Tag, 'id' | 'createdAt' | 'updatedAt' | 'linkCount' | 'lastUsedAt' | 'firstUsedAt'>): Promise<string> {
    return this.createOrGetTag(tagData.userId, tagData.name, tagData.type || 'manual');
  },

  async getTagByName(userId: string, name: string): Promise<Tag | null> {
    const q = query(
      collection(db, COLLECTIONS.TAGS),
      where('userId', '==', userId),
      where('name', '==', name),
      limit(1)
    );
    
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        lastUsedAt: data.lastUsedAt?.toDate() || new Date(),
        firstUsedAt: data.firstUsedAt?.toDate() || new Date(),
      } as Tag;
    }
    return null;
  },

  async getUserTags(userId: string): Promise<Tag[]> {
    console.log('tagService.getUserTags called with userId:', userId);
    try {
      const q = query(
        collection(db, COLLECTIONS.TAGS),
        where('userId', '==', userId),
        orderBy('lastUsedAt', 'desc')
      );
      
      const snapshot = await getDocs(q);
      console.log('tagService.getUserTags snapshot size:', snapshot.size);
      const tags = snapshot.docs.map(doc => {
        const data = doc.data();
        console.log('tagService.getUserTags tag data:', { id: doc.id, name: data.name });
        return {
          ...data,
          id: doc.id,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          lastUsedAt: data.lastUsedAt?.toDate() || new Date(),
          firstUsedAt: data.firstUsedAt?.toDate() || new Date(),
        } as Tag;
      });
      console.log('tagService.getUserTags returning tags:', tags);
      return tags;
    } catch (error) {
      console.error('tagService.getUserTags error:', error);
      throw error;
    }
  },

  async updateTagUsage(tagId: string): Promise<void> {
    const tagRef = doc(db, COLLECTIONS.TAGS, tagId);
    await updateDoc(tagRef, {
      linkCount: increment(1),
      lastUsedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  },

  // タグを削除（完全にユーザー固有）
  async deleteTag(userId: string, tagId: string): Promise<void> {
    // 1. 該当ユーザーのリンクからタグIDを削除
    const linksWithTag = await this.getLinksWithTag(userId, tagId);
    
    const batch = writeBatch(db);
    linksWithTag.forEach(link => {
      const linkRef = doc(db, 'links', link.id);
      const updatedTagIds = link.tagIds.filter(id => id !== tagId);
      batch.update(linkRef, { 
        tagIds: updatedTagIds,
        updatedAt: serverTimestamp() 
      });
    });
    
    // 2. tagsコレクションからタグを削除
    const tagRef = doc(db, COLLECTIONS.TAGS, tagId);
    batch.delete(tagRef);
    
    await batch.commit();
    
    await userService.updateUserStats(userId, { totalTags: -1 });
  },

  // 特定のタグIDを使用しているリンクを取得
  async getLinksWithTag(userId: string, tagId: string): Promise<Link[]> {
    const q = query(
      collection(db, COLLECTIONS.LINKS),
      where('userId', '==', userId),
      where('tagIds', 'array-contains', tagId)
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(convertToLink);
  },

  // おすすめタグを生成（ユーザー固有）
  async generateRecommendedTags(userId: string): Promise<string[]> {
    const SUGGESTED_TAGS = [
      'プログラミング', 'デザイン', 'マーケティング', 'ビジネス', 'ニュース',
      'エンターテイメント', '教育', 'ライフスタイル', 'テクノロジー', 'AI',
      'ツール', '音楽', '映画', '本', '料理', '旅行', 'スポーツ', '健康',
      'ファッション', '写真', 'DIY', 'ガジェット', 'レビュー', 'チュートリアル'
    ];
    
    // ユーザーの既存タグを取得
    const existingTags = await this.getUserTags(userId);
    const existingTagNames = existingTags.map(tag => tag.name.toLowerCase());
    
    // 未使用のタグを抽出
    const availableTags = SUGGESTED_TAGS.filter(tag => 
      !existingTagNames.includes(tag.toLowerCase())
    );
    
    // ランダムに5-8個選択
    const shuffled = availableTags.sort(() => 0.5 - Math.random());
    const count = Math.min(Math.max(5, Math.floor(Math.random() * 4) + 5), shuffled.length);
    
    return shuffled.slice(0, count);
  },

  // リアルタイムリスナー（タグ用）
  subscribeToUserTags(
    userId: string,
    callback: (tags: Tag[]) => void
  ): () => void {
    console.log('subscribeToUserTags called with userId:', userId);
    const q = query(
      collection(db, COLLECTIONS.TAGS),
      where('userId', '==', userId),
      orderBy('lastUsedAt', 'desc')
    );

    return onSnapshot(q, 
      (snapshot) => {
        console.log('subscribeToUserTags snapshot received, size:', snapshot.size);
        const tags = snapshot.docs.map(doc => {
          const data = doc.data();
          console.log('subscribeToUserTags tag data:', { id: doc.id, name: data.name, userId: data.userId });
          return {
            ...data,
            id: doc.id,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
            lastUsedAt: data.lastUsedAt?.toDate() || new Date(),
            firstUsedAt: data.firstUsedAt?.toDate() || new Date(),
          } as Tag;
        });
        console.log('subscribeToUserTags calling callback with tags:', tags);
        callback(tags);
      },
      (error) => {
        console.error('subscribeToUserTags error:', error);
        // エラーが発生した場合も空配列でコールバックを呼ぶ
        callback([]);
      }
    );
  },
};

// ===== フォルダ関連 =====
export const folderService = {
  async createFolder(folderData: Omit<Folder, 'id' | 'createdAt' | 'updatedAt' | 'linkCount'>): Promise<string> {
    const foldersRef = collection(db, COLLECTIONS.FOLDERS);
    const docRef = await addDoc(foldersRef, {
      ...folderData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      linkCount: 0,
    });
    
    // await userService.updateUserStats(folderData.userId, { totalFolders: 1 }); // TODO: Add totalFolders to User stats type
    
    return docRef.id;
  },

  async getUserFolders(userId: string): Promise<Folder[]> {
    const q = query(
      collection(db, COLLECTIONS.FOLDERS),
      where('userId', '==', userId),
      orderBy('order', 'asc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      } as Folder;
    });
  },

  async updateFolderLinkCount(folderId: string, incrementValue: number): Promise<void> {
    const folderRef = doc(db, COLLECTIONS.FOLDERS, folderId);
    await updateDoc(folderRef, {
      linkCount: increment(incrementValue),
    });
  },

  async deleteFolder(folderId: string, userId: string): Promise<void> {
    const folderRef = doc(db, COLLECTIONS.FOLDERS, folderId);
    await deleteDoc(folderRef);
    
    // await userService.updateUserStats(userId, { totalFolders: -1 }); // TODO: Add totalFolders to User stats type
  },
};

// ===== 検索履歴関連 =====
export const searchService = {
  async saveSearchHistory(userId: string, query: string, resultCount: number): Promise<void> {
    const historyRef = collection(db, COLLECTIONS.SEARCH_HISTORY);
    await addDoc(historyRef, {
      userId,
      query,
      resultCount,
      timestamp: serverTimestamp(),
    });
  },

  async getSearchHistory(userId: string, limitCount: number = 10): Promise<SearchHistory[]> {
    const q = query(
      collection(db, COLLECTIONS.SEARCH_HISTORY),
      where('userId', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        id: doc.id,
        timestamp: data.timestamp?.toDate() || new Date(),
      } as SearchHistory;
    });
  },
};

// ===== アプリ設定関連 =====
export const settingsService = {
  async saveSettings(settings: AppSettings): Promise<void> {
    const settingsRef = doc(db, COLLECTIONS.APP_SETTINGS, settings.userId);
    await updateDoc(settingsRef, {
      ...settings,
      updatedAt: serverTimestamp(),
    });
  },

  async getSettings(userId: string): Promise<AppSettings | null> {
    const settingsRef = doc(db, COLLECTIONS.APP_SETTINGS, userId);
    const settingsSnap = await getDoc(settingsRef);
    
    if (settingsSnap.exists()) {
      const data = settingsSnap.data();
      return {
        ...data,
        updatedAt: data.updatedAt?.toDate() || new Date(),
      } as AppSettings;
    }
    return null;
  },
};

// ===== バッチ操作 =====
export const batchService = {
  async bulkUpdateLinks(updates: { id: string; data: Partial<Link> }[]): Promise<void> {
    const batch = writeBatch(db);
    
    updates.forEach(({ id, data }) => {
      const linkRef = doc(db, COLLECTIONS.LINKS, id);
      batch.update(linkRef, {
        ...data,
        updatedAt: serverTimestamp(),
      });
    });
    
    await batch.commit();
  },

  async bulkDeleteLinks(linkIds: string[], userId: string): Promise<void> {
    const batch = writeBatch(db);
    
    linkIds.forEach(id => {
      const linkRef = doc(db, COLLECTIONS.LINKS, id);
      batch.delete(linkRef);
    });
    
    await batch.commit();
    
    // 統計更新
    await userService.updateUserStats(userId, { totalLinks: -linkIds.length });
  },
}; 
import {
  collection,
  doc,
  addDoc,
  updateDoc,
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
  Timestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { 
  Link, 
  Tag, 
  LinkFilter, 
  LinkSort, 
  PaginatedResponse,
  LinkWithTags 
} from '../types';
import { COLLECTIONS, convertToLink } from './firestoreUtils';
import { userService } from './userService';
import { tagService } from './tagService';

// ===== リンク関連 =====
export const linkService = {
  async createLink(linkData: Omit<Link, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    console.log('📝 linkService: リンク作成開始', {
      userId: linkData.userId,
      title: linkData.title,
      url: linkData.url
    });
    
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
    
    console.log('✅ linkService: リンク作成完了', {
      id: docRef.id,
      userId: linkData.userId,
      title: linkData.title,
      status: linkData.status,
      timestamp: new Date().toISOString()
    });
    
    // 作成直後にドキュメントを読み取って確認
    try {
      const createdDoc = await getDoc(docRef);
      if (createdDoc.exists()) {
        const data = createdDoc.data();
        console.log('🔍 linkService: 作成直後の確認読み取り', {
          id: docRef.id,
          hasTitle: !!data.title,
          hasUrl: !!data.url,
          createdAt: data.createdAt,
          status: data.status
        });
      }
    } catch (error) {
      console.error('❌ linkService: 作成確認エラー', error);
    }
    
    // ユーザー統計を更新
    await userService.updateUserStats(linkData.userId, { totalLinks: 1 });
    
    return docRef.id;
  },

  // 既存のURL重複チェック機能を活用したユーザー中心の削除
  async findExistingLinkByUrl(userId: string, url: string): Promise<Link | null> {
    const q = query(
      collection(db, COLLECTIONS.LINKS),
      where('url', '==', url),
      limit(1)
    );
    
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      const link = convertToLink(doc);
      // そのリンクが指定ユーザーのものかチェック
      if (link.userId === userId) {
        return link;
      }
    }
    
    return null;
  },

  // ユーザー関連付けベースの削除（推奨）
  async removeUserFromLink(linkId: string, userId: string): Promise<void> {
    const linkRef = doc(db, COLLECTIONS.LINKS, linkId);
    const linkDoc = await getDoc(linkRef);
    
    if (!linkDoc.exists()) {
      throw new Error('リンクが見つかりません');
    }
    
    const linkData = linkDoc.data();
    
    // 現在の実装では1ユーザー1リンクなので、完全削除
    // 将来的に複数ユーザー対応する場合は、userIdsから削除のみ
    if (linkData.userId === userId) {
      await deleteDoc(linkRef);
      await userService.updateUserStats(userId, { totalLinks: -1 });
    } else {
      throw new Error('このリンクを削除する権限がありません');
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
      const changes = snapshot.docChanges();
      console.log('📥 linkService: リアルタイム更新受信', {
        userId,
        totalDocs: snapshot.docs.length,
        changes: changes.map(c => ({ 
          type: c.type, 
          id: c.doc.id, 
          data: c.doc.data() 
        })),
        hasNewDocuments: changes.some(change => change.type === 'added'),
        timestamp: new Date().toISOString()
      });
      
      const links = snapshot.docs
        .map((doc, index) => {
          try {
            const link = convertToLink(doc);
            return link;
          } catch (error) {
            console.error('❌ convertToLink error:', {
              docId: doc.id,
              index,
              error,
              rawData: doc.data()
            });
            return null;
          }
        })
        .filter((link): link is Link => link !== null && !!link.id && !!link.url);
      
      console.log('📊 linkService: 変換後のリンク', {
        userId,
        originalCount: snapshot.docs.length,
        filteredCount: links.length,
        filteredOutCount: snapshot.docs.length - links.length
      });
      
      callback(links);
    }, (error) => {
      console.error('❌ linkService: リアルタイム更新エラー', {
        userId,
        error: error.message,
        code: error.code
      });
    });
  },
};
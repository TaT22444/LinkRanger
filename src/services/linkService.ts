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
import { notificationService } from './notificationService';

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
        unused3Days: false,
      },
    });
    

    
    // 作成直後にドキュメントを読み取って確認
    try {
      // serverTimestamp()の解決を待つため、少し待機してから読み取り
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const createdDoc = await getDoc(docRef);
      if (createdDoc.exists()) {
        const data = createdDoc.data();


        // 🔥 FCM一元化: ローカル通知スケジュールを削除
        // 3日間未読通知はCloud Scheduler + FCMで処理
        // ローカル通知は設定せず、FCMシステムに完全依存
        // Cloud Schedulerが6時間ごとに3日間未読リンクをチェックして通知
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
        unused3Days: false,
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
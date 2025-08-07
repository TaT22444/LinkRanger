import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  increment,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { Tag, Link } from '../types';
import { COLLECTIONS, convertToLink } from './firestoreUtils';
import { userService } from './userService';

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
        const tags = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            ...data,
            id: doc.id,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
            lastUsedAt: data.lastUsedAt?.toDate() || new Date(),
            firstUsedAt: data.firstUsedAt?.toDate() || new Date(),
          } as Tag;
        });
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
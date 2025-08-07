import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
  increment,
  writeBatch,
  collection,
  query,
  where,
  limit,
  getDocs,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { User } from '../types';
import { COLLECTIONS } from './firestoreUtils';
import { getDefaultPlatformTags } from '../utils/platformDetector';

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
        // 既存タグのチェック（念のため） - 循環インポートを避けるため、直接クエリ
        const existingTagQuery = query(
          collection(db, COLLECTIONS.TAGS),
          where('userId', '==', userId),
          where('name', '==', tagName),
          limit(1)
        );
        const existingTagSnapshot = await getDocs(existingTagQuery);
        if (!existingTagSnapshot.empty) {
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
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
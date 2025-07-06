import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signInAnonymously, 
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { User } from '../types';

// ユーザー登録（メールアドレス）
export const registerWithEmail = async (email: string, password: string): Promise<User> => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;
    
    // Firestoreにユーザー情報を保存
    const userData: User = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      isAnonymous: false,
      createdAt: new Date()
    };
    
    await setDoc(doc(db, 'users', firebaseUser.uid), userData);
    return userData;
  } catch (error) {
    console.error('Registration error:', error);
    throw error;
  }
};

// ログイン（メールアドレス）
export const loginWithEmail = async (email: string, password: string): Promise<User> => {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;
    
    // Firestoreからユーザー情報を取得
    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
    if (userDoc.exists()) {
      return userDoc.data() as User;
    } else {
      // ドキュメントが存在しない場合は作成
      const userData: User = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        isAnonymous: false,
        createdAt: new Date()
      };
      await setDoc(doc(db, 'users', firebaseUser.uid), userData);
      return userData;
    }
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
};

// 匿名ログイン
export const loginAnonymously = async (): Promise<User> => {
  try {
    const userCredential = await signInAnonymously(auth);
    const firebaseUser = userCredential.user;
    
    // Firestoreに匿名ユーザー情報を保存
    const userData: User = {
      uid: firebaseUser.uid,
      email: null,
      isAnonymous: true,
      createdAt: new Date()
    };
    
    await setDoc(doc(db, 'users', firebaseUser.uid), userData);
    return userData;
  } catch (error) {
    console.error('Anonymous login error:', error);
    throw error;
  }
};

// ログアウト
export const logout = async (): Promise<void> => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Logout error:', error);
    throw error;
  }
};

// 認証状態の監視
export const onAuthStateChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, async (firebaseUser: FirebaseUser | null) => {
    if (firebaseUser) {
      try {
        // Firestoreからユーザー情報を取得
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          callback(userDoc.data() as User);
        } else {
          callback(null);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
        callback(null);
      }
    } else {
      callback(null);
    }
  });
}; 
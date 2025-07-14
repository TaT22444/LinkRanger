import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signInAnonymously, 
  signOut, 
  onAuthStateChanged,
  updateProfile as updateFirebaseProfile,
  User as FirebaseUser,
  updateEmail
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { User } from '../types';

interface UpdateUserProfileParams {
  displayName?: string;
  email?: string;
  avatarId?: string;
  avatarIcon?: string;
}

// ユーザー登録（メールアドレス）
export const registerWithEmail = async (email: string, password: string): Promise<User> => {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;
    
    // Firestoreにユーザー情報を保存
    const userData: User = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      username: firebaseUser.email, // デフォルトの表示名をメールアドレスに設定
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
        username: firebaseUser.email, // デフォルトの表示名をメールアドレスに設定
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
      username: null,
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
  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (firebaseUser) {
      try {
        // Firestoreからユーザー情報を取得
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data() as User;
          // Firestoreのデータを優先
          callback({
            ...userData,
            username: userData.username || userData.email || null,
            avatarId: userData.avatarId,
            avatarIcon: userData.avatarIcon,
            createdAt: userData.createdAt instanceof Date ? userData.createdAt : new Date(userData.createdAt)
          });
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

// プロフィール更新
export const updateUserProfile = async (params: UpdateUserProfileParams): Promise<void> => {
  try {
    if (!auth.currentUser) throw new Error('ユーザーが見つかりません');

    // Firebase Authのプロフィールを更新（displayNameのみ）
    if (params.displayName) {
      await updateFirebaseProfile(auth.currentUser, {
        displayName: params.displayName
      });
    }

    // メールアドレスの更新
    if (params.email) {
      await updateEmail(auth.currentUser, params.email);
    }

    // Firestoreのユーザー情報を更新
    const userRef = doc(db, 'users', auth.currentUser.uid);
    const updateData: { [key: string]: any } = {};

    if (params.displayName) updateData.username = params.displayName;
    if (params.email) updateData.email = params.email;
    if (params.avatarId) updateData.avatarId = params.avatarId;
    if (params.avatarIcon) updateData.avatarIcon = params.avatarIcon;

    await updateDoc(userRef, updateData);

  } catch (error) {
    console.error('プロフィール更新エラー:', error);
    throw error;
  }
}; 
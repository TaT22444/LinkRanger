import { 
  GoogleAuthProvider,
  signInWithCredential
} from 'firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
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
import { userService } from './firestoreService';
import { UserPlan } from '../types';

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
    
    // デフォルトプラットフォームタグ付きでユーザープロフィールを作成
    await createUserProfile(firebaseUser);
    
    // 作成されたユーザー情報を取得して返す
    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
    if (userDoc.exists()) {
      return userDoc.data() as User;
    } else {
      throw new Error('Failed to retrieve created user profile');
    }
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
      // ドキュメントが存在しない場合は作成（既存ユーザーでプロフィールが無い場合）
      await createUserProfile(firebaseUser);
      const newUserDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      return newUserDoc.data() as User;
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
    
    // デフォルトプラットフォームタグ付きでユーザープロフィールを作成
    await createUserProfile(firebaseUser);
    
    // 作成されたユーザー情報を取得して返す
    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
    if (userDoc.exists()) {
      return userDoc.data() as User;
    } else {
      throw new Error('Failed to retrieve created anonymous user profile');
    }
  } catch (error) {
    console.error('Anonymous login error:', error);
    throw error;
  }
};

// Googleログイン
export const signInWithGoogle = async (): Promise<User> => {
  try {
    await GoogleSignin.hasPlayServices();
    await GoogleSignin.signIn();
    const { idToken } = await GoogleSignin.getTokens();
    if (!idToken) {
      throw new Error('Google sign-in failed: idToken is missing.');
    }
    const googleCredential = GoogleAuthProvider.credential(idToken);
    const userCredential = await signInWithCredential(auth, googleCredential);
    const firebaseUser = userCredential.user;

    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
    if (userDoc.exists()) {
      return userDoc.data() as User;
    } else {
      await createUserProfile(firebaseUser);
      const newUserDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      return newUserDoc.data() as User;
    }
  } catch (error) {
    console.error('Google sign-in error:', error);
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
    console.log('onAuthStateChanged triggered, firebaseUser:', firebaseUser ? firebaseUser.uid : 'null');
    
    if (firebaseUser) {
      try {
        console.log('Fetching user data from Firestore for uid:', firebaseUser.uid);
        
        // Firestoreからユーザー情報を取得
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        
        if (userDoc.exists()) {
          console.log('User document found in Firestore');
          const userData = userDoc.data() as User;
          
          // Firestoreのデータを優先
          const user = {
            ...userData,
            username: userData.username || userData.email || null,
            avatarId: userData.avatarId,
            avatarIcon: userData.avatarIcon,
            createdAt: userData.createdAt instanceof Date ? userData.createdAt : new Date(userData.createdAt)
          };
          
          console.log('Calling callback with user data:', user.uid);
          callback(user);
        } else {
          console.log('User document not found in Firestore, creating profile...');
          
          // ドキュメントが存在しない場合は作成
          try {
            await createUserProfile(firebaseUser);
            console.log('User profile created, fetching again...');
            
            // 作成後に再度取得
            const newUserDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
            if (newUserDoc.exists()) {
              const userData = newUserDoc.data() as User;
              const user = {
                ...userData,
                username: userData.username || userData.email || null,
                avatarId: userData.avatarId,
                avatarIcon: userData.avatarIcon,
                createdAt: userData.createdAt instanceof Date ? userData.createdAt : new Date(userData.createdAt)
              };
              console.log('Calling callback with newly created user data:', user.uid);
              callback(user);
            } else {
              console.error('Failed to retrieve newly created user profile');
              callback(null);
            }
          } catch (profileError) {
            console.error('Error creating user profile:', profileError);
            callback(null);
          }
        }
      } catch (error) {
        console.error('Error in onAuthStateChange:', error);
        callback(null);
      }
    } else {
      console.log('No firebase user, calling callback with null');
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

  const createUserProfile = async (user: FirebaseUser): Promise<void> => {
    try {
      const userData = {
        uid: user.uid,
        email: user.email || '',
        username: user.displayName || user.email || '',
        isAnonymous: user.isAnonymous,
        preferences: {
          theme: 'dark' as const,
          defaultSort: 'createdAt' as const,
          autoTagging: true,
          autoSummary: true,
        },
      };

      // まずユーザープロフィールを作成
      await userService.createUser(userData);
      console.log('User profile created successfully');
      
      // デフォルトプラットフォームタグの作成は非同期で実行（認証フローをブロックしない）
      setTimeout(async () => {
        try {
          await userService.createDefaultPlatformTags(user.uid);
          console.log('Default platform tags created in background');
        } catch (error) {
          console.error('Failed to create default platform tags in background:', error);
          // エラーが発生してもユーザー体験には影響しない
        }
      }, 100); // 100ms後に実行
      
    } catch (error) {
      console.error('Failed to create user profile:', error);
      throw error;
    }
  }; 
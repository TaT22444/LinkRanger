import { 
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  signInWithPopup
} from 'firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';
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
    console.log('📧 メールログイン開始:', email);
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;
    console.log('✅ Firebase認証完了:', firebaseUser.uid);
    
    // Firestoreからユーザー情報を取得
    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
    if (userDoc.exists()) {
      console.log('✅ 既存ユーザー情報取得');
      return userDoc.data() as User;
    } else {
      console.log('📝 ユーザープロフィール作成中...');
      // ドキュメントが存在しない場合は作成（既存ユーザーでプロフィールが無い場合）
      await createUserProfile(firebaseUser);
      const newUserDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      console.log('✅ ユーザープロフィール作成完了');
      return newUserDoc.data() as User;
    }
  } catch (error: any) {
    console.error('❌ メールログインエラー:', error);
    
    if (error.code) {
      switch (error.code) {
        case 'auth/api-key-not-valid':
          throw new Error('Firebase APIキーが無効です。設定を確認してください。');
        case 'auth/user-not-found':
          throw new Error('このメールアドレスは登録されていません。');
        case 'auth/wrong-password':
          throw new Error('パスワードが正しくありません。');
        case 'auth/too-many-requests':
          throw new Error('リクエストが多すぎます。しばらく待ってから再試行してください。');
        case 'auth/network-request-failed':
          throw new Error('ネットワークエラーが発生しました。インターネット接続を確認してください。');
        default:
          throw new Error(`ログインエラー: ${error.message || error.code}`);
      }
    }
    
    throw error;
  }
};

// 匿名ログイン
export const loginAnonymously = async (): Promise<User> => {
  try {
    console.log('👤 匿名ログイン開始');
    const userCredential = await signInAnonymously(auth);
    const firebaseUser = userCredential.user;
    console.log('✅ Firebase匿名認証完了:', firebaseUser.uid);
    
    // デフォルトプラットフォームタグ付きでユーザープロフィールを作成
    console.log('📝 匿名ユーザープロフィール作成中...');
    await createUserProfile(firebaseUser);
    
    // 作成されたユーザー情報を取得して返す
    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
    if (userDoc.exists()) {
      console.log('✅ 匿名ユーザープロフィール作成完了');
      return userDoc.data() as User;
    } else {
      throw new Error('匿名ユーザープロフィールの取得に失敗しました');
    }
  } catch (error: any) {
    console.error('❌ 匿名ログインエラー:', error);
    
    if (error.code) {
      switch (error.code) {
        case 'auth/api-key-not-valid':
          throw new Error('Firebase APIキーが無効です。設定を確認してください。');
        case 'auth/network-request-failed':
          throw new Error('ネットワークエラーが発生しました。インターネット接続を確認してください。');
        case 'auth/too-many-requests':
          throw new Error('リクエストが多すぎます。しばらく待ってから再試行してください。');
        default:
          throw new Error(`匿名ログインエラー: ${error.message || error.code}`);
      }
    }
    
    throw error;
  }
};

// Googleログイン
export const signInWithGoogle = async (): Promise<User> => {
  try {
    console.log('🔍 Googleログイン開始');
    
    // Play Services確認（Android用だが、念のため）
    try {
      await GoogleSignin.hasPlayServices();
      console.log('✅ Play Services確認完了');
    } catch (playServicesError) {
      console.log('ℹ️ Play Services確認スキップ（iOSなので正常）');
    }
    
    // Googleサインイン
    console.log('🔍 Googleサインイン実行中...');
    await GoogleSignin.signIn();
    console.log('✅ Googleサインイン完了');
    
    // トークン取得
    const { idToken } = await GoogleSignin.getTokens();
    if (!idToken) {
      throw new Error('GoogleサインインでIDトークンが取得できませんでした');
    }
    console.log('✅ IDトークン取得完了');
    
    // Firebase認証
    const googleCredential = GoogleAuthProvider.credential(idToken);
    const userCredential = await signInWithCredential(auth, googleCredential);
    const firebaseUser = userCredential.user;
    console.log('✅ Firebase認証完了:', firebaseUser.uid);

    // ユーザードキュメント確認・作成
    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
    if (userDoc.exists()) {
      console.log('✅ 既存ユーザー情報取得');
      return userDoc.data() as User;
    } else {
      console.log('📝 新規ユーザープロフィール作成中...');
      await createUserProfile(firebaseUser);
      const newUserDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      console.log('✅ 新規ユーザープロフィール作成完了');
      return newUserDoc.data() as User;
    }
  } catch (error: any) {
    console.error('❌ Googleログインエラー:', error);
    
    // エラーの詳細な分析
    if (error.code) {
      console.error('エラーコード:', error.code);
      switch (error.code) {
        case 'auth/api-key-not-valid':
          throw new Error('Firebase APIキーが無効です。設定を確認してください。');
        case 'auth/network-request-failed':
          throw new Error('ネットワークエラーが発生しました。インターネット接続を確認してください。');
        case 'auth/too-many-requests':
          throw new Error('リクエストが多すぎます。しばらく待ってから再試行してください。');
        default:
          throw new Error(`Googleログインエラー: ${error.message || error.code}`);
      }
    }
    
    throw new Error(`Googleログインに失敗しました: ${error.message || '不明なエラー'}`);
  }
};

// Appleログイン（iOS限定）
export const signInWithApple = async (): Promise<User> => {
  try {
    console.log('🍎 Appleログイン開始');
    
    // iOS以外では利用不可
    if (Platform.OS !== 'ios') {
      throw new Error('Appleログインは現在iOS端末でのみ利用可能です');
    }

    // expo-apple-authenticationを動的インポート
    const AppleAuthentication = await import('expo-apple-authentication');
    
    // Apple認証が利用可能かチェック
    const isAvailable = await AppleAuthentication.isAvailableAsync();
    if (!isAvailable) {
      throw new Error('このデバイスではApple認証が利用できません');
    }

    console.log('🔐 Apple認証開始...');
    
    // Apple認証を実行
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });

    console.log('✅ Apple認証完了:', credential.user);

    // identityTokenが必要
    if (!credential.identityToken) {
      throw new Error('Apple認証でidentityTokenが取得できませんでした');
    }

    // Firebase OAuthプロバイダーを作成
    const provider = new OAuthProvider('apple.com');
    
    // Firebase認証
    const oauthCredential = provider.credential({
      idToken: credential.identityToken,
    });

    const userCredential = await signInWithCredential(auth, oauthCredential);
    const firebaseUser = userCredential.user;
    console.log('✅ Firebase認証完了:', firebaseUser.uid);

    // ユーザードキュメント確認・作成
    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
    if (userDoc.exists()) {
      console.log('✅ 既存ユーザー情報取得');
      return userDoc.data() as User;
    } else {
      console.log('📝 新規ユーザープロフィール作成中...');
      await createUserProfile(firebaseUser);
      const newUserDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      console.log('✅ 新規ユーザープロフィール作成完了');
      return newUserDoc.data() as User;
    }

  } catch (error: any) {
    console.error('❌ Appleログインエラー:', error);
    
    if (error.code) {
      switch (error.code) {
        case 'ERR_REQUEST_CANCELED':
          throw new Error('Appleログインがキャンセルされました');
        case 'auth/invalid-credential':
          throw new Error('Apple認証の資格情報が無効です');
        case 'auth/account-exists-with-different-credential':
          throw new Error('このメールアドレスは既に別の方法で登録されています');
        case 'auth/api-key-not-valid':
          throw new Error('Firebase APIキーが無効です');
        default:
          throw new Error(`Appleログインエラー: ${error.message || error.code}`);
      }
    }
    
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
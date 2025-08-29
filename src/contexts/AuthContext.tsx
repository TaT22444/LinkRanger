import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, AuthState } from '../types';
import { onAuthStateChange, updateUserProfile as updateProfile, signInWithGoogle, signInWithApple } from '../services/authService';
import { auth } from '../config/firebase';
import {
  signOut,
  updateProfile as updateFirebaseProfile,
  updateEmail,
} from 'firebase/auth';
import { globalCache } from '../hooks/useFirestore';
import { db } from '../config/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { fcmService } from '../services/fcmService';

interface AuthContextType extends AuthState {
  loginWithGoogle: () => Promise<void>;
  loginWithApple: () => Promise<void>;
  logout: () => Promise<void>;
  updateUserProfile: (profile: { 
    displayName?: string; 
    avatarId?: string;
    avatarIcon?: string;
  }) => Promise<void>;
  getUserEmail: () => string | null;
  forceAuthSync: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    try {
      // 初期状態を設定
      setState({
        user: null,
        loading: true,
        error: null,
      });

      const unsubscribe = onAuthStateChange(async (user) => {
        console.log('AuthProvider: onAuthStateChange triggered', user ? `User: ${user.uid}` : 'No user');
        
        // ユーザーが存在する場合
        if (user) {
          setState({
            user: {
              ...user,
              // Firestoreのusernameフィールドを使用（authServiceで既にFirebase Authのemailがフォールバック設定済み）
              username: user.username || null,
              avatarId: user.avatarId,
              avatarIcon: user.avatarIcon,
            },
            loading: false,
            error: null,
          });

          // 🔥 ユーザーログイン時にFCM初期化を実行
          try {
            console.log('🔐 ユーザーログイン検出: FCM初期化を開始');
            await fcmService.initializeFCM();
            console.log('✅ FCMトークン登録完了 - Cloud Schedulerが通知送信で使用');
          } catch (fcmError) {
            console.error('❌ FCM初期化エラー:', fcmError);
            // FCMエラーは認証の妨げにならないようにログのみ
          }
        } else {
          // ユーザーが存在しない場合
          console.log('AuthProvider: No user detected, setting loading to false');
          setState({
            user: null,
            loading: false,
            error: null,
          });
        }
      });

      return () => {
        console.log('AuthProvider: Unsubscribing from auth state change');
        unsubscribe();
      };
    } catch (error) {
      console.error('❌ AuthContext初期化エラー:', error);
      setState({
        user: null,
        loading: false,
        error: '認証初期化エラー',
      });
    }
  }, []);

  const loginWithGoogle = async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      await signInWithGoogle();
    } catch (error: any) {
      setState(prev => ({ 
        ...prev, 
        error: error.message || 'Googleログインに失敗しました',
        loading: false, 
      }));
      throw error;
    }
  };

  const loginWithApple = async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      await signInWithApple();
    } catch (error: any) {
      setState(prev => ({ 
        ...prev, 
        error: error.message || 'Appleログインに失敗しました',
        loading: false, 
      }));
      throw error;
    }
  };

  const logout = async () => {
    try {
    setState(prev => ({ ...prev, loading: true, error: null }));
      await signOut(auth);
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        error: error.message || 'ログアウトに失敗しました',
        loading: false,
      }));
      throw error;
    }
  };

  const updateUserProfile = async (profile: { 
    displayName?: string; 
    avatarId?: string;
    avatarIcon?: string;
  }) => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      
      // プロフィール更新
      await updateProfile(profile);

      // ローカルのステートを更新
      setState(prev => ({
        ...prev,
        user: prev.user ? {
          ...prev.user,
          username: profile.displayName || prev.user.username,
          avatarId: profile.avatarId || prev.user.avatarId,
          avatarIcon: profile.avatarIcon || prev.user.avatarIcon,
        } : null,
        loading: false,
      }));

    } catch (error: any) {
      setState(prev => ({ 
        ...prev, 
        error: error.message || 'プロフィールの更新に失敗しました',
        loading: false, 
      }));
      throw error;
    }
  };

  const getUserEmail = (): string | null => {
    return auth.currentUser?.email || null;
  };

  const forceAuthSync = async () => {
    try {
      console.log('🔄 認証状態の強制同期開始');
      
      // Firebase Authの現在の状態を確認
      const currentAuthUser = auth.currentUser;
      if (!currentAuthUser) {
        console.log('⚠️ Firebase Authにユーザーが存在しません');
        // 現在の状態と異なる場合のみ更新
        if (state.user !== null) {
          setState({
            user: null,
            loading: false,
            error: null,
          });
        }
        return;
      }
      
      // Firestoreから最新のユーザー情報を取得
      const userDoc = await getDoc(doc(db, 'users', currentAuthUser.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data() as User;
        const user = {
          ...userData,
          username: userData.username || currentAuthUser.displayName || 'ユーザー',
          avatarId: userData.avatarId,
          avatarIcon: userData.avatarIcon,
          createdAt: userData.createdAt
        };
        
        // 現在の状態と異なる場合のみ更新
        if (JSON.stringify(state.user) !== JSON.stringify(user)) {
          setState({
            user,
            loading: false,
            error: null,
          });
          console.log('✅ 認証状態の強制同期完了 - 状態更新あり');
        } else {
          console.log('✅ 認証状態の強制同期完了 - 状態変更なし');
        }
      } else {
        console.log('⚠️ Firestoreにユーザードキュメントが存在しません');
        // 現在の状態と異なる場合のみ更新
        if (state.user !== null || state.error !== 'ユーザープロフィールが見つかりません') {
          setState({
            user: null,
            loading: false,
            error: 'ユーザープロフィールが見つかりません',
          });
        }
      }
    } catch (error) {
      console.error('❌ 認証状態の強制同期エラー:', error);
      // 現在の状態と異なる場合のみ更新
      if (state.error !== '認証状態の同期に失敗しました') {
        setState({
          user: null,
          loading: false,
          error: '認証状態の同期に失敗しました',
        });
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        ...state,
        loginWithGoogle,
        loginWithApple,
        logout,
        updateUserProfile,
        getUserEmail,
        forceAuthSync,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
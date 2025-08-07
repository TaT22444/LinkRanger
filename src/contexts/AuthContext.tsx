import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, AuthState } from '../types';
import { onAuthStateChange, updateUserProfile as updateProfile, signInWithGoogle, signInWithApple } from '../services/authService';
import { auth } from '../config/firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile as updateFirebaseProfile,
  updateEmail,
  signInAnonymously,
} from 'firebase/auth';

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  loginAnonymously: () => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  loginWithApple: () => Promise<void>;
  logout: () => Promise<void>;
  updateUserProfile: (profile: { 
    displayName?: string; 
    email?: string;
    avatarId?: string;
    avatarIcon?: string;
  }) => Promise<void>;
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
      const unsubscribe = onAuthStateChange((user) => {
        setState({
          user: user ? {
            ...user,
            // Firestoreのusernameフィールドを優先的に使用
            username: user.username || user.email || null,
            avatarId: user.avatarId,
            avatarIcon: user.avatarIcon,
          } : null,
          loading: false,
          error: null,
        });
      });

      return () => unsubscribe();
    } catch (error) {
      console.error('❌ AuthContext初期化エラー:', error);
      setState({
        user: null,
        loading: false,
        error: '認証初期化エラー',
      });
    }
  }, []);

  const login = async (email: string, password: string) => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChangeでloadingがfalseになるため、ここでは設定しない
    } catch (error: any) {
      setState(prev => ({ 
        ...prev, 
        error: error.message || 'ログインに失敗しました',
        loading: false, 
      }));
      throw error;
    }
  };

  const register = async (email: string, password: string) => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      await createUserWithEmailAndPassword(auth, email, password);
      // onAuthStateChangeでloadingがfalseになるため、ここでは設定しない
    } catch (error: any) {
      setState(prev => ({ 
        ...prev, 
        error: error.message || 'アカウント作成に失敗しました',
        loading: false, 
      }));
      throw error;
    }
  };

  const loginAnonymously = async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      await signInAnonymously(auth);
      // onAuthStateChangeでloadingがfalseになるため、ここでは設定しない
    } catch (error: any) {
      setState(prev => ({ 
        ...prev, 
        error: error.message || '匿名ログインに失敗しました',
        loading: false, 
      }));
      throw error;
    }
  };

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
    email?: string;
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
          email: profile.email || prev.user.email,
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

  return (
    <AuthContext.Provider
      value={{
    ...state,
    login,
    register,
    loginAnonymously,
    loginWithGoogle,
    loginWithApple,
        logout,
        updateUserProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}; 
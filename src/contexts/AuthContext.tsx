import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, AuthState } from '../types';
import { onAuthStateChange } from '../services/authService';

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  loginAnonymously: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null
  });

  useEffect(() => {
    console.log('Setting up auth listener...');
    
    const unsubscribe = onAuthStateChange((user) => {
      console.log('Auth state changed:', user ? `User: ${user.email || 'Anonymous'}` : 'No user');
      setState(prev => ({
        ...prev,
        user,
        loading: false
      }));
    });

    return () => {
      console.log('Cleaning up auth listener');
      unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const { loginWithEmail } = await import('../services/authService');
      await loginWithEmail(email, password);
      // 認証状態の変更はonAuthStateChangeで処理される
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: error instanceof Error ? error.message : 'Login failed' 
      }));
      throw error;
    }
  };

  const register = async (email: string, password: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const { registerWithEmail } = await import('../services/authService');
      await registerWithEmail(email, password);
      // 認証状態の変更はonAuthStateChangeで処理される
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: error instanceof Error ? error.message : 'Registration failed' 
      }));
      throw error;
    }
  };

  const loginAnonymously = async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const { loginAnonymously: loginAnon } = await import('../services/authService');
      await loginAnon();
      // 認証状態の変更はonAuthStateChangeで処理される
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: error instanceof Error ? error.message : 'Anonymous login failed' 
      }));
      throw error;
    }
  };

  const logout = async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const { logout: logoutUser } = await import('../services/authService');
      await logoutUser();
      // 認証状態の変更はonAuthStateChangeで処理される
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        loading: false, 
        error: error instanceof Error ? error.message : 'Logout failed' 
      }));
      throw error;
    }
  };

  const value: AuthContextType = {
    ...state,
    login,
    register,
    loginAnonymously,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 
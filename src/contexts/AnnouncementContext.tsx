import React, { createContext, useContext, useState, useEffect } from 'react';
import { announcementService } from '../services/announcementService';
import { useAuth } from './AuthContext';
import { UserPlan } from '../types';

interface AnnouncementWithReadStatus {
  id: string;
  isRead: boolean;
  title: string;
  content: string;
  type: string;
  priority: string;
  publishedAt?: Date;
  createdAt: Date;
  // 他の必要なプロパティを追加
}

interface AnnouncementContextType {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
  decrementUnreadCount: () => void;
  announcements: AnnouncementWithReadStatus[];
  setAnnouncements: (announcements: AnnouncementWithReadStatus[]) => void;
}

const AnnouncementContext = createContext<AnnouncementContextType | undefined>(undefined);

export const useAnnouncements = () => {
  const context = useContext(AnnouncementContext);
  if (!context) {
    throw new Error('useAnnouncements must be used within an AnnouncementProvider');
  }
  return context;
};

export const AnnouncementProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [announcements, setAnnouncements] = useState<AnnouncementWithReadStatus[]>([]);
  const { user } = useAuth();

  // Firebaseからリアルタイムで未読数を取得
  useEffect(() => {
    if (!user?.uid) return;

    // 実際のFirestoreプラン値を使用
    const actualPlan = user?.subscription?.plan === 'plus' ? 'plus' : 'free';

    const unsubscribe = announcementService.subscribeToAnnouncements(
      user.uid,
      actualPlan as UserPlan,
      user.createdAt,
      (data) => {
        // お知らせデータを設定
        setAnnouncements(data.announcements);
        
        // 'reminder'タイプのお知らせを除外して未読数を計算
        const filteredUnreadCount = data.announcements
          .filter(announcement => announcement.type !== 'reminder' && !announcement.isRead)
          .length;
        setUnreadCount(filteredUnreadCount);
      }
    );

    return unsubscribe;
  }, [user?.uid, user?.subscription?.plan, user?.createdAt]);

  const decrementUnreadCount = () => {
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  return (
    <AnnouncementContext.Provider
      value={{
        unreadCount,
        setUnreadCount,
        decrementUnreadCount,
        announcements,
        setAnnouncements
      }}
    >
      {children}
    </AnnouncementContext.Provider>
  );
};
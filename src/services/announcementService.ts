import {
  collection,
  doc,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../config/firebase';
import { Announcement, UserAnnouncementRead, UserPlan } from '../types';

const COLLECTIONS = {
  ANNOUNCEMENTS: 'announcements',
  USER_ANNOUNCEMENT_READS: 'userAnnouncementReads',
} as const;

// Cloud Functions
const sendAnnouncementNotificationFunction = httpsCallable(functions, 'sendAnnouncementNotification');

interface AnnouncementWithReadStatus extends Announcement {
  isRead: boolean;
}

interface AnnouncementsData {
  announcements: AnnouncementWithReadStatus[];
  unreadCount: number;
}

export const announcementService = {
  /**
   * ユーザーのお知らせ一覧を取得
   */
  async getAnnouncements(userId: string, userPlan?: UserPlan): Promise<AnnouncementsData> {
    try {
      console.log('📢 お知らせ取得開始:', { userId, userPlan });

      // 公開されているお知らせを取得
      const now = new Date();
      let announcementsQuery = query(
        collection(db, COLLECTIONS.ANNOUNCEMENTS),
        where('isActive', '==', true),
        where('publishedAt', '<=', Timestamp.fromDate(now)),
        orderBy('publishedAt', 'desc')
      );

      const announcementsSnapshot = await getDocs(announcementsQuery);
      const allAnnouncements = announcementsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        publishedAt: doc.data().publishedAt?.toDate(),
        expiresAt: doc.data().expiresAt?.toDate(),
      })) as Announcement[];

      // ユーザープランでフィルタリングし、日付でソート
      const filteredAnnouncements = allAnnouncements
        .filter(announcement => {
          // 対象プランが指定されていない場合は全ユーザーが対象
          if (!announcement.targetUserPlans || announcement.targetUserPlans.length === 0) {
            return true;
          }
          // ユーザープランが対象に含まれているかチェック
          return userPlan && announcement.targetUserPlans.includes(userPlan);
        })
        .sort((a, b) => {
          // 日付でソート（新しい順）
          const dateA = a.publishedAt || a.createdAt;
          const dateB = b.publishedAt || b.createdAt;
          return dateB.getTime() - dateA.getTime();
        });

      // 既読状態を取得
      const readQuery = query(
        collection(db, COLLECTIONS.USER_ANNOUNCEMENT_READS),
        where('userId', '==', userId)
      );
      const readSnapshot = await getDocs(readQuery);
      const readAnnouncementIds = new Set(
        readSnapshot.docs.map(doc => doc.data().announcementId)
      );

      // お知らせに既読状態を追加
      const announcementsWithReadStatus: AnnouncementWithReadStatus[] = filteredAnnouncements.map(announcement => ({
        ...announcement,
        isRead: readAnnouncementIds.has(announcement.id),
      }));

      const unreadCount = announcementsWithReadStatus.filter(a => !a.isRead).length;

      console.log('✅ お知らせ取得完了:', {
        total: announcementsWithReadStatus.length,
        unread: unreadCount,
      });

      return {
        announcements: announcementsWithReadStatus,
        unreadCount,
      };
    } catch (error) {
      console.error('❌ お知らせ取得エラー:', error);
      throw error;
    }
  },

  /**
   * お知らせを既読にする
   */
  async markAsRead(userId: string, announcementId: string): Promise<void> {
    try {
      console.log('📖 お知らせ既読処理:', { userId, announcementId });

      // 既読レコードが存在するかチェック
      const readQuery = query(
        collection(db, COLLECTIONS.USER_ANNOUNCEMENT_READS),
        where('userId', '==', userId),
        where('announcementId', '==', announcementId)
      );
      const readSnapshot = await getDocs(readQuery);

      if (readSnapshot.empty) {
        // 既読レコードを作成
        await addDoc(collection(db, COLLECTIONS.USER_ANNOUNCEMENT_READS), {
          userId,
          announcementId,
          readAt: serverTimestamp(),
        });
        console.log('✅ お知らせ既読完了');
      } else {
        console.log('ℹ️ 既に既読済み');
      }
    } catch (error) {
      console.error('❌ お知らせ既読エラー:', error);
      throw error;
    }
  },

  /**
   * 未読お知らせ数を取得
   */
  async getUnreadCount(userId: string, userPlan?: UserPlan): Promise<number> {
    try {
      const data = await this.getAnnouncements(userId, userPlan);
      return data.unreadCount;
    } catch (error) {
      console.error('❌ 未読お知らせ数取得エラー:', error);
      return 0;
    }
  },

  /**
   * お知らせのリアルタイム購読
   */
  subscribeToAnnouncements(
    userId: string,
    userPlan: UserPlan | undefined,
    callback: (data: AnnouncementsData) => void
  ): () => void {
    console.log('📡 お知らせリアルタイム購読開始:', { userId, userPlan });

    const now = new Date();
    const announcementsQuery = query(
      collection(db, COLLECTIONS.ANNOUNCEMENTS),
      where('isActive', '==', true),
      where('publishedAt', '<=', Timestamp.fromDate(now)),
      orderBy('publishedAt', 'desc')
    );

    return onSnapshot(announcementsQuery, async (snapshot) => {
      try {
        console.log('📢 お知らせ更新受信:', { count: snapshot.docs.length });
        
        // 変更があった場合のみデータを再取得
        const data = await this.getAnnouncements(userId, userPlan);
        callback(data);
      } catch (error) {
        console.error('❌ お知らせリアルタイム更新エラー:', error);
      }
    });
  },

  /**
   * 管理者用: お知らせを送信
   */
  async sendAnnouncement(announcement: Omit<Announcement, 'id' | 'createdAt'>): Promise<string> {
    try {
      console.log('📤 お知らせ送信開始:', announcement);

      const docRef = await addDoc(collection(db, COLLECTIONS.ANNOUNCEMENTS), {
        ...announcement,
        createdAt: serverTimestamp(),
        publishedAt: announcement.publishedAt ? Timestamp.fromDate(announcement.publishedAt) : serverTimestamp(),
        expiresAt: announcement.expiresAt ? Timestamp.fromDate(announcement.expiresAt) : null,
      });

      console.log('✅ お知らせ作成完了:', docRef.id);

      // プッシュ通知を送信（高優先度のみ）
      if (announcement.priority === 'high') {
        try {
          await sendAnnouncementNotificationFunction({
            announcementId: docRef.id,
            title: announcement.title,
            content: announcement.content,
            targetUserPlans: announcement.targetUserPlans || [],
          });
          console.log('📱 プッシュ通知送信完了');
        } catch (notificationError) {
          console.error('❌ プッシュ通知送信エラー:', notificationError);
          // 通知エラーはお知らせ作成の成功を妨げない
        }
      }

      return docRef.id;
    } catch (error) {
      console.error('❌ お知らせ送信エラー:', error);
      throw error;
    }
  },

  /**
   * 管理者用: お知らせを更新
   */
  async updateAnnouncement(announcementId: string, updates: Partial<Announcement>): Promise<void> {
    try {
      console.log('📝 お知らせ更新:', { announcementId, updates });

      const updateData: any = { ...updates };
      
      if (updates.publishedAt) {
        updateData.publishedAt = Timestamp.fromDate(updates.publishedAt);
      }
      if (updates.expiresAt) {
        updateData.expiresAt = Timestamp.fromDate(updates.expiresAt);
      }

      await updateDoc(doc(db, COLLECTIONS.ANNOUNCEMENTS, announcementId), updateData);
      console.log('✅ お知らせ更新完了');
    } catch (error) {
      console.error('❌ お知らせ更新エラー:', error);
      throw error;
    }
  },
};
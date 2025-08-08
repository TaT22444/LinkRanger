/**
 * プッシュ通知サービス
 * リンクの未アクセス通知を管理
 */

import { Platform, Alert } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Link } from '../types';
import { linkService } from './firestoreService';

// expo-notificationsの安全なimport（Development build対応）
let Notifications: any = null;
try {
  Notifications = require('expo-notifications');
} catch (error) {
  console.log('⚠️ Development build: expo-notifications module not available');
}

// expo-notifications の型定義（フォールバック）
interface NotificationPermissionStatus {
  status: 'granted' | 'denied' | 'undetermined';
  granted: boolean;
  canAskAgain: boolean;
}

// 通知機能が利用可能かチェック
const isNotificationAvailable = () => {
  try {
    // Development buildでネイティブモジュールが利用可能かチェック
    return typeof Notifications !== 'undefined' && 
           Notifications !== null &&
           typeof Notifications.getExpoPushTokenAsync === 'function';
  } catch {
    console.log('⚠️ Development build: expo-notifications無効化');
    return false;
  }
};

// 通知設定
const setupNotificationHandler = () => {
  if (isNotificationAvailable()) {
    // 通知表示方法の設定
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    console.log('📱 通知ハンドラーを設定');
  } else {
    console.log('⚠️ 通知機能は現在利用できません');
  }
};

class NotificationService {
  private static instance: NotificationService;
  private pushToken: string | null = null;

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * 通知権限をリクエスト
   */
  async requestPermissions(): Promise<NotificationPermissionStatus> {
    try {
      if (!isNotificationAvailable()) {
        console.log('⚠️ 通知機能は利用できません（expo-notificationsが未インストール）');
        return {
          status: 'denied',
          granted: false,
          canAskAgain: false,
        };
      }

      const { status } = await Notifications.requestPermissionsAsync();
      console.log('📱 通知権限リクエスト結果:', status);
      
      return {
        status: status as 'granted' | 'denied' | 'undetermined',
        granted: status === 'granted',
        canAskAgain: status !== 'denied',
      };
    } catch (error) {
      console.error('❌ 通知権限リクエストエラー:', error);
      return {
        status: 'denied',
        granted: false,
        canAskAgain: false,
      };
    }
  }

  /**
   * プッシュトークンを取得
   */
  async registerForPushNotifications(): Promise<string | null> {
    try {
      if (!isNotificationAvailable()) {
        console.log('⚠️ 通知機能は利用できません');
        return null;
      }

      // 通知権限をリクエスト
      const permissions = await this.requestPermissions();
      if (!permissions.granted) {
        console.log('⚠️ 通知権限が許可されていません');
        return null;
      }

      // プッシュトークンを取得
      const token = await Notifications.getExpoPushTokenAsync({
        projectId: '44836b1a-e184-475c-b67f-08f7fd1d68e1', // app.jsonのprojectIdと同じ
      });
      
      this.pushToken = token.data;
      console.log('📱 プッシュトークン取得完了');
      
      return token.data;
    } catch (error) {
      console.error('❌ プッシュトークン取得エラー:', error);
      return null;
    }
  }

  /**
   * リンク未アクセス通知をスケジュール
   */
  async scheduleUnusedLinkNotification(link: Link): Promise<string | null> {
    try {
      if (!isNotificationAvailable()) {
        console.log('⚠️ 通知機能は利用できません - スケジュールをスキップ');
        return null;
      }

      // 3日後の通知予定時刻を計算
      const notificationDate = new Date();
      notificationDate.setDate(notificationDate.getDate() + 3);
      notificationDate.setHours(10, 0, 0, 0);

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: '📖 未読のリンクがあります',
          body: `「${link.title}」を確認してみませんか？`,
          data: {
            type: 'unused_link_reminder',
            linkId: link.id,
            linkUrl: link.url,
            linkTitle: link.title,
          },
          sound: true,
        },
        trigger: {
          date: notificationDate,
        },
      });

      console.log('📅 リンク通知スケジュール完了:', {
        linkId: link.id,
        linkTitle: link.title.slice(0, 30) + '...',
        scheduledFor: notificationDate.toLocaleString(),
        notificationId,
      });

      return notificationId;
    } catch (error) {
      console.error('❌ 通知スケジュールエラー:', error);
      return null;
    }
  }

  /**
   * 通知をキャンセル
   */
  async cancelNotificationForLink(linkId: string): Promise<void> {
    try {
      if (!isNotificationAvailable()) {
        console.log('⚠️ 通知機能は利用できません - キャンセルをスキップ');
        return;
      }

      // スケジュール済み通知からlinkIdに関連するものを検索してキャンセル
      const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
      const targetNotifications = scheduledNotifications.filter(
        (notification) => notification.content.data?.linkId === linkId
      );

      for (const notification of targetNotifications) {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
        console.log('🗑️ 通知キャンセル完了:', {
          linkId,
          notificationId: notification.identifier,
        });
      }
    } catch (error) {
      console.error('❌ 通知キャンセルエラー:', error);
    }
  }

  /**
   * リンクアクセス時の処理（通知キャンセル + 最終アクセス時間更新）
   */
  async handleLinkAccess(link: Link): Promise<void> {
    try {
      // 1. 通知をキャンセル
      await this.cancelNotificationForLink(link.id);

      // 2. 最終アクセス時間を更新
      const now = new Date();
      await updateDoc(doc(db, 'links', link.id), {
        lastAccessedAt: now,
        isRead: true,
        updatedAt: now,
      });

      // 3. 新しい通知を3日後にスケジュール
      const updatedLink = { ...link, lastAccessedAt: now, isRead: true };
      await this.scheduleUnusedLinkNotification(updatedLink);

      console.log('✅ リンクアクセス処理完了:', {
        linkId: link.id,
        linkTitle: link.title.slice(0, 30) + '...',
        accessedAt: now.toLocaleString(),
        notificationStatus: isNotificationAvailable() ? 'アクティブ' : '通知機能無効化'
      });
    } catch (error) {
      console.error('❌ リンクアクセス処理エラー:', error);
    }
  }

  /**
   * アプリ起動時の初期化処理
   */
  async initializeNotifications(): Promise<void> {
    try {
      // プッシュトークンを登録
      await this.registerForPushNotifications();

      // 通知リスナーを設定
      this.setupNotificationListeners();

      console.log('✅ 通知サービス初期化完了');
    } catch (error) {
      console.error('❌ 通知サービス初期化エラー:', error);
    }
  }

  /**
   * 通知リスナーの設定
   */
  private setupNotificationListeners(): void {
    if (!isNotificationAvailable()) {
      console.log('⚠️ 通知機能が利用できないため、リスナー設定をスキップ');
      return;
    }

    // 通知受信時の処理
    Notifications.addNotificationReceivedListener((notification) => {
      console.log('📨 通知受信:', notification);
    });

    // 通知タップ時の処理
    Notifications.addNotificationResponseReceivedListener((response) => {
      console.log('👆 通知タップ:', response);
      const data = response.notification.request.content.data as any;
      
      if (data?.type === 'unused_link_reminder' && data?.linkUrl) {
        // リンクを開く処理をここに実装
        // navigation.navigate() や Linking.openURL() などを使用
        console.log('🔗 未使用リンク通知タップ:', data.linkUrl);
      }
    });

    // 通知ハンドラーの設定
    setupNotificationHandler();
  }

  /**
   * デバッグ用：すべてのスケジュール済み通知を取得
   */
  async getScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
    try {
      if (!isNotificationAvailable()) {
        console.log('⚠️ 通知機能は利用できません');
        return [];
      }
      return await Notifications.getAllScheduledNotificationsAsync();
    } catch (error) {
      console.error('❌ スケジュール済み通知取得エラー:', error);
      return [];
    }
  }

  /**
   * デバッグ用：すべての通知をクリア
   */
  async clearAllNotifications(): Promise<void> {
    try {
      if (!isNotificationAvailable()) {
        console.log('⚠️ 通知機能は利用できません');
        return;
      }
      await Notifications.cancelAllScheduledNotificationsAsync();
      console.log('🗑️ すべての通知をクリアしました');
    } catch (error) {
      console.error('❌ 通知クリアエラー:', error);
    }
  }
}

export const notificationService = NotificationService.getInstance();
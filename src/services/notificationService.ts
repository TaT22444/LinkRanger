/**
 * プッシュ通知サービス
 * リンクの未アクセス通知を管理
 */

import { Link } from '../types';

// expo-notificationsの安全なimport（モジュール未対応環境対応）
let Notifications: any = null;

try {
  Notifications = require('expo-notifications');
} catch (error) {
  // expo-notifications module not available
}

// expo-notifications の型定義（フォールバック）
interface NotificationPermissionStatus {
  granted: boolean;
  status: string;
}

// 通知機能が利用可能かチェック
const isNotificationAvailable = () => {
  try {
    return typeof Notifications !== 'undefined' &&
           Notifications !== null &&
           typeof Notifications.scheduleNotificationAsync === 'function';
  } catch {
    // expo-notifications無効化（モジュール未対応）
    return false;
  }
};

// 通知設定
const setupNotificationHandler = () => {
  if (isNotificationAvailable()) {
    // 通知表示方法の設定
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: false,   // 通知を表示する
        shouldPlaySound: false,   // 音を鳴らす
        shouldSetBadge: false,   // バッジは設定しない
      }),
    });
  }
};

class NotificationService {
  private static instance: NotificationService;
  private onNotificationTapCallback?: (linkId: string) => void;
  private notificationListener?: any;
  private responseListener?: any;

  private constructor() {}

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * 通知タップ時のコールバックを設定
   */
  setNotificationTapCallback(callback: (linkId: string) => void): void {
    this.onNotificationTapCallback = callback;

  }

  /**
   * 通知権限をリクエスト
   */
  async requestPermissions(): Promise<NotificationPermissionStatus> {
    try {
      if (!isNotificationAvailable()) {

        return {
          granted: false,
          status: 'unavailable'
        };
      }

      const { status } = await Notifications.requestPermissionsAsync();
      
      return {
        granted: status === 'granted',
        status
      };
    } catch (error) {
      console.error('❌ 通知権限リクエストエラー:', error);
      return {
        granted: false,
        status: 'error'
      };
    }
  }

  /**
   * リンク作成時に3日間後の通知をスケジュール
   */
  async schedule3DayReminder(link: Link): Promise<string | null> {
    try {
      if (!isNotificationAvailable()) {

        return null;
      }

            // 3日間後の正確な時刻を計算
      const now = new Date();
      const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      
      // 3日後の日時が過去の場合は通知しない（データ整合性エラー）
      if (threeDaysLater <= now) {

        return null;
      }



      const trigger = { date: threeDaysLater };


      // 通知をスケジュール
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: '📖 未読リンクのリマインダー',
          body: `「${link.title}」を3日前に保存しました。まだ読んでいませんか？`,
          data: {
            type: '3day_reminder',
            linkId: link.id,
            linkUrl: link.url,
            linkTitle: link.title,
            scheduledFor: threeDaysLater.toISOString(),
          },
          sound: true,
        },
        trigger: {
          date: threeDaysLater,  // 日時指定でスケジュール
        },
      });



      return notificationId;


    } catch (error) {
      console.error('❌ 3日間リマインダー設定エラー:', error);
      return null;
    }
  }

  /**
   * 通知をキャンセル
   */
  async cancelNotificationForLink(linkId: string): Promise<void> {
    try {
      if (!isNotificationAvailable()) {

        return;
      }

      // スケジュール済み通知からlinkIdに関連するものを検索してキャンセル
      const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
      const targetNotifications = scheduledNotifications.filter(
        (notification: any) => notification.content.data?.linkId === linkId
      );

      for (const notification of targetNotifications) {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);

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

      // 2. 最終アクセス時間を更新（Firestore更新は呼び出し元で実行）

      // 3. リンクアクセス時は即座の新しい通知スケジュールは行わない
      // バックグラウンドタスクが3日後にチェックして通知する
      // await this.scheduleUnusedLinkNotification(updatedLink);
    } catch (error) {
      console.error('❌ リンクアクセス処理エラー:', error);
    }
  }

  /**
   * 全通知をクリア（デバッグ用）
   */
  async clearAllNotifications(): Promise<void> {
    try {
      if (!isNotificationAvailable()) {

        return;
      }

      await Notifications.cancelAllScheduledNotificationsAsync();

    } catch (error) {
      console.error('❌ 通知クリアエラー:', error);
    }
  }

  /**
   * スケジュール済み通知を表示（デバッグ用）
   */
  async debugScheduledNotifications(): Promise<void> {
    try {
      if (!isNotificationAvailable()) {
        return;
      }

      const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
      

      
      const now = new Date();
      
      scheduledNotifications.forEach((notification: any, index: number) => {
        const trigger = notification.trigger;
        const data = notification.content?.data;
        const scheduledDate = trigger?.date ? new Date(trigger.date) : null;
        

      });
      

      
    } catch (error) {
      console.error('❌ 通知デバッグエラー:', error);
    }
  }

  /**
   * テスト通知を送信（デバッグ用）
   */
  async sendTestNotification(): Promise<void> {
    try {
      if (!isNotificationAvailable()) {
        return;
      }

      // 即座通知を送信（テスト用）
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: '🗺️ テスト通知',
          body: '通知システムが正常に動作しています。',
          data: {
            type: 'test',
            timestamp: new Date().toISOString()
          },
          sound: true,
        },
        trigger: null, // 即座送信
      });


    } catch (error) {
      console.error('❌ テスト通知エラー:', error);
    }
  }

  /**
   * 通知サービスを初期化
   */
  async initializeNotifications(): Promise<void> {
    try {
      // 通知権限をリクエスト
      await this.requestPermissions();
      
      // 通知リスナーを設定
      this.setupNotificationListeners();
      

    } catch (error) {
      console.error('❌ 通知サービス初期化エラー:', error);
    }
  }

  /**
   * 通知サービスをクリーンアップ
   */
  cleanup(): void {
    try {
      if (this.notificationListener) {
        this.notificationListener.remove();
        this.notificationListener = undefined;
      }
      if (this.responseListener) {
        this.responseListener.remove();
        this.responseListener = undefined;
      }

    } catch (error) {
      console.error('❌ 通知サービスクリーンアップエラー:', error);
    }
  }

  /**
   * 通知リスナーの設定
   */
  private setupNotificationListeners(): void {
    if (!isNotificationAvailable()) {
      return;
    }

    // 既存のリスナーをクリーンアップ
    this.cleanup();

    // 通知ハンドラーを設定
    setupNotificationHandler();

    // 1. アプリが起動中に通知をタップした場合のリスナー
    this.responseListener = Notifications.addNotificationResponseReceivedListener((response: any) => {

      const notificationData = response?.notification?.request?.content?.data;
      if (notificationData?.linkId && this.onNotificationTapCallback) {

        this.onNotificationTapCallback(notificationData.linkId);
      } else {

      }
    });

    // 2. アプリが終了している状態から通知タップで起動した場合の処理
    Notifications.getLastNotificationResponseAsync().then((response: any) => {
      if (response) {

        const notificationData = response?.notification?.request?.content?.data;
        if (notificationData?.linkId && this.onNotificationTapCallback) {

          setTimeout(() => {
            if (this.onNotificationTapCallback) {
              this.onNotificationTapCallback(notificationData.linkId);
            }
          }, 500);
        }
      }
    });

    // 通知受信時のリスナー (デバッグ用)
    this.notificationListener = Notifications.addNotificationReceivedListener((notification: any) => {

    });


  }
}

export const notificationService = NotificationService.getInstance();

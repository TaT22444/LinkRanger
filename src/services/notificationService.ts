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
  console.log('⚠️ expo-notifications module not available');
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
    console.log('⚠️ expo-notifications無効化（モジュール未対応）');
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
    console.log('📱 通知ハンドラーを設定');
  } else {
    console.log('⚠️ 通知機能は現在利用できません');
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
    console.log('📱 通知タップコールバック設定完了');
  }

  /**
   * 通知権限をリクエスト
   */
  async requestPermissions(): Promise<NotificationPermissionStatus> {
    try {
      if (!isNotificationAvailable()) {
        console.log('⚠️ 通知機能は利用できません（expo-notificationsが未インストール）');
        return {
          granted: false,
          status: 'unavailable'
        };
      }

      const { status } = await Notifications.requestPermissionsAsync();
      console.log('📱 通知権限リクエスト結果:', status);
      
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
        console.log('⚠️ 通知機能は利用できません - 3日間リマインダーをスキップ');
        return null;
      }

            // 3日間後の正確な時刻を計算
      const now = new Date();
      const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      
      // 3日後の日時が過去の場合は通知しない（データ整合性エラー）
      if (threeDaysLater <= now) {
        console.log('🚫 3日後の日時が過去のため通知をスキップ');
        return null;
      }

      console.log('📅 3日間リマインダーをスケジュール:', {
        linkId: link.id,
        title: link.title.slice(0, 30) + '...',
        scheduledFor: threeDaysLater.toISOString(),
        willScheduleIn: Math.floor((threeDaysLater.getTime() - now.getTime()) / (1000 * 60 * 60)) + ' hours'
      });

      const trigger = { date: threeDaysLater };
      console.log('🐛 DEBUG: Trigger object to be scheduled:', trigger);

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

      console.log('✅ 3日間リマインダースケジュール完了:', {
        linkId: link.id,
        notificationId,
        scheduledFor: threeDaysLater.toISOString()
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
        console.log('⚠️ 通知機能は利用できません - キャンセルをスキップ');
        return;
      }

      // スケジュール済み通知からlinkIdに関連するものを検索してキャンセル
      const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
      const targetNotifications = scheduledNotifications.filter(
        (notification: any) => notification.content.data?.linkId === linkId
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
      console.log('🔗 リンクアクセス処理開始:', {
        linkId: link.id,
        linkTitle: link.title.slice(0, 30) + '...',
        notificationStatus: isNotificationAvailable() ? 'アクティブ' : '通知機能無効化'
      });

      // 1. 通知をキャンセル
      await this.cancelNotificationForLink(link.id);

      // 2. 最終アクセス時間を更新（Firestore更新は呼び出し元で実行）
      console.log('✅ リンクアクセス処理完了:', {
        linkId: link.id,
        notificationCancelled: true,
        lastAccessedAt: new Date().toISOString()
      });

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
        console.log('⚠️ 通知機能は利用できません - クリアをスキップ');
        return;
      }

      await Notifications.cancelAllScheduledNotificationsAsync();
      console.log('🗑️ 全てのスケジュール済み通知をクリアしました');
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
        console.log('⚠️ 通知機能は利用できません');
        return;
      }

      const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
      
      console.log('📅 スケジュール済み通知一覧:', {
        totalCount: scheduledNotifications.length
      });
      
      const now = new Date();
      
      scheduledNotifications.forEach((notification: any, index: number) => {
        const trigger = notification.trigger;
        const data = notification.content?.data;
        const scheduledDate = trigger?.date ? new Date(trigger.date) : null;
        
        console.log(`🔔 [通知 ${index + 1}]:`, {
          id: notification.identifier,
          title: notification.content?.title,
          linkId: data?.linkId,
          type: data?.type,
          scheduledFor: scheduledDate?.toISOString(),
          hoursFromNow: scheduledDate ? Math.floor((scheduledDate.getTime() - now.getTime()) / (1000 * 60 * 60)) : null,
          daysFromNow: scheduledDate ? Math.floor((scheduledDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null
        });
      });
      
      if (scheduledNotifications.length === 0) {
        console.log('🚫 スケジュール済み通知はありません');
      }
      
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
        console.log('⚠️ 通知機能は利用できません');
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

      console.log('📨 テスト通知送信完了:', { notificationId });
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
      
      console.log('✅ 通知サービス初期化完了');
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
      console.log('🗑️ 通知サービスクリーンアップ完了');
    } catch (error) {
      console.error('❌ 通知サービスクリーンアップエラー:', error);
    }
  }

  /**
   * 通知リスナーの設定
   */
  private setupNotificationListeners(): void {
    if (!isNotificationAvailable()) {
      console.log('⚠️ 通知機能は利用できません - リスナー設定をスキップ');
      return;
    }

    // 既存のリスナーをクリーンアップ
    this.cleanup();

    // 通知ハンドラーを設定
    setupNotificationHandler();

    // 通知受信時のリスナー
    this.notificationListener = Notifications.addNotificationReceivedListener((notification: any) => {
      console.log('📱 通知受信:', notification);
    });

    // 通知タップ時のリスナー
    this.responseListener = Notifications.addNotificationResponseReceivedListener((response: any) => {
      console.log('👆 通知タップ:', response);
      
      // 通知データからlinkIdを取得
      const notificationData = response?.notification?.request?.content?.data;
      if (notificationData?.linkId && this.onNotificationTapCallback) {
        console.log('🔗 通知タップ - リンクID検出:', notificationData.linkId);
        this.onNotificationTapCallback(notificationData.linkId);
      } else {
        console.log('⚠️ 通知タップ - リンクIDが見つからないか、コールバックが設定されていません');
      }
    });

    console.log('�� 通知リスナー設定完了');
  }
}

export const notificationService = NotificationService.getInstance();
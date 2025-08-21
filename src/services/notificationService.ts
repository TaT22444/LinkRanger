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

      // 🔍 Development環境での動作確認用ログ
      console.log('📅 schedule3DayReminder: 開始', {
        linkId: link.id,
        title: link.title.slice(0, 30) + '...',
        isDevelopment: __DEV__,
        environment: __DEV__ ? 'Development' : 'Production/TestFlight'
      });

      // 🔍 デバッグログ: createdAtの詳細確認
      console.log('🔍 schedule3DayReminder: デバッグ開始', {
        linkId: link.id,
        createdAt: link.createdAt,
        createdAtType: typeof link.createdAt,
        createdAtConstructor: link.createdAt.constructor.name,
        createdAtString: link.createdAt.toString(),
        createdAtISO: link.createdAt.toISOString(),
        currentTime: new Date().toISOString()
      });

      // 3日間後の正確な時刻を計算
      const threeDaysLater = new Date(link.createdAt.getTime() + 3 * 24 * 60 * 60 * 1000);
      
      // 🔍 詳細な計算ログ
      console.log('🔍 schedule3DayReminder: 日時計算', {
        createdAtTime: link.createdAt.getTime(),
        threeDaysInMs: 3 * 24 * 60 * 60 * 1000,
        threeDaysLater: threeDaysLater.toISOString(),
        currentTime: new Date().toISOString(),
        isPastDate: threeDaysLater <= new Date()
      });
      
      // 3日後の日時が過去の場合は通知しない（データ整合性エラー）
      if (threeDaysLater <= new Date()) {

        return null;
      }
      
      const notificationDate = threeDaysLater;

      // 🔍 実際の通知スケジュール前の最終確認
      console.log('🔍 schedule3DayReminder: 通知スケジュール実行前', {
        linkId: link.id,
        notificationDate: notificationDate.toISOString(),
        trigger: { date: notificationDate },
        willScheduleIn: (notificationDate.getTime() - new Date().getTime()) / 1000 / 60 + ' minutes'
      });

      // 🔧 修正: secondsベースのtriggerに変更（expo-notificationsの既知問題対応）
      const secondsFromNow = Math.floor((notificationDate.getTime() - new Date().getTime()) / 1000);
      
      console.log('🔧 schedule3DayReminder: trigger修正', {
        notificationDate: notificationDate.toISOString(),
        secondsFromNow,
        minutesFromNow: secondsFromNow / 60,
        hoursFromNow: secondsFromNow / 3600
      });

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: '📖 未読のリンクがあります',
          body: `「${link.title}」を3日間確認していません。確認してみませんか？`,
          data: {
            type: 'unused_link_3day_reminder',
            linkId: link.id,
            linkUrl: link.url,
            linkTitle: link.title,
            scheduledFor: threeDaysLater.toISOString(),
          },
          sound: true,
        },
        trigger: {
          seconds: secondsFromNow,
        },
      });

      // 🔍 スケジュール完了後の検証ログ
      const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
      const ourNotification = scheduledNotifications.find((n: any) => n.identifier === notificationId);
      
      console.log('📅 3日間リマインダー設定完了:', {
        linkId: link.id,
        linkTitle: link.title.slice(0, 30) + '...',
        createdAt: link.createdAt.toLocaleString(),
        scheduledFor: notificationDate.toLocaleString(),
        notificationId,
        actuallyScheduled: !!ourNotification,
        scheduledTime: ourNotification?.trigger?.dateComponents || ourNotification?.trigger,
        totalScheduledNotifications: scheduledNotifications.length
      });

      return notificationId;
    } catch (error) {
      console.error('❌ 3日間リマインダー設定エラー:', error);
      return null;
    }
  }

  /**
   * リンク未アクセス通知を即座スケジュール（主にCloud Functionsからの呼び出し用）
   */
  async scheduleUnusedLinkNotification(link: Link): Promise<string | null> {
    try {
      if (!isNotificationAvailable()) {
        console.log('⚠️ 通知機能は利用できません - スケジュールをスキップ');
        return null;
      }

      // 🔒 厳格な安全チェック: 作成から最低3日経過していないリンクは絶対に通知しない
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      
      console.log('🔍 scheduleUnusedLinkNotification: 時間チェック', {
        linkId: link.id,
        linkTitle: link.title.slice(0, 30) + '...',
        createdAt: link.createdAt.toISOString(),
        threeDaysAgo: threeDaysAgo.toISOString(),
        currentTime: now.toISOString(),
        isOldEnough: link.createdAt <= threeDaysAgo,
        ageInHours: Math.floor((now.getTime() - link.createdAt.getTime()) / (1000 * 60 * 60))
      });
      
      if (link.createdAt > threeDaysAgo) {
        console.log('🚫 scheduleUnusedLinkNotification: リンクが新しすぎるためスキップ', {
          linkId: link.id,
          ageInHours: Math.floor((now.getTime() - link.createdAt.getTime()) / (1000 * 60 * 60)),
          requiredHours: 72
        });
        return null;
      }

      // 3日間経過後の未読チェック時に即座通知を送信
      const notificationDate = new Date();
      notificationDate.setSeconds(notificationDate.getSeconds() + 5); // 5秒後に即座通知（即座性を保つ）

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
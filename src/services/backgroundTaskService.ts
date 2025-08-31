/**
 * バックグラウンドタスクサービス
 * 3日間未読リンクの通知チェック機能
 */

// モジュール未対応環境の安全なimport
let BackgroundFetch: any = null;
let TaskManager: any = null;

try {
  BackgroundFetch = require('expo-background-fetch');
  TaskManager = require('expo-task-manager');
} catch (error) {
  // BackgroundFetch/TaskManager modules not available
}
import { Platform } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
import { notificationService } from './notificationService';

/**
 * 3日間未読リンクの通知処理を実行する共通関数
 * 🔥 FCM一元化: ローカル通知を削除、FCMのみで処理
 */
const processUnusedLinksNotifications = async (unusedLinks: Array<{
  id: string;
  title: string;
  url: string;
  userId: string;
  lastAccessedAt?: Date;
  createdAt: Date;
}>) => {
  // 🔥 FCM一元化: ローカル通知を送信せず、Cloud SchedulerのFCMに任せる
  // バックグラウンドタスクではローカル通知を送信せず、
  // Cloud Schedulerが定期的に全ユーザーをチェックしてFCM通知を送信
};

// バックグラウンドタスクの定義
const UNUSED_LINKS_CHECK_TASK = 'unused-links-check-task';

// Cloud Functions
const checkUnusedLinksFunction = httpsCallable(functions, 'checkUnusedLinks');

// バックグラウンドタスクが利用可能かチェック
const isBackgroundTaskAvailable = () => {
  try {
    return BackgroundFetch !== null &&
           TaskManager !== null &&
           typeof BackgroundFetch.registerTaskAsync === 'function' &&
           typeof TaskManager.defineTask === 'function' &&
           Platform.OS === 'ios'; // iOSのみサポート（TestFlight/App Store）
  } catch {

    return false;
  }
};

// バックグラウンドタスクの定義（利用可能な場合のみ）
if (isBackgroundTaskAvailable()) {
  TaskManager.defineTask(UNUSED_LINKS_CHECK_TASK, async () => {
    try {

      
      // Cloud Functionsで3日間未読リンクをチェック
      const result = await checkUnusedLinksFunction();
      const data = result.data as { 
        unusedLinks: Array<{
          id: string;
          title: string;
          url: string;
          userId: string;
          lastAccessedAt?: Date;
          createdAt: Date;
        }>;
        notificationsSent: number;
      };
      


      // 共通関数を使用して通知処理を実行
      await processUnusedLinksNotifications(data.unusedLinks);

      return (BackgroundFetch as any).BackgroundFetchResult.NewData;
    } catch (error) {
      console.error('❌ バックグラウンドタスクエラー:', error);
      return (BackgroundFetch as any).BackgroundFetchResult.Failed;
    }
  });
}

class BackgroundTaskService {
  private static instance: BackgroundTaskService;
  private isRegistered: boolean = false;

  static getInstance(): BackgroundTaskService {
    if (!BackgroundTaskService.instance) {
      BackgroundTaskService.instance = new BackgroundTaskService();
    }
    return BackgroundTaskService.instance;
  }

  /**
   * バックグラウンドタスクを登録
   */
  async registerBackgroundTasks(): Promise<void> {
    try {
      if (!isBackgroundTaskAvailable()) {
        return;
      }

      if (this.isRegistered) {
        return;
      }

      // 🔒 開発環境での即座実行を防止
      if (__DEV__) {
        return;
      }

      // バックグラウンドフェッチを登録
      const status = await BackgroundFetch.registerTaskAsync(UNUSED_LINKS_CHECK_TASK, {
        minimumInterval: 24 * 60 * 60 * 1000, // 24時間ごと（より正確な3日間チェック）
        stopOnTerminate: false,
        startOnBoot: true,
      });



      this.isRegistered = true;
    } catch (error) {
      console.error('❌ バックグラウンドタスク登録エラー:', error);
    }
  }

  /**
   * バックグラウンドタスクの登録解除
   */
  async unregisterBackgroundTasks(): Promise<void> {
    try {
      if (!isBackgroundTaskAvailable()) {

        return;
      }

      await BackgroundFetch.unregisterTaskAsync(UNUSED_LINKS_CHECK_TASK);
      this.isRegistered = false;
      

    } catch (error) {
      console.error('❌ バックグラウンドタスク登録解除エラー:', error);
    }
  }

  /**
   * バックグラウンドタスクの状態を取得
   */
  async getBackgroundTaskStatus(): Promise<{
    isRegistered: boolean;
    isAvailable: boolean;
    status?: any;
  }> {
    try {
      if (!isBackgroundTaskAvailable()) {
        return {
          isRegistered: false,
          isAvailable: false
        };
      }

      const status = await BackgroundFetch.getStatusAsync();
      const isTaskRegistered = await TaskManager.isTaskRegisteredAsync(UNUSED_LINKS_CHECK_TASK);

      return {
        isRegistered: isTaskRegistered,
        isAvailable: true,
        status
      };
    } catch (error) {
      console.error('❌ バックグラウンドタスク状態取得エラー:', error);
      return {
        isRegistered: false,
        isAvailable: false
      };
    }
  }

  /**
   * 手動で3日間未読リンクをチェック（デバッグ用）
   */
  async checkUnusedLinksManually(): Promise<void> {
    try {

      
      // 🔒 安全な手動テストのための確認
      if (!__DEV__) {
        console.warn('⚠️ 手動チェックは開発モードでのみ実行してください');
        return;
      }
      

      
      // 手動チェックで3日間未読リンクをチェック
      // 認証されたユーザーIDはCloud Functions側で自動取得されます
      const result = await checkUnusedLinksFunction();
      const data = result.data as { 
        unusedLinks: Array<{
          id: string;
          title: string;
          url: string;
          userId: string;
          lastAccessedAt?: Date;
          createdAt: Date;
        }>;
        notificationsSent: number;
      };
      


      // 🔒 開発モードでの通知テスト用の安全なフィルタリング
      const testSafeLinks = data.unusedLinks.filter(link => {
        const createdAt = new Date(link.createdAt);
        const now = new Date();
        const ageInHours = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
        return ageInHours >= 72; // 3日間（72時間）以上のリンクのみ
      });
      


      // 共通関数を使用して通知処理を実行（安全なリンクのみ）
      await processUnusedLinksNotifications(testSafeLinks);
      

    } catch (error) {
      console.error('❌ 手動チェックエラー:', error);
    }
  }

  // データ移行関数を呼び出す
  async migrateNotificationStructure(): Promise<void> {
    try {

      const migrateFunction = httpsCallable(functions, 'migrateNotificationStructure');
      const result = await migrateFunction();

    } catch (error) {
      console.error('❌ 通知構造の移行に失敗しました:', error);
      throw error;
    }
  }
}

export const backgroundTaskService = BackgroundTaskService.getInstance();
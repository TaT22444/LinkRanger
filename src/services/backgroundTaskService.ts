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
  console.log('⚠️ BackgroundFetch/TaskManager modules not available');
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
  console.log('📱 processUnusedLinksNotifications開始 (FCM一元化):', { count: unusedLinks.length });
  
  // 🔥 FCM一元化: ローカル通知を送信せず、Cloud SchedulerのFCMに任せる
  console.log('🌩️ バックグラウンドタスク: FCMはサーバーサイドで処理', {
    unusedLinksCount: unusedLinks.length,
    notificationSystem: 'Cloud Scheduler + FCM',
    schedule: '6時間ごと'
  });
  
  // バックグラウンドタスクではローカル通知を送信せず、
  // Cloud Schedulerが定期的に全ユーザーをチェックしてFCM通知を送信
  
  console.log('✅ processUnusedLinksNotifications完了 (FCM一元化)');
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
    console.log('⚠️ BackgroundFetch/TaskManager利用不可（モジュール未対応）');
    return false;
  }
};

// バックグラウンドタスクの定義（利用可能な場合のみ）
if (isBackgroundTaskAvailable()) {
  TaskManager.defineTask(UNUSED_LINKS_CHECK_TASK, async () => {
    try {
      console.log('🔍 バックグラウンドタスク開始: 3日間未読リンクチェック');
      
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
      
      console.log('📊 3日間未読リンクチェック結果:', {
        unusedLinksCount: data.unusedLinks.length,
        notificationsSent: data.notificationsSent
      });

      // 共通関数を使用して通知処理を実行
      await processUnusedLinksNotifications(data.unusedLinks);

      return (BackgroundFetch as any).BackgroundFetchResult.NewData;
    } catch (error) {
      console.error('❌ バックグラウンドタスクエラー:', error);
      return (BackgroundFetch as any).BackgroundFetchResult.Failed;
    }
  });
} else {
  console.log('⚠️ BackgroundTask利用不可: TaskManagerタスク定義をスキップ');
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
        console.log('⚠️ バックグラウンドタスクは利用できません（モジュール未対応）');
        return;
      }

      if (this.isRegistered) {
        console.log('✅ バックグラウンドタスクは既に登録済み');
        return;
      }

      // 🔒 開発環境での即座実行を防止
      if (__DEV__) {
        console.log('🛡️ 開発モード: バックグラウンドタスク登録をスキップ（即座実行防止）');
        console.log('📝 手動テスト用: backgroundTaskService.checkUnusedLinksManually() を使用してください');
        return;
      }

      // バックグラウンドフェッチを登録
      const status = await BackgroundFetch.registerTaskAsync(UNUSED_LINKS_CHECK_TASK, {
        minimumInterval: 24 * 60 * 60 * 1000, // 24時間ごと（より正確な3日間チェック）
        stopOnTerminate: false,
        startOnBoot: true,
      });

      console.log('📅 バックグラウンドタスク登録完了:', {
        taskName: UNUSED_LINKS_CHECK_TASK,
        status,
        interval: '24時間ごと（より正確な3日間チェック）',
        environment: 'production'
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
        console.log('⚠️ バックグラウンドタスクは利用できません');
        return;
      }

      await BackgroundFetch.unregisterTaskAsync(UNUSED_LINKS_CHECK_TASK);
      this.isRegistered = false;
      
      console.log('🗑️ バックグラウンドタスク登録解除完了');
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
      console.log('🔍 手動チェック開始: 3日間未読リンク');
      
      // 🔒 安全な手動テストのための確認
      if (!__DEV__) {
        console.warn('⚠️ 手動チェックは開発モードでのみ実行してください');
        return;
      }
      
      console.log('🛡️ 開発モードでの手動テストを実行中...');
      
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
      
      // ログ出力を簡潔にする
      console.log('📊 手動チェック結果:', {
        unusedLinksCount: data.unusedLinks.length,
        notificationsSent: data.notificationsSent,
        environment: 'development_manual_test'
      });

      // 🔒 開発モードでの通知テスト用の安全なフィルタリング
      const testSafeLinks = data.unusedLinks.filter(link => {
        const createdAt = new Date(link.createdAt);
        const now = new Date();
        const ageInHours = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
        return ageInHours >= 72; // 3日間（72時間）以上のリンクのみ
      });
      
      console.log('🔒 安全フィルタ結果:', {
        originalCount: data.unusedLinks.length,
        safeCount: testSafeLinks.length,
        filteredOut: data.unusedLinks.length - testSafeLinks.length
      });

      // 共通関数を使用して通知処理を実行（安全なリンクのみ）
      await processUnusedLinksNotifications(testSafeLinks);
      
      console.log('✅ 手動チェック完了（開発モード）');
    } catch (error) {
      console.error('❌ 手動チェックエラー:', error);
    }
  }

  // データ移行関数を呼び出す
  async migrateNotificationStructure(): Promise<void> {
    try {
      console.log('🔄 通知構造の移行を開始します...');
      const migrateFunction = httpsCallable(functions, 'migrateNotificationStructure');
      const result = await migrateFunction();
      console.log('✅ 通知構造の移行が完了しました:', result.data);
    } catch (error) {
      console.error('❌ 通知構造の移行に失敗しました:', error);
      throw error;
    }
  }
}

export const backgroundTaskService = BackgroundTaskService.getInstance();
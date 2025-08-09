/**
 * バックグラウンドタスクサービス
 * 3日間未読リンクの通知チェック機能
 */

// Development build対応の安全なimport
let BackgroundFetch: any = null;
let TaskManager: any = null;

try {
  BackgroundFetch = require('expo-background-fetch');
  TaskManager = require('expo-task-manager');
} catch (error) {
  console.log('⚠️ Development build: BackgroundFetch/TaskManager modules not available');
}
import { Platform } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
import { notificationService } from './notificationService';

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
    console.log('⚠️ Development build: BackgroundFetch/TaskManager無効化');
    return false;
  }
};

// バックグラウンドタスクの定義（Development buildではスキップ）
if (isBackgroundTaskAvailable() && TaskManager) {
  TaskManager.defineTask(UNUSED_LINKS_CHECK_TASK, async () => {
  try {
    console.log('🔍 バックグラウンドタスク開始: 3日間未読リンクチェック');
    
    // Cloud Functionを呼び出して3日間未読リンクをチェック
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

    // ローカル通知を送信
    for (const link of data.unusedLinks) {
      await notificationService.scheduleUnusedLinkNotification({
        id: link.id,
        title: link.title,
        url: link.url,
        userId: link.userId,
        lastAccessedAt: link.lastAccessedAt || link.createdAt,
        createdAt: link.createdAt,
        // 他の必要なプロパティはデフォルト値を設定
        description: '',
        status: 'pending' as const,
        isBookmarked: false,
        isArchived: false,
        isRead: false,
        priority: 'medium' as const,
        tagIds: [],
        updatedAt: new Date(),
        notificationsSent: { unused3Days: false }
      });
    }

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.error('❌ バックグラウンドタスクエラー:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
  });
} else {
  console.log('⚠️ Development build: TaskManagerタスク定義をスキップ');
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
        console.log('⚠️ バックグラウンドタスクは利用できません（Development build）');
        return;
      }

      if (this.isRegistered) {
        console.log('✅ バックグラウンドタスクは既に登録済み');
        return;
      }

      // バックグラウンドフェッチを登録
      const status = await BackgroundFetch.registerTaskAsync(UNUSED_LINKS_CHECK_TASK, {
        minimumInterval: 24 * 60 * 60 * 1000, // 24時間ごと
        stopOnTerminate: false,
        startOnBoot: true,
      });

      console.log('📅 バックグラウンドタスク登録完了:', {
        taskName: UNUSED_LINKS_CHECK_TASK,
        status,
        interval: '24時間ごと'
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
    status?: BackgroundFetch.BackgroundFetchStatus;
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
      
      console.log('📊 手動チェック結果:', {
        unusedLinksCount: data.unusedLinks.length,
        notificationsSent: data.notificationsSent,
        links: data.unusedLinks.map(link => ({
          title: link.title.slice(0, 30) + '...',
          daysSinceLastAccess: Math.floor(
            (new Date().getTime() - (link.lastAccessedAt || link.createdAt).getTime()) / 
            (1000 * 60 * 60 * 24)
          )
        }))
      });

      // ローカル通知を送信
      for (const link of data.unusedLinks) {
        await notificationService.scheduleUnusedLinkNotification({
          id: link.id,
          title: link.title,
          url: link.url,
          userId: link.userId,
          lastAccessedAt: link.lastAccessedAt || link.createdAt,
          createdAt: link.createdAt,
          description: '',
          status: 'pending' as const,
          isBookmarked: false,
          isArchived: false,
          isRead: false,
          priority: 'medium' as const,
          tagIds: [],
          updatedAt: new Date(),
          notificationsSent: { unused3Days: false }
        });
      }
    } catch (error) {
      console.error('❌ 手動チェックエラー:', error);
    }
  }
}

export const backgroundTaskService = BackgroundTaskService.getInstance();
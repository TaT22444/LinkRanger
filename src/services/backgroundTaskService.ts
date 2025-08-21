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

/**
 * 3日間未読リンクの通知処理を実行する共通関数
 */
const processUnusedLinksNotifications = async (unusedLinks: Array<{
  id: string;
  title: string;
  url: string;
  userId: string;
  lastAccessedAt?: Date;
  createdAt: Date;
}>) => {
  console.log('📱 processUnusedLinksNotifications開始:', { count: unusedLinks.length });
  
  // ローカル通知を送信（追加の安全チェック付き）
  for (const link of unusedLinks) {
    // 🔧 データ形式修正: createdAtをDateオブジェクトに変換
    let linkCreatedAt: Date;
    try {
      if (link.createdAt instanceof Date) {
        linkCreatedAt = link.createdAt;
      } else if (typeof link.createdAt === 'string') {
        linkCreatedAt = new Date(link.createdAt);
      } else if (link.createdAt && typeof link.createdAt === 'object' && 'seconds' in link.createdAt) {
        // Firebase Timestamp形式の場合
        linkCreatedAt = new Date((link.createdAt as any).seconds * 1000);
      } else {
        console.error('⚠️ 無効なcreatedAt形式:', { linkId: link.id, createdAt: link.createdAt, type: typeof link.createdAt });
        continue;
      }
    } catch (error) {
      console.error('⚠️ createdAt変換エラー:', { linkId: link.id, createdAt: link.createdAt, error });
      continue;
    }

    // 🔒 安全チェック: 作成から最低3時間経過していないリンクは通知しない
    const now = new Date();
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    
    if (linkCreatedAt > threeHoursAgo) {

      continue; // この新しいリンクの通知をスキップ
    }
    
    console.log('📱 通知送信:', {
      linkId: link.id,
      title: link.title.slice(0, 30) + '...',
      createdAt: linkCreatedAt.toISOString()
    });
    
    await notificationService.scheduleUnusedLinkNotification({
      id: link.id,
      title: link.title,
      url: link.url,
      userId: link.userId,
      lastAccessedAt: link.lastAccessedAt || linkCreatedAt,
      createdAt: linkCreatedAt,
      // 他の必要なプロパティはデフォルト値を設定
      description: '',
      status: 'pending' as const,
      isBookmarked: false,
      isArchived: false,
      isRead: false,
      priority: 'medium' as const,
      tagIds: [],
      updatedAt: new Date(),
      notificationsSent: { 
        unused3Days: false
      }
    });
  }
  
  console.log('✅ processUnusedLinksNotifications完了');
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
    console.log('⚠️ Development build: BackgroundFetch/TaskManager無効化');
    return false;
  }
};

// バックグラウンドタスクの定義（Development buildではスキップ）
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
        minimumInterval: 6 * 60 * 60 * 1000, // 6時間ごと（より正確な3日間チェック）
        stopOnTerminate: false,
        startOnBoot: true,
      });

      console.log('📅 バックグラウンドタスク登録完了:', {
        taskName: UNUSED_LINKS_CHECK_TASK,
        status,
        interval: '6時間ごと（より正確な3日間チェック）'
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
        notificationsSent: data.notificationsSent
      });

      // 共通関数を使用して通知処理を実行
      await processUnusedLinksNotifications(data.unusedLinks);
      
      console.log('✅ 手動チェック完了');
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
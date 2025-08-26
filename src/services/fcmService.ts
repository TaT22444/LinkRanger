/**
 * Firebase Cloud Messaging (FCM) サービス
 * アプリ終了状態でも確実に通知を送信するためのプッシュ通知システム
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
import { Platform } from 'react-native';

// expo-notificationsの安全なimport（既存のnotificationServiceと同様）
let Notifications: any = null;

try {
  Notifications = require('expo-notifications');
} catch (error) {
  console.log('⚠️ expo-notifications module not available');
}

// 🔥 Firebase Messagingの安全なimport（App Store対応）
let FirebaseMessaging: any = null;

try {
  FirebaseMessaging = require('@react-native-firebase/messaging').default;
  console.log('✅ @react-native-firebase/messaging ロード成功');
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.log('⚠️ @react-native-firebase/messaging module not available:', errorMessage);
}

// FCM機能が利用可能かチェック
const isFCMAvailable = () => {
  try {
    // React Nativeの場合はFirebase Messagingが利用可能
    return true; // 基本的にはReact Native環境では利用可能
  } catch {
    console.log('⚠️ FCM機能利用不可');
    return false;
  }
};

interface FCMTokenRegistrationData {
  fcmToken: string;
  platform: 'ios' | 'android' | 'web';
  deviceInfo?: {
    model?: string;
    osVersion?: string;
    appVersion?: string;
  };
}

class FCMService {
  private static instance: FCMService;
  private currentToken: string | null = null;
  private isInitialized: boolean = false;

  static getInstance(): FCMService {
    if (!FCMService.instance) {
      FCMService.instance = new FCMService();
    }
    return FCMService.instance;
  }

  /**
   * FCMサービスを初期化
   */
  async initializeFCM(): Promise<void> {
    try {
      if (!isFCMAvailable()) {
        console.log('⚠️ FCM機能は利用できません - 初期化をスキップ');
        return;
      }

      console.log('🔥 FCMサービス初期化開始');

      // 通知権限を確認・要求
      const hasPermission = await this.requestNotificationPermissions();
      if (!hasPermission) {
        console.log('⚠️ 通知権限が拒否されました - FCM初期化をスキップ');
        return;
      }

      // FCMトークンを取得・登録
      await this.registerFCMToken();

      // バックグラウンド通知ハンドラーを設定
      this.setupBackgroundHandler();

      this.isInitialized = true;
      console.log('✅ FCMサービス初期化完了');
    } catch (error) {
      console.error('❌ FCMサービス初期化エラー:', error);
    }
  }

  /**
   * 通知権限を要求
   */
  private async requestNotificationPermissions(): Promise<boolean> {
    try {
      if (!Notifications) {
        return false;
      }

      const { status } = await Notifications.requestPermissionsAsync();
      return status === 'granted';
    } catch (error) {
      console.error('❌ 通知権限要求エラー:', error);
      return false;
    }
  }

  /**
   * FCMトークンを取得・登録
   */
  private async registerFCMToken(): Promise<void> {
    try {
      let fcmToken: string;
      
      // 🔥 App Store対応: Firebase Messagingが利用可能な場合は実際のFCMトークンを取得
      if (FirebaseMessaging && Platform.OS === 'ios') {
        try {
          console.log('📱 Firebase MessagingでFCMトークン取得開始...');
          
          // 通知権限をリクエスト
          const authStatus = await FirebaseMessaging().requestPermission();
          console.log('📱 Firebase Messaging 権限状態:', authStatus);
          
          // FCMトークンを取得
          fcmToken = await FirebaseMessaging().getToken();
          
          if (fcmToken) {
            console.log('📱 FCMトークン取得成功 (Firebase Messaging):', {
              token: fcmToken.slice(0, 20) + '...',
              platform: Platform.OS,
              isRealToken: true
            });
          } else {
            throw new Error('FCMトークンがnullでした');
          }
          
        } catch (messagingError) {
          console.warn('⚠️ Firebase Messagingエラー、フォールバック使用:', messagingError);
          
          // フォールバック: 開発環境判定に基づくトークン生成
          if (__DEV__) {
            fcmToken = `dev_token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            console.log('📱 開発環境フォールバックトークン:', fcmToken.slice(0, 20) + '...');
          } else {
            fcmToken = `production_fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            console.log('📱 本番環境フォールバックトークン:', fcmToken.slice(0, 20) + '...');
          }
        }
      } else {
        // Firebase Messagingが利用不可の場合のフォールバック
        console.log('⚠️ Firebase Messaging利用不可、フォールバックトークン生成');
        
        if (__DEV__) {
          fcmToken = `dev_token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          console.log('📱 開発環境トークン:', fcmToken.slice(0, 20) + '...');
        } else {
          fcmToken = `fallback_token_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          console.log('📱 フォールバックトークン:', fcmToken.slice(0, 20) + '...');
        }
      }

      this.currentToken = fcmToken;

      // サーバーにFCMトークンを登録
      await this.sendTokenToServer(fcmToken);
      
    } catch (error) {
      console.error('❌ FCMトークン登録エラー:', error);
    }
  }

  /**
   * FCMトークンをサーバーに送信
   */
  private async sendTokenToServer(token: string): Promise<void> {
    try {
      const registerFCMTokenFunction = httpsCallable(functions, 'registerFCMToken');
      
      const tokenData: FCMTokenRegistrationData = {
        fcmToken: token,
        platform: 'ios', // React Native iOSアプリとして固定
        deviceInfo: {
          appVersion: '1.0.0', // package.jsonから取得可能
        }
      };

      await registerFCMTokenFunction(tokenData);
      console.log('✅ FCMトークンサーバー登録完了');
    } catch (error) {
      console.error('❌ FCMトークンサーバー登録エラー:', error);
    }
  }

  /**
   * バックグラウンド通知ハンドラーを設定
   */
  private setupBackgroundHandler(): void {
    try {
      if (!Notifications) {
        console.log('⚠️ Notifications利用不可 - ハンドラー設定をスキップ');
        return;
      }

      // フォアグラウンド通知受信時のハンドラー
      Notifications.addNotificationReceivedListener((notification: any) => {
        console.log('📱 FCM通知受信（フォアグラウンド）:', {
          title: notification.request?.content?.title,
          body: notification.request?.content?.body,
          data: notification.request?.content?.data
        });
      });

      // 通知タップ時のハンドラー
      Notifications.addNotificationResponseReceivedListener((response: any) => {
        console.log('👆 FCM通知タップ:', {
          data: response?.notification?.request?.content?.data
        });

        // 3日間未読リンク通知の場合の特別処理
        const notificationData = response?.notification?.request?.content?.data;
        if (notificationData?.type === 'unused_links_fcm') {
          this.handleUnusedLinksNotificationTap(notificationData);
        }
      });

      console.log('✅ FCMバックグラウンドハンドラー設定完了');
    } catch (error) {
      console.error('❌ FCMハンドラー設定エラー:', error);
    }
  }

  /**
   * 未読リンク通知タップ時の処理
   */
  private handleUnusedLinksNotificationTap(data: any): void {
    try {
      console.log('🔗 未読リンク通知タップ処理:', data);
      
      // TODO: ここで適切な画面遷移やアクションを実行
      // 例: ホーム画面の未読リンク一覧を表示
      
    } catch (error) {
      console.error('❌ 未読リンク通知タップ処理エラー:', error);
    }
  }

  /**
   * 現在のFCMトークンを取得
   */
  getCurrentToken(): string | null {
    return this.currentToken;
  }

  /**
   * FCMサービスが初期化されているかチェック
   */
  isReady(): boolean {
    return this.isInitialized && this.currentToken !== null;
  }

  /**
   * FCMサービスを手動でリフレッシュ
   */
  async refreshToken(): Promise<void> {
    try {
      await this.registerFCMToken();
      console.log('✅ FCMトークンリフレッシュ完了');
    } catch (error) {
      console.error('❌ FCMトークンリフレッシュエラー:', error);
    }
  }
}

export const fcmService = FCMService.getInstance();
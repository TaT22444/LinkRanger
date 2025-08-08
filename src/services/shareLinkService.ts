/**
 * 外部アプリからのリンク共有処理サービス
 * Deep LinkingとShare Extensionを管理
 */

import { Alert } from 'react-native';
import * as Linking from 'expo-linking';
import Constants from 'expo-constants';
import { linkService } from './linkService';
import { User, LinkStatus } from '../types';

export interface SharedLinkData {
  url: string;
  title?: string;
  source: 'deep-link' | 'share-extension';
}

class ShareLinkService {
  private static instance: ShareLinkService;

  static getInstance(): ShareLinkService {
    if (!ShareLinkService.instance) {
      ShareLinkService.instance = new ShareLinkService();
    }
    return ShareLinkService.instance;
  }

  /**
   * Deep Linkingが利用可能かチェック
   */
  isDeepLinkingAvailable(): boolean {
    try {
      // expo-linkingモジュールの存在確認
      return typeof Linking !== 'undefined';
    } catch {
      console.log('⚠️ expo-linking利用不可');
      return false;
    }
  }

  /**
   * URLからリンク情報を解析
   */
  parseSharedUrl(url: string): SharedLinkData | null {
    try {
      // Deep Linkの場合: wink://share?url=https://example.com&title=Example
      if (url.startsWith('wink://share')) {
        const parsed = Linking.parse(url);
        const queryParams = parsed.queryParams;
        
        if (queryParams && queryParams.url) {
          return {
            url: queryParams.url as string,
            title: queryParams.title as string || undefined,
            source: 'deep-link'
          };
        }
      }

      // 直接URLの場合（他のアプリからの共有）
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return {
          url,
          source: 'share-extension'
        };
      }

      return null;
    } catch (error) {
      console.error('❌ URL解析エラー:', error);
      return null;
    }
  }

  /**
   * 共有されたリンクを処理してアプリに追加
   */
  async handleSharedLink(
    sharedData: SharedLinkData, 
    user: User
  ): Promise<string | null> {
    try {
      console.log('🔗 共有リンク処理開始:', {
        url: sharedData.url,
        title: sharedData.title,
        source: sharedData.source,
        userId: user.uid
      });

      // リンクデータを作成
      const linkData = {
        userId: user.uid,
        url: sharedData.url,
        title: sharedData.title || 'リンクを取得中...',
        description: '',
        status: 'pending' as LinkStatus,
        tagIds: [],
        isBookmarked: false,
        isArchived: false,
        priority: 'medium' as const,
        isRead: false
      };

      // リンクを作成
      const linkId = await linkService.createLink(linkData);
      
      console.log('✅ 共有リンク保存完了:', {
        linkId,
        url: sharedData.url,
        source: sharedData.source
      });

      // 成功通知
      Alert.alert(
        '🔗 リンクを保存しました',
        'AIが自動でタグ付けと要約を生成しています',
        [{ text: 'OK' }]
      );

      return linkId;
    } catch (error) {
      console.error('❌ 共有リンク処理エラー:', error);
      
      Alert.alert(
        'エラー',
        'リンクの保存に失敗しました',
        [{ text: 'OK' }]
      );
      
      return null;
    }
  }

  /**
   * Deep Linkingのリスナーを設定
   */
  setupDeepLinkListener(onSharedLink: (data: SharedLinkData) => void) {
    if (!this.isDeepLinkingAvailable()) {
      console.log('⚠️ Deep Linking利用不可 - リスナー設定をスキップ');
      return () => {}; // 空の cleanup 関数
    }

    // URL変更を監視
    const subscription = Linking.addEventListener('url', (event) => {
      console.log('🔗 Deep Link受信:', event.url);
      
      const parsedData = this.parseSharedUrl(event.url);
      if (parsedData) {
        onSharedLink(parsedData);
      }
    });

    // アプリ起動時の初期URLをチェック
    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log('🚀 アプリ起動時URL:', url);
        const parsedData = this.parseSharedUrl(url);
        if (parsedData) {
          onSharedLink(parsedData);
        }
      }
    });

    return () => {
      subscription?.remove();
    };
  }
}

export const shareLinkService = ShareLinkService.getInstance();
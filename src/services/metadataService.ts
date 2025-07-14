import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

export interface LinkMetadata {
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  domain?: string;
  author?: string;
  publishedDate?: string;
  keywords?: string[];
  language?: string;
  type?: string;
  favicon?: string;
}

// Cloud Functionsのメタデータ取得関数
const fetchMetadataFunction = httpsCallable(functions, 'fetchMetadata');

export const metadataService = {
  async fetchMetadata(url: string, userId?: string): Promise<LinkMetadata> {
    try {
      console.log('Fetching metadata for:', url);
      
      // Cloud Functionsを使用してセキュアにメタデータを取得
      const result = await fetchMetadataFunction({ url, userId });
      const metadata = result.data as LinkMetadata;
      
      console.log('Fetched metadata:', metadata);
      return metadata;
      
    } catch (error) {
      console.error('Error fetching metadata:', error);
      
      // エラーの詳細をログ出力
      if (error instanceof Error) {
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
      }
      
      // フォールバック：URLからドメイン名を抽出してタイトルとする
      try {
        const urlObj = new URL(url);
        const fallbackTitle = urlObj.hostname.replace('www.', '');
        console.log('Using fallback title:', fallbackTitle);
        return {
          title: fallbackTitle,
          description: '',
          domain: urlObj.hostname,
        };
      } catch {
        console.log('Using URL as fallback title:', url);
        return {
          title: url,
          description: '',
        };
      }
    }
  },

  // 旧バージョンとの互換性のため、プロキシサービスを使用したフォールバック関数
  async fetchMetadataFallback(url: string): Promise<LinkMetadata> {
    try {
      console.log('Using fallback metadata fetching for:', url);
      
      // 外部プロキシサービスを使用（セキュリティ上の問題があるため、緊急時のみ）
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      
      // 8秒のタイムアウトを設定
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      const response = await fetch(proxyUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.contents) {
        throw new Error('Failed to fetch page content');
      }
      
      const html = data.contents;
      const metadata: LinkMetadata = {};
      
      // タイトル取得（優先順位: og:title > title タグ）
      const ogTitle = html.match(/<meta[^>]*property=["\']og:title["\'][^>]*content=["\']([^"\']*)["\'][^>]*>/i);
      const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      
      if (ogTitle && ogTitle[1]) {
        metadata.title = ogTitle[1].trim();
      } else if (titleTag && titleTag[1]) {
        metadata.title = titleTag[1].trim();
      }
      
      // 説明取得（優先順位: og:description > meta description）
      const ogDescription = html.match(/<meta[^>]*property=["\']og:description["\'][^>]*content=["\']([^"\']*)["\'][^>]*>/i);
      const metaDescription = html.match(/<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']*)["\'][^>]*>/i);
      
      if (ogDescription && ogDescription[1]) {
        metadata.description = ogDescription[1].trim();
      } else if (metaDescription && metaDescription[1]) {
        metadata.description = metaDescription[1].trim();
      }
      
      // OGP画像取得
      const ogImage = html.match(/<meta[^>]*property=["\']og:image["\'][^>]*content=["\']([^"\']*)["\'][^>]*>/i);
      if (ogImage && ogImage[1]) {
        metadata.imageUrl = ogImage[1].trim();
      }
      
      // サイト名取得
      const ogSiteName = html.match(/<meta[^>]*property=["\']og:site_name["\'][^>]*content=["\']([^"\']*)["\'][^>]*>/i);
      if (ogSiteName && ogSiteName[1]) {
        metadata.siteName = ogSiteName[1].trim();
      }
      
      // ドメイン情報を追加
      try {
        const urlObj = new URL(url);
        metadata.domain = urlObj.hostname;
      } catch {
        // URL解析に失敗した場合はスキップ
      }
      
      console.log('Fetched metadata (fallback):', metadata);
      return metadata;
      
    } catch (error) {
      console.error('Error fetching metadata (fallback):', error);
      
      // 最終フォールバック：URLからドメイン名を抽出してタイトルとする
      try {
        const urlObj = new URL(url);
        const fallbackTitle = urlObj.hostname.replace('www.', '');
        console.log('Using final fallback title:', fallbackTitle);
        return {
          title: fallbackTitle,
          description: '',
          domain: urlObj.hostname,
        };
      } catch {
        console.log('Using URL as final fallback title:', url);
        return {
          title: url,
          description: '',
        };
      }
    }
  }
}; 
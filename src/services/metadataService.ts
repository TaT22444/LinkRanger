import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

export interface LinkMetadata {
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  domain?: string;
  // 新機能: 詳細コンテンツ分析
  fullContent?: string;           // ページの全文テキスト
  headings?: string[];           // h1, h2, h3タグの内容
  images?: ImageMetadata[];      // 画像の詳細情報
  links?: string[];              // 外部リンク先
  codeSnippets?: CodeSnippet[];  // コードブロック
  structuredData?: any;          // JSON-LD等の構造化データ
  contentType?: ContentType;     // コンテンツタイプ分類
  readingTime?: number;          // 推定読了時間（分）
  wordCount?: number;            // 文字数
  language?: string;             // 言語検出
  // Google Maps専用メタデータ
  mapInfo?: GoogleMapInfo;       // マップ情報
}

export interface GoogleMapInfo {
  placeName?: string;            // 場所名
  address?: string;              // 住所
  coordinates?: {                // 座標
    lat: number;
    lng: number;
  };
  placeType?: string;            // 場所のタイプ（レストラン、駅など）
  rating?: number;               // 評価
  businessHours?: string;        // 営業時間
  phoneNumber?: string;          // 電話番号
  website?: string;              // ウェブサイト
}

export interface ImageMetadata {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  type?: 'photo' | 'diagram' | 'screenshot' | 'logo' | 'icon';
}

export interface CodeSnippet {
  language?: string;
  code: string;
  context?: string; // 周辺のテキスト
}

export interface ContentType {
  category: 'article' | 'tutorial' | 'documentation' | 'news' | 'blog' | 'tool' | 'video' | 'social' | 'ecommerce' | 'map' | 'other';
  subCategory?: string;
  confidence: number; // 0.0-1.0
  indicators: string[]; // 判定根拠
}

// Cloud Functionsの強化されたメタデータ取得関数
const fetchEnhancedMetadataFunction = httpsCallable(functions, 'fetchEnhancedMetadata');

export const metadataService = {
  /**
   * 基本メタデータ取得
   */
  async fetchMetadata(url: string, userId?: string): Promise<LinkMetadata> {
    try {
      console.log('Fetching basic metadata for:', url);
      
      // 一時的にGoogle Maps特別処理を無効化して、通常のWebページとして処理
      // if (this.isGoogleMapsUrl(url)) {
      //   return this.handleGoogleMapsUrl(url);
      // }
      
      const fetchMetadataFunction = httpsCallable(functions, 'fetchMetadata');
      const result = await fetchMetadataFunction({ url, userId });
      const metadata = result.data as LinkMetadata;
      
      console.log('Basic metadata fetched:', metadata);
      return metadata;
      
    } catch (error) {
      console.error('Error fetching basic metadata:', error);
      
      // 最終フォールバック
      return this.generateFallbackMetadata(url);
    }
  },

  /**
   * コンテンツタイプを分析
   */
  analyzeContentType(metadata: LinkMetadata): ContentType {
    const { title = '', description = '', fullContent = '', domain = '', headings = [] } = metadata;
    const text = `${title} ${description} ${fullContent} ${headings.join(' ')}`.toLowerCase();
    
    // ドメインベース分析
    const domainIndicators = this.getDomainTypeIndicators(domain);
    
    // キーワードベース分析
    const keywordIndicators = this.getKeywordTypeIndicators(text);
    
    // 構造ベース分析
    const structureIndicators = this.getStructureTypeIndicators(metadata);
    
    // 総合判定
    const allIndicators = [...domainIndicators, ...keywordIndicators, ...structureIndicators];
    const categoryScores = this.calculateCategoryScores(allIndicators);
    
    const topCategory = Object.entries(categoryScores)
      .sort(([,a], [,b]) => b - a)[0];
    
    return {
      category: topCategory[0] as ContentType['category'],
      confidence: topCategory[1],
      indicators: allIndicators.slice(0, 5), // 上位5つの根拠
    };
  },

  /**
   * ドメインベースのタイプ指標
   */
  getDomainTypeIndicators(domain: string): string[] {
    const domainMap: Record<string, string[]> = {
      'github.com': ['tool', 'documentation'],
      'stackoverflow.com': ['tutorial', 'documentation'],
      'medium.com': ['blog', 'article'],
      'dev.to': ['blog', 'tutorial'],
      'qiita.com': ['tutorial', 'article'],
      'youtube.com': ['video'],
      'youtu.be': ['video'],
      'twitter.com': ['social'],
      'x.com': ['social'],
      'linkedin.com': ['social'],
      'amazon.com': ['ecommerce'],
      'amazon.co.jp': ['ecommerce'],
      'wikipedia.org': ['article', 'documentation'],
      'news.ycombinator.com': ['news'],
      'reddit.com': ['social', 'news'],
      'getnavi.jp': ['news', 'article'],
      'itmedia.co.jp': ['news', 'article'],
      'techcrunch.com': ['news', 'article'],
      'wired.com': ['news', 'article'],
      'gigazine.net': ['news', 'article'],
      'ascii.jp': ['news', 'article'],
      'nikkei.com': ['news', 'article'],
      'mainichi.jp': ['news'],
      'asahi.com': ['news'],
      'yomiuri.co.jp': ['news'],
      'maps.google.com': ['map'],
      'goo.gl': ['map'], // Google Maps短縮URL
    };
    
    return domainMap[domain.toLowerCase()] || [];
  },

  /**
   * キーワードベースのタイプ指標
   */
  getKeywordTypeIndicators(text: string): string[] {
    const patterns: Record<string, RegExp[]> = {
      tutorial: [
        /how to|tutorial|guide|step by step|getting started|beginner/i,
        /チュートリアル|使い方|方法|手順|始め方|ガイド/i
      ],
      article: [
        /article|blog post|opinion|analysis|review/i,
        /記事|ブログ|分析|レビュー|考察|解説/i
      ],
      documentation: [
        /documentation|api|reference|manual|spec/i,
        /ドキュメント|仕様書|マニュアル|リファレンス/i
      ],
      news: [
        /news|breaking|update|announcement|release/i,
        /ニュース|発表|リリース|更新|最新|話題|注目|賛否|議論|炎上/i
      ],
      tool: [
        /tool|app|software|platform|service|application/i,
        /ツール|アプリ|ソフト|サービス|プラットフォーム|アプリケーション|新.*アプリ/i
      ],
    };
    
    const indicators: string[] = [];
    
    Object.entries(patterns).forEach(([type, regexes]) => {
      if (regexes.some(regex => regex.test(text))) {
        indicators.push(type);
      }
    });
    
    return indicators;
  },

  /**
   * 構造ベースのタイプ指標
   */
  getStructureTypeIndicators(metadata: LinkMetadata): string[] {
    const indicators: string[] = [];
    
    // コードスニペットの存在
    if (metadata.codeSnippets && metadata.codeSnippets.length > 0) {
      indicators.push('tutorial', 'documentation');
    }
    
    // 画像の多さ
    if (metadata.images && metadata.images.length > 5) {
      indicators.push('article', 'blog');
    }
    
    // 見出しの構造
    if (metadata.headings && metadata.headings.length > 3) {
      indicators.push('article', 'tutorial');
    }
    
    // 文字数による判定
    if (metadata.wordCount) {
      if (metadata.wordCount > 2000) {
        indicators.push('article', 'documentation');
      } else if (metadata.wordCount < 500) {
        indicators.push('tool', 'news');
      }
    }
    
    return indicators;
  },

  /**
   * カテゴリスコア計算
   */
  calculateCategoryScores(indicators: string[]): Record<string, number> {
    const scores: Record<string, number> = {
      article: 0, tutorial: 0, documentation: 0, news: 0, blog: 0,
      tool: 0, video: 0, social: 0, ecommerce: 0, map: 0, other: 0
    };
    
    indicators.forEach(indicator => {
      if (scores.hasOwnProperty(indicator)) {
        scores[indicator] += 1;
      }
    });
    
    // 正規化（0.0-1.0）
    const maxScore = Math.max(...Object.values(scores));
    if (maxScore > 0) {
      Object.keys(scores).forEach(key => {
        scores[key] = scores[key] / maxScore;
      });
    }
    
    return scores;
  },

  /**
   * 読了時間推定（日本語対応）
   */
  estimateReadingTime(content: string): number {
    // 日本語: 400-600文字/分, 英語: 200-300語/分
    const japaneseChars = (content.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g) || []).length;
    const englishWords = content.split(/\s+/).length - japaneseChars;
    
    const japaneseTime = japaneseChars / 500; // 分
    const englishTime = englishWords / 250;   // 分
    
    return Math.ceil(japaneseTime + englishTime);
  },

  /**
   * 文字数カウント
   */
  countWords(content: string): number {
    // 日本語文字 + 英単語の総数
    const japaneseChars = (content.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g) || []).length;
    const englishWords = content.split(/\s+/).filter(word => /[a-zA-Z]/.test(word)).length;
    
    return japaneseChars + englishWords;
  },

  /**
   * フォールバックメタデータ生成
   */
  generateFallbackMetadata(url: string): LinkMetadata {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace('www.', '');
      
      return {
        title: domain,
        description: '',
        domain: urlObj.hostname,
        contentType: {
          category: 'other',
          confidence: 0.1,
          indicators: ['fallback'],
        },
      };
    } catch {
      return {
        title: url,
        description: '',
        contentType: {
          category: 'other',
          confidence: 0.1,
          indicators: ['fallback'],
        },
      };
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
  },

  /**
   * Google MapsのURLかどうか判定
   */
  isGoogleMapsUrl(url: string): boolean {
    const patterns = [
      /maps\.google\./,
      /goo\.gl\/maps/,
      /maps\.app\.goo\.gl/,
      /google\..*\/maps/,
    ];
    
    return patterns.some(pattern => pattern.test(url));
  },

  /**
   * Google MapsのURLを処理してメタデータを生成
   */
  async handleGoogleMapsUrl(url: string): Promise<LinkMetadata> {
    try {
      console.log('Processing Google Maps URL:', url);
      
      // 短縮URLの場合は展開を試行
      let finalUrl = url;
      if (url.includes('goo.gl') || url.includes('maps.app.goo.gl')) {
        try {
          console.log('Attempting to expand shortened URL:', url);
          const response = await fetch(url, { 
            method: 'HEAD',
            redirect: 'manual'
          });
          const location = response.headers.get('location');
          if (location && this.isGoogleMapsUrl(location)) {
            finalUrl = location;
            console.log('Expanded URL:', finalUrl);
          }
        } catch (error) {
          console.log('Failed to expand URL, using original:', error);
        }
      }
      
      const mapInfo = this.parseGoogleMapsUrl(finalUrl);
      const title = this.generateMapTitle(mapInfo);
      const description = this.generateMapDescription(mapInfo);
      
      return {
        title,
        description,
        siteName: 'Google Maps',
        domain: 'maps.google.com',
        mapInfo,
        contentType: {
          category: 'map',
          confidence: 1.0,
          indicators: ['google-maps-url'],
        },
      };
    } catch (error) {
      console.error('Error processing Google Maps URL:', error);
      
      // フォールバック
      return {
        title: 'Google Maps',
        description: 'マップリンク',
        siteName: 'Google Maps',
        domain: 'maps.google.com',
        contentType: {
          category: 'map',
          confidence: 0.8,
          indicators: ['google-maps-fallback'],
        },
      };
    }
  },

  /**
   * Google MapsのURLを解析
   */
  parseGoogleMapsUrl(url: string): GoogleMapInfo {
    const mapInfo: GoogleMapInfo = {};
    
    try {
      console.log('Parsing Google Maps URL:', url);
      const urlObj = new URL(url);
      const params = urlObj.searchParams;
      const pathname = urlObj.pathname;
      
      // クエリパラメータから場所名を取得 (例: ?q=東京駅)
      const query = params.get('q');
      if (query) {
        mapInfo.placeName = decodeURIComponent(query);
        console.log('Place name from query:', mapInfo.placeName);
      }
      
      // パスから場所情報を抽出（/maps/place/場所名/@座標 形式）
      const placeMatch = pathname.match(/\/maps\/place\/([^/@]+)/);
      if (placeMatch) {
        const placeName = decodeURIComponent(placeMatch[1]).replace(/\+/g, ' ');
        mapInfo.placeName = placeName;
        console.log('Place name from path:', placeName);
      }
      
      // より詳細なパターンマッチング
      // /maps/search/場所名 形式
      const searchMatch = pathname.match(/\/maps\/search\/([^/@]+)/);
      if (searchMatch && !mapInfo.placeName) {
        const placeName = decodeURIComponent(searchMatch[1]).replace(/\+/g, ' ');
        mapInfo.placeName = placeName;
        console.log('Place name from search path:', placeName);
      }
      
      // /maps/dir/出発地/目的地 形式
      const dirMatch = pathname.match(/\/maps\/dir\/[^/]+\/([^/@]+)/);
      if (dirMatch && !mapInfo.placeName) {
        const placeName = decodeURIComponent(dirMatch[1]).replace(/\+/g, ' ');
        mapInfo.placeName = placeName;
        console.log('Place name from directions:', placeName);
      }
      
      // 座標情報を抽出
      const coordMatch = pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      if (coordMatch) {
        mapInfo.coordinates = {
          lat: parseFloat(coordMatch[1]),
          lng: parseFloat(coordMatch[2]),
        };
        console.log('Coordinates found:', mapInfo.coordinates);
      }
      
      // URLフラグメント（#）からの情報抽出
      if (urlObj.hash) {
        const hashMatch = urlObj.hash.match(/!1m[^!]*!3d(-?\d+\.?\d*)[^!]*!4d(-?\d+\.?\d*)/);
        if (hashMatch && !mapInfo.coordinates) {
          mapInfo.coordinates = {
            lat: parseFloat(hashMatch[1]),
            lng: parseFloat(hashMatch[2]),
          };
          console.log('Coordinates from hash:', mapInfo.coordinates);
        }
      }
      
      // data パラメータから詳細情報を抽出
      const dataParam = params.get('data');
      if (dataParam) {
        console.log('Data parameter found:', dataParam);
        // 住所抽出ロジック
        const addressMatch = dataParam.match(/!1s([^!]+)/);
        if (addressMatch) {
          mapInfo.address = decodeURIComponent(addressMatch[1]);
          console.log('Address from data:', mapInfo.address);
        }
      }
      
      // place_id がある場合
      const placeId = params.get('place_id');
      if (placeId) {
        console.log('Place ID found:', placeId);
      }
      
      console.log('Final parsed map info:', mapInfo);
      
    } catch (error) {
      console.error('Error parsing Google Maps URL:', error);
    }
    
    return mapInfo;
  },

  /**
   * マップ情報からタイトルを生成
   */
  generateMapTitle(mapInfo: GoogleMapInfo): string {
    console.log('Generating map title from:', mapInfo);
    
    if (mapInfo.placeName) {
      const title = mapInfo.placeName.trim();
      console.log('Using place name as title:', title);
      return title;
    }
    
    if (mapInfo.address) {
      const title = mapInfo.address.trim();
      console.log('Using address as title:', title);
      return title;
    }
    
    if (mapInfo.coordinates) {
      const title = `地図 (${mapInfo.coordinates.lat.toFixed(4)}, ${mapInfo.coordinates.lng.toFixed(4)})`;
      console.log('Using coordinates as title:', title);
      return title;
    }
    
    console.log('Using fallback title: Google Maps');
    return 'Google Maps';
  },

  /**
   * マップ情報から説明を生成
   */
  generateMapDescription(mapInfo: GoogleMapInfo): string {
    const parts: string[] = [];
    
    if (mapInfo.address) {
      parts.push(`住所: ${mapInfo.address}`);
    }
    
    if (mapInfo.coordinates) {
      parts.push(`座標: ${mapInfo.coordinates.lat.toFixed(6)}, ${mapInfo.coordinates.lng.toFixed(6)}`);
    }
    
    if (mapInfo.placeType) {
      parts.push(`タイプ: ${mapInfo.placeType}`);
    }
    
    if (mapInfo.rating) {
      parts.push(`評価: ${mapInfo.rating}/5`);
    }
    
    return parts.length > 0 ? parts.join(' | ') : 'Google Mapsの地図リンク';
  }
}; 
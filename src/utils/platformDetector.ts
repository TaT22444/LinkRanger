/**
 * プラットフォーム自動認識ユーティリティ
 * URLからプラットフォーム（提供先）を自動判定する
 */

export interface PlatformInfo {
  name: string;
  displayName: string;
  category: 'social' | 'video' | 'productivity' | 'maps' | 'music' | 'shopping' | 'news' | 'other';
  color?: string;
  emoji?: string;
}

// サポートするプラットフォーム定義
const PLATFORMS: Record<string, PlatformInfo> = {
  instagram: {
    name: 'Instagram',
    displayName: 'Instagram',
    category: 'social',
    color: '#E4405F',
    emoji: '📸'
  },
  twitter: {
    name: 'X',
    displayName: 'X (Twitter)',
    category: 'social', 
    color: '#1DA1F2',
    emoji: '🐦'
  },
  x: {
    name: 'X',
    displayName: 'X (Twitter)',
    category: 'social',
    color: '#000000',
    emoji: '❌'
  },
  youtube: {
    name: 'YouTube',
    displayName: 'YouTube',
    category: 'video',
    color: '#FF0000',
    emoji: '📺'
  },
  youtu: {
    name: 'YouTube',
    displayName: 'YouTube',
    category: 'video',
    color: '#FF0000',
    emoji: '📺'
  },
  googlemaps: {
    name: 'GoogleMaps',
    displayName: 'Google Maps',
    category: 'maps',
    color: '#4285F4',
    emoji: '🗺️'
  },
  maps: {
    name: 'GoogleMaps',
    displayName: 'Google Maps',
    category: 'maps',
    color: '#4285F4',
    emoji: '🗺️'
  },
  note: {
    name: 'note',
    displayName: 'note',
    category: 'social',
    color: '#41C9B4',
    emoji: '📝'
  },
  notion: {
    name: 'Notion',
    displayName: 'Notion',
    category: 'productivity',
    color: '#000000',
    emoji: '📋'
  },
  tiktok: {
    name: 'TikTok',
    displayName: 'TikTok',
    category: 'video',
    color: '#000000',
    emoji: '🎵'
  },
  facebook: {
    name: 'Facebook',
    displayName: 'Facebook',
    category: 'social',
    color: '#1877F2',
    emoji: '👥'
  },
  linkedin: {
    name: 'LinkedIn',
    displayName: 'LinkedIn',
    category: 'social',
    color: '#0A66C2',
    emoji: '💼'
  },
  github: {
    name: 'GitHub',
    displayName: 'GitHub',
    category: 'productivity',
    color: '#181717',
    emoji: '🐙'
  },
  qiita: {
    name: 'Qiita',
    displayName: 'Qiita',
    category: 'productivity',
    color: '#55C500',
    emoji: '📚'
  },
  zenn: {
    name: 'Zenn',
    displayName: 'Zenn',
    category: 'productivity',
    color: '#3EA8FF',
    emoji: '⚡'
  },
  spotify: {
    name: 'Spotify',
    displayName: 'Spotify',
    category: 'music',
    color: '#1DB954',
    emoji: '🎵'
  },
  applemusic: {
    name: 'AppleMusic',
    displayName: 'Apple Music',
    category: 'music',
    color: '#FA243C',
    emoji: '🍎'
  },
  amazon: {
    name: 'Amazon',
    displayName: 'Amazon',
    category: 'shopping',
    color: '#FF9900',
    emoji: '📦'
  },
  rakuten: {
    name: 'Rakuten',
    displayName: '楽天',
    category: 'shopping',
    color: '#BF0000',
    emoji: '🛒'
  },
  netflix: {
    name: 'Netflix',
    displayName: 'Netflix',
    category: 'video',
    color: '#E50914',
    emoji: '🎬'
  },
  medium: {
    name: 'Medium',
    displayName: 'Medium',
    category: 'news',
    color: '#000000',
    emoji: '✍️'
  },
  reddit: {
    name: 'Reddit',
    displayName: 'Reddit',
    category: 'social',
    color: '#FF4500',
    emoji: '🤖'
  },
  discord: {
    name: 'Discord',
    displayName: 'Discord',
    category: 'social',
    color: '#5865F2',
    emoji: '💬'
  },
  slack: {
    name: 'Slack',
    displayName: 'Slack',
    category: 'productivity',
    color: '#4A154B',
    emoji: '💼'
  },
  figma: {
    name: 'Figma',
    displayName: 'Figma',
    category: 'productivity',
    color: '#F24E1E',
    emoji: '🎨'
  },
  canva: {
    name: 'Canva',
    displayName: 'Canva',
    category: 'productivity',
    color: '#00C4CC',
    emoji: '🖼️'
  },
  pinterest: {
    name: 'Pinterest',
    displayName: 'Pinterest',
    category: 'social',
    color: '#E60023',
    emoji: '📌'
  },
  wikipedia: {
    name: 'Wikipedia',
    displayName: 'Wikipedia',
    category: 'news',
    color: '#000000',
    emoji: '📖'
  }
};

// URLパターンマッチング用の正規表現
const URL_PATTERNS: Array<{ pattern: RegExp; platform: string }> = [
  // Instagram
  { pattern: /instagram\.com/i, platform: 'instagram' },
  { pattern: /instagr\.am/i, platform: 'instagram' },
  
  // YouTube
  { pattern: /youtube\.com/i, platform: 'youtube' },
  { pattern: /youtu\.be/i, platform: 'youtu' },
  { pattern: /m\.youtube\.com/i, platform: 'youtube' },
  
  // Netflix（twitterより前に配置）
  { pattern: /netflix\.com/i, platform: 'netflix' },
  
  // X (Twitter)
  { pattern: /twitter\.com/i, platform: 'twitter' },
  { pattern: /t\.co/i, platform: 'twitter' },
  { pattern: /x\.com/i, platform: 'x' },
  
  // Google Maps
  { pattern: /maps\.google\.com/i, platform: 'googlemaps' },
  { pattern: /goo\.gl\/maps/i, platform: 'googlemaps' },
  { pattern: /maps\.app\.goo\.gl/i, platform: 'googlemaps' },
  
  // note
  { pattern: /note\.com/i, platform: 'note' },
  { pattern: /note\.mu/i, platform: 'note' },
  
  // Notion
  { pattern: /notion\.so/i, platform: 'notion' },
  { pattern: /notion\.site/i, platform: 'notion' },
  
  // TikTok
  { pattern: /tiktok\.com/i, platform: 'tiktok' },
  { pattern: /vm\.tiktok\.com/i, platform: 'tiktok' },
  
  // Facebook
  { pattern: /facebook\.com/i, platform: 'facebook' },
  { pattern: /fb\.com/i, platform: 'facebook' },
  { pattern: /m\.facebook\.com/i, platform: 'facebook' },
  
  // LinkedIn
  { pattern: /linkedin\.com/i, platform: 'linkedin' },
  { pattern: /lnkd\.in/i, platform: 'linkedin' },
  
  // GitHub
  { pattern: /github\.com/i, platform: 'github' },
  { pattern: /gist\.github\.com/i, platform: 'github' },
  
  // Qiita
  { pattern: /qiita\.com/i, platform: 'qiita' },
  
  // Zenn
  { pattern: /zenn\.dev/i, platform: 'zenn' },
  
  // Spotify
  { pattern: /spotify\.com/i, platform: 'spotify' },
  { pattern: /spoti\.fi/i, platform: 'spotify' },
  
  // Apple Music
  { pattern: /music\.apple\.com/i, platform: 'applemusic' },
  
  // Amazon
  { pattern: /amazon\.co\.jp/i, platform: 'amazon' },
  { pattern: /amazon\.com/i, platform: 'amazon' },
  { pattern: /amzn\.to/i, platform: 'amazon' },
  
  // 楽天
  { pattern: /rakuten\.co\.jp/i, platform: 'rakuten' },
  { pattern: /item\.rakuten\.co\.jp/i, platform: 'rakuten' },
  
  // Medium
  { pattern: /medium\.com/i, platform: 'medium' },
  
  // Reddit
  { pattern: /reddit\.com/i, platform: 'reddit' },
  { pattern: /redd\.it/i, platform: 'reddit' },
  
  // Discord
  { pattern: /discord\.com/i, platform: 'discord' },
  { pattern: /discord\.gg/i, platform: 'discord' },
  
  // Slack
  { pattern: /slack\.com/i, platform: 'slack' },
  { pattern: /\.slack\.com/i, platform: 'slack' },
  
  // Figma
  { pattern: /figma\.com/i, platform: 'figma' },
  
  // Canva
  { pattern: /canva\.com/i, platform: 'canva' },
  
  // Pinterest
  { pattern: /pinterest\.com/i, platform: 'pinterest' },
  { pattern: /pin\.it/i, platform: 'pinterest' },
  
  // Wikipedia
  { pattern: /wikipedia\.org/i, platform: 'wikipedia' },
];

/**
 * URLからプラットフォームを自動検出
 * @param url 検出対象のURL
 * @returns プラットフォーム情報またはnull
 */
export function detectPlatform(url: string): PlatformInfo | null {
  if (!url) return null;

  try {
    // URLの正規化
    const normalizedUrl = url.toLowerCase().trim();
    
    // パターンマッチング
    for (const { pattern, platform } of URL_PATTERNS) {
      if (pattern.test(normalizedUrl)) {
        const platformInfo = PLATFORMS[platform];
        if (platformInfo) {
          return platformInfo;
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Platform detection error:', error);
    return null;
  }
}

/**
 * プラットフォーム名からタグ名を生成
 * @param platformInfo プラットフォーム情報
 * @returns タグ名
 */
export function generatePlatformTagName(platformInfo: PlatformInfo): string {
  return platformInfo.displayName;
}

/**
 * デフォルトで提供するプラットフォームタグ一覧を取得
 * @returns デフォルトプラットフォームタグ名の配列
 */
export function getDefaultPlatformTags(): string[] {
  // よく使われるプラットフォームのみをデフォルトとして提供
  const defaultPlatforms = [
    'Instagram',
    'X (Twitter)', 
    'YouTube',
    'Google Maps',
    'note',
    'Notion',
    'TikTok',
    'GitHub',
    'Qiita',
    'Zenn',
    'Amazon',
    'Netflix',
    'Medium',
    'Wikipedia'
  ];
  
  return defaultPlatforms;
}

/**
 * プラットフォーム情報の一覧を取得
 * @returns 全プラットフォーム情報
 */
export function getAllPlatforms(): PlatformInfo[] {
  return Object.values(PLATFORMS);
}

/**
 * カテゴリ別のプラットフォーム一覧を取得
 * @param category カテゴリ
 * @returns 指定カテゴリのプラットフォーム一覧
 */
export function getPlatformsByCategory(category: PlatformInfo['category']): PlatformInfo[] {
  return Object.values(PLATFORMS).filter(platform => platform.category === category);
} 
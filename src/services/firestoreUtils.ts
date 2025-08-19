import { Timestamp } from 'firebase/firestore';
import { Link } from '../types';

// コレクション名
export const COLLECTIONS = {
  USERS: 'users',
  LINKS: 'links',
  TAGS: 'tags',
  FOLDERS: 'folders',
  SEARCH_HISTORY: 'searchHistory',
  APP_SETTINGS: 'appSettings',

} as const;

// Firestoreデータを安全なLinkオブジェクトに変換
export const convertToLink = (doc: any): Link => {
  const data = doc.data();
  
  // serverTimestamp()の値がまだ解決されていない場合のチェック
  if (!data || !data.url) {
    console.warn('⚠️ convertToLink: 不完全なドキュメント（URL必須）', {
      id: doc.id,
      hasTitle: !!data?.title,
      hasUrl: !!data?.url,
      hasUserId: !!data?.userId,
      createdAt: data?.createdAt,
      rawCreatedAt: data?.createdAt?.toString(),
      isServerTimestamp: data?.createdAt === null || data?.createdAt?.constructor?.name === 'FieldValue'
    });
  }
  
  // serverTimestamp()が未解決の場合でも、基本的な情報があれば処理を続行
  if (data?.url && data?.userId) {
    console.log('✅ convertToLink: 基本情報あり、変換続行', {
      id: doc.id,
      url: data.url.slice(0, 50) + '...',
      title: data.title?.slice(0, 30) + '...' || 'タイトル未取得'
    });
  }
  
  return {
    ...data,
    id: doc.id,
    title: data.title || data.url || 'タイトルなし', // フォールバック
    url: data.url || '', // 必須フィールド
    tagIds: data.tagIds || [], // tagIdsが未定義の場合は空配列に
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
    lastAccessedAt: data.lastAccessedAt?.toDate(),
    expiresAt: data.expiresAt?.toDate() || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // デフォルト7日後
    isRead: data.isRead || false,
    isExpired: data.isExpired || false,
    notificationsSent: data.notificationsSent || {
      threeDays: false,
      oneDay: false,
      oneHour: false,
    },
  } as Link;
};


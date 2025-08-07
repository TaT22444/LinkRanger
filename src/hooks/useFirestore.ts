import { useState, useEffect, useCallback } from 'react';
import { 
  Link, 
  Tag, 
  Folder, 
  LinkFilter, 
  LinkSort, 
  PaginatedResponse,
  LinkWithTags 
} from '../types';
import { 
  linkService, 
  tagService,
  folderService, 
  userService 
} from '../services';

// 🚀 グローバルキャッシュシステム
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  isSubscribed: boolean;
}

const globalCache = {
  links: new Map<string, CacheEntry<Link[]>>(),
  tags: new Map<string, CacheEntry<Tag[]>>(),
  activeSubscriptions: new Map<string, () => void>()
};

// キャッシュ設定
const CACHE_CONFIG = {
  CACHE_DURATION: 2 * 60 * 1000, // 2分間キャッシュ
  REALTIME_THRESHOLD: 5, // 5人以上のアクティブユーザーでリアルタイム停止
  MAX_CACHE_SIZE: 50 // 最大50ユーザーのキャッシュ保持
};

// キャッシュ管理ユーティリティ
const cacheUtils = {
  isValid<T>(entry: CacheEntry<T> | undefined): boolean {
    if (!entry) return false;
    return (Date.now() - entry.timestamp) < CACHE_CONFIG.CACHE_DURATION;
  },
  
  shouldUseRealtime(): boolean {
    return globalCache.activeSubscriptions.size < CACHE_CONFIG.REALTIME_THRESHOLD;
  },
  
  cleanupCache<T>(cache: Map<string, CacheEntry<T>>): void {
    if (cache.size > CACHE_CONFIG.MAX_CACHE_SIZE) {
      const entries = Array.from(cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = entries.slice(0, cache.size - CACHE_CONFIG.MAX_CACHE_SIZE);
      toRemove.forEach(([key]) => cache.delete(key));
    }
  }
};

// ===== リンク関連のHooks =====
export const useLinks = (
  userId: string | null,
  filter?: LinkFilter,
  sort?: LinkSort
) => {
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLinks([]);
      setLoading(false);
      return;
    }

    const cacheKey = `${userId}-${JSON.stringify(filter)}-${JSON.stringify(sort)}`;
    console.log('🔄 useLinks: 初期化', {
      userId,
      cacheKey: cacheKey.slice(0, 20) + '...',
      shouldUseRealtime: cacheUtils.shouldUseRealtime(),
      activeSubscriptions: globalCache.activeSubscriptions.size
    });

    // キャッシュチェック
    const cachedEntry = globalCache.links.get(cacheKey);
    if (cacheUtils.isValid(cachedEntry)) {
      console.log('💾 useLinks: キャッシュヒット', {
        linksCount: cachedEntry!.data.length,
        ageMinutes: Math.round((Date.now() - cachedEntry!.timestamp) / (1000 * 60))
      });
      setLinks(cachedEntry!.data);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    // リアルタイム監視 vs 一回限り読み取りの選択
    if (cacheUtils.shouldUseRealtime()) {
      console.log('📡 useLinks: リアルタイム監視開始', {
        userId,
        activeSubscriptions: globalCache.activeSubscriptions.size
      });

      const unsubscribe = linkService.subscribeToUserLinks(
        userId,
        (newLinks) => {
          setLinks(currentLinks => {
            const previousCount = currentLinks.length;
            const newCount = newLinks.length;
            
            console.log('📥 useLinks: リアルタイム更新受信', {
              userId,
              previousCount,
              newCount,
              hasNewLinks: newCount > previousCount,
              timestamp: new Date().toISOString(),
              firebaseIds: newLinks.map(l => l.id).slice(0, 5),
              currentIds: currentLinks.map(l => l.id).slice(0, 5)
            });
            
            // 🚀 オプティミスティック更新との重複を検知・解決
            const mergedLinks = newLinks.map(firebaseLink => {
              // ローカルのオプティミスティック更新されたリンクを探す
              const localLink = currentLinks.find(local => local.id === firebaseLink.id);
              
              if (localLink && localLink.status === 'processing' && firebaseLink.status === 'processing') {
                // ローカルのオプティミスティック更新を保持（より新しい状態の可能性）
                console.log('🔄 useLinks: オプティミスティック更新を保持', {
                  id: firebaseLink.id,
                  localTitle: localLink.title,
                  firebaseTitle: firebaseLink.title
                });
                return localLink;
              }
              
              return firebaseLink;
            });
            
            console.log('📊 useLinks: リアルタイム更新統合完了', {
              previousCount,
              firebaseCount: newLinks.length,
              mergedCount: mergedLinks.length
            });
            
            return mergedLinks;
          });
          
          setLoading(false);
          setError(null);
          
          // キャッシュ更新
          globalCache.links.set(cacheKey, {
            data: newLinks,
            timestamp: Date.now(),
            isSubscribed: true
          });
          cacheUtils.cleanupCache(globalCache.links);
        },
        filter,
        sort
      );

      // サブスクリプション管理
      globalCache.activeSubscriptions.set(cacheKey, unsubscribe);

      // クリーンアップ
      return () => {
        console.log('🧹 useLinks: リアルタイム監視停止', {
          userId,
          remainingSubscriptions: globalCache.activeSubscriptions.size - 1
        });
        unsubscribe();
        globalCache.activeSubscriptions.delete(cacheKey);
      };
    } else {
      // 一回限り読み取り（高負荷時）
      console.log('📖 useLinks: 一回限り読み取り（高負荷対応）', {
        userId,
        activeSubscriptions: globalCache.activeSubscriptions.size,
        threshold: CACHE_CONFIG.REALTIME_THRESHOLD
      });

      const fetchLinks = async () => {
        try {
          const result = await linkService.getUserLinks(userId, filter, sort, 100);
          console.log('📥 useLinks: 一回限り読み取り完了', {
            userId,
            linksCount: result.data.length,
            strategy: 'one_time_read'
          });
          
          setLinks(result.data);
          setLoading(false);
          setError(null);
          
          // キャッシュ保存
          globalCache.links.set(cacheKey, {
            data: result.data,
            timestamp: Date.now(),
            isSubscribed: false
          });
          cacheUtils.cleanupCache(globalCache.links);
        } catch (err) {
          console.error('❌ useLinks: 読み取りエラー', err);
          setError(err instanceof Error ? err.message : 'リンクの読み込みに失敗しました');
          setLoading(false);
        }
      };

      fetchLinks();
    }
  }, [userId, filter, sort]);

  const createLink = useCallback(async (linkData: Omit<Link, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      console.log('🚀 useLinks: createLink開始', {
        url: linkData.url,
        title: linkData.title,
        currentLinksCount: links.length
      });
      
      const linkId = await linkService.createLink(linkData);
      
      console.log('✅ useLinks: createLink完了', {
        linkId,
        url: linkData.url,
        title: linkData.title
      });
      
      // 🚀 即座にローカル状態を更新（オプティミスティック更新）
      const optimisticLink: Link = {
        ...linkData,
        id: linkId,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isRead: false,
        isExpired: false,
        notificationsSent: {
          threeDays: false,
          oneDay: false,
          oneHour: false,
        },
      };
      
      console.log('🔄 useLinks: オプティミスティック更新実行', {
        linkId: optimisticLink.id,
        currentCount: links.length,
        newCount: links.length + 1
      });
      
      // ローカル状態を即座に更新
      setLinks(prevLinks => {
        // 既に存在するかチェック（重複防止）
        const exists = prevLinks.some(link => link.id === linkId);
        if (exists) {
          console.log('⚠️ useLinks: リンクが既に存在するため、重複追加をスキップ', { linkId });
          return prevLinks;
        }
        
        const newLinks = [optimisticLink, ...prevLinks];
        console.log('📝 useLinks: ローカル状態更新完了', {
          previousCount: prevLinks.length,
          newCount: newLinks.length,
          addedLinkId: linkId
        });
        return newLinks;
      });
      
      return linkId;
    } catch (err) {
      console.error('❌ useLinks: createLink エラー', err);
      setError(err instanceof Error ? err.message : 'Failed to create link');
      throw err;
    }
  }, [links]);

  const updateLink = useCallback(async (linkId: string, updates: Partial<Link>) => {
    try {
      await linkService.updateLink(linkId, updates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update link');
      throw err;
    }
  }, []);

  const deleteLink = useCallback(async (linkId: string, userId: string) => {
    try {
      await linkService.deleteLink(linkId, userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete link');
      throw err;
    }
  }, []);

  return {
    links,
    loading,
    error,
    createLink,
    updateLink,
    deleteLink,
  };
};

// ===== タグ関連のHooks =====
export const useTags = (userId: string | null) => {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setTags([]);
      setLoading(false);
      return;
    }

    const cacheKey = `tags-${userId}`;
    console.log('🔄 useTags: 初期化', {
      userId,
      shouldUseRealtime: cacheUtils.shouldUseRealtime(),
      activeSubscriptions: globalCache.activeSubscriptions.size
    });

    // キャッシュチェック
    const cachedEntry = globalCache.tags.get(cacheKey);
    if (cacheUtils.isValid(cachedEntry)) {
      console.log('💾 useTags: キャッシュヒット', {
        tagsCount: cachedEntry!.data.length,
        ageMinutes: Math.round((Date.now() - cachedEntry!.timestamp) / (1000 * 60))
      });
      setTags(cachedEntry!.data);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    // リアルタイム監視 vs 一回限り読み取りの選択
    if (cacheUtils.shouldUseRealtime()) {
      console.log('📡 useTags: リアルタイム監視開始', {
        userId,
        activeSubscriptions: globalCache.activeSubscriptions.size
      });

      try {
        const unsubscribe = tagService.subscribeToUserTags(
          userId,
          (newTags) => {
            console.log('📥 useTags: リアルタイム更新受信', {
              userId,
              tagsCount: newTags.length
            });
            
            setTags(newTags);
            setLoading(false);
            setError(null);
            
            // キャッシュ更新
            globalCache.tags.set(cacheKey, {
              data: newTags,
              timestamp: Date.now(),
              isSubscribed: true
            });
            cacheUtils.cleanupCache(globalCache.tags);
          }
        );

        // サブスクリプション管理
        globalCache.activeSubscriptions.set(cacheKey, unsubscribe);

        // クリーンアップ
        return () => {
          console.log('🧹 useTags: リアルタイム監視停止', {
            userId,
            remainingSubscriptions: globalCache.activeSubscriptions.size - 1
          });
          unsubscribe();
          globalCache.activeSubscriptions.delete(cacheKey);
        };
      } catch (err) {
        console.error('❌ useTags: リアルタイム監視エラー', err);
        setError(err instanceof Error ? err.message : 'Failed to subscribe to tags');
        setLoading(false);
      }
    } else {
      // 一回限り読み取り（高負荷時）
      console.log('📖 useTags: 一回限り読み取り（高負荷対応）', {
        userId,
        activeSubscriptions: globalCache.activeSubscriptions.size,
        threshold: CACHE_CONFIG.REALTIME_THRESHOLD
      });

      const fetchTags = async () => {
        try {
          // 直接的なタグ取得（リアルタイムなし）
          const tagsResult = await tagService.getUserTags(userId);
          console.log('📥 useTags: 一回限り読み取り完了', {
            userId,
            tagsCount: tagsResult.length,
            strategy: 'one_time_read'
          });
          
          setTags(tagsResult);
          setLoading(false);
          setError(null);
          
          // キャッシュ保存
          globalCache.tags.set(cacheKey, {
            data: tagsResult,
            timestamp: Date.now(),
            isSubscribed: false
          });
          cacheUtils.cleanupCache(globalCache.tags);
        } catch (err) {
          console.error('❌ useTags: 読み取りエラー', err);
          setError(err instanceof Error ? err.message : 'タグの読み込みに失敗しました');
          setLoading(false);
        }
      };

      fetchTags();
    }
  }, [userId]);

  const createOrGetTag = useCallback(async (tagName: string, type: 'manual' | 'ai' | 'recommended' = 'manual') => {
    if (!userId) return '';
    
    try {
      const tagId = await tagService.createOrGetTag(userId, tagName, type);
      return tagId;
    } catch (err) {
      console.error('useTags: error creating tag:', err);
      setError(err instanceof Error ? err.message : 'Failed to create tag');
      throw err;
    }
  }, [userId]);

  const deleteTag = useCallback(async (tagId: string) => {
    if (!userId) return;
    
    try {
      await tagService.deleteTag(userId, tagId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete tag');
      throw err;
    }
  }, [userId]);

  const generateRecommendedTags = useCallback(async () => {
    if (!userId) return [];
    
    try {
      return await tagService.generateRecommendedTags(userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate recommended tags');
      return [];
    }
  }, [userId]);

  return {
    tags,
    loading,
    error,
    createOrGetTag,
    deleteTag,
    generateRecommendedTags,
  };
};

// ===== リンクとタグを結合したHook =====
export const useLinksWithTags = (userId: string | null) => {
  const [linksWithTags, setLinksWithTags] = useState<LinkWithTags[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLinksWithTags = useCallback(async () => {
    if (!userId) {
      setLinksWithTags([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await linkService.getLinksWithTags(userId);
      setLinksWithTags(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch links with tags');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchLinksWithTags();
  }, [fetchLinksWithTags]);

  return {
    linksWithTags,
    loading,
    error,
    refetch: fetchLinksWithTags,
  };
};

// ===== フォルダ関連のHooks =====
export const useFolders = (userId: string | null) => {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFolders = useCallback(async () => {
    if (!userId) {
      setFolders([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const userFolders = await folderService.getUserFolders(userId);
      setFolders(userFolders);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch folders');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchFolders();
  }, [fetchFolders]);

  const createFolder = useCallback(async (folderData: Omit<Folder, 'id' | 'createdAt' | 'updatedAt' | 'linkCount'>) => {
    try {
      const folderId = await folderService.createFolder(folderData);
      await fetchFolders(); // リフレッシュ
      return folderId;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create folder');
      throw err;
    }
  }, [fetchFolders]);

  const deleteFolder = useCallback(async (folderId: string, userId: string) => {
    try {
      await folderService.deleteFolder(folderId, userId);
      await fetchFolders(); // リフレッシュ
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete folder');
      throw err;
    }
  }, [fetchFolders]);

  return {
    folders,
    loading,
    error,
    createFolder,
    deleteFolder,
    refetch: fetchFolders,
  };
};

// ===== ページネーション対応のリンクHook =====
export const usePaginatedLinks = (
  userId: string | null,
  filter?: LinkFilter,
  sort?: LinkSort,
  pageSize: number = 20
) => {
  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<any>(null);

  const loadLinks = useCallback(async (isInitial: boolean = false) => {
    if (!userId || loading) return;

    try {
      setLoading(true);
      setError(null);

      const result = await linkService.getUserLinks(
        userId,
        filter,
        sort,
        pageSize,
        isInitial ? undefined : lastDoc
      );

      if (isInitial) {
        setLinks(result.data);
      } else {
        setLinks(prev => [...prev, ...result.data]);
      }

      setHasMore(result.hasMore);
      setLastDoc(result.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load links');
    } finally {
      setLoading(false);
    }
  }, [userId, filter, sort, pageSize, lastDoc, loading]);

  const loadMore = useCallback(() => {
    if (hasMore && !loading) {
      loadLinks(false);
    }
  }, [hasMore, loading, loadLinks]);

  const refresh = useCallback(() => {
    setLastDoc(null);
    setHasMore(true);
    loadLinks(true);
  }, [loadLinks]);

  useEffect(() => {
    refresh();
  }, [userId, filter, sort]);

  return {
    links,
    loading,
    error,
    hasMore,
    loadMore,
    refresh,
  };
};

// ===== 統計情報Hook =====
export const useUserStats = (userId: string | null) => {
  const [stats, setStats] = useState({
    totalLinks: 0,
    totalTags: 0,
    totalFolders: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setStats({ totalLinks: 0, totalTags: 0, totalFolders: 0 });
      setLoading(false);
      return;
    }

    const fetchStats = async () => {
      try {
        setLoading(true);
        const user = await userService.getUser(userId);
        if (user?.stats) {
          setStats({
            totalLinks: user.stats.totalLinks || 0,
            totalTags: user.stats.totalTags || 0,
            totalFolders: (user.stats as any).totalFolders || 0,
          });
        }
      } catch (err) {
        console.error('Failed to fetch user stats:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [userId]);

  return { stats, loading };
}; 
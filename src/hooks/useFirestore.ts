import { useState, useEffect, useCallback } from 'react';
import { 
  Link, 
  Tag, 
  Folder, 
  LinkFilter, 
  LinkSort, 
  PaginatedResponse,
  LinkWithTags,
  User 
} from '../types';
import { 
  linkService, 
  tagService,
  folderService, 
  userService 
} from '../services';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  getDoc, 
  doc 
} from 'firebase/firestore';
import { db } from '../config/firebase';

// 🚀 グローバルキャッシュシステム
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  isSubscribed: boolean;
}

export const globalCache = {
  links: new Map<string, CacheEntry<Link[]>>(),
  tags: new Map<string, CacheEntry<Tag[]>>(),
  users: new Map<string, CacheEntry<User>>(),
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

type UseLinksOptions = {
  initialLimit?: number;         // 初回ロード件数（デフォルト20）
  pageSize?: number;             // 追加ロード件数（デフォルト10）
  forcePaginated?: boolean;      // trueでリアルタイム購読を使わず常にページング
};

// ===== リンク関連のHooks =====
export const useLinks = (
  userId: string | null,
  // 第2引数は LinkFilter でも UseLinksOptions でもOK
  filterOrOptions?: LinkFilter | UseLinksOptions,
  // 第3引数は LinkSort でも UseLinksOptions でもOK
  sortOrOptions?: LinkSort | UseLinksOptions
) => {
  // ★ 引数の解釈（後方互換）
  const options: UseLinksOptions = {
    ...(typeof filterOrOptions === 'object' && ('initialLimit' in filterOrOptions || 'pageSize' in filterOrOptions || 'forcePaginated' in filterOrOptions)
      ? filterOrOptions as UseLinksOptions
      : {}),
    ...(typeof sortOrOptions === 'object' && ('initialLimit' in sortOrOptions || 'pageSize' in sortOrOptions || 'forcePaginated' in sortOrOptions)
      ? sortOrOptions as UseLinksOptions
      : {}),
  };

  const filter: LinkFilter | undefined =
    (typeof filterOrOptions === 'object' && !('initialLimit' in filterOrOptions) && !('pageSize' in filterOrOptions) && !('forcePaginated' in filterOrOptions))
      ? filterOrOptions as LinkFilter
      : undefined;

  const sort: LinkSort | undefined =
    (typeof sortOrOptions === 'object' && !('initialLimit' in sortOrOptions) && !('pageSize' in sortOrOptions) && !('forcePaginated' in sortOrOptions))
      ? sortOrOptions as LinkSort
      : undefined;

  // ✅ オプションで上書き（デフォルトは従来値）
  const INITIAL_PAGE_SIZE = options.initialLimit ?? 20;
  const LOAD_MORE_PAGE_SIZE = options.pageSize ?? 10;

  const [links, setLinks] = useState<Link[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    if (!userId) {
      setLinks([]);
      setLoading(false);
      setHasMore(true);
      setNextCursor(undefined);
      return;
    }

    // オプションもキャッシュキーに含める（初期/追加件数が違うキャッシュ混在を避ける）
    const optionsKey = JSON.stringify({
      il: INITIAL_PAGE_SIZE,
      ps: LOAD_MORE_PAGE_SIZE,
      fp: !!options.forcePaginated
    });
    const cacheKey = `${userId}-${JSON.stringify(filter)}-${JSON.stringify(sort)}-${optionsKey}`;



    // キャッシュチェック
    const cachedEntry = globalCache.links.get(cacheKey);
    if (cacheUtils.isValid(cachedEntry)) {

      
      setLinks(cachedEntry!.data);
      setLoading(false);
      setError(null);
      setHasMore(false);
      setNextCursor(undefined);
      return;
    }

    setLoading(true);
    setError(null);
    setHasMore(true);
    setNextCursor(undefined);

    const useRealtime = cacheUtils.shouldUseRealtime() && !options.forcePaginated;

    if (useRealtime) {

      const unsubscribe = linkService.subscribeToUserLinks(
        userId,
        (newLinks) => {

          
          setLinks(currentLinks => {
            const mergedLinks = newLinks.map(firebaseLink => {
              const local = currentLinks.find(l => l.id === firebaseLink.id);
              if (local && local.status === 'processing' && firebaseLink.status === 'processing') {
    
                return local;
              }
              return firebaseLink;
            });
            

            
            return mergedLinks;
          });

          setLoading(false);
          setError(null);
          setHasMore(false);
          setNextCursor(undefined);

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

      globalCache.activeSubscriptions.set(cacheKey, unsubscribe);
      return () => {
        unsubscribe();
        globalCache.activeSubscriptions.delete(cacheKey);
      };
    } else {

      const fetchLinks = async () => {
        try {
          const result = await linkService.getUserLinks(userId, filter, sort, INITIAL_PAGE_SIZE);
          setLinks(result.data);
          setLoading(false);
          setError(null);
          setHasMore(result.hasMore);
          setNextCursor(result.nextCursor);

          globalCache.links.set(cacheKey, {
            data: result.data,
            timestamp: Date.now(),
            isSubscribed: false
          });
          cacheUtils.cleanupCache(globalCache.links);
        } catch (err) {
          console.error('❌ useLinks: initial fetch error', err);
          setError(err instanceof Error ? err.message : 'リンクの読み込みに失敗しました');
          setLoading(false);
        }
      };
      fetchLinks();
    }
  // 依存に options も入れる
  }, [userId, JSON.stringify(filter), JSON.stringify(sort), options.initialLimit, options.pageSize, options.forcePaginated]);

  // 無限スクロール
  const loadMore = useCallback(async () => {
    if (!userId || !hasMore || isLoadingMore || loading) return;

    setIsLoadingMore(true);
    try {
      const result = await linkService.getUserLinks(
        userId,
        filter,
        sort,
        LOAD_MORE_PAGE_SIZE,
        nextCursor
      );
      setLinks(prev => [...prev, ...result.data]);
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
    } catch (err) {
      console.error('❌ useLinks: loadMore error', err);
      setError(err instanceof Error ? err.message : '追加読み込みに失敗しました');
    } finally {
      setIsLoadingMore(false);
    }
  }, [userId, filter, sort, hasMore, isLoadingMore, loading, nextCursor, LOAD_MORE_PAGE_SIZE]);

  const createLink = useCallback(/* 既存のまま */ async (linkData: Omit<Link, 'id'|'createdAt'|'updatedAt'>) => {
    try {

      
      const linkId = await linkService.createLink(linkData);

      
      const optimisticLink: Link = {
        ...linkData,
        id: linkId,
        createdAt: new Date(),
        updatedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        isRead: false,
        isExpired: false,
        notificationsSent: { unused3Days: false },
      };
      
      setLinks(prev => {
        if (prev.some(l => l.id === linkId)) {
          return prev;
        }

        const newLinks = [optimisticLink, ...prev];
        

        
        return newLinks;
      });
      
      return linkId;
    } catch (err) {
      console.error('❌ useLinks: createLink失敗', err);
      setError(err instanceof Error ? err.message : 'Failed to create link');
      throw err;
    }
  }, [userId, filter, sort, options]);

  const updateLink = useCallback(async (linkId: string, updates: Partial<Link>) => {
    // Optimistic Update: 即座にUIのリンクを更新
    const originalLinks = links;
    setLinks(prev => prev.map(link => 
      link.id === linkId 
        ? { ...link, ...updates, updatedAt: new Date() }
        : link
    ));
    
    try {
      await linkService.updateLink(linkId, updates);
    } catch (err) {
      // エラー時にロールバック
      setLinks(originalLinks);
      setError(err instanceof Error ? err.message : 'Failed to update link');
      throw err;
    }
  }, [links]);

  const deleteLink = useCallback(async (linkId: string, userId: string) => {
    // Optimistic Update: 即座にUIからリンクを削除
    const originalLinks = links;
    setLinks(prev => prev.filter(link => link.id !== linkId));
    
    try {
      await linkService.deleteLink(linkId, userId);
    } catch (err) {
      // エラー時にロールバック
      setLinks(originalLinks);
      setError(err instanceof Error ? err.message : 'Failed to delete link');
      throw err;
    }
  }, [links]);

  const bulkDeleteLinks = useCallback(async (linkIds: string[], userId: string) => {
    // Optimistic Update: 即座にUIからリンクを削除
    const originalLinks = links;
    setLinks(prev => prev.filter(link => !linkIds.includes(link.id)));
    
    try {
      // batchServiceを使用して一括削除
      const { batchService } = await import('../services/firestoreService');
      await batchService.bulkDeleteLinks(linkIds, userId);
    } catch (err) {
      // エラー時にロールバック
      setLinks(originalLinks);
      setError(err instanceof Error ? err.message : 'Failed to bulk delete links');
      throw err;
    }
  }, [links]);

  return {
    links,
    loading,
    error,
    createLink,
    updateLink,
    deleteLink,
    bulkDeleteLinks,
    hasMore,
    isLoadingMore,
    loadMore,
  };
};;

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


    // キャッシュチェック
    const cachedEntry = globalCache.tags.get(cacheKey);
    if (cacheUtils.isValid(cachedEntry)) {

      setTags(cachedEntry!.data);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    // リアルタイム監視 vs 一回限り読み取りの選択
    if (cacheUtils.shouldUseRealtime()) {


      try {
        const unsubscribe = tagService.subscribeToUserTags(
          userId,
          (newTags) => {

            
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


      const fetchTags = async () => {
        try {
          // 直接的なタグ取得（リアルタイムなし）
          const tagsResult = await tagService.getUserTags(userId);

          
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

  const createOrGetTag = useCallback(async (tagName: string, type: 'manual' | 'ai' = 'manual') => {
    if (!userId) throw new Error('User ID is not available');

    const normalizedTagName = tagName.trim();
    if (!normalizedTagName) throw new Error('Tag name cannot be empty');

    // 既存のタグを検索（大文字小文字を区別しない）
    const existingTag = tags.find(tag => tag.name.toLowerCase() === normalizedTagName.toLowerCase());
    if (existingTag) {
      return existingTag.id;
    }

    // 楽観的更新用の仮IDとオブジェクト
    const optimisticId = `optimistic-${Date.now()}`;
    const newTag: Tag = {
      id: optimisticId,
      name: normalizedTagName,
      userId: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastUsedAt: new Date(),
      firstUsedAt: new Date(),
      type: type,
      linkCount: 0,
    };

    // 楽観的更新：即座にUIに反映
    setTags(prev => [...prev, newTag]);

    try {
      // サーバーにタグ作成をリクエスト
      const actualTagId = await tagService.createOrGetTag(userId, normalizedTagName, type);
      
      // サーバーから返された実際のIDでUIを更新
      setTags(prev => prev.map(tag => 
        tag.id === optimisticId ? { ...newTag, id: actualTagId } : tag
      ));
      
      return actualTagId;
    } catch (err) {
      console.error('useTags: error creating tag, rolling back optimistic update', err);
      // エラー時に楽観的更新をロールバック
      setTags(prev => prev.filter(tag => tag.id !== optimisticId));
      
      // エラーを呼び出し元に伝える
      setError(err instanceof Error ? err.message : 'Failed to create tag');
      throw err;
    }
  }, [userId, tags]);

  const deleteTag = useCallback(async (tagId: string) => {
    if (!userId) return;
    
    // Optimistic Update: 即座にUIからタグを削除
    const originalTags = tags;
    setTags(prev => prev.filter(tag => tag.id !== tagId));
    
    try {
      await tagService.deleteTag(userId, tagId);
    } catch (err) {
      // エラー時にロールバック
      setTags(originalTags);
      setError(err instanceof Error ? err.message : 'Failed to delete tag');
      throw err;
    }
  }, [userId, tags]);

  return {
    tags,
    loading,
    error,
    createOrGetTag,
    deleteTag,
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
    if (!userId || (loading && isInitial) || (!hasMore && !isInitial) ) return;

    setLoading(true);
    setError(null);

    try {
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
        setLinks(prev => [...prev, ...result.data.filter(newItem => !prev.some(prevItem => prevItem.id === newItem.id))]);
      }

      setHasMore(result.hasMore);
      setLastDoc(result.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load links');
    } finally {
      setLoading(false);
    }
  }, [userId, filter, sort, pageSize, lastDoc, loading, hasMore]);

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
    if (userId) {
      refresh();
    } else {
      setLinks([]);
      setHasMore(true);
      setLastDoc(null);
    }
  }, [userId, JSON.stringify(filter), JSON.stringify(sort)]);

  const createLink = useCallback(async (linkData: Omit<Link, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!userId) throw new Error("User not authenticated");
    
    const optimisticLink: Link = {
      ...linkData,
      id: `optimistic-${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      isRead: false,
      isExpired: false,
              notificationsSent: { unused3Days: false },
    };
    
    setLinks(prevLinks => [optimisticLink, ...prevLinks]);

    try {
      const linkId = await linkService.createLink(linkData);
      setLinks(prevLinks => prevLinks.map(link => 
        link.id === optimisticLink.id ? { ...optimisticLink, id: linkId } : link
      ));
      return linkId;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create link');
      setLinks(prevLinks => prevLinks.filter(link => link.id !== optimisticLink.id));
      throw err;
    }
  }, [userId]);

  const updateLink = useCallback(async (linkId: string, updates: Partial<Link>) => {
    const originalLinks = links;
    setLinks(prevLinks => prevLinks.map(link => 
      link.id === linkId ? { ...link, ...updates } : link
    ));
    try {
      await linkService.updateLink(linkId, updates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update link');
      setLinks(originalLinks);
      throw err;
    }
  }, [links]);

  const deleteLink = useCallback(async (linkId: string, userId: string) => {
    const originalLinks = links;
    setLinks(prevLinks => prevLinks.filter(link => link.id !== linkId));
    try {
      await linkService.deleteLink(linkId, userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete link');
      setLinks(originalLinks);
      throw err;
    }
  }, [links]);

  return {
    links,
    loading,
    error,
    hasMore,
    loadMore,
    refresh,
    createLink,
    updateLink,
    deleteLink,
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

// ===== ユーザー情報関連のHooks =====
export const useUser = (userId: string | null) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setUser(null);
      setLoading(false);
      return;
    }

    const cacheKey = `user-${userId}`;

    // キャッシュチェック
    const cachedEntry = globalCache.users?.get(cacheKey);
    if (cacheUtils.isValid(cachedEntry)) {

      setUser(cachedEntry!.data);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    // リアルタイム監視
    if (cacheUtils.shouldUseRealtime()) {


      try {
        const q = query(
          collection(db, 'users'),
          where('__name__', '==', userId)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
          if (snapshot.empty) {
            setUser(null);
            setLoading(false);
            setError('ユーザーが見つかりません');
            return;
          }

          const userDoc = snapshot.docs[0];
          const userData = userDoc.data() as User;
          

          
          setUser(userData);
          setLoading(false);
          setError(null);
          
          // キャッシュ更新
          if (!globalCache.users) {
            globalCache.users = new Map<string, CacheEntry<User>>();
          }
          globalCache.users.set(cacheKey, {
            data: userData,
            timestamp: Date.now(),
            isSubscribed: true
          });
          cacheUtils.cleanupCache(globalCache.users);
        }, (error) => {
          console.error('❌ useUser: リアルタイム監視エラー', error);
          setError(error.message);
          setLoading(false);
        });

        // サブスクリプション管理
        globalCache.activeSubscriptions.set(cacheKey, unsubscribe);

        // クリーンアップ
        return () => {
          
          unsubscribe();
          globalCache.activeSubscriptions.delete(cacheKey);
        };
      } catch (err) {
        console.error('❌ useUser: リアルタイム監視エラー', err);
        setError(err instanceof Error ? err.message : 'Failed to subscribe to user');
        setLoading(false);
      }
    } else {
      // 一回限り読み取り（高負荷時）
      
      const fetchUser = async () => {
        try {
          const userDoc = await getDoc(doc(db, 'users', userId));
          if (userDoc.exists()) {
            const userData = userDoc.data() as User;
            setUser(userData);
            
            // キャッシュ更新
            if (!globalCache.users) {
              globalCache.users = new Map<string, CacheEntry<User>>();
            }
            globalCache.users.set(cacheKey, {
              data: userData,
              timestamp: Date.now(),
              isSubscribed: false
            });
          } else {
            setUser(null);
            setError('ユーザーが見つかりません');
          }
        } catch (err) {
          console.error('❌ useUser: ユーザー取得エラー', err);
          setError(err instanceof Error ? err.message : 'Failed to fetch user');
        } finally {
          setLoading(false);
        }
      };
      
      fetchUser();
    }
  }, [userId]);

  return { user, loading, error };
}; 
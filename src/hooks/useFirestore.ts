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
} from '../services/firestoreService';

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

    setLoading(true);
    setError(null);

    const unsubscribe = linkService.subscribeToUserLinks(
      userId,
      (newLinks) => {
        setLinks(newLinks);
        setLoading(false);
        setError(null); // 成功時はエラーをクリア
      },
      filter,
      sort
    );

    // エラーハンドリング（インデックス構築中など）
    const handleError = (error: any) => {
      console.log('useLinks error:', error);
      if (error?.code === 'failed-precondition') {
        setError('インデックス構築中です。しばらくお待ちください。');
      } else {
        setError(error?.message || 'リンクの読み込みに失敗しました');
      }
      setLoading(false);
    };

    // エラーの場合も処理を継続
    try {
      // unsubscribeは既に設定済み
    } catch (err) {
      handleError(err);
    }

    return unsubscribe;
  }, [userId, filter, sort]);

  const createLink = useCallback(async (linkData: Omit<Link, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const linkId = await linkService.createLink(linkData);
      return linkId;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create link');
      throw err;
    }
  }, []);

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
  console.log('useTags hook called with userId:', userId);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('useTags useEffect called with userId:', userId);
    if (!userId) {
      console.log('useTags: no userId, setting empty state');
      setTags([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('useTags: calling subscribeToUserTags');
      const unsubscribe = tagService.subscribeToUserTags(
        userId,
        (newTags) => {
          console.log('useTags: received tags from subscription:', newTags);
          console.log('useTags: tags count:', newTags.length);
          setTags(newTags);
          setLoading(false);
          setError(null);
        }
      );

      return unsubscribe;
    } catch (err) {
      console.error('useTags: error setting up subscription:', err);
      setError(err instanceof Error ? err.message : 'Failed to subscribe to tags');
      setLoading(false);
    }
  }, [userId]);

  // デバッグログを追加
  console.log('useTags hook state:', { tagsCount: tags.length, loading, error });

  const createOrGetTag = useCallback(async (tagName: string, type: 'manual' | 'ai' | 'recommended' = 'manual') => {
    if (!userId) return '';
    
    try {
      console.log('useTags: creating tag:', tagName, 'type:', type);
      const tagId = await tagService.createOrGetTag(userId, tagName, type);
      console.log('useTags: tag created with ID:', tagId);
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
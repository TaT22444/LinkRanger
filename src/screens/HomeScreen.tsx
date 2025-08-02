import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  FlatList,
  RefreshControl,
  Modal,
  ScrollView,
  Linking,
  Animated,
  TextInput,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { PanGestureHandler, State, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { useLinks, useTags } from '../hooks/useFirestore';
import { LinkCard } from '../components/LinkCard';
import { AddLinkModal } from '../components/AddLinkModal';
import { FloatingActionButton } from '../components/FloatingActionButton';
import { TagFilter } from '../components/TagFilter';
import { ViewModeSelector } from '../components/ViewModeSelector';
import { FolderCard } from '../components/FolderCard';
import { TagGroupCard } from '../components/TagGroupCard';

import { AddTagModal } from '../components/AddTagModal';
import { SearchModal } from '../components/SearchModal';
import { LinkDetailScreen } from './LinkDetailScreen';
import { Link, UserPlan, LinkViewMode, Tag, Folder } from '../types';
import { linkService } from '../services/firestoreService';

import { aiService } from '../services/aiService';
import { metadataService } from '../services/metadataService';

import { AIStatusMonitor } from '../components/AIStatusMonitor';

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { user, logout } = useAuth();
  const { links, loading, error, createLink, updateLink, deleteLink } = useLinks(user?.uid || null);
  const { tags: userTags, createOrGetTag, deleteTag: deleteTagById, generateRecommendedTags } = useTags(user?.uid || null);
  
  const [aiProcessingStatus, setAiProcessingStatus] = useState<{ [key: string]: number }>({
    'demo-processing-1': 0.65 // デモ用の進捗バー
  });
  const [dismissedUntaggedIds, setDismissedUntaggedIds] = useState<Set<string>>(new Set());
  
  const dummyUntaggedLinks = useMemo(() => [
    {
      id: 'dummy-1',
      userId: user?.uid || '',
      url: 'https://example.com/article-1',
      title: 'React Hooksの基礎知識',
      description: 'React Hooksの使い方と基本的なパターンについて',
      status: 'completed' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      tagIds: [],
      isBookmarked: false,
      isArchived: false,
      priority: 'medium' as const,
      isRead: false,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      isExpired: false,
      notificationsSent: { threeDays: false, oneDay: false, oneHour: false }
    },
    {
      id: 'dummy-2',
      userId: user?.uid || '',
      url: 'https://example.com/article-2', 
      title: 'TypeScriptでの型安全な開発',
      description: 'TypeScriptを使った型安全なコードの書き方',
      status: 'completed' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      tagIds: [],
      isBookmarked: false,
      isArchived: false,
      priority: 'high' as const,
      isRead: false,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      isExpired: false,
      notificationsSent: { threeDays: false, oneDay: false, oneHour: false }
    },
  ] as Link[], [user?.uid]);

  const { processingLinks, failedLinks, untaggedLinks } = useMemo(() => {
    const processing = [...links, ...dummyUntaggedLinks].filter(link => aiProcessingStatus[link.id] !== undefined);
    const failed = links.filter(link => link.status === 'error' && link.error?.code === 'QUOTA_EXCEEDED');
    const untagged = dummyUntaggedLinks.filter(link => !dismissedUntaggedIds.has(link.id) && aiProcessingStatus[link.id] === undefined);
    return { processingLinks: processing, failedLinks: failed, untaggedLinks: untagged };
  }, [links, aiProcessingStatus, dummyUntaggedLinks, dismissedUntaggedIds]);
  
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddTagModal, setShowAddTagModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [selectedLink, setSelectedLink] = useState<Link | null>(null);
  
  // インライン検索用の状態
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchMode, setIsSearchMode] = useState(false);

  // 表示モード関連の状態
  const [viewMode, setViewMode] = useState<LinkViewMode>('list');
  const [expandedTagIds, setExpandedTagIds] = useState<Set<string>>(new Set());
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());

  // スワイプジェスチャー用の状態
  const swipeGestureRef = useRef<PanGestureHandler>(null);
  const [isSwipeEnabled, setIsSwipeEnabled] = useState(true);
  const swipeTranslateX = useRef(new Animated.Value(0)).current;
  const lastScrollTime = useRef(0);
  const [isSwipeActive, setIsSwipeActive] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);

  // Animated Header
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerTranslateY = useRef(new Animated.Value(0)).current;
  const lastScrollY = useRef(0);
  const isAnimating = useRef(false); // アニメーション実行中フラグ
  const [staticHeaderHeight, setStaticHeaderHeight] = useState(0);
  const [dynamicHeaderHeight, setDynamicHeaderHeight] = useState(0);

  const listPaddingTop = isSearchMode ? dynamicHeaderHeight : 24;

  // ダミーのユーザープラン（テスト用）
  const userPlan: UserPlan = user?.email === 'test@02.com' ? 'pro' : 'free';

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      Alert.alert('エラー', 'ログアウトに失敗しました');
    }
  };

  const handleAccountPress = () => {
    navigation.navigate('Account');
  };

  const handleAddLink = async (linkData: Partial<Link>) => {
    if (!user?.uid) return;
    
    // ... (URL重複チェックのロジックは変更なし)
    if (linkData.url) {
      try {
        const existingLink = await linkService.findExistingLinkByUrl(user.uid, linkData.url);
        if (existingLink) {
          if (existingLink.isExpired) {
            await linkService.reviveExpiredLink(existingLink.id);
            Alert.alert('復活しました', '以前保存したリンクが見つかりました。新しい期限で復活させました。');
            return;
          } else {
            Alert.alert('すでに保存済み', 'このリンクはすでに保存されています。');
            return;
          }
        }
      } catch (error) {
        // エラーが発生しても新規作成は続行
      }
    }
    
    const fullLinkData = {
      ...linkData,
      userId: user.uid,
      status: 'processing',
      tagIds: linkData.tagIds || [],
      isBookmarked: false,
      isArchived: false,
      priority: 'medium',
    } as Omit<Link, 'id' | 'createdAt' | 'updatedAt'>;
    
    try {
      const newLinkId = await createLink(fullLinkData);
      Alert.alert('✅ 保存完了', 'リンクを保存しました。AIが追加のタグを生成します...');
      
      // 新しく作成した関数を呼び出す
      processAITagging(newLinkId, fullLinkData);

    } catch (error) {
      Alert.alert('エラー', 'リンクの保存に失敗しました');
    }
  };

  const processAITagging = async (linkId: string, linkData: Partial<Link>) => {
    if (!user?.uid) return;

    setAiProcessingStatus(prev => ({ ...prev, [linkId]: 0.1 }));

    try {
      console.log('[AI自動タグ付与] 開始: linkId', linkId, linkData);
      setAiProcessingStatus(prev => ({ ...prev, [linkId]: 0.3 }));

      const metadata = await metadataService.fetchMetadata(linkData.url || '', user.uid);
      console.log('[AI自動タグ付与] メタデータ取得', metadata);
      setAiProcessingStatus(prev => ({ ...prev, [linkId]: 0.6 }));

      const aiResponse = await aiService.generateEnhancedTags(
        metadata,
        user.uid,
        userPlan
      );
      console.log('[AI自動タグ付与] Gemini応答', aiResponse);
      setAiProcessingStatus(prev => ({ ...prev, [linkId]: 0.8 }));

      const finalTagIds: string[] = [...(linkData.tagIds || [])];
      
      for (const tagName of aiResponse.tags) {
        const normalizedTagName = tagName.trim();
        const existingTag = userTags.find(t => t.name.trim().toLowerCase() === normalizedTagName.toLowerCase());
        
        if (existingTag) {
          if (!finalTagIds.includes(existingTag.id)) {
            finalTagIds.push(existingTag.id);
          }
        } else {
          try {
            const newTagId = await handleAddTag(normalizedTagName, 'ai');
            if (newTagId && !finalTagIds.includes(newTagId)) {
              finalTagIds.push(newTagId);
            }
          } catch (error) {
            // タグ作成失敗は許容
          }
        }
      }

      const updateData: Partial<Link> = {
        status: 'completed',
        tagIds: finalTagIds,
        aiAnalysis: {
          sentiment: 'neutral',
          category: 'General',
          keywords: aiResponse.tags,
          confidence: 0.8,
          fromCache: aiResponse.fromCache,
          tokensUsed: aiResponse.tokensUsed,
          cost: aiResponse.cost,
        },
      };

      await updateLink(linkId, updateData);
      console.log('[AI自動タグ付与] 完了: linkId', linkId, updateData);
      
      // ... (Alert表示のロジックは変更なし)
      const userTagCount = (linkData.tagIds || []).length;
      const aiTagCount = finalTagIds.length - userTagCount;
      let message = `🤖 AI分析が完了しました！\n\n`;
      if (userTagCount > 0) message += `👤 ユーザー選択: ${userTagCount}個\n`;
      if (aiTagCount > 0) message += `🤖 AI生成: ${aiTagCount}個\n`;
      message += `\n📊 合計: ${finalTagIds.length}個のタグ\n\n`;
      message += `🏷️ 生成されたタグ: ${aiResponse.tags.join(', ')}\n\n`;
      if (aiResponse.fromCache) {
        message += '💾 キャッシュから取得';
      } else {
        message += `🔥 新規AI分析 (トークン: ${aiResponse.tokensUsed})`;
      }
      Alert.alert('🎉 自動AI分析完了', message);

    } catch (error: any) {
      console.log('[AI自動タグ付与] 失敗: linkId', linkId, error);
      
      // エラーの種類を判定
      const isQuotaError = error.message?.includes('quota') || error.code === 'resource-exhausted';
      const errorCode = isQuotaError ? 'QUOTA_EXCEEDED' : 'AUTO_TAG_GENERATION_FAILED';
      const errorMessage = isQuotaError 
        ? 'AIタグ付けの月間上限に達しました。' 
        : 'AI自動タグ生成中にエラーが発生しました';

      await updateLink(linkId, {
        status: 'error',
        error: {
          message: errorMessage,
          code: errorCode,
          timestamp: new Date()
        }
      });
      
      if (!isQuotaError) {
        Alert.alert('⚠️ AI処理エラー', 'AIタグの自動生成に失敗しましたが、リンクとユーザー選択タグは正常に保存されました。');
      }
    } finally {
      // 処理が完了または失敗したら、進捗表示から削除
      setAiProcessingStatus(prev => {
        const newState = { ...prev };
        delete newState[linkId];
        return newState;
      });
    }
  };

  const handleExecuteAI = (linkId: string) => {
    const link = dummyUntaggedLinks.find(l => l.id === linkId);
    if (link) {
      processAITagging(linkId, link);
      setDismissedUntaggedIds(prev => new Set([...prev, linkId]));
    }
  };

  const handleDismissUntagged = (linkId: string) => {
    setDismissedUntaggedIds(prev => new Set([...prev, linkId]));
  };

  const mockUserPlan = 'free' as UserPlan;
  const mockAiUsageCount = 8;
  const mockAiUsageLimit = 10;
  const canUseAI = mockAiUsageCount < mockAiUsageLimit;

  const handleToggleBookmark = async (link: Link) => {
    try {
      await updateLink(link.id, {
        isBookmarked: !link.isBookmarked,
      });
    } catch (error) {
      Alert.alert('エラー', 'ブックマークの更新に失敗しました');
    }
  };

  const handleDeleteLink = async (link: Link) => {
    Alert.alert(
      '削除確認',
      'このリンクを削除しますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteLink(link.id, user?.uid || '');
            } catch (error) {
              Alert.alert('エラー', 'リンクの削除に失敗しました');
            }
          },
        },
      ]
    );
  };

  const handleOpenExternalLink = async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('エラー', 'このリンクを開くことができません');
      }
    } catch (error) {
      Alert.alert('エラー', 'リンクを開く際にエラーが発生しました');
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      //
    } finally {
      setRefreshing(false);
    }
  };

  const filteredLinks = useMemo(() => {
    if (!links || !Array.isArray(links)) return [];
    
    let filtered = links;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(link => {
        if (link.title.toLowerCase().includes(query)) return true;
        if (link.description?.toLowerCase().includes(query)) return true;
        if (link.url.toLowerCase().includes(query)) return true;
        
        const linkTags = (link.tagIds || []).map(tagId => 
          userTags.find(tag => tag.id === tagId)?.name?.toLowerCase()
        ).filter(Boolean);
        
        return linkTags.some(tagName => tagName?.includes(query));
      });
    }

    if (selectedTagIds.length > 0) {
      filtered = filtered.filter(link => 
        selectedTagIds.some(selectedTagId => 
          link.tagIds?.includes(selectedTagId)
        )
      );
    }

    return filtered;
  }, [links, searchQuery, selectedTagIds, userTags]);

  const handleTagToggle = (tagId: string) => {
    setSelectedTagIds(prev => 
      prev.includes(tagId) 
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
  };

  const handleClearTags = () => {
    setSelectedTagIds([]);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  const handleClearAll = () => {
    setSearchQuery('');
    setSelectedTagIds([]);
  };

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { 
      useNativeDriver: false,
      listener: (event: any) => {
        if (!isSearchMode) return;
        
        const currentScrollY = event.nativeEvent.contentOffset.y;
        const diff = currentScrollY - lastScrollY.current;

        lastScrollTime.current = Date.now();
        setIsSwipeEnabled(false);
        
        setTimeout(() => {
          if (Date.now() - lastScrollTime.current >= 150) {
            setIsSwipeEnabled(true);
          }
        }, 150);

        if (isAnimating.current) return;

        if (currentScrollY <= 0) {
          isAnimating.current = true;
          Animated.timing(headerTranslateY, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            isAnimating.current = false;
          });
        } else if (diff > 5 && currentScrollY > 50) {
          isAnimating.current = true;
          Animated.timing(headerTranslateY, {
            toValue: -dynamicHeaderHeight,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            isAnimating.current = false;
          });
        } else if (diff < -5) {
          isAnimating.current = true;
          Animated.timing(headerTranslateY, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            isAnimating.current = false;
          });
        }

        lastScrollY.current = currentScrollY;
      }
    }
  );

  const handleStaticHeaderLayout = (event: any) => {
    setStaticHeaderHeight(event.nativeEvent.layout.height);
  };

  const handleDynamicHeaderLayout = (event: any) => {
    setDynamicHeaderHeight(event.nativeEvent.layout.height);
  };

  const handleSearchTextChange = (text: string) => {
    setSearchQuery(text);
  };

  const getUserInitial = () => {
    return user?.email?.charAt(0).toUpperCase() || 'U';
  };

  const handleAddTag = async (tagName: string, type: 'manual' | 'ai' | 'recommended' = 'manual') => {
    if (!user?.uid) return '';
    
    try {
      const tagId = await createOrGetTag(tagName, type);
      return tagId;
    } catch (error) {
      Alert.alert('エラー', 'タグの作成に失敗しました');
      throw error;
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    if (!user?.uid) return;
    
    try {
      await deleteTagById(tagId);
    } catch (error) {
      Alert.alert('エラー', 'タグの削除に失敗しました');
    }
  };

  const handleDeleteTagByName = async (tagName: string) => {
    if (!user?.uid) return;
    
    const tag = userTags.find(t => t.name === tagName);
    if (tag) {
      await handleDeleteTag(tag.id);
    }
  };

  const renderLinkItem = ({ item }: { item: Link }) => (
    <View style={styles.linkItem}>
      <LinkCard
        key={item.id}
        link={item}
        tags={userTags}
        onPress={() => {
          setSelectedLink(item);
          setShowDetailModal(true);
        }}
        onToggleBookmark={() => {
          //
        }}
        onDelete={() => handleDeleteLink(item)}
        onMarkAsRead={async () => {
          try {
            await linkService.markAsRead(item.id);
          } catch (error) {
            //
          }
        }}
      />
    </View>
  );

  const toggleTagExpansion = (tagId: string) => {
    setExpandedTagIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tagId)) {
        newSet.delete(tagId);
      } else {
        newSet.add(tagId);
      }
      return newSet;
    });
  };

  const modes: LinkViewMode[] = ['list', 'folder', 'tag'];
  
  const getNextMode = () => {
    const currentIndex = modes.indexOf(viewMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    return modes[nextIndex];
  };
  
  const getPrevMode = () => {
    const currentIndex = modes.indexOf(viewMode);
    const prevIndex = (currentIndex - 1 + modes.length) % modes.length;
    return modes[prevIndex];
  };
  
  const switchToNextMode = () => {
    setViewMode(getNextMode());
  };
  
  const switchToPrevMode = () => {
    setViewMode(getPrevMode());
  };

  const handleSwipeGesture = (event: any) => {
    const { translationX, velocityX, state } = event.nativeEvent;
    
    if (state === State.ACTIVE) {
      if (!isSwipeActive) setIsSwipeActive(true);
      const dampedTranslation = translationX * 0.5;
      swipeTranslateX.setValue(dampedTranslation);
    }
    
    if (state === State.END) {
      const swipeThreshold = 80;
      const velocityThreshold = 400;
      const shouldSwitch = Math.abs(translationX) > swipeThreshold || Math.abs(velocityX) > velocityThreshold;
      
      if (shouldSwitch) {
        if (translationX > 0 || velocityX > 0) switchToPrevMode();
        else switchToNextMode();
        
        swipeTranslateX.setValue(translationX > 0 ? -300 : 300);
        
        Animated.timing(swipeTranslateX, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }).start(() => setIsSwipeActive(false));
      } else {
        Animated.spring(swipeTranslateX, {
          toValue: 0,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }).start(() => setIsSwipeActive(false));
      }
    }
    
    if (state === State.CANCELLED || state === State.FAILED) {
      Animated.spring(swipeTranslateX, {
        toValue: 0,
        tension: 100,
        friction: 8,
        useNativeDriver: true,
      }).start(() => setIsSwipeActive(false));
    }
  };

  const renderMainContent = () => {
    if (viewMode === 'tag') {
      return (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={{ paddingTop: listPaddingTop, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={8}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#8A2BE2" />}
        >
          <View style={styles.tagGroupsContainer}>
            {groupedData.tagGroups?.map((group) => {
              if (!group) return null;
              const { tag, links } = group;
              return (
                <TagGroupCard
                  key={tag.id}
                  tag={tag}
                  links={links}
                  isExpanded={expandedTagIds.has(tag.id)}
                  onToggleExpanded={() => toggleTagExpansion(tag.id)}
                  onPress={(link) => {
                    setSelectedLink(link);
                    setShowDetailModal(true);
                  }}
                  onMarkAsRead={async (linkId: string) => {
                    try {
                      await linkService.markAsRead(linkId);
                    } catch (error) {
                      //
                    }
                  }}
                />
              );
            })}
          </View>

          {groupedData.untaggedLinks && groupedData.untaggedLinks.length > 0 && (
            <View style={styles.untaggedSection}>
              <Text style={styles.sectionTitle}>タグなしのリンク</Text>
              {groupedData.untaggedLinks.map(link => (
                <View key={link.id} style={styles.linkItem}>
                  <LinkCard
                    link={link}
                    tags={userTags}
                    onPress={() => {
                      setSelectedLink(link);
                      setShowDetailModal(true);
                    }}
                    onToggleBookmark={() => {
                      //
                    }}
                    onDelete={() => handleDeleteLink(link)}
                    onMarkAsRead={async () => {
                      try {
                        await linkService.markAsRead(link.id);
                      } catch (error) {
                        //
                      }
                    }}
                  />
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      );
    }

    if (viewMode === 'folder') {
      return (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={{ paddingTop: listPaddingTop, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={8}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#8A2BE2" />}
        >
          <View style={styles.comingSoonContainer}>
            <Feather name="folder" size={48} color="#666" />
            <Text style={styles.comingSoonTitle}>フォルダ機能</Text>
            <Text style={styles.comingSoonText}>
              フォルダ機能は近日公開予定です。{'\n'}
              しばらくお待ちください。
            </Text>
          </View>

          {/* {groupedData.unfolderLinks && groupedData.unfolderLinks.length > 0 && (
            <View style={styles.untaggedSection}>
              <Text style={styles.sectionTitle}>フォルダなしのリンク</Text>
              {groupedData.unfolderLinks.map(link => (
                <View key={link.id} style={styles.linkItem}>
                  <LinkCard
                    link={link}
                    tags={userTags}
                    onPress={() => {
                      setSelectedLink(link);
                      setShowDetailModal(true);
                    }}
                    onToggleBookmark={() => {
                      //
                    }}
                    onDelete={() => handleDeleteLink(link)}
                    onMarkAsRead={async () => {
                      try {
                        await linkService.markAsRead(link.id);
                      } catch (error) {
                        //
                      }
                    }}
                  />
                </View>
              ))}
            </View>
          )} */}
        </ScrollView>
      );
    }

    return (
      <FlatList
        style={styles.scrollView}
        contentContainerStyle={{ paddingTop: listPaddingTop, paddingBottom: 100 }}
        data={groupedData.listLinks}
        keyExtractor={(item) => item.id}
        renderItem={renderLinkItem}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={8}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#8A2BE2" />}
        ListEmptyComponent={() => (
          <View style={styles.emptyStateContainer}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>読み込み中...</Text>
              </View>
            ) : error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
                  <Text style={styles.retryButtonText}>再試行</Text>
                </TouchableOpacity>
              </View>
            ) : (
              renderEmptyState()
            )}
          </View>
        )}
        ListFooterComponent={() => <View style={styles.bottomSpacer} />}
      />
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      {searchQuery.trim() ? (
        <>
          <Text style={styles.emptyStateTitle}>🔍 検索結果がありません</Text>
          <Text style={styles.emptyStateText}>
            {`「${searchQuery}」に一致するリンクが見つかりません。\n別のキーワードで検索してみてください。`}
          </Text>
        </>
      ) : selectedTagIds.length > 0 ? (
        <>
          <Text style={styles.emptyStateTitle}>🏷️ 該当するリンクがありません</Text>
          <Text style={styles.emptyStateText}>
            選択したタグに一致するリンクが見つかりません。{'\n'}
            フィルターをクリアして全てのリンクを表示してください。
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.emptyStateTitle}>📎 リンクがありません</Text>
          <Text style={styles.emptyStateText}>
            {`右下の + ボタンを押して最初のリンクを保存しましょう！`}
          </Text>
        </>
      )}
    </View>
  );

  const groupedData = useMemo(() => {
    if (viewMode === 'folder') {
      const folderGroups: { folder: Folder; links: Link[] }[] = [];
      const unfolderLinks = filteredLinks.filter(link => !link.folderId);
      return { folderGroups, unfolderLinks };
    }
    
    if (viewMode === 'tag') {
      const tagGroups = new Map<string, Link[]>();
      const untaggedLinks: Link[] = [];
      
      filteredLinks.forEach(link => {
        if (!link.tagIds || link.tagIds.length === 0) {
          untaggedLinks.push(link);
        } else {
          link.tagIds.forEach(tagId => {
            if (!tagGroups.has(tagId)) {
              tagGroups.set(tagId, []);
            }
            tagGroups.get(tagId)!.push(link);
          });
        }
      });
      
      const tagGroupsArray = Array.from(tagGroups.entries())
        .map(([tagId, links]) => {
          const tag = userTags.find(t => t.id === tagId);
          return tag ? { tag, links } : null;
        })
        .filter(Boolean)
        .sort((a, b) => b!.links.length - a!.links.length);
      
      return { tagGroups: tagGroupsArray, untaggedLinks };
    }
    
    return { listLinks: filteredLinks };
  }, [filteredLinks, viewMode, userTags]);

  useEffect(() => {
    if (!isSearchMode) {
      headerTranslateY.setValue(0);
      isAnimating.current = false;
    }
  }, [isSearchMode]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <TouchableWithoutFeedback>
        <View style={styles.container}>
          {/* 固定ヘッダー */}
          <View style={styles.header} onLayout={handleStaticHeaderLayout}>
            {isSearchMode ? (
              <>
                <TouchableOpacity 
                  style={styles.searchCloseButton}
                  onPress={() => {
                    setSearchQuery('');
                    setSelectedTagIds([]);
                    setIsSearchMode(false);
                  }}
                >
                  <Feather name="x" size={20} color="#666" />
                </TouchableOpacity>
                <View style={styles.searchInputContainer}>
                  <TextInput
                    style={styles.headerSearchInput}
                    placeholder="リンクを検索..."
                    placeholderTextColor="#666"
                    value={searchQuery}
                    onChangeText={handleSearchTextChange}
                    returnKeyType="search"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setSearchQuery('')}
                      style={styles.searchClearButton}
                    >
                      <Feather name="x-circle" size={16} color="#666" />
                    </TouchableOpacity>
                  )}
                </View>
              </>
            ) : (
              <>
                <TouchableOpacity 
                  style={styles.searchHeaderButton}
                  onPress={() => setIsSearchMode(true)}
                >
                  <Feather name="search" size={20} color="#8B5CF6" />
                </TouchableOpacity>
                <AIStatusMonitor 
                  processingLinks={processingLinks}
                  failedLinks={failedLinks}
                  untaggedLinks={untaggedLinks}
                  onRetry={processAITagging}
                  onExecuteAI={handleExecuteAI}
                  onDismissUntagged={handleDismissUntagged}
                  aiProcessingStatus={aiProcessingStatus}
                  canUseAI={canUseAI}
                  aiUsageCount={mockAiUsageCount}
                  aiUsageLimit={mockAiUsageLimit}
                />
                <TouchableOpacity style={styles.accountButton} onPress={handleAccountPress}>
                  <Text style={styles.accountText}>{getUserInitial()}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* 動的ヘッダー */}
          <Animated.View 
            style={[
              styles.animatedHeaderContainer,
              { 
                top: staticHeaderHeight,
                transform: [{ translateY: headerTranslateY }] 
              }
            ]}
            onLayout={handleDynamicHeaderLayout}
          >
            {isSearchMode && (
              <View style={styles.searchSectionContainer}>
                <View style={styles.tagFilterSection}>
                  <TagFilter
                    tags={userTags.map(tag => tag.name)}
                    selectedTags={selectedTagIds.map(tagId => {
                      const tag = userTags.find(t => t.id === tagId);
                      return tag ? tag.name : '';
                    }).filter(Boolean)}
                    onTagToggle={(tagName: string) => {
                      const tag = userTags.find(t => t.name === tagName);
                      if (tag) handleTagToggle(tag.id);
                    }}
                    onClearAll={handleClearTags}
                    onAddTag={() => setShowAddTagModal(true)}
                  />
                </View>

                {(searchQuery.trim() || selectedTagIds.length > 0) && (
                  <View style={styles.searchStatusSection}>
                    <Text style={styles.searchStatusText}>
                      {searchQuery.trim() && selectedTagIds.length > 0 
                        ? `「${searchQuery}」で検索中 + ${selectedTagIds.length}個のタグでフィルタ中`
                        : searchQuery.trim() 
                        ? `「${searchQuery}」で検索中`
                        : `${selectedTagIds.length}個のタグでフィルタ中`
                      }
                    </Text>
                    <TouchableOpacity onPress={handleClearAll} style={styles.searchStatusClear}>
                      <Text style={styles.searchStatusClearText}>すべてクリア</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </Animated.View>

          {!isSearchMode && (
            <ViewModeSelector
              currentMode={viewMode}
              onModeChange={setViewMode}
            />
          )}

          <PanGestureHandler
            ref={swipeGestureRef}
            onGestureEvent={handleSwipeGesture}
            onHandlerStateChange={handleSwipeGesture}
            activeOffsetX={[-20, 20]}
            failOffsetY={[-80, 80]}
            shouldCancelWhenOutside={false}
            enabled={isSwipeEnabled && !isSearchMode}
          >
            <Animated.View 
              style={{ 
                flex: 1,
                transform: [{ translateX: swipeTranslateX }]
              }}
            >
              {renderMainContent()}
            </Animated.View>
          </PanGestureHandler>

          <FloatingActionButton onPress={() => setShowAddModal(true)} />

          <AddLinkModal
            visible={showAddModal}
            onClose={() => setShowAddModal(false)}
            onSubmit={handleAddLink}
            userId={user?.uid}
            availableTags={userTags.map(tag => ({ id: tag.id, name: tag.name }))}
            onAddTag={handleAddTag}
            onDeleteTag={handleDeleteTagByName}
          />

          <AddTagModal
            visible={showAddTagModal}
            onClose={() => setShowAddTagModal(false)}
            availableTags={userTags.map(tag => ({ id: tag.id, name: tag.name }))}
            selectedTags={[]}
            onTagsChange={() => {}}
            onCreateTag={handleAddTag}
            onDeleteTag={handleDeleteTagByName}
          />
          
          <SearchModal
            visible={showSearchModal}
            onClose={() => setShowSearchModal(false)}
            links={links || []}
            tags={userTags}
            onLinkPress={(link) => {
              setSelectedLink(link);
              setShowDetailModal(true);
            }}
          />

          {selectedLink && (
            <Modal
              visible={showDetailModal}
              animationType="slide"
              presentationStyle="pageSheet"
              onRequestClose={() => setShowDetailModal(false)}
            >
              <LinkDetailScreen
                link={selectedLink}
                onClose={() => setShowDetailModal(false)}
                onUpdateLink={async (linkId: string, updatedData: Partial<Link>) => {
                  await updateLink(linkId, updatedData);
                  setShowDetailModal(false);
                }}
                userPlan={userPlan}
                availableTags={userTags.map(tag => ({ id: tag.id, name: tag.name }))}
                onCreateTag={handleAddTag}
                onDeleteTag={handleDeleteTagByName}
                onDelete={async () => {
                  try {
                    await deleteLink(selectedLink.id, user?.uid || '');
                    setShowDetailModal(false);
                    setSelectedLink(null);
                  } catch (error) {
                    Alert.alert('エラー', 'リンクの削除に失敗しました');
                  }
                }}
              />
            </Modal>
          )}
        </View>
      </TouchableWithoutFeedback>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  scrollView: {
    flex: 1,
    paddingTop: 16,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 72,
    paddingBottom: 16,
    backgroundColor: '#121212',
    zIndex: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#CCC',
  },

  searchStatusSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
    marginHorizontal: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.2)',
  },
  searchStatusText: {
    flex: 1,
    fontSize: 13,
    color: '#B794F6',
    fontWeight: '500',
  },
  searchStatusClear: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderRadius: 8,
  },
  searchStatusClearText: {
    color: '#E9D5FF',
    fontWeight: '700',
    fontSize: 12,
  },
  searchHeaderButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
    backgroundColor: '#27272A',
  },
  searchCloseButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
    backgroundColor: '#27272A',
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 44,
    marginLeft: 12,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
  },
  headerSearchInput: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    paddingVertical: 0,
  },
  searchClearButton: {
    padding: 4,
    marginLeft: 8,
  },

  accountButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
    backgroundColor: '#27272A',
  },
  accountText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#CCC',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#CCC',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#FFF',
    marginBottom: 20,
  },
  retryButton: {
    padding: 12,
    backgroundColor: '#00FFFF',
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#121212',
  },
  linkItem: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateTitle: {
    fontSize: 24,
    color: '#FFF',
    marginBottom: 15,
    textAlign: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#AAA',
    textAlign: 'center',
    lineHeight: 24,
  },
  emptyStateContainer: {
    flex: 1,
    minHeight: 300,
  },
  bottomSpacer: {
    height: 100,
  },
  tagFilterSection: {
    //
  },
  searchSectionContainer: {
    backgroundColor: '#121212',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  animatedHeaderContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: '#121212',
  },
  tagGroupsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  untaggedSection: {
    paddingBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 12,
    marginTop: 20,
    paddingLeft: 16,
  },
  comingSoonContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  comingSoonTitle: {
    fontSize: 24,
    color: '#FFF',
    marginBottom: 15,
    textAlign: 'center',
  },
  comingSoonText: {
    fontSize: 16,
    color: '#AAA',
    textAlign: 'center',
    lineHeight: 24,
  },

});
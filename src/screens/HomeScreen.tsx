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
import { detectPlatform, generatePlatformTagName } from '../utils/platformDetector';

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { user, logout } = useAuth();
  const { links, loading, error, createLink, updateLink, deleteLink } = useLinks(user?.uid || null);
  const { tags: userTags, createOrGetTag, deleteTag: deleteTagById, generateRecommendedTags } = useTags(user?.uid || null);
  
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
    
    const userSelectedTagIds: string[] = linkData.tagIds ? [...linkData.tagIds] : [];

    let platformTagId: string | null = null;
    if (linkData.url) {
      const platformInfo = detectPlatform(linkData.url);
      if (platformInfo) {
        const platformTagName = generatePlatformTagName(platformInfo);
        const existingPlatformTag = userTags.find(t => t.name.toLowerCase() === platformTagName.toLowerCase());
        if (existingPlatformTag) {
          platformTagId = existingPlatformTag.id;
        } else {
          try {
            platformTagId = await handleAddTag(platformTagName, 'recommended');
          } catch (error) {
            // エラーハンドリング
          }
        }
      }
    }
    
    const initialTagIds: string[] = [...userSelectedTagIds];
    if (platformTagId && !initialTagIds.includes(platformTagId)) {
      initialTagIds.push(platformTagId);
    }
    
    const fullLinkData = {
      ...linkData,
      userId: user.uid,
      status: 'processing',
      tagIds: initialTagIds,
      isBookmarked: false,
      isArchived: false,
      priority: 'medium',
    } as Omit<Link, 'id' | 'createdAt' | 'updatedAt'>;
    
    try {
      const newLinkId = await createLink(fullLinkData);
      
      Alert.alert('✅ 保存完了', 'リンクを保存しました。AIが追加のタグを生成します...');
      
      if (newLinkId) {
        
        
        setTimeout(async () => {
          try {
            console.log(`🤖 [AI Tagging Home] Starting automatic AI processing for linkId: ${newLinkId}`);
            
            let finalTitle = linkData.title || '';
            let finalDescription = linkData.description || '';
            
            try {
              const metadata = await metadataService.fetchMetadata(linkData.url || '', user.uid);
              finalTitle = finalTitle || metadata.title || linkData.url || '';
              finalDescription = finalDescription || metadata.description || '';
            } catch (metadataError) {
              finalTitle = finalTitle || linkData.url || '';
            }

            console.log(`🤖 [AI Tagging Home] Calling AI service for linkId: ${newLinkId}`);
            const aiResponse = await aiService.generateTags(
              finalTitle,
              finalDescription,
              linkData.url || '',
              user.uid,
              userPlan
            );
            console.log(`🤖 [AI Tagging Home] AI response for linkId: ${newLinkId}`, { tags: aiResponse.tags, fromCache: aiResponse.fromCache });

            const finalTagIds: string[] = [...initialTagIds];
            
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
                  console.error(`🤖🔥 [AI Tagging Home] Failed to create new AI tag for linkId: ${newLinkId}`, { tagName: normalizedTagName, error });
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

            await updateLink(newLinkId, updateData);
            console.log(`🤖 [AI Tagging Home] Successfully updated link with AI tags. linkId: ${newLinkId}`, { finalTagIds });

            const userTagCount = userSelectedTagIds.length;
            const platformTagCount = platformTagId ? 1 : 0;
            const aiTagCount = finalTagIds.length - userTagCount - platformTagCount;
            
            let message = `🤖 AI分析が完了しました！

`;
            if (userTagCount > 0) {
              message += `👤 ユーザー選択: ${userTagCount}個
`;
            }
            if (platformTagCount > 0) {
              message += `🌐 プラットフォーム: ${platformTagCount}個
`;
            }
            if (aiTagCount > 0) {
              message += `🤖 AI生成: ${aiTagCount}個
`;
            }
            message += `
📊 合計: ${finalTagIds.length}個のタグ

`;
            message += `🏷️ 生成されたタグ: ${aiResponse.tags.join(', ')}

`;
            
            if (aiResponse.fromCache) {
              message += '💾 キャッシュから取得';
            } else {
              message += `🔥 新規AI分析 (トークン: ${aiResponse.tokensUsed})`;
            }
            
            Alert.alert('🎉 自動AI分析完了', message);

          } catch (error) {
            console.error(`🤖🔥 [AI Tagging Home] Auto AI processing failed for linkId: ${newLinkId}`, { error });
            await updateLink(newLinkId, {
              status: 'error',
              error: {
                message: 'AI自動タグ生成中にエラーが発生しました',
                code: 'AUTO_TAG_GENERATION_FAILED',
                timestamp: new Date()
              }
            });
            Alert.alert('⚠️ AI処理エラー', 'AIタグの自動生成に失敗しましたが、リンクとユーザー選択タグは正常に保存されました。');
          }
        }, 1000);
      }
      
    } catch (error) {
      Alert.alert('エラー', 'リンクの保存に失敗しました');
    }
  };

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

          {groupedData.unfolderLinks && groupedData.unfolderLinks.length > 0 && (
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
          )}
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
                <Text style={styles.title}>LinkRanger</Text>
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
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#2A2A2A',
  },
  searchHeaderButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#2A2A2A',
  },
  searchCloseButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#2A2A2A',
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
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#666',
    backgroundColor: 'transparent',
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
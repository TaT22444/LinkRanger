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
  Animated,
  TextInput,
  TouchableWithoutFeedback,
  Dimensions,
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
import { TagGroupCard } from '../components/TagGroupCard';

import { AddTagModal } from '../components/AddTagModal';
import { SearchModal } from '../components/SearchModal';
import { LinkDetailScreen } from './LinkDetailScreen';
import { Link, UserPlan, LinkViewMode } from '../types';
import { linkService, batchService } from '../services';

import { aiService } from '../services/aiService';
import { metadataService } from '../services/metadataService';
import { PlanService } from '../services/planService';
import { notificationService } from '../services/notificationService';

import { AIStatusMonitor } from '../components/AIStatusMonitor';
import { UpgradeModal } from '../components/UpgradeModal';


// 共有リンク用のデータ型
type SharedLinkData = {
  url: string;
  title?: string;
  source: 'deep-link';
};

export const HomeScreen: React.FC<{ sharedLinkData?: SharedLinkData | null }> = ({ sharedLinkData }) => {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { user } = useAuth();
  const [prefillUrl, setPrefillUrl] = useState<string>('');
  const lastHandledSharedUrlRef = useRef<string | null>(null);
  
  // 🚀 最適化されたHooksの使用
  
  const { links, loading, error, createLink, updateLink, deleteLink, hasMore, isLoadingMore, loadMore } = useLinks(user?.uid || null);
  const { tags: userTags, createOrGetTag, deleteTag: deleteTagById } = useTags(user?.uid || null);
  
  
  
  const [aiProcessingStatus, setAiProcessingStatus] = useState<{ [key: string]: number }>({});
  

  const { processingLinks, failedLinks, untaggedLinks } = useMemo(() => {
    const processing = links.filter(link => aiProcessingStatus[link.id] !== undefined);
    const failed = links.filter(link => link.status === 'error' && link.error?.code === 'QUOTA_EXCEEDED');
    const untagged = links.filter(link => 
      (link.status === 'pending' || (link.tagIds && link.tagIds.length === 0)) && 
      aiProcessingStatus[link.id] === undefined
    );
    return { processingLinks: processing, failedLinks: failed, untaggedLinks: untagged };
  }, [links, aiProcessingStatus]);
  
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddTagModal, setShowAddTagModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [selectedLink, setSelectedLink] = useState<Link | null>(null);
  
  // 共有リンクデータがある場合、AddLinkModalを自動で開く
    useEffect(() => {
      const incoming = sharedLinkData?.url;
      if (!incoming) return;
      let normalized = incoming;
      try {
        normalized = decodeURIComponent(incoming);
      } catch {}

      // すでに同じURLを処理していて、かつモーダルが開いているなら無視
      if (lastHandledSharedUrlRef.current === normalized && showAddModal) return;

      lastHandledSharedUrlRef.current = normalized;
      setPrefillUrl(normalized);
      setShowAddModal(true);
    }, [sharedLinkData?.url]); // URLの変化にのみ反応
  
  // インライン検索用の状態
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchMode, setIsSearchMode] = useState(false);

  // 表示モード関連の状態
  const [viewMode, setViewMode] = useState<LinkViewMode>('list');
  const [expandedTagIds, setExpandedTagIds] = useState<Set<string>>(new Set());
  
  // 選択モード関連の状態
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedLinkIds, setSelectedLinkIds] = useState<Set<string>>(new Set());
  const [selectedTagIdsForDeletion, setSelectedTagIdsForDeletion] = useState<Set<string>>(new Set());
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeModalContext, setUpgradeModalContext] = useState<'link_limit' | 'tag_limit' | 'ai_limit' | 'account' | 'general'>('general');

  // スワイプジェスチャー用の状態
  const swipeGestureRef = useRef<PanGestureHandler>(null);
  const [isSwipeEnabled, setIsSwipeEnabled] = useState(true);
  const swipeTranslateX = useRef(new Animated.Value(0)).current;
  const lastScrollTime = useRef(0);
  const [isSwipeActive, setIsSwipeActive] = useState(false);


  // Animated Header
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerTranslateY = useRef(new Animated.Value(0)).current;
  const lastScrollY = useRef(0);
  const isAnimating = useRef(false); // アニメーション実行中フラグ
  const [staticHeaderHeight, setStaticHeaderHeight] = useState(0);
  const [dynamicHeaderHeight, setDynamicHeaderHeight] = useState(0);

  const listPaddingTop = isSearchMode ? dynamicHeaderHeight : 24;

  // ユーザープラン（PlanServiceを使用）
  const userPlan: UserPlan = PlanService.getEffectivePlan(user);


  const handleAccountPress = () => {
    navigation.navigate('Account');
  };

  const handleAddLink = async (linkData: Partial<Link>) => {
    if (!user?.uid) return;
    
    // プラン制限チェック
    const currentLinkCount = links.length;
    if (!PlanService.canCreateLink(user, currentLinkCount)) {
      const limitMessage = PlanService.getLimitExceededMessage(user, 'links');
      Alert.alert('制限に達しました', limitMessage, [
        { text: 'キャンセル', style: 'cancel' },
        { text: 'プラン変更', onPress: () => {
          setUpgradeModalContext('link_limit');
          setShowUpgradeModal(true);
        }}
      ]);
      return;
    }
    
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
      
      // 通知は3日間未読だった場合のみ発行するため、リンク作成時の即座通知は削除
      // const newLink = { ...fullLinkData, id: newLinkId } as Link;
      // await notificationService.scheduleUnusedLinkNotification(newLink);
      
      // 🚀 手動選択されたタグがある場合は自動AI処理をスキップするかユーザーに確認
      const hasManualTags = (linkData.tagIds || []).length > 0;
      
      if (hasManualTags) {
        Alert.alert('保存完了', `リンクを保存しました。\n手動選択タグ: ${linkData.tagIds?.length}個\nAI自動タグ付与も実行しますか？`, [
          { text: 'スキップ', style: 'cancel' },
          { 
            text: 'AI実行', 
            onPress: () => {
              setTimeout(() => {
                processAITagging(newLinkId, fullLinkData);
              }, 500);
            }
          }
        ]);
      } else {
        Alert.alert('✅ 保存完了', 'リンクを保存しました。AI自動タグ付与を開始します。');
        
        // タグが未選択の場合は自動的にAI処理を実行
        setTimeout(() => {
          processAITagging(newLinkId, fullLinkData);
        }, 500);
      }

      // 追加に成功したらモーダルは閉じ、入力をリセット
      setShowAddModal(false);
      setPrefillUrl('');
      lastHandledSharedUrlRef.current = null;
 

    } catch (error) {
      Alert.alert('エラー', 'リンクの保存に失敗しました');
    }
  };

  const processAITagging = async (linkId: string, linkData: Partial<Link>) => {
    if (!user?.uid) return;

    setAiProcessingStatus(prev => ({ ...prev, [linkId]: 0.1 }));

    try {
      setAiProcessingStatus(prev => ({ ...prev, [linkId]: 0.3 }));

      // 🚀 メタデータ取得（重複防止のため短時間のキャッシュを考慮）
      console.log('🔄 processAITagging: メタデータ取得開始', { url: linkData.url });
      const metadata = await metadataService.fetchMetadata(linkData.url || '', user.uid);
      console.log('📄 processAITagging: メタデータ取得完了', { 
        title: metadata.title?.slice(0, 50) + '...',
        hasDescription: !!metadata.description 
      });
      setAiProcessingStatus(prev => ({ ...prev, [linkId]: 0.6 }));

      const aiResponse = await aiService.generateEnhancedTags(
        metadata,
        user.uid,
        userPlan
      );
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
      
      // ... (Alert表示のロジックは変更なし)
      const userTagCount = (linkData.tagIds || []).length;
      const aiTagCount = finalTagIds.length - userTagCount;
      let message = `🤖 AI解説が完了しました！\n\n`;
      if (userTagCount > 0) message += `👤 ユーザー選択: ${userTagCount}個\n`;
      if (aiTagCount > 0) message += `🤖 AI生成: ${aiTagCount}個\n`;
      message += `\n📊 合計: ${finalTagIds.length}個のタグ\n\n`;
      message += `🏷️ 生成されたタグ: ${aiResponse.tags.join(', ')}\n\n`;
      if (aiResponse.fromCache) {
        message += '💾 キャッシュから取得';
      } else {
        message += `🔥 新規AI解説 (トークン: ${aiResponse.tokensUsed})`;
      }
      // Alert.alert('🎉 自動AI解説完了', message); // アラート削除

    } catch (error: any) {
      
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
    const link = links.find(l => l.id === linkId);
    if (link) {
      processAITagging(linkId, link);
    }
  };

  const handleDismissUntagged = (linkId: string) => {
    // 実装予定: 未タグ付けリンクを非表示にする処理
  };

  const mockAiUsageCount = 8;
  const mockAiUsageLimit = 10;
  const canUseAI = mockAiUsageCount < mockAiUsageLimit;


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
    
    // プラン制限チェック
    const currentTagCount = userTags.length;
    if (!PlanService.canCreateTag(user, currentTagCount)) {
      const limitMessage = PlanService.getLimitExceededMessage(user, 'tags');
      Alert.alert('制限に達しました', limitMessage, [
        { text: 'キャンセル', style: 'cancel' },
        { text: 'プラン変更', onPress: () => {
          setUpgradeModalContext('tag_limit');
          setShowUpgradeModal(true);
        }}
      ]);
      return '';
    }
    
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

  // 選択モード関連の関数
  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedLinkIds(new Set()); // 選択をクリア
    setSelectedTagIdsForDeletion(new Set()); // タグ選択もクリア
  };

  const toggleLinkSelection = (linkId: string) => {
    setSelectedLinkIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(linkId)) {
        newSet.delete(linkId);
      } else {
        newSet.add(linkId);
      }
      return newSet;
    });
  };

  const selectAllLinks = () => {
    const allLinkIds = new Set(filteredLinks.map(link => link.id));
    setSelectedLinkIds(allLinkIds);
  };

  const clearSelection = () => {
    setSelectedLinkIds(new Set());
  };

  const toggleTagSelection = (tagId: string) => {
    setSelectedTagIdsForDeletion(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tagId)) {
        newSet.delete(tagId);
      } else {
        newSet.add(tagId);
      }
      return newSet;
    });
  };

  const selectAllTags = () => {
    if (viewMode === 'tag' && groupedData.tagGroups) {
      const allTagIds = new Set(groupedData.tagGroups.map(group => group?.tag.id).filter(Boolean) as string[]);
      setSelectedTagIdsForDeletion(allTagIds);
    }
  };

  const clearTagSelection = () => {
    setSelectedTagIdsForDeletion(new Set());
  };

  // ViewModeHeader コンポーネント
  const renderViewModeHeader = () => {
    if (viewMode === 'folder') return null; // folderモードでは表示しない

    const getHeaderInfo = () => {
      if (viewMode === 'list') {
        return {
          label: 'リンク',
          count: filteredLinks.length,
          items: filteredLinks
        };
      } else if (viewMode === 'tag') {
        // タグモードでの表示用データを計算
        const tagGroups = groupedData.tagGroups || [];
        return {
          label: 'タグ',
          count: tagGroups.length, // タグの総数を表示（リンク数ではなく）
          items: filteredLinks
        };
      }
      return { label: '', count: 0, items: [] };
    };

    const { label, count } = getHeaderInfo();

    return (
      <View style={styles.viewModeHeaderContainer}>
        <View style={styles.viewModeHeader}>
          <View style={styles.viewModeHeaderLeft}>
            <Text style={styles.viewModeHeaderLabel}>{label}</Text>
            <Text style={styles.viewModeHeaderCount}>({count})</Text>
          </View>
          
          <View style={styles.viewModeHeaderRight}>
            {/* タグモード時のアクションボタン */}
            {viewMode === 'tag' && (
              <>
                <TouchableOpacity 
                  style={styles.tagActionButton}
                  onPress={() => {
                    setShowAddTagModal(true);
                  }}
                >
                  <Feather name="plus" size={16} color="#8A2BE2" />
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.tagActionButton}
                  onPress={() => {
                    // タグ結合機能（今後実装予定）
                    Alert.alert('タグ結合', 'タグ結合機能は近日公開予定です');
                  }}
                >
                  <Feather name="git-merge" size={16} color="#8A2BE2" />
                </TouchableOpacity>
              </>
            )}
            
            <TouchableOpacity 
              style={[
                styles.selectionButton,
                isSelectionMode && styles.selectionButtonActive
              ]}
              onPress={toggleSelectionMode}
            >
              <Text style={[
                styles.selectionButtonText,
                isSelectionMode && styles.selectionButtonTextActive
              ]}>
                {isSelectionMode ? 'キャンセル' : '選択'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        
        {/* 選択モード時の状態バー */}
        {isSelectionMode && (
          <View style={styles.selectionStatusBar}>
            <View style={styles.selectionStatusLeft}>
              <Text style={styles.selectionStatusText}>
                {viewMode === 'tag' 
                  ? `${selectedTagIdsForDeletion.size}件選択中`
                  : `${selectedLinkIds.size}件選択中`
                }
              </Text>
              {((viewMode === 'tag' && groupedData.tagGroups && groupedData.tagGroups.length > 0) ||
                (viewMode !== 'tag' && filteredLinks.length > 0)) && (
                <TouchableOpacity 
                  style={styles.selectAllButton}
                  onPress={() => {
                    if (viewMode === 'tag') {
                      const allTagsSelected = groupedData.tagGroups?.length === selectedTagIdsForDeletion.size;
                      if (allTagsSelected) {
                        clearTagSelection();
                      } else {
                        selectAllTags();
                      }
                    } else {
                      const allLinksSelected = selectedLinkIds.size === filteredLinks.length;
                      if (allLinksSelected) {
                        clearSelection();
                      } else {
                        selectAllLinks();
                      }
                    }
                  }}
                >
                  <Text style={styles.selectAllButtonText}>
                    {viewMode === 'tag' 
                      ? (groupedData.tagGroups?.length === selectedTagIdsForDeletion.size ? 'すべて解除' : 'すべて選択')
                      : (selectedLinkIds.size === filteredLinks.length ? 'すべて解除' : 'すべて選択')
                    }
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            
            <View style={styles.selectionActions}>
              <TouchableOpacity 
                style={[
                  styles.selectionActionButton,
                  ((viewMode === 'tag' && selectedTagIdsForDeletion.size === 0) ||
                   (viewMode !== 'tag' && selectedLinkIds.size === 0)) && styles.selectionActionButtonDisabled
                ]}
                onPress={() => {
                  if (viewMode === 'tag' && selectedTagIdsForDeletion.size > 0) {
                    Alert.alert(
                      'タグの削除',
                      `${selectedTagIdsForDeletion.size}件のタグを削除しますか？`,
                      [
                        { text: 'キャンセル', style: 'cancel' },
                        {
                          text: '削除',
                          style: 'destructive',
                          onPress: async () => {
                            try {
                              // タグの一括削除を実行
                              const tagIdsArray = Array.from(selectedTagIdsForDeletion);
                              await batchService.bulkDeleteTags(tagIdsArray, user?.uid || '');
                              // 選択をクリア
                              setSelectedTagIdsForDeletion(new Set());
                              // 選択モードを終了
                              setIsSelectionMode(false);
                            } catch (error) {
                              Alert.alert('エラー', 'タグの削除に失敗しました');
                            }
                          }
                        }
                      ]
                    );
                  } else if (viewMode !== 'tag' && selectedLinkIds.size > 0) {
                    Alert.alert(
                      'リンクの削除',
                      `${selectedLinkIds.size}件のリンクを削除しますか？`,
                      [
                        { text: 'キャンセル', style: 'cancel' },
                        {
                          text: '削除',
                          style: 'destructive',
                          onPress: async () => {
                            try {
                              // リンクの一括削除を実行
                              const linkIdsArray = Array.from(selectedLinkIds);
                              await batchService.bulkDeleteLinks(linkIdsArray, user?.uid || '');
                              // 選択をクリア
                              setSelectedLinkIds(new Set());
                              // 選択モードを終了
                              setIsSelectionMode(false);
                            } catch (error) {
                              Alert.alert('エラー', 'リンクの削除に失敗しました');
                            }
                          }
                        }
                      ]
                    );
                  }
                }}
                disabled={(viewMode === 'tag' && selectedTagIdsForDeletion.size === 0) ||
                         (viewMode !== 'tag' && selectedLinkIds.size === 0)}
              >
                <Feather 
                  name="trash-2" 
                  size={16} 
                  color={((viewMode === 'tag' && selectedTagIdsForDeletion.size === 0) ||
                          (viewMode !== 'tag' && selectedLinkIds.size === 0)) ? "#666" : "#FF6B6B"} 
                />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderLinkItem = ({ item }: { item: Link }) => (
    <View style={styles.linkItem}>
      <LinkCard
        key={item.id}
        link={item}
        tags={userTags}
        onPress={() => {
          console.log('🔥 LinkCard tapped:', {
            linkId: item.id,
            title: item.title,
            isSwipeActive,
            isSelectionMode
          });
          
          // 実際にスワイプ中の場合はタップを無効化
          if (isSwipeActive) {
            console.log('🚫 Tap blocked by active swipe gesture');
            return;
          }
          
          if (isSelectionMode) {
            console.log('📝 Selection mode - toggling selection');
            toggleLinkSelection(item.id);
          } else {
            console.log('✅ Opening detail modal for link:', item.title);
            setSelectedLink(item);
            setShowDetailModal(true);
          }
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
        isSelectionMode={isSelectionMode}
        isSelected={selectedLinkIds.has(item.id)}
        onToggleSelection={() => toggleLinkSelection(item.id)}
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

  const modes: LinkViewMode[] = ['list', 'tag', 'folder'];
  
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
    
    if (state === State.BEGAN) {
      // スワイプ開始時は一度リセットしておく
      setIsSwipeActive(false);
    }
    
    if (state === State.ACTIVE) {
      // 実際に移動が発生した場合のみスワイプ状態にする
      const minSwipeDistance = 10; // 最小スワイプ距離
      if (Math.abs(translationX) > minSwipeDistance) {
        setIsSwipeActive(true);
      }
      const dampedTranslation = translationX * 0.5;
      swipeTranslateX.setValue(dampedTranslation);
    }
    
    if (state === State.END) {
      const swipeThreshold = 100; // 閾値を上げてより明確なスワイプを要求
      const velocityThreshold = 600; // 速度閾値も上げる
      const shouldSwitch = Math.abs(translationX) > swipeThreshold || Math.abs(velocityX) > velocityThreshold;
      
      if (shouldSwitch) {
        if (translationX > 0 || velocityX > 0) switchToPrevMode();
        else switchToNextMode();
        
        swipeTranslateX.setValue(translationX > 0 ? -300 : 300);
        
        Animated.timing(swipeTranslateX, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }).start(() => {
          setIsSwipeActive(false);
          setIsSwipeEnabled(true);
        });
      } else {
        Animated.spring(swipeTranslateX, {
          toValue: 0,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }).start(() => {
          setIsSwipeActive(false);
          setIsSwipeEnabled(true);
        });
      }
      
      // 即座にスワイプ状態をリセット
      setIsSwipeActive(false);
      setIsSwipeEnabled(true);
    }
    
    if (state === State.CANCELLED || state === State.FAILED) {
      Animated.spring(swipeTranslateX, {
        toValue: 0,
        tension: 100,
        friction: 8,
        useNativeDriver: true,
      }).start(() => {
        setIsSwipeActive(false);
        setIsSwipeEnabled(true);
      });
      
      // 即座にスワイプ状態をリセット
      setIsSwipeActive(false);
      setIsSwipeEnabled(true);
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
          {renderViewModeHeader()}
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
                    if (isSwipeActive) {
                      console.log('🚫 TagGroupCard tap blocked by active swipe gesture');
                      return;
                    }
                    if (isSelectionMode) {
                      toggleLinkSelection(link.id);
                    } else {
                      setSelectedLink(link);
                      setShowDetailModal(true);
                    }
                  }}
                  onMarkAsRead={async (linkId: string) => {
                    try {
                      await linkService.markAsRead(linkId);
                    } catch (error) {
                      //
                    }
                  }}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedTagIdsForDeletion.has(tag.id)}
                  onToggleSelection={() => toggleTagSelection(tag.id)}
                  selectedLinkIds={selectedLinkIds}
                  onToggleLinkSelection={toggleLinkSelection}
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
                      if (isSwipeActive) {
                        console.log('🚫 Untagged LinkCard tap blocked by active swipe gesture');
                        return;
                      }
                      if (isSelectionMode) {
                        toggleLinkSelection(link.id);
                      } else {
                        setSelectedLink(link);
                        setShowDetailModal(true);
                      }
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
                    isSelectionMode={isSelectionMode}
                    isSelected={selectedLinkIds.has(link.id)}
                    onToggleSelection={() => toggleLinkSelection(link.id)}
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
          {renderViewModeHeader()}
          <View style={styles.comingSoonContainer}>
            <Feather name="folder" size={48} color="#666" />
            <Text style={styles.comingSoonTitle}>フォルダ機能</Text>
            <Text style={styles.comingSoonText}>
              フォルダ機能は近日公開予定です。{'\n'}
              しばらくお待ちください。
            </Text>
          </View>
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
        ListHeaderComponent={renderViewModeHeader}
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
        ListFooterComponent={() => (
          <View style={styles.bottomSpacer}>
            {/* 🚀 無限スクロール用のローディングインジケーター */}
            {isLoadingMore && (
              <View style={styles.loadMoreContainer}>
                <Text style={styles.loadMoreText}>さらに読み込み中...</Text>
              </View>
            )}
          </View>
        )}
        onEndReached={() => {
          console.log('📚 FlatList: onEndReached triggered', { hasMore, isLoadingMore, loading });
          if (hasMore && !isLoadingMore && !loading) {
            loadMore();
          }
        }}
        onEndReachedThreshold={0.3}
        windowSize={10}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        initialNumToRender={10}
        updateCellsBatchingPeriod={50}
      />
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      {searchQuery.trim() ? (
        <>
          <Text style={styles.emptyStateTitle}>🔍 検索結果がありません</Text>
          <Text style={styles.emptyStateText}>
            {`「${searchQuery}」に一致するリンクが見つかりません。別のキーワードで検索してみてください。`}
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
            {`右下のボタンを押して最初のリンクを保存しましょう！`}
          </Text>
        </>
      )}
    </View>
  );

  // タグ別グループ化の最適化されたメモ化
  const tagGroupData = useMemo(() => {
    if (viewMode !== 'tag') return null;
    
    const tagGroups = new Map<string, Link[]>();
    const untaggedLinks: Link[] = [];
    
    // タグMapを効率的に初期化
    userTags.forEach(tag => {
      tagGroups.set(tag.id, []);
    });
    
    // リンクを効率的に分類
    filteredLinks.forEach(link => {
      if (!link.tagIds || link.tagIds.length === 0) {
        untaggedLinks.push(link);
      } else {
        link.tagIds.forEach(tagId => {
          const tagLinks = tagGroups.get(tagId);
          if (tagLinks) {
            tagLinks.push(link);
          }
        });
      }
    });
    
    const tagGroupsArray = Array.from(tagGroups.entries())
      .map(([tagId, links]) => {
        const tag = userTags.find(t => t.id === tagId);
        return tag ? { tag, links } : null;
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (b!.links.length !== a!.links.length) {
          return b!.links.length - a!.links.length;
        }
        return a!.tag.name.localeCompare(b!.tag.name);
      });
    
    return { tagGroups: tagGroupsArray, untaggedLinks };
  }, [viewMode, filteredLinks, userTags]);

  const groupedData = useMemo(() => {
    if (viewMode === 'folder') {
      const folderGroups: { folder: any; links: Link[] }[] = [];
      const unfolderLinks = filteredLinks.filter(link => !link.folderId);
      return { folderGroups, unfolderLinks };
    }
    
    if (viewMode === 'tag') {
      return tagGroupData || { tagGroups: [], untaggedLinks: [] };
    }
    
    return { listLinks: filteredLinks };
  }, [viewMode, filteredLinks, tagGroupData]);

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
                    placeholder="リンクやタグを検索..."
                    placeholderTextColor="#666"
                    value={searchQuery}
                    onChangeText={handleSearchTextChange}
                    returnKeyType="search"
                    autoCapitalize="none"
                    autoCorrect={true}
                    autoComplete="off"
                    keyboardType="default"
                    autoFocus
                    clearButtonMode="while-editing"
                    onSubmitEditing={() => {
                      // 検索実行時にキーボードを隠す
                      if (searchQuery.trim()) {
                        // 既に filteredLinks で結果は表示される
                      }
                    }}
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
                  {user?.avatarIcon ? (
                    <Text style={styles.avatarIcon}>{user.avatarIcon}</Text>
                  ) : (
                    <Text style={styles.accountText}>{getUserInitial()}</Text>
                  )}
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

          {isSelectionMode ? null : (
            <FloatingActionButton
              onPress={() => {
                setPrefillUrl('');      // 手動追加は空で開始
                setShowAddModal(true);
              }}
            />
          )}

          <AddLinkModal
            key={prefillUrl}                 // URLが変われば入力欄をリセット
            visible={showAddModal}
            onClose={() => {
              setShowAddModal(false);
              // 共有リンクデータをクリア
              setPrefillUrl('');
              // 同じURLをもう一度共有しても開けるように、ローカルの既処理記録はクリア
              lastHandledSharedUrlRef.current = null;
            }}
            onSubmit={handleAddLink}
            initialUrl={prefillUrl}
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
            onTagsChange={() => {
              // タグ作成完了時の処理
              // モーダルを閉じる（タグ作成が完了したため）
              setShowAddTagModal(false);
              // 手動でリフレッシュを実行してタグリストを更新
              handleRefresh();
            }}
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
          
          {/* UpgradeModal */}
          <UpgradeModal
            visible={showUpgradeModal}
            onClose={() => setShowUpgradeModal(false)}
            currentPlan={PlanService.getUserPlan(user)}
            heroTitle="リンクの保持数を増やそう！"
            heroDescription="Proプランではリンクの保持数を200個まで増やせます"
            sourceContext={upgradeModalContext}
          />
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
    marginBottom: 16,
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
    borderColor: 'rgba(81, 81, 82, 0.2)',
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
  avatarIcon: {
    fontSize: 24,
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
  loadMoreContainer: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  loadMoreText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
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
  viewModeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
    backgroundColor: '#121212',
    zIndex: 15,
  },
  viewModeHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewModeHeaderLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#CCC',
  },
  viewModeHeaderCount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ccc',
    marginLeft: 8,
  },
  viewModeHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4, // ボタン間の間隔を調整
  },
  tagActionButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(138, 43, 226, 0.1)', // 薄い紫の背景
    borderWidth: 1,
    borderColor: 'rgba(138, 43, 226, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  selectionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#27272A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  selectionButtonActive: {
    backgroundColor: '#27272A',
    borderColor: '#333',
  },
  selectionButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#fff',
  },
  selectionButtonTextActive: {
    color: '#fff',
  },
  viewModeHeaderContainer: {
    marginBottom: 8,
  },
  selectionStatusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginBottom: 8,
    backgroundColor: '#121212',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  selectionStatusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectionStatusText: {
    fontSize: 12,
    color: '#fff',
    marginRight: 10,
  },
  selectAllButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#27272A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
  },
  selectAllButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8B5CF6',
  },
  selectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectionActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#27272A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  selectionActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF6B6B',
    marginLeft: 5,
  },
  selectionActionButtonDisabled: {
    opacity: 0.5,
  },
  selectionActionTextDisabled: {
    color: '#666',
  },

});
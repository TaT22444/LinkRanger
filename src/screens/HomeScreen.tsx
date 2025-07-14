import React, { useState, useCallback, useEffect, useRef } from 'react';
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
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { useLinks, useTags } from '../hooks/useFirestore';
import { LinkCard } from '../components/LinkCard';
import { PinnedLinkCard } from '../components/PinnedLinkCard';
import { AddLinkModal } from '../components/AddLinkModal';
import { FloatingActionButton } from '../components/FloatingActionButton';
import { TagFilter } from '../components/TagFilter';

import { AddTagModal } from '../components/AddTagModal';
import { LinkDetailScreen } from './LinkDetailScreen';
import { Link, UserPlan } from '../types';
import { linkService } from '../services/firestoreService';
import { aiService } from '../services/aiService';
import { metadataService } from '../services/metadataService';
import { AIUsageDashboard } from '../components/AIUsageDashboard';

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { user, logout } = useAuth();
  const { links, loading, error, createLink, updateLink, deleteLink } = useLinks(user?.uid || null);
  const { tags: userTags, createOrGetTag, deleteTag: deleteTagById, generateRecommendedTags } = useTags(user?.uid || null);
  
  // デバッグログ
  console.log('HomeScreen - userId:', user?.uid);
  console.log('HomeScreen - userTags:', userTags);
  console.log('HomeScreen - userTags.length:', userTags.length);
  console.log('HomeScreen - links sample:', links.slice(0, 2).map(link => ({ 
    id: link.id, 
    title: link.title, 
    tagIds: link.tagIds
  })));
  const [pinnedLinks, setPinnedLinks] = useState<Link[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddTagModal, setShowAddTagModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showAIUsageDashboard, setShowAIUsageDashboard] = useState(false);
  const [selectedLink, setSelectedLink] = useState<Link | null>(null);
  
  // スクロール制御用の状態
  const [isPinnedVisible, setIsPinnedVisible] = useState(true);
  const scrollY = useRef(0);
  const pinnedAnimatedValue = useRef(new Animated.Value(1)).current;

  // ダミーのユーザープラン（テスト用）
  const userPlan: UserPlan = user?.email === 'test@02.com' ? 'pro' : 'free';

  // ピン留めリンクを取得
  useEffect(() => {
    const fetchPinnedLinks = async () => {
      if (user?.uid) {
        try {
          const pinned = await linkService.getPinnedLinks(user.uid);
          setPinnedLinks(pinned);
        } catch (error: any) {
          console.error('Failed to fetch pinned links:', error);
          // インデックスエラーの場合はローカル状態を保持（空にしない）
          if (error?.code === 'failed-precondition') {
            console.log('Index not ready, keeping current pinned links state');
            // ローカル状態をそのまま維持
          }
        }
      }
    };

    fetchPinnedLinks();
  }, [user?.uid]); // linksの依存を除去してピン留め操作時の競合を回避

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
    
    // プロプランユーザーは自動AI要約が有効
    const shouldAutoAnalyze = userPlan !== 'free';
    
    // タグ名をタグIDに変換
    let tagIds: string[] = [];
    if (linkData.tagIds && linkData.tagIds.length > 0) {
      console.log('Converting tag names to IDs:', linkData.tagIds);
      for (const tagName of linkData.tagIds) {
        // userTagsからタグ名に対応するIDを検索
        const tag = userTags.find(t => t.name === tagName);
        if (tag) {
          tagIds.push(tag.id);
          console.log(`Found tag ID for "${tagName}": ${tag.id}`);
        } else {
          console.warn(`Tag not found for name: ${tagName}`);
        }
      }
    }
    
    const fullLinkData = {
      ...linkData,
      userId: user.uid,
      status: 'processing', // AI処理中に設定
      tagIds, // 変換されたタグIDを使用
    } as Omit<Link, 'id' | 'createdAt' | 'updatedAt'>;
    
    console.log('Creating link with tagIds:', tagIds);
    
    try {
      const newLinkId = await createLink(fullLinkData);
      
      // 成功アラートを表示
      Alert.alert('成功', 'リンクを保存しました。AIタグ生成を開始します...');
      
      // リンク保存後、自動的にAIタグ生成を実行
      if (newLinkId) {
        setTimeout(async () => {
          try {
            // メタデータを取得
            let finalTitle = linkData.title || '';
            let finalDescription = linkData.description || '';
            
            // メタデータが不足している場合は取得
            if (!finalTitle || !finalDescription) {
              try {
                const metadata = await metadataService.fetchMetadata(linkData.url || '', user.uid);
                finalTitle = finalTitle || metadata.title || linkData.url || '';
                finalDescription = finalDescription || metadata.description || '';
                
                console.log('Fetched metadata:', { 
                  title: finalTitle, 
                  description: finalDescription?.slice(0, 100) + '...' 
                });
              } catch (metadataError) {
                console.error('Failed to fetch metadata:', metadataError);
                // メタデータ取得に失敗した場合はURLをタイトルとして使用
                finalTitle = finalTitle || linkData.url || 'Untitled';
              }
            }

            // AIに渡すテキストを構築
            const aiInputText = `${finalTitle}\n\n${finalDescription}`.trim();
            
            console.log('AI input text:', aiInputText.slice(0, 200) + '...');

            // AIタグを生成
            const aiResponse = await aiService.generateTags(
              finalTitle,
              finalDescription,
              linkData.url || '',
              user.uid,
              userPlan
            );

            console.log('AI tags generated:', aiResponse.tags);

            // 生成されたタグを既存のタグと統合
            const newTagIds: string[] = [...tagIds]; // 既存のタグIDをコピー
            
            for (const tagName of aiResponse.tags) {
              // 既存のタグから検索（大文字小文字を無視、前後の空白を除去）
              const normalizedTagName = tagName.trim();
              const existingTag = userTags.find(t => 
                t.name.trim().toLowerCase() === normalizedTagName.toLowerCase()
              );
              
              if (existingTag) {
                // 既存のタグがある場合、そのIDを使用（重複回避）
                if (!newTagIds.includes(existingTag.id)) {
                  newTagIds.push(existingTag.id);
                  console.log(`Using existing tag: "${existingTag.name}" (ID: ${existingTag.id})`);
                }
              } else {
                // 新しいタグの場合、作成
                try {
                  const newTagId = await handleAddTag(normalizedTagName, 'ai');
                  if (newTagId && !newTagIds.includes(newTagId)) {
                    newTagIds.push(newTagId);
                    console.log(`Created new tag: "${normalizedTagName}" (ID: ${newTagId})`);
                  }
                } catch (error) {
                  console.error('Failed to create AI tag:', normalizedTagName, error);
                }
              }
            }

            // リンクを更新（AIタグ追加 + ステータス更新）
            const updateData: Partial<Link> = {
              status: 'completed',
              tagIds: newTagIds,
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

            // summaryは条件付きで追加
            if (shouldAutoAnalyze && finalDescription) {
              updateData.summary = `AIが自動生成した要約：\n\n${finalDescription.slice(0, 200)}${finalDescription.length > 200 ? '...' : ''}`;
            }

            await updateLink(newLinkId, updateData);

            // 成功通知
            Alert.alert(
              'AI処理完了',
              `${aiResponse.tags.length}個のタグが自動生成されました。\n\n` +
              `生成されたタグ: ${aiResponse.tags.join(', ')}\n\n` +
              (aiResponse.fromCache ? 'キャッシュから取得' : '新規生成') +
              (aiResponse.tokensUsed > 0 ? `\nトークン使用数: ${aiResponse.tokensUsed}` : ''),
              [{ text: 'OK' }]
            );

          } catch (error) {
            console.error('Auto AI tag generation error:', error);
            
            // エラー時はステータスを更新
            await updateLink(newLinkId, {
              status: 'error',
              error: {
                message: 'AI自動タグ生成中にエラーが発生しました',
                code: 'AUTO_TAG_GENERATION_FAILED',
                timestamp: new Date()
              }
            });

            Alert.alert(
              'AI処理エラー',
              'AIタグの自動生成に失敗しましたが、リンクは正常に保存されました。',
              [{ text: 'OK' }]
            );
          }
        }, 1000); // 1秒後に実行
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

  const handleTogglePin = async (link: Link) => {
    try {
      const newPinnedState = !link.isPinned;
      
      // 楽観的にローカル状態を先に更新
      if (newPinnedState) {
        // ピン留め追加
        setPinnedLinks(prev => {
          const updated = [
            { ...link, isPinned: true, pinnedAt: new Date() },
            ...prev.filter(p => p.id !== link.id)
          ];
          return updated.slice(0, 10); // 最大10個
        });
      } else {
        // ピン留め解除
        setPinnedLinks(prev => prev.filter(p => p.id !== link.id));
      }
      
      // Firestoreを更新
      await linkService.togglePin(link.id, newPinnedState);
      
      console.log(`Pin toggled for ${link.title}: ${newPinnedState}`);
    } catch (error) {
      console.error('Pin toggle error:', error);
      
      // エラー時は元の状態に戻す
      if (!link.isPinned) {
        // ピン留め追加に失敗した場合は削除
        setPinnedLinks(prev => prev.filter(p => p.id !== link.id));
      } else {
        // ピン留め解除に失敗した場合は再追加
        setPinnedLinks(prev => {
          const updated = [
            { ...link, isPinned: true, pinnedAt: link.pinnedAt || new Date() },
            ...prev.filter(p => p.id !== link.id)
          ];
          return updated.slice(0, 10);
        });
      }
      
      Alert.alert('エラー', 'ピン留めの更新に失敗しました');
    }
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
      // リフレッシュ処理は useLinks フックが自動で行う
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error('Refresh error:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // スクロール方向を検知してピン留めセクションの表示制御
  const handleScroll = (event: any) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    const scrollDiff = currentScrollY - scrollY.current;
    
    // スクロール量が少ない場合は無視（小さな揺れを防ぐ）
    if (Math.abs(scrollDiff) < 8) return;
    
    // ピン留めリンクがない場合は処理しない
    if (pinnedLinks.length === 0) return;
    
    // 上スクロール、上部近く、またはピン留めリンクがない場合は表示
    const shouldShow = scrollDiff < 0 || currentScrollY <= 50;
    
    if (shouldShow !== isPinnedVisible) {
      setIsPinnedVisible(shouldShow);
      
      Animated.timing(pinnedAnimatedValue, {
        toValue: shouldShow ? 1 : 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
    
    scrollY.current = currentScrollY;
  };

  // タグでフィルタリングされたリンク
  const filteredLinks = selectedTagIds.length > 0 
    ? links.filter(link => 
        selectedTagIds.some(selectedTagId => 
          link.tagIds?.includes(selectedTagId)
        )
      )
    : links;

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

  const getUserInitial = () => {
    return user?.email?.charAt(0).toUpperCase() || 'U';
  };

  const handleAddTag = async (tagName: string, type: 'manual' | 'ai' | 'recommended' = 'manual') => {
    if (!user?.uid) return '';
    
    try {
      const tagId = await createOrGetTag(tagName, type);
      console.log('HomeScreen: created tag with ID:', tagId);
      return tagId;
    } catch (error) {
      console.error('HomeScreen: tag creation error:', error);
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
    <LinkCard
      link={item}
      tags={userTags} // タグ情報を渡す
      onPress={() => {
        console.log('Link detail view for:', item.title);
        setSelectedLink(item);
        setShowDetailModal(true);
      }}
      onToggleBookmark={() => handleToggleBookmark(item)}
      onTogglePin={() => handleTogglePin(item)}
      onDelete={() => handleDeleteLink(item)}
    />
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      {selectedTagIds.length > 0 ? (
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
            右下の + ボタンを押して{'\n'}
            最初のリンクを保存しましょう！
          </Text>
        </>
      )}
    </View>
  );

  // タグ名の配列を生成（UI表示用）
  const allTagNames = userTags.map(tag => tag.name);
  console.log('HomeScreen - allTagNames:', allTagNames);

  return (
    <SafeAreaView style={styles.container}>
      {/* 固定ヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.iconButton}
          onPress={() => setShowAIUsageDashboard(true)}
        >
          <Feather name="zap" size={20} color="#8A2BE2" />
        </TouchableOpacity>
        <Text style={styles.title}>LinkRanger</Text>
        <TouchableOpacity style={styles.accountButton} onPress={handleAccountPress}>
          <Text style={styles.accountText}>{getUserInitial()}</Text>
        </TouchableOpacity>
      </View>

      {/* 固定タグフィルター */}
      <View style={styles.tagFilterContainer}>
        <TagFilter
          tags={userTags.map(tag => tag.name)}
          selectedTags={selectedTagIds.map(tagId => {
            const tag = userTags.find(t => t.id === tagId);
            return tag ? tag.name : '';
          }).filter(Boolean)}
          onTagToggle={(tagName: string) => {
            console.log('TagFilter onTagToggle called with:', tagName);
            const tag = userTags.find(t => t.name === tagName);
            if (tag) {
              handleTagToggle(tag.id);
            }
          }}
          onClearAll={handleClearTags}
          onAddTag={() => setShowAddTagModal(true)}
        />
      </View>

      {/* アニメーション付きピン留めリンク */}
      {pinnedLinks.length > 0 && (
        <Animated.View 
          style={[
            styles.pinnedSection,
            {
              opacity: pinnedAnimatedValue,
              transform: [
                { 
                  translateY: pinnedAnimatedValue.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-60, 0],
                  })
                }
              ],
            }
          ]}
        >
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pinnedList}
          >
            {pinnedLinks.map((link) => (
              <PinnedLinkCard
                key={link.id}
                link={link}
                onPress={() => {
                  setSelectedLink(link);
                  setShowDetailModal(true);
                }}
                onUnpin={() => handleTogglePin(link)}
                onOpenExternal={() => handleOpenExternalLink(link.url)}
              />
            ))}
          </ScrollView>
        </Animated.View>
      )}

      {/* スクロール可能なメインコンテンツ（リンク一覧のみ） */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#8A2BE2"
          />
        }
      >
        {/* リンク一覧 */}
        <View style={styles.linksSection}>
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
          ) : filteredLinks.length === 0 ? (
            renderEmptyState()
          ) : (
            <View style={styles.linksList}>
              {filteredLinks.map((item) => (
                <View key={item.id} style={styles.linkItem}>
                  {renderLinkItem({ item })}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* 下部スペース（FAB用） */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* フローティングアクションボタン */}
      <FloatingActionButton onPress={() => setShowAddModal(true)} />

      {/* モーダル */}
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

      {/* AI使用量ダッシュボード */}
      <AIUsageDashboard
        visible={showAIUsageDashboard}
        onClose={() => setShowAIUsageDashboard(false)}
        userId={user?.uid || ''}
        userPlan={userPlan}
      />

      {/* リンク詳細モーダル */}
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
          />
        </Modal>
      )}
    </SafeAreaView>
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
    paddingBottom: 100, // FABのスペースを確保
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    // borderBottomWidth: 1,
    // borderBottomColor: '#333',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#CCC',
  },
  tagFilterContainer: {
    height: 52,
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#2A2A2A',
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
  pinnedSection: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    backgroundColor: '#121212',
    minHeight: 80, // 最小高さを設定
  },
  pinnedList: {
    paddingLeft: 0,
    paddingRight: 8,
    alignItems: 'center', // 縦方向の中央揃え
  },
  linksSection: {
    paddingVertical: 20,
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
  linksList: {
    // リンクリストのスタイル
  },
  linkItem: {
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
  bottomSpacer: {
    height: 100, // FABのスペースを確保
  },

}); 
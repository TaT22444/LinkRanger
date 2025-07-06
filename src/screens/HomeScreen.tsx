import React, { useState, useCallback, useEffect } from 'react';
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
} from 'react-native';
import { Feather } from '@expo/vector-icons';
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

export const HomeScreen: React.FC = () => {
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
  const [selectedLink, setSelectedLink] = useState<Link | null>(null);

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
      status: shouldAutoAnalyze ? 'processing' : 'pending',
      tagIds, // 変換されたタグIDを使用
    } as Omit<Link, 'id' | 'createdAt' | 'updatedAt'>;
    
    console.log('Creating link with tagIds:', tagIds);
    
    try {
      const newLinkId = await createLink(fullLinkData);
      
      // 成功アラートを表示
      Alert.alert('成功', 'リンクを保存しました');
      
      // プロプランユーザーの場合、自動でAI分析を開始
      if (shouldAutoAnalyze && newLinkId) {
        setTimeout(async () => {
          try {
            // TODO: 実際のAI分析API呼び出し
            // 現在はダミー処理
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            const mockSummary = `このリンクは${linkData.title}に関する内容です。プロプラン特典により自動で要約が生成されました。

• 主要なポイントが整理されている
• 実用的な情報が含まれている  
• 参考価値の高いコンテンツ
• 最新の情報に基づいた内容

このリンクは保存価値が高く、後で参照する際に役立つでしょう。`;

            await updateLink(newLinkId, {
              status: 'completed',
              summary: mockSummary,
              aiAnalysis: {
                sentiment: 'positive',
                category: 'General',
                keywords: ['自動分析', '要約', 'プロプラン'],
                confidence: 0.9
              }
            });
          } catch (error) {
            console.error('Auto AI analysis error:', error);
            await updateLink(newLinkId, {
              status: 'error',
              error: {
                message: '自動AI分析中にエラーが発生しました',
                code: 'AUTO_ANALYSIS_FAILED',
                timestamp: new Date()
              }
            });
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
    <View style={styles.container}>
      {/* 透明な固定ヘッダー */}
      <View style={styles.headerContainer}>
        <SafeAreaView style={styles.headerSafeArea}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.iconButton}>
              <Feather name="bell" size={20} color="#CCC" />
            </TouchableOpacity>
            <View style={styles.headerSpacer} />
            <TouchableOpacity style={styles.accountButton} onPress={handleLogout}>
              <Text style={styles.accountText}>{getUserInitial()}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>

      {/* 透明な固定タグフィルター */}
      <View style={styles.fixedTagFilter}>
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

        {/* メインスクロールコンテンツ */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#8A2BE2"
            />
          }
        >
          {/* ピン留めリンク */}
          {pinnedLinks.length > 0 && (
            <View style={styles.pinnedSection}>
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
            </View>
          )}

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
          onDeleteTag={handleDeleteTag}
        />

        <Modal
          visible={showDetailModal}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowDetailModal(false)}
        >
          {selectedLink && (
            <LinkDetailScreen
              link={selectedLink}
              onClose={() => {
                setShowDetailModal(false);
                setSelectedLink(null);
              }}
              onUpdateLink={updateLink}
              userPlan={userPlan}
              availableTags={userTags.map(tag => ({ id: tag.id, name: tag.name }))}
              onCreateTag={handleAddTag}
              onDeleteTag={handleDeleteTag}
            />
          )}
        </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'rgba(18, 18, 18, 0.95)',
    zIndex: 200,
  },
  iconButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#2A2A2A',
  },
  headerSpacer: {
    flex: 1,
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
  fixedTagFilter: {
    backgroundColor: 'rgba(18, 18, 18, 0.95)',
    zIndex: 100,
    paddingBottom: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100, // FABのスペースを確保
  },
  pinnedSection: {
    paddingVertical: 12,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 12,
    marginLeft: 20,
  },
  pinnedList: {
    paddingLeft: 20,
    paddingRight: 8,
  },
  linksSection: {
    paddingVertical: 12,
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
    marginBottom: 12,
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
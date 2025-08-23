import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  FlatList,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  TouchableWithoutFeedback,
  Linking,
  ScrollView,
  Dimensions,
  AppState,
  AppStateStatus,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Modalize } from 'react-native-modalize';
import { useNavigation, useRoute, RouteProp, useFocusEffect, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { useLinks, useTags } from '../hooks/useFirestore';
import { LinkCard } from '../components/LinkCard';
import { UpgradeModal } from '../components/UpgradeModal';
import { LinkDetailScreen } from './LinkDetailScreen';
import { AddTagToLinksModal } from '../components/AddTagToLinksModal';
import { Link, Tag } from '../types';
import { 
  linkService, 
  tagService, 
  userService 
} from '../services/firestoreService';
import { metadataService } from '../services/metadataService';
import AsyncStorage from '@react-native-async-storage/async-storage';

type TagDetailScreenRouteProp = RouteProp<{ TagDetail: { tag: Tag } }, 'TagDetail'>;

export const TagDetailScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const route = useRoute<TagDetailScreenRouteProp>();
  
  // 🔧 早期リターン: ルートパラメータが不正な場合
  if (!route?.params?.tag) {
    console.error('❌ TagDetailScreen: 必要なパラメータが不足しています');
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#FFF', fontSize: 16 }}>エラー: タグ情報が見つかりません</Text>
        <TouchableOpacity 
          style={{ marginTop: 20, backgroundColor: '#8A2BE2', padding: 12, borderRadius: 8 }}
          onPress={() => navigation.goBack()}
        >
          <Text style={{ color: '#FFF', fontSize: 14 }}>戻る</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }
  
  // Convert serialized dates back to Date objects
  const tag = useMemo(() => {
    const rawTag = route?.params?.tag;
    
    // 🔧 安全チェック: パラメータが存在しない場合のフォールバック
    if (!rawTag) {
      console.error('❌ TagDetailScreen: タグパラメータが不正です', { route: route?.params });
      // デフォルトタグを返すか、エラーを表示
      return {
        id: 'error',
        name: 'エラー',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastUsedAt: new Date(),
        firstUsedAt: new Date(),
        userId: '',
        type: 'manual' as const
      };
    }
    return {
      ...rawTag,
      createdAt: typeof rawTag.createdAt === 'string' ? new Date(rawTag.createdAt) : rawTag.createdAt,
      updatedAt: typeof rawTag.updatedAt === 'string' ? new Date(rawTag.updatedAt) : rawTag.updatedAt,
      lastUsedAt: typeof rawTag.lastUsedAt === 'string' ? new Date(rawTag.lastUsedAt) : rawTag.lastUsedAt,
      firstUsedAt: typeof rawTag.firstUsedAt === 'string' ? new Date(rawTag.firstUsedAt) : rawTag.firstUsedAt,
    } as Tag;
  }, [route?.params?.tag]);
  const { user } = useAuth();
  const { links, loading: linksLoading, updateLink, deleteLink } = useLinks(user?.uid || null);
  const { tags, deleteTag: deleteTagById, createOrGetTag, loading: tagsLoading } = useTags(user?.uid || null);

  // State management
  const [refreshing, setRefreshing] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeTargetTag, setMergeTargetTag] = useState('');
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [selectedLink, setSelectedLink] = useState<Link | null>(null);
  const [showLinkDetail, setShowLinkDetail] = useState(false);
  const [showAddTagToLinksModal, setShowAddTagToLinksModal] = useState(false);
  // 🔧 安全チェック: 初期化時にundefinedエラーを防ぐ
  const safeLinks = links || [];
  const safeTags = tags || [];

  // Filter links for this tag - moved before useFocusEffect to fix declaration order
  const tagLinks = useMemo(() => {
    return safeLinks.filter(link => link?.tagIds?.includes(tag.id));
  }, [safeLinks, tag.id]);

  // Available tags for merge (excluding current tag)
  const availableTagsForMerge = useMemo(() => {
    return safeTags.filter(t => t?.id !== tag.id);
  }, [safeTags, tag.id]);

  // このタグが付与されていないリンクを取得
  const linksWithoutThisTag = useMemo(() => {
    return safeLinks.filter(link => !link.tagIds?.includes(tag.id));
  }, [safeLinks, tag.id]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    // Refresh is handled by the hooks automatically
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const handleLinkPress = (link: Link) => {
    // Show link detail screen as modal
    console.log('Link pressed:', link.title);
    setSelectedLink(link);
    setShowLinkDetail(true);
  };

  const handleMarkAsRead = useCallback(async (linkId: string) => {
    try {
      await updateLink(linkId, { isRead: true });
    } catch (error) {
      console.error('Error marking link as read:', error);
    }
  }, [updateLink]);

  const handleToggleBookmark = useCallback(async (link: Link) => {
    try {
      await updateLink(link.id, { isBookmarked: !link.isBookmarked });
    } catch (error) {
      console.error('Error toggling bookmark:', error);
      Alert.alert('エラー', 'ブックマークの更新に失敗しました');
    }
  }, [updateLink]);

  const handleDeleteLink = useCallback(async (linkId: string) => {
    if (!user?.uid) return;
    
    Alert.alert(
      'リンクを削除',
      'このリンクを削除しますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteLink(linkId, user.uid);
            } catch (error) {
              console.error('Error deleting link:', error);
              Alert.alert('エラー', 'リンクの削除に失敗しました');
            }
          },
        },
      ]
    );
  }, [deleteLink, user?.uid]);

  const handleAnalysisLinkPress = useCallback(async (url: string) => {
    try {
      console.log('🔗 参考資料リンクをタップ:', url);
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('エラー', 'このリンクを開くことができません');
      }
    } catch (error) {
      console.error('Error opening link:', error);
      Alert.alert('エラー', 'リンクの開設に失敗しました');
    }
  }, []);



  const handleDeleteTag = useCallback(() => {
    Alert.alert(
      'タグを削除',
      `「${tag.name}」タグを削除しますか？\n関連するリンクからもこのタグが削除されます。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTagById(tag.id);
              navigation.goBack();
            } catch (error) {
              console.error('Error deleting tag:', error);
              Alert.alert('エラー', 'タグの削除に失敗しました');
            }
          },
        },
      ]
    );
  }, [tag, deleteTagById, navigation]);

  // 選択されたリンクにタグを付与
  const handleAddTagToSelectedLinks = useCallback(async (selectedLinkIds: string[]) => {
    if (!user?.uid || selectedLinkIds.length === 0) return;
    
    try {
      // 各リンクにタグを付与
      const updatePromises = selectedLinkIds.map(linkId => {
        const link = safeLinks.find(l => l.id === linkId);
        if (!link) return Promise.resolve();
        
        const currentTagIds = link.tagIds || [];
        const newTagIds = [...currentTagIds, tag.id];
        
        return updateLink(linkId, { tagIds: newTagIds });
      });
      
      await Promise.all(updatePromises);
      
      Alert.alert(
        '完了',
        `${selectedLinkIds.length}件のリンクに「${tag.name}」タグを付与しました`
      );
      
      setShowAddTagToLinksModal(false);
    } catch (error) {
      console.error('Error adding tag to links:', error);
      Alert.alert('エラー', 'タグの付与に失敗しました');
    }
  }, [user?.uid, safeLinks, tag.id, tag.name, updateLink]);

  const handleAddTag = useCallback(async (tagName: string, type: 'manual' | 'ai' | 'recommended' = 'manual') => {
    if (!user?.uid) return '';
    
    try {
      const tagId = await createOrGetTag(tagName, type);
      return tagId;
    } catch (error) {
      Alert.alert('エラー', 'タグの作成に失敗しました');
      throw error;
    }
  }, [user?.uid]);

  const handleDeleteTagByName = useCallback(async (tagName: string) => {
    if (!user?.uid) return;
    
    const tagToDelete = tags.find(t => t.name === tagName);
    if (tagToDelete) {
      try {
        await deleteTagById(tagToDelete.id);
      } catch (error) {
        Alert.alert('エラー', 'タグの削除に失敗しました');
      }
    }
  }, [user?.uid, tags, deleteTagById]);

  const handleMergeTag = useCallback(async () => {
    if (!mergeTargetTag.trim() || !user?.uid) return;

    try {
      // Find or create target tag
      const targetTagId = await createOrGetTag(mergeTargetTag.trim());
      
      if (targetTagId === tag.id) {
        Alert.alert('エラー', '同じタグには統合できません');
        return;
      }

      // Update all links to use the target tag instead
      const updatePromises = tagLinks.map(link => {
        const newTagIds = link.tagIds
          .filter(id => id !== tag.id) // Remove current tag
          .concat(targetTagId); // Add target tag
        
        return updateLink(link.id, { tagIds: Array.from(new Set(newTagIds)) });
      });

      await Promise.all(updatePromises);

      // Delete the current tag
      await deleteTagById(tag.id);

      setShowMergeModal(false);
      navigation.goBack();
    } catch (error) {
      console.error('Error merging tag:', error);
      Alert.alert('エラー', 'タグの統合に失敗しました');
    }
  }, [mergeTargetTag, user?.uid, createOrGetTag, tag, tagLinks, updateLink, deleteTagById, navigation]);

  const renderLinkItem = ({ item }: { item: Link }) => {
    const linkTags = tags.filter(t => item.tagIds.includes(t.id));
    
    return (
      <View style={styles.linkItemContainer}>
        <LinkCard
          link={item}
          tags={linkTags}
          onPress={() => handleLinkPress(item)}
          onToggleBookmark={() => handleToggleBookmark(item)}
          onDelete={() => handleDeleteLink(item.id)}
          onMarkAsRead={() => handleMarkAsRead(item.id)}
        />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Feather name="arrow-left" size={16} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>#{tag.name}</Text>
        <TouchableOpacity
          style={styles.optionsButton}
          onPress={() => setShowOptionsMenu(true)}
        >
          <Feather name="more-vertical" size={16} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Scrollable Content */}
      <FlatList
        data={tagLinks}
        renderItem={renderLinkItem}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#8A2BE2"
          />
        }
        contentContainerStyle={styles.scrollContentContainer}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.headerContainer}>
            {/* Links Section Header */}
            <View style={styles.linksSectionHeader}>
              <Text style={styles.linksSectionTitle}>
                保存リンク ({tagLinks.length})
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          linksLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#8A2BE2" />
              <Text style={styles.loadingText}>読み込み中...</Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Feather name="link" size={48} color="#666" />
              <Text style={styles.emptyText}>このタグのリンクはありません</Text>
            </View>
          )
        }
      />

      {/* Options Menu Modal */}
      <Modal
        visible={showOptionsMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowOptionsMenu(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowOptionsMenu(false)}>
          <View style={styles.optionsOverlay}>
            <View style={styles.optionsMenu}>
              {/* <TouchableOpacity
                style={styles.optionItem}
                onPress={() => {
                  setShowOptionsMenu(false);
                  setShowMergeModal(true);
                }}
              >
                <Feather name="git-merge" size={20} color="#FFF" />
                <Text style={styles.optionText}>タグを統合</Text>
              </TouchableOpacity> */}
              
              <TouchableOpacity
                style={styles.optionItem}
                onPress={() => {
                  console.log('🔍 ボタンタップ: データ状態', {
                    linksWithoutThisTag: linksWithoutThisTag.length,
                    totalLinks: safeLinks.length,
                    tagId: tag.id,
                    tagName: tag.name
                  });
                  setShowOptionsMenu(false);
                  setShowAddTagToLinksModal(true);
                }}
              >
                <Feather name="plus" size={20} color="#8A2BE2" />
                <Text style={styles.optionText}>このタグを付与</Text>
              </TouchableOpacity>
              
              <View style={styles.optionSeparator} />
              
              <TouchableOpacity
                style={[styles.optionItem, styles.deleteOption]}
                onPress={() => {
                  setShowOptionsMenu(false);
                  handleDeleteTag();
                }}
              >
                <Feather name="trash-2" size={20} color="#FF6B6B" />
                <Text style={[styles.optionText, { color: '#FF6B6B' }]}>タグを削除</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      
      {/* LinkDetailScreen Modal */}
      {selectedLink && (
        <Modal
          visible={showLinkDetail}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowLinkDetail(false)}
        >
          <LinkDetailScreen
            link={selectedLink}
            onClose={() => setShowLinkDetail(false)}
            onUpdateLink={async (linkId: string, updatedData: Partial<Link>) => {
              await updateLink(linkId, updatedData);
              setShowLinkDetail(false);
            }}
            userPlan={'free'}
            availableTags={tags.map(tag => ({ id: tag.id, name: tag.name }))}
            onCreateTag={handleAddTag}
            onDeleteTag={handleDeleteTagByName}
            onDelete={async () => {
              try {
                await deleteLink(selectedLink.id, user?.uid || '');
                setShowLinkDetail(false);
                setSelectedLink(null);
              } catch (error) {
                Alert.alert('エラー', 'リンクの削除に失敗しました');
              }
            }}
          />
        </Modal>
      )}

      {/* タグ付与モーダル */}
      <AddTagToLinksModal
        visible={showAddTagToLinksModal}
        onClose={() => setShowAddTagToLinksModal(false)}
        links={linksWithoutThisTag}
        tagName={tag.name}
        onConfirm={handleAddTagToSelectedLinks}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backButton: {
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  headerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
  },
  optionsButton: {
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContentContainer: {
    paddingBottom: 20,
  },
  analysisStatusText: {
    fontSize: 10,
    color: '#8A2BE2',
    fontWeight: '600',
    backgroundColor: 'rgba(138, 43, 226, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  analysisStatusTextSimple: {
    fontSize: 10,
    color: '#888',
    fontWeight: '500',
  },

  analysisResult: {
    fontSize: 14,
    color: '#E8E8E8',
    lineHeight: 20,
    marginBottom: 10,
  },
  analysisFooter: {
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
    paddingTop: 8,
    marginTop: 4,
  },
  analysisStats: {
    fontSize: 9,
    color: '#666',
    textAlign: 'right',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#121212',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#666',
    fontSize: 16,
    marginTop: 12,
  },
  linkItemContainer: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#2A2A2A',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalDescription: {
    fontSize: 14,
    color: '#AAA',
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  modalInput: {
    backgroundColor: '#121212',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#FFF',
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#666',
  },
  modalConfirmButton: {
    backgroundColor: '#8A2BE2',
  },
  modalCancelText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
  },
  modalConfirmText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Options menu styles
  optionsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 100,
    paddingRight: 16,
  },
  optionsMenu: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    paddingVertical: 8,
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  optionText: {
    fontSize: 16,
    color: '#FFF',
    fontWeight: '500',
  },
  optionSeparator: {
    height: 1,
    backgroundColor: '#333',
    marginHorizontal: 16,
  },
  deleteOption: {
    // Additional styling for delete option if needed
  },
  noLinksContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  noLinksText: {
    fontSize: 16,
    color: '#8A2BE2',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 24,
  },




  // Loading Styles
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  loadingText: {
    fontSize: 12,
    color: '#888',
    marginLeft: 8,
  },





  regenerateButton: {
    padding: 6,
    borderRadius: 6,
  },
  regenerateButtonDisabled: {
    opacity: 0.5,
  },
  

  testFeatureBadge: {
    fontSize: 10,
    color: '#FF6B35',
    backgroundColor: 'rgba(255, 107, 53, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Basic UI styles
  headerContainer: {
    backgroundColor: '#121212',
  },
  linksSectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 32,
    paddingBottom: 16,
  },
  linksSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  

}); 
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Linking,
  Alert,
  Modal,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Link, UserPlan } from '../types';
import { TagSelectorModal } from '../components/TagSelectorModal';
import { notificationService } from '../services/notificationService';

interface Tag {
  id: string;
  name: string;
}

interface LinkDetailScreenProps {
  link: Link;
  onClose: () => void;
  onUpdateLink?: (linkId: string, updates: Partial<Link>) => Promise<void>;
  userPlan?: UserPlan;
  availableTags?: Tag[];
  onCreateTag?: (tagName: string, type?: 'manual' | 'ai') => Promise<string>;
  onDeleteTag?: (tagName: string) => Promise<void>;
  onDelete?: () => void;
}

export const LinkDetailScreen: React.FC<LinkDetailScreenProps> = ({
  link,
  onClose,
  onUpdateLink,
  userPlan = 'free',
  availableTags = [],
  onCreateTag,
  onDeleteTag,
  onDelete,
}) => {
  const [showTagModal, setShowTagModal] = useState(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);

  const handleTagsChange = async (newTags: string[]) => {
    if (onUpdateLink) {
      try {
        await onUpdateLink(link.id, { tagIds: newTags });
      } catch (error) {
        Alert.alert('エラー', 'タグの更新に失敗しました');
      }
    }
  };

  const handleOpenExternalLink = async () => {
    try {
      const supported = await Linking.canOpenURL(link.url);
      if (supported) {
        // 3日間未アクセス通知システム：リンクアクセス時の処理
        await notificationService.handleLinkAccess(link);
        
        // 外部リンクを開く前に既読マーク
        if (onUpdateLink && !link.isRead) {
          await onUpdateLink(link.id, { isRead: true });
        }
        await Linking.openURL(link.url);
      } else {
        Alert.alert('エラー', 'このリンクを開くことができません');
      }
    } catch (error) {
      Alert.alert('エラー', 'リンクを開く際にエラーが発生しました');
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'リンクを削除',
      'このリンクを削除しますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: () => {
            if (onDelete) {
              onDelete();
            }
            onClose();
          },
        },
      ]
    );
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const getDomainFromUrl = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  const getTagName = (tagId: string): string => {
    const tag = availableTags.find(t => t.id === tagId);
    
    // 🔧 タグが見つからない場合の表示を改善（IDではなく適切なフォールバック）
    if (tag) {
      return tag.name;
    } else {
      // タグが見つからない場合（削除されたタグや制限で作成されなかったタグ）
      console.warn('⚠️ LinkDetailScreen: タグが見つかりません', { tagId, availableTagsCount: availableTags.length });
      return '削除されたタグ'; // ユーザーフレンドリーな表示
    }
  };

  const getDisplayTags = () => {
    if (!link.tagIds || link.tagIds.length === 0) return [];
    
    // 重複するtagIdを除去してユニークにする
    const uniqueTagIds = [...new Set(link.tagIds)];
    
    return uniqueTagIds.map(tagId => ({
      id: tagId,
      name: getTagName(tagId)
    }));
  };

  const displayTags = getDisplayTags();

  return (
    <SafeAreaView style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onClose}>
          <Text style={styles.backButtonText}>閉じる</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.optionsButton}
          onPress={() => setShowOptionsMenu(true)}
        >
          <Feather name="more-vertical" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* タイトルと基本情報 */}
        <View style={styles.titleSection}>
          <Text style={styles.title}>{link.title}</Text>
          <View style={styles.meta}>
            <Text style={styles.domain}>{getDomainFromUrl(link.url)}</Text>
            <Text style={styles.separator}>•</Text>
            <Text style={styles.date}>{formatDate(link.createdAt)}</Text>
          </View>
        </View>

        {/* 説明 */}
        {link.description && (
          <View style={styles.descriptionSection}>
            <Text style={styles.descriptionText}>{link.description}</Text>
          </View>
        )}

        {/* タグ */}
        <View style={styles.tagSection}>
          <View style={styles.tagHeader}>
            <Text style={styles.tagTitle}>タグ</Text>
            <TouchableOpacity style={styles.tagEditButton} onPress={() => setShowTagModal(true)}>
              <Feather name="edit-2" size={16} color="#8A2BE2" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.tagsContainer}>
            {displayTags.length > 0 ? (
              displayTags.map((tag, index) => (
                <View key={`${tag.id}-${index}`} style={styles.tag}>
                  <Text style={styles.tagText}>#{tag.name}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.noTagsText}>タグなし</Text>
            )}
          </View>
        </View>

        {/* アクション */}
        <View style={styles.actionSection}>
          <TouchableOpacity style={styles.openLinkButton} onPress={handleOpenExternalLink}>
            <Feather name="external-link" size={18} color="#FFF" />
            <Text style={styles.openLinkButtonText}>リンクを開く</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomSpacing} />
      </ScrollView>

      {/* オプションメニューモーダル */}
      <Modal
        visible={showOptionsMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowOptionsMenu(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowOptionsMenu(false)}>
          <View style={styles.optionsOverlay}>
            <View style={styles.optionsMenu}>
              <TouchableOpacity
                style={styles.optionItem}
                onPress={() => {
                  setShowOptionsMenu(false);
                  handleOpenExternalLink();
                }}
              >
                <Feather name="external-link" size={20} color="#8A2BE2" />
                <Text style={styles.optionText}>リンクを開く</Text>
              </TouchableOpacity>
              
              <View style={styles.optionSeparator} />
              
              <TouchableOpacity
                style={[styles.optionItem, styles.deleteOption]}
                onPress={() => {
                  setShowOptionsMenu(false);
                  handleDelete();
                }}
              >
                <Feather name="trash-2" size={20} color="#FF6B6B" />
                <Text style={[styles.optionText, { color: '#FF6B6B' }]}>リンクを削除</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* タグ管理モーダル */}
      {onCreateTag && (
        <TagSelectorModal
          visible={showTagModal}
          onClose={() => setShowTagModal(false)}
          availableTags={availableTags}
          selectedTags={link.tagIds || []}
          onTagsChange={handleTagsChange}
          onCreateTag={onCreateTag}
          onDeleteTag={onDeleteTag}
          linkTitle={link.title}
          linkUrl={link.url}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  
  // ヘッダー
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    // backgroundColor: '#1A1A1A',
  },
  backButton: {
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#1A1A1A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 14,
    color: '#fff',
  },
  
  // コンテンツ
  content: {
    flex: 1,
  },
  
  // タイトルセクション
  titleSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 4,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  domain: {
    fontSize: 14,
    color: '#888',
  },
  separator: {
    marginHorizontal: 4,
    color: '#888',
  },
  date: {
    fontSize: 14,
    color: '#888',
  },
  
  // 説明セクション
  descriptionSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  descriptionText: {
    fontSize: 14,
    color: '#CCC',
    lineHeight: 20,
  },
  
  // タグセクション
  tagSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  tagHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tagTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  tagEditButton: {
    paddingHorizontal: 16,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#1A1A1A',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
tag: {
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 6,
    marginBottom: 4,
  },
  tagText: {
    fontSize: 12,
    color: '#CCC',
    fontWeight: '500',
  },
  noTagsText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  
  // アクションセクション
  actionSection: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
    backgroundColor: '#1A1A1A',
  },
  openLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8A2BE2',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
  },
  openLinkButtonText: {
    fontSize: 14,
    color: '#FFF',
    marginLeft: 8,
  },
  
  // オプションメニュー関連のスタイル
  optionsButton: {
    paddingHorizontal: 12,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#1A1A1A',
  },
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
  
  // 底部の余白
  bottomSpacing: {
    height: 40,
  },
});
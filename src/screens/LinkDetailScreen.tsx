import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Linking,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Link, UserPlan } from '../types';
import { TagSelectorModal } from '../components/TagSelectorModal';

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
  onCreateTag?: (tagName: string, type?: 'manual' | 'ai' | 'recommended') => Promise<string>;
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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);

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

  const handleAIAnalysis = async () => {
    if (isAnalyzing) return;

    setIsAnalyzing(true);
    
    try {
      if (onUpdateLink) {
        await onUpdateLink(link.id, { status: 'processing' });
      }

      // TODO: 実際のAI分析API呼び出し
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const mockSummary = `${link.title}の要約:\n\n主要なポイントと詳細な解説が含まれています。実用的な情報と具体的な例が豊富で、参考価値の高いリソースです。`;

      if (onUpdateLink) {
        await onUpdateLink(link.id, {
          status: 'completed',
          summary: mockSummary,
          aiAnalysis: {
            sentiment: 'positive',
            category: 'General',
            keywords: ['参考', '解説', '実用'],
            confidence: 0.9
          }
        });
      }
    } catch (error) {
      console.error('AI analysis error:', error);
      if (onUpdateLink) {
        await onUpdateLink(link.id, { status: 'error' });
      }
    } finally {
      setIsAnalyzing(false);
    }
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
    return tag ? tag.name : tagId;
  };

  const getDisplayTags = () => {
    if (!link.tagIds || link.tagIds.length === 0) return [];
    return link.tagIds.map(tagId => ({
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
          <Feather name="arrow-left" size={24} color="#FFF" />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.openButton} onPress={handleOpenExternalLink}>
          <Feather name="external-link" size={20} color="#8A2BE2" />
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

        {/* AI要約 */}
        {link.summary && (
          <View style={styles.summarySection}>
            <Text style={styles.summaryText}>{link.summary}</Text>
          </View>
        )}

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
            <TouchableOpacity onPress={() => setShowTagModal(true)}>
              <Feather name="edit-2" size={16} color="#8A2BE2" />
            </TouchableOpacity>
          </View>
          
          <View style={styles.tagsContainer}>
            {displayTags.length > 0 ? (
              displayTags.map((tag) => (
                <View key={tag.id} style={styles.tag}>
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
          {link.status !== 'processing' && !isAnalyzing && (
            <TouchableOpacity style={styles.actionButton} onPress={handleAIAnalysis}>
              <Feather name="zap" size={18} color="#8A2BE2" />
              <Text style={styles.actionButtonText}>AI要約を生成</Text>
            </TouchableOpacity>
          )}
          
          {(link.status === 'processing' || isAnalyzing) && (
            <View style={styles.processingContainer}>
              <ActivityIndicator size="small" color="#8A2BE2" />
              <Text style={styles.processingText}>AI解析中...</Text>
            </View>
          )}
          
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <Feather name="trash-2" size={18} color="#FF6B6B" />
            <Text style={styles.deleteButtonText}>削除</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomSpacing} />
      </ScrollView>

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
    backgroundColor: '#1A1A1A',
  },
  backButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  openButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
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
  
  // AI要約セクション
  summarySection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  summaryText: {
    fontSize: 14,
    color: '#FFF',
    lineHeight: 20,
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
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2A2A2A',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  actionButtonText: {
    fontSize: 14,
    color: '#8A2BE2',
    marginLeft: 8,
  },
  processingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  processingText: {
    fontSize: 14,
    color: '#888',
    marginLeft: 8,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF6B6B',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
  },
  deleteButtonText: {
    fontSize: 14,
    color: '#FFF',
    marginLeft: 8,
  },
  
  // 底部の余白
  bottomSpacing: {
    height: 40,
  },
}); 
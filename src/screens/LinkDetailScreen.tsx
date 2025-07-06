import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Image,
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
}

export const LinkDetailScreen: React.FC<LinkDetailScreenProps> = ({
  link,
  onClose,
  onUpdateLink,
  userPlan = 'free',
  availableTags = [],
  onCreateTag,
  onDeleteTag,
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

  const handleRemoveTag = async (tagIdToRemove: string) => {
    const tagToRemove = availableTags.find(tag => tag.id === tagIdToRemove);
    const tagName = tagToRemove ? tagToRemove.name : 'このタグ';
    
    Alert.alert(
      'タグを削除',
      `「${tagName}」を削除しますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        { 
          text: '削除', 
          style: 'destructive',
          onPress: async () => {
            const currentTags = link.tagIds || [];
            const newTags = currentTags.filter(tagId => tagId !== tagIdToRemove);
            await handleTagsChange(newTags);
          }
        }
      ]
    );
  };

  const handleCreateTag = async (tagName: string) => {
    if (onCreateTag) {
      await onCreateTag(tagName);
    }
  };

  const handleAITagSuggestion = async () => {
    try {
      // TODO: 実際のAI分析API呼び出し
      // 現在はダミー処理
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const mockSuggestedTags = ['AI', 'テクノロジー', '開発'];
      const currentTags = link.tagIds || [];
      const newTags = [...new Set([...currentTags, ...mockSuggestedTags])];
      
      if (onUpdateLink) {
        await onUpdateLink(link.id, { tagIds: newTags });
      }
      
      Alert.alert('完了', 'AIがタグを提案しました');
    } catch (error) {
      Alert.alert('エラー', 'AIタグ提案に失敗しました');
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

  const handleAIAnalysis = async () => {
    if (isAnalyzing) return;

    Alert.alert(
      'AI分析を開始',
      'このリンクの内容をAIで分析し、要約を生成しますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '分析開始', onPress: startAIAnalysis }
      ]
    );
  };

  const startAIAnalysis = async () => {
    setIsAnalyzing(true);
    
    try {
      // まずステータスを更新
      if (onUpdateLink) {
        await onUpdateLink(link.id, { status: 'processing' });
      }

      // TODO: 実際のAI分析API呼び出し
      // 現在はダミー処理
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const mockSummary = `このリンクは${link.title}に関する内容です。主要なポイントとして以下が挙げられます：

• 技術的な解説が詳細に記載されている
• 実用的な例とサンプルコードが豊富
• 初心者から上級者まで幅広く対応
• 最新のトレンドと技術動向を反映

全体的に信頼性が高く、参考価値の高いリソースとして推奨できます。特に実装時の注意点や最適化のコツについて詳しく説明されており、実践的な知識を得ることができます。`;

      if (onUpdateLink) {
        await onUpdateLink(link.id, {
          status: 'completed',
          summary: mockSummary,
          aiAnalysis: {
            sentiment: 'positive',
            category: 'Technology',
            keywords: ['技術', '解説', 'サンプル', '実装'],
            confidence: 0.95
          }
        });
      }

      Alert.alert('分析完了', 'AI分析が完了しました。要約が生成されました。');
    } catch (error) {
      console.error('AI analysis error:', error);
      
      if (onUpdateLink) {
        await onUpdateLink(link.id, {
          status: 'error',
          error: {
            message: 'AI分析中にエラーが発生しました',
            code: 'AI_ANALYSIS_FAILED',
            timestamp: new Date()
          }
        });
      }
      
      Alert.alert('エラー', 'AI分析中にエラーが発生しました。しばらく後に再度お試しください。');
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

  const getStatusInfo = (status: Link['status']) => {
    switch (status) {
      case 'completed':
        return { text: '完了', color: '#00FF88', icon: 'check-circle' };
      case 'processing':
        return { text: '解析中', color: '#FFA500', icon: 'loader' };
      case 'error':
        return { text: 'エラー', color: '#FF4444', icon: 'alert-circle' };
      default:
        return { text: '待機中', color: '#888', icon: 'clock' };
    }
  };

  // タグIDからタグ名を取得する関数
  const getTagName = (tagId: string): string => {
    const tag = availableTags.find(t => t.id === tagId);
    return tag ? tag.name : tagId; // タグが見つからない場合はIDを返す
  };

  // 表示用のタグリストを取得
  const getDisplayTags = () => {
    if (!link.tagIds || link.tagIds.length === 0) return [];
    return link.tagIds.map(tagId => ({
      id: tagId,
      name: getTagName(tagId)
    }));
  };

  const statusInfo = getStatusInfo(link.status);
  const showAIAnalysisButton = link.status !== 'processing' && !isAnalyzing;
  const displayTags = getDisplayTags();

  return (
    <SafeAreaView style={styles.container}>
      {/* コンパクトヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={onClose}>
          <Feather name="arrow-left" size={20} color="#FFF" />
        </TouchableOpacity>
        
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {link.title}
          </Text>
          <Text style={styles.headerSubtitle}>
            {getDomainFromUrl(link.url)} • {formatDate(link.createdAt)}
          </Text>
        </View>
        
        <TouchableOpacity style={styles.headerButton} onPress={handleOpenExternalLink}>
          <Feather name="external-link" size={20} color="#00FFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* コンパクトメイン情報 */}
        <View style={styles.compactMain}>
          <View style={styles.mainRow}>
            {/* 左側：画像 */}
            {link.imageUrl && (
              <Image
                source={{ uri: link.imageUrl }}
                style={styles.compactImage}
                resizeMode="cover"
              />
            )}
            
            {/* 右側：情報 */}
            <View style={styles.infoSection}>
              {/* ステータス */}
              <View style={styles.statusRow}>
                <Feather name={statusInfo.icon as any} size={12} color={statusInfo.color} />
                <Text style={[styles.statusText, { color: statusInfo.color }]}>
                  {statusInfo.text}
                </Text>
                {showAIAnalysisButton && (
                  <TouchableOpacity
                    style={styles.miniAnalysisButton}
                    onPress={handleAIAnalysis}
                    disabled={isAnalyzing}
                  >
                    <Feather name="zap" size={12} color="#FFF" />
                  </TouchableOpacity>
                )}
              </View>

              {/* タグ */}
              <View style={styles.simpleTagSection}>
                <View style={styles.simpleTagsContainer}>
                  {/* タグ追加ボタン（左側固定） */}
                  <TouchableOpacity 
                    style={styles.addTagButton}
                    onPress={() => setShowTagModal(true)}
                    activeOpacity={0.7}
                  >
                    <Feather name="plus" size={12} color="#8A2BE2" />
                  </TouchableOpacity>
                  
                  {displayTags.length > 0 ? (
                    displayTags.slice(0, 4).map((tag, index) => (
                      <TouchableOpacity 
                        key={tag.id} 
                        style={styles.removableTag}
                        onPress={() => handleRemoveTag(tag.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.removableTagText}>#{tag.name}</Text>
                        <Feather name="x" size={10} color="#888" style={styles.removeIcon} />
                      </TouchableOpacity>
                    ))
                  ) : (
                    <Text style={styles.placeholderText}>タグを追加</Text>
                  )}
                  {displayTags.length > 4 && (
                    <TouchableOpacity 
                      style={styles.moreTagsButton}
                      onPress={() => setShowTagModal(true)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.moreTagsText}>+{displayTags.length - 4}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* AI要約（コンパクト） */}
        {(link.summary || link.status === 'processing' || isAnalyzing || link.status === 'error') && (
          <View style={styles.compactSummarySection}>
            <View style={styles.summaryHeader}>
              <Feather name="zap" size={14} color="#8A2BE2" />
              <Text style={styles.summaryTitle}>AI要約</Text>
            </View>
            
            <View style={styles.summaryContent}>
              {link.summary ? (
                <Text style={styles.summaryText}>{link.summary}</Text>
              ) : link.status === 'processing' || isAnalyzing ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color="#FFA500" />
                  <Text style={styles.loadingText}>解析中...</Text>
                </View>
              ) : link.status === 'error' ? (
                <View style={styles.errorRow}>
                  <Feather name="alert-circle" size={14} color="#FF4444" />
                  <Text style={styles.errorText}>解析エラー</Text>
                </View>
              ) : null}
            </View>
          </View>
        )}

        {/* 説明（コンパクト） */}
        {link.description && (
          <View style={styles.compactSection}>
            <View style={styles.sectionHeader}>
              <Feather name="file-text" size={14} color="#CCC" />
              <Text style={styles.sectionTitle}>説明</Text>
            </View>
            <Text style={styles.descriptionText} numberOfLines={3}>
              {link.description}
            </Text>
          </View>
        )}

        {/* URL（コンパクト） */}
        <View style={styles.compactSection}>
          <TouchableOpacity onPress={handleOpenExternalLink} style={styles.urlRow}>
            <Feather name="link" size={14} color="#00FFFF" />
            <Text style={styles.urlText} numberOfLines={2}>
              {link.url}
            </Text>
            <Feather name="external-link" size={12} color="#00FFFF" />
          </TouchableOpacity>
        </View>

        {/* 底部の余白 */}
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
          onAITagSuggestion={handleAITagSuggestion}
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
  
  // コンパクトヘッダー
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    backgroundColor: '#1A1A1A',
  },
  headerButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    marginHorizontal: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#888',
  },
  
  // コンテンツ
  content: {
    flex: 1,
  },
  
  // コンパクトメイン
  compactMain: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  compactImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 12,
  },
  infoSection: {
    flex: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 4,
    flex: 1,
  },
  miniAnalysisButton: {
    backgroundColor: '#8A2BE2',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // シンプルタグ
  simpleTagSection: {
    marginTop: 4,
  },
  simpleTagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  simpleTag: {
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
    marginRight: 6,
    marginBottom: 4,
  },
  simpleTagText: {
    fontSize: 10,
    color: '#CCC',
    fontWeight: '500',
  },
  removableTag: {
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
    marginRight: 6,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  removableTagText: {
    fontSize: 10,
    color: '#CCC',
    fontWeight: '500',
    marginRight: 4,
  },
  removeIcon: {
    opacity: 0.6,
  },
  addTagButton: {
    backgroundColor: '#2A2A2A',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 6,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#8A2BE2',
  },
  placeholderText: {
    fontSize: 11,
    color: '#666',
    fontStyle: 'italic',
    marginLeft: 4,
  },
  moreTagsButton: {
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
    marginLeft: 4,
    borderWidth: 1,
    borderColor: '#444',
  },
  moreTagsText: {
    fontSize: 10,
    color: '#888',
  },
  
  // コンパクト要約
  compactSummarySection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
    marginLeft: 6,
  },
  summaryContent: {
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 2,
    borderLeftColor: '#8A2BE2',
  },
  summaryText: {
    fontSize: 14,
    color: '#FFF',
    lineHeight: 20,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 12,
    color: '#FFA500',
    marginLeft: 6,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  errorText: {
    fontSize: 12,
    color: '#FF4444',
    marginLeft: 6,
  },
  
  // コンパクトセクション
  compactSection: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
    marginLeft: 6,
  },
  descriptionText: {
    fontSize: 14,
    color: '#CCC',
    lineHeight: 20,
  },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    padding: 12,
    borderRadius: 8,
  },
  urlText: {
    fontSize: 12,
    color: '#00FFFF',
    flex: 1,
    marginHorizontal: 8,
  },
     bottomSpacing: {
     height: 20,
   },
}); 
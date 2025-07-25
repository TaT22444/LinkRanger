import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Link, UserPlan } from '../types';
import { metadataService } from '../services/metadataService';
import { aiService } from '../services/aiService';
import { TagSelectorModal } from './TagSelectorModal';

interface Tag {
  id: string;
  name: string;
}

interface AddLinkModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (linkData: Partial<Link>) => Promise<void>;
  initialUrl?: string;
  userId?: string;
  availableTags: Tag[];
  onAddTag?: (tagName: string, type?: 'manual' | 'ai' | 'recommended') => Promise<string>;
  onDeleteTag?: (tagName: string) => Promise<void>;
  onAITagSuggestion?: () => Promise<void>;
}

export const AddLinkModal: React.FC<AddLinkModalProps> = ({
  visible,
  onClose,
  onSubmit,
  initialUrl = '',
  userId,
  availableTags,
  onAddTag,
  onDeleteTag,
  onAITagSuggestion,
}) => {
  const [url, setUrl] = useState(initialUrl);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchingMetadata, setFetchingMetadata] = useState(false);
  const [generatingAITags, setGeneratingAITags] = useState(false);

  const resetForm = () => {
    setUrl(initialUrl);
    setTitle('');
    setDescription('');
    setSelectedTags([]);
    setShowTagSelector(false);
    setFetchingMetadata(false);
    setGeneratingAITags(false);
    setLoading(false);
  };

  const isValidUrl = (urlString: string) => {
    try {
      const url = new URL(urlString);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const handleSubmit = async () => {
    if (!url.trim()) {
      Alert.alert('エラー', 'URLを入力してください');
      return;
    }

    if (!isValidUrl(url.trim())) {
      Alert.alert('エラー', '有効なURLを入力してください');
      return;
    }

    try {
      let finalTitle = title.trim();
      let finalDescription = description.trim();
      
      // タイトルが空の場合、メタデータを取得
      if (!finalTitle) {
        setFetchingMetadata(true);
        try {
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Metadata fetch timeout')), 15000);
          });
          
          const metadata = await Promise.race([
            metadataService.fetchMetadata(url.trim(), userId),
            timeoutPromise
          ]);
          
          finalTitle = metadata.title || url.trim();
          if (!finalDescription && metadata.description) {
            finalDescription = metadata.description;
          }
        } catch (error) {
          finalTitle = url.trim();
        } finally {
          setFetchingMetadata(false);
        }
      }

      setLoading(true);

      const linkData: Partial<Link> = {
        url: url.trim(),
        title: finalTitle,
        description: finalDescription || '',
        status: 'pending',
        isBookmarked: false,
        isArchived: false,
        priority: 'medium',
        tagIds: selectedTags,
        // AI処理済みフラグを追加（AddLinkModalでAI生成した場合）
        aiProcessed: selectedTags.some(tagId => {
          const tag = availableTags.find(t => t.id === tagId);
          return tag?.type === 'ai';
        }),
      };

      await onSubmit(linkData);
      resetForm();
      onClose();
    } catch (error) {
      Alert.alert('エラー', 'リンクの保存に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleTagsChange = (newTags: string[]) => {
    setSelectedTags(newTags);
  };

  const handleGenerateAITags = async () => {
    if (!url.trim() || !userId) {
      Alert.alert('エラー', 'URLが入力されていません');
      return;
    }

    if (!isValidUrl(url.trim())) {
      Alert.alert('エラー', '有効なURLを入力してください');
      return;
    }

    setGeneratingAITags(true);
    try {
      let finalTitle = title.trim();
      let finalDescription = description.trim();
      if (!finalTitle || !finalDescription) {
        const metadata = await metadataService.fetchMetadata(url.trim(), userId);
        finalTitle = finalTitle || metadata.title || url.trim();
        finalDescription = finalDescription || metadata.description || '';
        if (!title.trim() && metadata.title) setTitle(metadata.title);
        if (!description.trim() && metadata.description) setDescription(metadata.description);
      }
      // metadataを取得しgenerateEnhancedTagsに渡す
      const metadata = await metadataService.fetchMetadata(url.trim(), userId);
      const aiResponse = await aiService.generateEnhancedTags(
        metadata,
        userId,
        'free' as UserPlan
      );
      
      const newTagIds: string[] = [];
      const preservedUserTags = [...selectedTags];
      
      for (const tagName of aiResponse.tags) {
        const normalizedTagName = tagName.trim();
        const existingTag = availableTags.find(t => 
          t.name.trim().toLowerCase() === normalizedTagName.toLowerCase()
        );
        
        if (existingTag) {
          if (!preservedUserTags.includes(existingTag.id)) {
            newTagIds.push(existingTag.id);
          }
        } else if (onAddTag) {
          try {
            const newTagId = await onAddTag(normalizedTagName, 'ai');
            if (newTagId && !preservedUserTags.includes(newTagId)) {
              newTagIds.push(newTagId);
            }
          } catch (error) {
            console.error('🤖🔥 [AI Tagging Modal] Failed to create new AI tag:', { tagName: normalizedTagName, error });
          }
        }
      }
      
      if (newTagIds.length > 0) {
        const finalTags = [...preservedUserTags, ...newTagIds];
        setSelectedTags(finalTags);
        
        const userTagCount = preservedUserTags.length;
        const aiTagCount = newTagIds.length;
        
        let successMessage = `${aiTagCount}個の新しいAIタグを追加しました！

`;
        if (userTagCount > 0) successMessage += `👤 ユーザー選択: ${userTagCount}個
`;
        successMessage += `🤖 Gemini AI生成: ${aiTagCount}個
`;
        successMessage += `📊 合計: ${finalTags.length}個のタグ

`;
        successMessage += `🏷️ 生成されたタグ: ${aiResponse.tags.join(', ')}

`;
        if (aiResponse.fromCache) successMessage += '💾 キャッシュから取得';
        else successMessage += `🔥 新規AI分析 (トークン: ${aiResponse.tokensUsed})`;
        
        Alert.alert('🎉 Gemini AI生成完了', successMessage);
      } else {
        Alert.alert(
          '💡 情報', 
          `AIが${aiResponse.tags.length}個のタグを生成しましたが、すべて既に選択済みでした。

` +
          `生成されたタグ: ${aiResponse.tags.join(', ')}`
        );
      }
      
    } catch (error) {
      console.error('🤖🔥 [AI Tagging Modal] AI tag generation failed:', { error });
      Alert.alert(
        '⚠️ AI生成エラー',
        `Gemini AIタグの生成に失敗しました。

エラー: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setGeneratingAITags(false);
    }
  };

  const handleClose = () => {
    if (!loading && !generatingAITags) {
      resetForm();
      onClose();
    }
  };

  const getTagName = (tagId: string): string => {
    const tag = availableTags.find(t => t.id === tagId);
    return tag ? tag.name : tagId;
  };

  const canSave = url.trim() && isValidUrl(url.trim()) && !loading && !fetchingMetadata && !generatingAITags;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.container}>
        {/* ヘッダー */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.headerButton} 
            onPress={handleClose} 
            disabled={loading || generatingAITags}
          >
            <Text style={[styles.cancelText, (loading || generatingAITags) && styles.disabledText]}>
              キャンセル
            </Text>
          </TouchableOpacity>
          
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>リンクを追加</Text>
          </View>
          
          <TouchableOpacity 
            style={[styles.addButton, !canSave && styles.addButtonDisabled]} 
            onPress={handleSubmit}
            disabled={!canSave}
          >
            <Text style={[styles.addText, !canSave && styles.addTextDisabled]}>
              {loading ? '追加中...' : '追加'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* URL入力 */}
          <View style={styles.inputGroup}>
            <View style={styles.inputHeader}>
              <Text style={styles.label}>URL</Text>
              <Text style={styles.required}>*</Text>
            </View>
            <View style={styles.inputContainer}>
              <TextInput
                style={[styles.input, fetchingMetadata && styles.inputLoading]}
                value={url}
                onChangeText={setUrl}
                placeholder="https://example.com"
                placeholderTextColor="#666"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                returnKeyType="done"
                editable={!loading && !fetchingMetadata}
              />
              {fetchingMetadata && (
                <View style={styles.inputSpinner}>
                  <ActivityIndicator size="small" color="#8A2BE2" />
                </View>
              )}
            </View>
            {fetchingMetadata && (
              <Text style={styles.statusText}>ページ情報を取得中...</Text>
            )}
          </View>

          {/* タイトル入力 */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, styles.labelWithMargin]}>タイトル</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="リンクのタイトル（省略可）"
              placeholderTextColor="#666"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              editable={!loading}
            />
            <Text style={styles.hintText}>空白の場合、自動でタイトルを取得します</Text>
          </View>

          {/* 説明入力 */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, styles.labelWithMargin]}>説明</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="リンクの説明（省略可）"
              placeholderTextColor="#666"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              editable={!loading}
            />
          </View>

          {/* タグ選択 */}
          <View style={styles.inputGroup}>
            <View style={styles.tagHeaderWithAI}>
              <Text style={[styles.label, styles.labelWithMargin]}>タグ</Text>
              <TouchableOpacity
                style={[styles.aiTagButton, generatingAITags && styles.aiTagButtonDisabled]}
                onPress={handleGenerateAITags}
                disabled={!url.trim() || !isValidUrl(url.trim()) || generatingAITags || loading}
              >
                {generatingAITags ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Feather name="zap" size={14} color="#FFF" />
                )}
                <Text style={styles.aiTagButtonText}>
                  {generatingAITags ? 'AI生成中...' : 'AI生成'}
                </Text>
              </TouchableOpacity>
            </View>
            
            <TouchableOpacity
              style={styles.tagSelector}
              onPress={() => setShowTagSelector(true)}
              disabled={loading || generatingAITags}
            >
              <View style={styles.tagSelectorContent}>
                {selectedTags.length > 0 ? (
                  <View style={styles.selectedTagsContainer}>
                    {selectedTags.slice(0, 2).map((tagId) => (
                      <View key={tagId} style={styles.selectedTag}>
                        <Text style={styles.selectedTagText}>#{getTagName(tagId)}</Text>
                      </View>
                    ))}
                    {selectedTags.length > 2 && (
                      <Text style={styles.moreTagsText}>+{selectedTags.length - 2}個</Text>
                    )}
                  </View>
                ) : (
                  <Text style={styles.placeholderText}>タグを選択（省略可）</Text>
                )}
              </View>
              <Feather name="chevron-right" size={16} color="#666" />
            </TouchableOpacity>
          </View>

          {/* AI機能説明 */}
          <View style={styles.infoCard}>
            <View style={styles.infoHeader}>
              <Feather name="info" size={16} color="#8A2BE2" />
              <Text style={styles.infoTitle}>AI機能について</Text>
            </View>
            <Text style={styles.infoText}>
              保存後、AIが自動的にリンク先を解析し、要約文の生成や関連タグの付与を行います。
            </Text>
            <Text style={styles.infoNote}>
              ※ 自動AI分析はProプラン限定です
            </Text>
          </View>
        </ScrollView>

        {/* TagSelectorModal */}
        <TagSelectorModal
          visible={showTagSelector}
          onClose={() => setShowTagSelector(false)}
          availableTags={availableTags}
          selectedTags={selectedTags}
          onTagsChange={handleTagsChange}
          onCreateTag={onAddTag || (() => Promise.resolve(''))}
          onDeleteTag={onDeleteTag}
          linkTitle={title}
          linkUrl={url}
        />
      </SafeAreaView>
    </Modal>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerButton: {
    minWidth: 60,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
  },
  cancelText: {
    fontSize: 16,
    color: '#666',
  },
  addButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  addButtonDisabled: {
    // スタイルなし（透明）
  },
  addText: {
    fontSize: 16,
    color: '#8A2BE2',
    fontWeight: '600',
  },
  addTextDisabled: {
    color: '#666',
  },
  disabledText: {
    color: '#444',
  },
  
  // コンテンツ
  content: {
    flex: 1,
    padding: 16,
  },
  inputGroup: {
    marginBottom: 24,
  },
  inputHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  labelWithMargin: {
    marginBottom: 8,
  },
  required: {
    color: '#FF6B6B',
    marginLeft: 4,
    fontSize: 16,
  },
  inputContainer: {
    position: 'relative',
  },
  input: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#FFF',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  inputLoading: {
    paddingRight: 50,
  },
  inputSpinner: {
    position: 'absolute',
    right: 16,
    top: '50%',
    transform: [{ translateY: -10 }],
  },
  statusText: {
    fontSize: 12,
    color: '#8A2BE2',
    marginTop: 6,
    fontStyle: 'italic',
  },
  hintText: {
    fontSize: 12,
    color: '#888',
    marginTop: 6,
  },
  textArea: {
    height: 100,
    paddingTop: 14,
    textAlignVertical: 'top',
  },
  
  // タグセレクター
  tagSelector: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tagSelectorContent: {
    flex: 1,
  },
  placeholderText: {
    fontSize: 16,
    color: '#666',
  },
  selectedTagsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  selectedTag: {
    backgroundColor: '#444',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 6,
    marginBottom: 4,
  },
  selectedTagText: {
    fontSize: 12,
    color: '#CCC',
  },
  moreTagsText: {
    fontSize: 12,
    color: '#888',
    marginLeft: 4,
  },
  
  // タグヘッダーとAI生成ボタン
  tagHeaderWithAI: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  aiTagButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8A2BE2',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  aiTagButtonDisabled: {
    backgroundColor: '#666',
    opacity: 0.7,
  },
  aiTagButtonText: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '600',
    marginLeft: 6,
  },
  
  // 情報カード
  infoCard: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#8A2BE2',
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
    marginLeft: 6,
  },
  infoText: {
    fontSize: 13,
    color: '#CCC',
    lineHeight: 18,
    marginBottom: 6,
  },
  infoNote: {
    fontSize: 11,
    color: '#888',
    fontStyle: 'italic',
  },
});
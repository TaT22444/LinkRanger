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
import { Link } from '../types';
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
          console.error('Failed to fetch metadata during submit:', error);
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
        isPinned: false,
        priority: 'medium',
        tagIds: selectedTags,
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
      // メタデータを取得（まだ取得していない場合）
      let finalTitle = title.trim();
      let finalDescription = description.trim();
      
      if (!finalTitle || !finalDescription) {
        const metadata = await metadataService.fetchMetadata(url.trim(), userId);
        finalTitle = finalTitle || metadata.title || url.trim();
        finalDescription = finalDescription || metadata.description || '';
        
        // タイトルと説明を更新
        if (!title.trim() && metadata.title) {
          setTitle(metadata.title);
        }
        if (!description.trim() && metadata.description) {
          setDescription(metadata.description);
        }
      }

      // AIタグを生成
      const aiResponse = await aiService.generateTags(
        finalTitle,
        finalDescription,
        url.trim(),
        userId,
        'free' // TODO: 実際のユーザープランを渡す
      );

      // 生成されたタグを既存のタグと統合
      const newTagIds: string[] = [];
      
      for (const tagName of aiResponse.tags) {
        // 既存のタグから検索
        const existingTag = availableTags.find(t => t.name === tagName);
        
        if (existingTag) {
          // 既存のタグがある場合、そのIDを使用
          if (!selectedTags.includes(existingTag.id)) {
            newTagIds.push(existingTag.id);
          }
        } else {
          // 新しいタグの場合、作成
          if (onAddTag) {
            try {
              const newTagId = await onAddTag(tagName, 'ai');
              if (newTagId && !selectedTags.includes(newTagId)) {
                newTagIds.push(newTagId);
              }
            } catch (error) {
              console.error('Failed to create AI tag:', tagName, error);
            }
          }
        }
      }

      // 新しいタグを追加
      if (newTagIds.length > 0) {
        setSelectedTags(prevTags => [...prevTags, ...newTagIds]);
        
        Alert.alert(
          'AI タグ生成完了',
          `${newTagIds.length}個のタグが生成されました。\n\n` +
          `生成されたタグ: ${aiResponse.tags.join(', ')}\n\n` +
          (aiResponse.fromCache ? 'キャッシュから取得' : '新規生成'),
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('情報', '新しいタグは生成されませんでした。');
      }

    } catch (error) {
      console.error('AI tag generation failed:', error);
      Alert.alert(
        'エラー',
        'AIタグの生成に失敗しました。\n\n' +
        'フォールバック機能により、基本的なタグを生成します。'
      );
      
      // フォールバック処理
      try {
        const fallbackTags = aiService.generateFallbackTags(
          url.trim(),
          title.trim(),
          description.trim()
        );
        
        if (fallbackTags.length > 0) {
          const newTagIds: string[] = [];
          
          for (const tagName of fallbackTags) {
            const existingTag = availableTags.find(t => t.name === tagName);
            
            if (existingTag) {
              if (!selectedTags.includes(existingTag.id)) {
                newTagIds.push(existingTag.id);
              }
            } else if (onAddTag) {
              try {
                const newTagId = await onAddTag(tagName, 'ai');
                if (newTagId && !selectedTags.includes(newTagId)) {
                  newTagIds.push(newTagId);
                }
              } catch (error) {
                console.error('Failed to create fallback tag:', tagName, error);
              }
            }
          }
          
          if (newTagIds.length > 0) {
            setSelectedTags(prevTags => [...prevTags, ...newTagIds]);
          }
        }
      } catch (fallbackError) {
        console.error('Fallback tag generation failed:', fallbackError);
      }
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

  // タグ名を取得
  const getTagName = (tagId: string): string => {
    const tag = availableTags.find(t => t.id === tagId);
    return tag ? tag.name : tagId;
  };

  // 保存ボタンの有効性
  const canSave = url.trim() && isValidUrl(url.trim()) && !loading && !fetchingMetadata && !generatingAITags;
  const hasChanges = url.trim() || title.trim() || description.trim() || selectedTags.length > 0;

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
          <TouchableOpacity style={styles.headerButton} onPress={handleClose} disabled={loading || generatingAITags}>
            <Text style={[styles.cancelText, (loading || generatingAITags) && styles.disabledText]}>キャンセル</Text>
          </TouchableOpacity>
          
          <Text style={styles.headerTitle}>リンクを追加</Text>
          
          <TouchableOpacity 
            style={[styles.headerButton, styles.saveButton, !canSave && styles.saveButtonDisabled]} 
            onPress={handleSubmit}
            disabled={!canSave}
          >
            <Text style={[styles.saveText, !canSave && styles.saveTextDisabled]}>
              {loading ? '保存中...' : '保存'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* URL入力 */}
          <View style={styles.section}>
            <Text style={styles.label}>URL *</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={[styles.input, fetchingMetadata && styles.inputWithLoader]}
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
                <View style={styles.inputLoader}>
                  <ActivityIndicator size="small" color="#8A2BE2" />
                </View>
              )}
            </View>
            {fetchingMetadata && (
              <Text style={styles.hint}>ページ情報を取得しています...</Text>
            )}
          </View>

          {/* タイトル入力 */}
          <View style={styles.section}>
            <Text style={styles.label}>タイトル</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="リンクのタイトル（省略可）"
              placeholderTextColor="#666"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="default"
              returnKeyType="done"
              editable={!loading}
            />
            <Text style={styles.hint}>空白の場合、自動でタイトルを取得します</Text>
          </View>

          {/* 説明入力 */}
          <View style={styles.section}>
            <Text style={styles.label}>説明</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="リンクの説明（省略可）"
              placeholderTextColor="#666"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="default"
              returnKeyType="done"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              editable={!loading}
            />
          </View>

          {/* タグ選択 */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.label}>タグ</Text>
              <TouchableOpacity
                style={[styles.aiButton, generatingAITags && styles.aiButtonDisabled]}
                onPress={handleGenerateAITags}
                disabled={!url.trim() || !isValidUrl(url.trim()) || generatingAITags || loading}
              >
                {generatingAITags ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Feather name="zap" size={16} color="#FFF" />
                )}
                <Text style={styles.aiButtonText}>
                  {generatingAITags ? 'AI生成中...' : 'AIタグ生成'}
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
                  <View style={styles.selectedTagsPreview}>
                    {selectedTags.slice(0, 3).map((tagId) => (
                      <View key={tagId} style={styles.tagPreview}>
                        <Text style={styles.tagPreviewText}>#{getTagName(tagId)}</Text>
                      </View>
                    ))}
                    {selectedTags.length > 3 && (
                      <Text style={styles.moreTagsText}>+{selectedTags.length - 3}</Text>
                    )}
                  </View>
                ) : (
                  <Text style={styles.tagSelectorPlaceholder}>タグを選択（省略可）</Text>
                )}
              </View>
              <Feather name="chevron-right" size={16} color="#666" />
            </TouchableOpacity>
          </View>

          {/* AI機能について */}
          <View style={styles.infoSection}>
            <View style={styles.infoHeader}>
              <Feather name="zap" size={16} color="#8A2BE2" />
              <Text style={styles.infoTitle}>AI機能について</Text>
            </View>
            <Text style={styles.infoText}>
              保存後、AIが自動的に以下を実行します：{'\n'}
              • リンク先の内容を解析{'\n'}
              • 要約文を生成{'\n'}
              • 関連タグを自動付与{'\n'}
              • メタデータを取得
            </Text>
            <Text style={styles.infoNote}>
              ※ 自動AI分析はProプラン限定です{'\n'}
              Freeプランでは手動でAI分析を実行できます
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
          onAITagSuggestion={onAITagSuggestion}
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
  },
  cancelText: {
    fontSize: 16,
    color: '#666',
  },
  saveButton: {
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#8A2BE2',
  },
  saveButtonDisabled: {
    backgroundColor: 'transparent',
    borderColor: '#444',
  },
  saveText: {
    fontSize: 16,
    color: '#8A2BE2',
    fontWeight: '600',
  },
  saveTextDisabled: {
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
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  aiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8A2BE2',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#8A2BE2',
  },
  aiButtonDisabled: {
    backgroundColor: '#444',
    borderColor: '#444',
  },
  aiButtonText: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '600',
    marginLeft: 6,
  },
  
  // 入力フィールド
  inputContainer: {
    position: 'relative',
  },
  input: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#FFF',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  inputWithLoader: {
    paddingRight: 50,
  },
  inputLoader: {
    position: 'absolute',
    right: 16,
    top: '50%',
    transform: [{ translateY: -10 }],
  },
  textArea: {
    height: 100,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  hint: {
    fontSize: 12,
    color: '#8A2BE2',
    marginTop: 6,
    fontStyle: 'italic',
  },
  
  // タグセレクター
  tagSelector: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tagSelectorContent: {
    flex: 1,
  },
  tagSelectorPlaceholder: {
    fontSize: 16,
    color: '#666',
  },
  selectedTagsPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  tagPreview: {
    backgroundColor: '#444',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginRight: 6,
    marginBottom: 4,
  },
  tagPreviewText: {
    fontSize: 12,
    color: '#CCC',
  },
  moreTagsText: {
    fontSize: 12,
    color: '#888',
    marginLeft: 4,
  },
  
  // 情報セクション
  infoSection: {
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
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginLeft: 6,
  },
  infoText: {
    fontSize: 14,
    color: '#CCC',
    lineHeight: 20,
    marginBottom: 8,
  },
  infoNote: {
    fontSize: 12,
    color: '#888',
    lineHeight: 16,
    fontStyle: 'italic',
  },
}); 
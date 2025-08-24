import React, { useState, useRef, useEffect } from 'react';
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
  Dimensions,
  Animated,
  TouchableWithoutFeedback,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { Link, UserPlan } from '../types';
import { metadataService } from '../services/metadataService';
import { aiService } from '../services/aiService';
import { TagSelectorModal } from './TagSelectorModal';

const { height: screenHeight } = Dimensions.get('window');

// モーダルの高さ状態
const MODAL_HEIGHTS = {
  COLLAPSED: screenHeight * 0.4,  // 最小高さ
  EXPANDED: screenHeight * 0.7,   // 最大高さ
  THRESHOLD: screenHeight * 0.1,  // スワイプの閾値
};

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
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchingMetadata, setFetchingMetadata] = useState(false);
  const [generatingAITags, setGeneratingAITags] = useState(false);
  
  // アニメーション用の状態
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  
  // 🚀 メタデータキャッシュを追加
  const [metadataCache, setMetadataCache] = useState<{[url: string]: any}>({});
  const [lastFetchedUrl, setLastFetchedUrl] = useState<string>('');

  // 🚀 入力フィールドのref管理
  const urlRef = useRef<TextInput>(null);
  
  // アニメーション用の値
  const translateY = useRef(new Animated.Value(screenHeight)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const modalTranslateY = useRef(new Animated.Value(0)).current;
  
  // ジェスチャー用の値
  const gestureTranslateY = useRef(new Animated.Value(0)).current;
  const panGestureRef = useRef<PanGestureHandler>(null);

  const resetForm = () => {
    setUrl(initialUrl);
    setSelectedTags([]);
    setShowTagSelector(false);
    setFetchingMetadata(false);
    setGeneratingAITags(false);
    setLoading(false);
    setIsExpanded(false);
    // キャッシュはリセットしない（セッション中は保持）
  };

  // モーダル表示/非表示の状態管理とアニメーション
  useEffect(() => {
    if (visible && !isVisible) {
      // モーダルを開く
      setIsVisible(true);
      setUrl(initialUrl);
      resetForm();
      
      // アニメーション開始
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
      
      // URL入力フィールドにフォーカス
      setTimeout(() => {
        urlRef.current?.focus();
      }, 350);
      
    } else if (!visible && isVisible) {
      // モーダルを閉じる
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: screenHeight,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setIsVisible(false);
        resetForm();
      });
    }
  }, [visible, initialUrl]); // initialUrlも依存配列に追加

  // 展開/縮小状態の変更時のアニメーション
  useEffect(() => {
    if (visible && isVisible) {
      const targetTranslateY = isExpanded ? 0 : (MODAL_HEIGHTS.EXPANDED - MODAL_HEIGHTS.COLLAPSED);
      
      Animated.spring(modalTranslateY, {
        toValue: targetTranslateY,
        tension: 80,
        friction: 10,
        useNativeDriver: true,
      }).start();
    }
  }, [isExpanded, visible, isVisible]);

  // initialUrlが変更された際にURLフィールドを更新
  useEffect(() => {
    if (initialUrl && initialUrl !== url) {
      console.log('AddLinkModal: initialUrl changed, updating URL field:', initialUrl);
      setUrl(initialUrl);
    }
  }, [initialUrl]);

  // ジェスチャーハンドラー
  const onGestureEvent = Animated.event(
    [{ nativeEvent: { translationY: gestureTranslateY } }],
    { useNativeDriver: true }
  );

  const onHandlerStateChange = (event: any) => {
    const { state, translationY, velocityY } = event.nativeEvent;
    
    if (state === State.END) {
      gestureTranslateY.flattenOffset();

      const shouldExpand = translationY < -MODAL_HEIGHTS.THRESHOLD || velocityY < -1000;
      const shouldCollapse = translationY > MODAL_HEIGHTS.THRESHOLD || velocityY > 1000;
      const shouldClose = translationY > MODAL_HEIGHTS.COLLAPSED * 0.5 && velocityY > 500;

      if (shouldClose) {
        // モーダルを閉じる
        handleClose();
      } else if (shouldExpand && !isExpanded) {
        // 展開
        setIsExpanded(true);
        Animated.spring(gestureTranslateY, {
          toValue: 0,
          tension: 65,
          friction: 11,
          useNativeDriver: true,
        }).start();
      } else if (shouldCollapse && isExpanded) {
        // 縮小
        setIsExpanded(false);
        Animated.spring(gestureTranslateY, {
          toValue: 0,
          tension: 65,
          friction: 11,
          useNativeDriver: true,
        }).start();
      } else {
        // 元の位置に戻す
        Animated.spring(gestureTranslateY, {
          toValue: 0,
          tension: 65,
          friction: 11,
          useNativeDriver: true,
        }).start();
      }
    } else if (state === State.BEGAN) {
      // ジェスチャー開始時の処理
      gestureTranslateY.setOffset(0);
      gestureTranslateY.setValue(0);
    }
  };

  // 🚀 フィールド間のナビゲーション処理
  const handleUrlSubmit = () => {
    // URLを入力完了時はキーボードを閉じる
    urlRef.current?.blur();
  };

  const handleDescriptionSubmit = () => {
    // 説明入力完了時はキーボードを閉じる（現在は使用されていない）
  };

  // 🚀 効率的なメタデータ取得関数
  const fetchMetadataWithCache = async (targetUrl: string) => {
    console.log('📄 AddLinkModal: メタデータ取得開始', {
      url: targetUrl,
      hasCache: !!metadataCache[targetUrl],
      lastFetchedUrl
    });

    // キャッシュチェック
    if (metadataCache[targetUrl]) {
      console.log('💾 AddLinkModal: キャッシュヒット', { url: targetUrl });
      return metadataCache[targetUrl];
    }

    // 新規取得
    console.log('🌐 AddLinkModal: 新規メタデータ取得', { url: targetUrl });
    const metadata = await metadataService.fetchMetadata(targetUrl, userId);
    
    // キャッシュ保存
    setMetadataCache(prev => ({ ...prev, [targetUrl]: metadata }));
    setLastFetchedUrl(targetUrl);
    
    console.log('💾 AddLinkModal: メタデータをキャッシュに保存', {
      url: targetUrl,
      title: metadata.title?.slice(0, 50) + '...'
    });
    
    return metadata;
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
      let finalTitle = '';
      let finalDescription = '';
      
      // タイトルが空の場合、メタデータを取得（キャッシュ対応）
      if (!finalTitle) {
        setFetchingMetadata(true);
        try {
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Metadata fetch timeout')), 15000);
          });
          
          const metadata = await Promise.race([
            fetchMetadataWithCache(url.trim()),
            timeoutPromise
          ]);
          
          // デバッグログ: 取得したメタデータの詳細
          console.log('🔍 AddLinkModal: 取得したメタデータ', {
            url: url.trim(),
            metadataTitle: metadata.title,
            metadataDescription: metadata.description,
            metadataImageUrl: metadata.imageUrl,
            metadataSiteName: metadata.siteName,
            metadataDomain: metadata.domain
          });
          
          finalTitle = metadata.title || url.trim();
          if (!finalDescription && metadata.description) {
            finalDescription = metadata.description;
          }
          
          // デバッグログ: 最終的に使用される値
          console.log('🔍 AddLinkModal: 最終的なリンクデータ', {
            finalTitle,
            finalDescription,
            url: url.trim()
          });
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
      };

      await onSubmit(linkData);
      resetForm();
      onClose();
    } catch (error) {
      console.error('❌ AddLinkModal: リンク保存エラー', error);
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

    console.log('🤖 AddLinkModal: AIタグ生成開始', { url: url.trim() });
    setGeneratingAITags(true);
    try {
      let finalTitle = '';
      let finalDescription = '';
      
      // メタデータが不足している場合のみ取得（キャッシュ対応）
      if (!finalTitle || !finalDescription) {
        console.log('📄 AddLinkModal: メタデータ補完のため取得', {
          needTitle: !finalTitle,
          needDescription: !finalDescription
        });
        
        const metadata = await fetchMetadataWithCache(url.trim());
        finalTitle = finalTitle || metadata.title || url.trim();
        finalDescription = finalDescription || metadata.description || '';
      }
      
      // 🚀 重複取得を防止：既にキャッシュから取得済みのメタデータを再利用
      const metadata = metadataCache[url.trim()] || await fetchMetadataWithCache(url.trim());
      
      const aiResponse = await aiService.generateEnhancedTags(
        metadata,
        userId,
        'free' as UserPlan
      );
      
      console.log('🎯 AddLinkModal: AIタグ生成完了', {
        generatedTags: aiResponse.tags,
        tagCount: aiResponse.tags.length
      });
      
      const newTagIds: string[] = [];
      const preservedUserTags = [...selectedTags];
      
      // 🔒 AI生成タグの事前制限チェック
      const newTagsToCreate: string[] = [];
      const existingTagsToAdd: string[] = [];
      
      // まず既存タグと新規作成が必要なタグを分類
      for (const tagName of aiResponse.tags) {
        const normalizedTagName = tagName.trim();
        const existingTag = availableTags.find(t => 
          t.name.trim().toLowerCase() === normalizedTagName.toLowerCase()
        );
        
        if (existingTag) {
          if (!preservedUserTags.includes(existingTag.id)) {
            existingTagsToAdd.push(existingTag.id);
          }
        } else {
          newTagsToCreate.push(normalizedTagName);
        }
      }
      
      // 🔒 新規タグ作成可能数をチェック（user は AddLinkModal の props にないため、onAddTag でチェック）
      // 既存タグを追加
      newTagIds.push(...existingTagsToAdd);
      
      // 新規タグを作成（制限チェックは handleAddTag 内で実行される）
      for (const tagName of newTagsToCreate) {
        if (onAddTag) {
          try {
            const newTagId = await onAddTag(tagName, 'ai');
            if (newTagId && !preservedUserTags.includes(newTagId)) {
              newTagIds.push(newTagId);
            }
          } catch (error) {
            console.error('🤖🔥 [AI Tagging Modal] Failed to create new AI tag:', { tagName, error });
            // エラーが制限超過によるものか確認
            if (error instanceof Error && error.message.includes('制限')) {
              // 🔔 制限に達した場合はユーザーに通知して残りをスキップ
              const remainingCount = newTagsToCreate.length - newTagsToCreate.indexOf(tagName);
              Alert.alert(
                'タグ制限に達しました', 
                `AI生成タグのうち${remainingCount}個が制限により作成できませんでした。\n\n作成可能なタグのみ保存します。`,
                [
                  { text: 'OK', style: 'default' },
                  { 
                    text: 'プランアップ', 
                    onPress: () => {
                      // AddLinkModalではアップグレードモーダルを直接表示できないため、
                      // onClose後にHomeScreenでハンドリングする必要がある
                      console.log('🔄 プランアップ要求（AddLinkModal）');
                    }
                  }
                ]
              );
              break;
            }
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
        
        // Alert.alert('🎉 Gemini AI生成完了', successMessage); // アラート削除
      } else {
        // Alert.alert(
        //   '💡 情報', 
        //   `AIが${aiResponse.tags.length}個のタグを生成しましたが、すべて既に選択済みでした。

// ` +
//           `生成されたタグ: ${aiResponse.tags.join(', ')}`
//         ); // アラート削除
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

  const hasUnsavedChanges = () => {
    return (
      url.trim() !== initialUrl || 
      selectedTags.length > 0
    );
  };

  const handleClose = () => {
    if (loading || generatingAITags) {
      return;
    }

    if (hasUnsavedChanges()) {
      Alert.alert(
        '未保存の変更があります',
        '入力内容を破棄してモーダルを閉じますか？',
        [
          {
            text: 'キャンセル',
            style: 'cancel',
          },
          {
            text: '変更を破棄',
            style: 'destructive',
            onPress: () => {
              performClose();
            },
          },
        ]
      );
    } else {
      performClose();
    }
  };

  const performClose = () => {
    resetForm();
    onClose();
  };

  const handleBackdropPress = () => {
    // バックドロップタップ時は変更確認を行う
    handleClose();
  };

  const handleInputFocus = () => {
    if (!isExpanded) {
      setIsExpanded(true);
    }
  };

  const getTagName = (tagId: string): string => {
    const tag = availableTags.find(t => t.id === tagId);
    
    // 🔧 タグが見つからない場合の表示を改善（IDではなく適切なフォールバック）
    if (tag) {
      return tag.name;
    } else {
      // タグが見つからない場合（削除されたタグや制限で作成されなかったタグ）
      console.warn('⚠️ AddLinkModal: タグが見つかりません', { tagId, availableTagsCount: availableTags.length });
      return '削除されたタグ'; // ユーザーフレンドリーな表示
    }
  };

  const canSave = url.trim() && isValidUrl(url.trim()) && !loading && !fetchingMetadata && !generatingAITags;

  return (
    <Modal
      visible={isVisible}
      animationType="none"
      presentationStyle="overFullScreen"
      transparent={true}
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* 背景オーバーレイ */}
        <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
          <TouchableWithoutFeedback onPress={handleBackdropPress}>
            <View style={styles.backdropTouchable} />
          </TouchableWithoutFeedback>
        </Animated.View>
        
        {/* モーダルコンテンツ */}
        <Animated.View 
          style={[
            styles.modalContainer,
            {
              transform: [
                { translateY: translateY },
                { translateY: modalTranslateY },
              ]
            }
          ]}
        >
          {/* ジェスチャーハンドラをモーダル全体に適用 */}
          <PanGestureHandler
            ref={panGestureRef}
            onGestureEvent={onGestureEvent}
            onHandlerStateChange={onHandlerStateChange}
            activeOffsetY={[-20, 20]}
            failOffsetX={[-100, 100]}
          >
            <Animated.View style={[{flex: 1}, { transform: [{ translateY: gestureTranslateY }] }]}>

              {/* ドラッグハンドル */}
               <View style={styles.dragHandle}>
                <View style={styles.dragIndicator} />
              </View>
              
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

              <View style={styles.content}>
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
                      returnKeyType="next"
                      editable={!loading && !fetchingMetadata}
                      onSubmitEditing={handleUrlSubmit}
                      ref={urlRef}
                      autoComplete="url"
                      textContentType="URL"
                      clearButtonMode="while-editing"
                      onFocus={handleInputFocus}
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

                {/* タグ選択 */}
                <View style={styles.inputGroup}>
                  <View style={styles.tagHeaderWithAI}>
                    <Text style={[styles.label, styles.labelWithMargin]}>タグ（省略可）</Text>
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
              </View>

              {/* TagSelectorModal */}
              <TagSelectorModal
                visible={showTagSelector}
                onClose={() => setShowTagSelector(false)}
                availableTags={availableTags}
                selectedTags={selectedTags}
                onTagsChange={handleTagsChange}
                onCreateTag={onAddTag || (() => Promise.resolve(''))}
                onDeleteTag={onDeleteTag}
                linkTitle={''} // Title is now fetched from metadata
                linkUrl={url}
              />
            </Animated.View>
          </PanGestureHandler>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  
  // ヘッダー
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    marginBottom: 24,
  },
  headerButton: {
    paddingHorizontal: 16,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#1A1A1A',
    zIndex: 10,
  },
  headerTitleContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  headerTitle: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  cancelText: {
    fontSize: 14,
    color: '#666',
  },
  addButton: {
    paddingHorizontal: 16,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#1A1A1A',
    zIndex: 10,
  },
  addButtonDisabled: {
    // スタイルなし（透明）
  },
  addText: {
    fontSize: 14,
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
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  inputGroup: {
    marginBottom: 24,
  },
  inputHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  labelWithMargin: {
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
    marginBottom: 8,
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
  
  // モーダルコンテナ
  modalContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#121212',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: MODAL_HEIGHTS.EXPANDED,
    paddingBottom: 34, // Safe area bottom padding
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },

  // ドラッグハンドル
  dragHandle: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
  },
  dragIndicator: {
    width: 40,
    height: 4,
    backgroundColor: '#666',
    borderRadius: 2,
  },

  // 背景オーバーレイ
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  backdropTouchable: {
    flex: 1,
  },
});
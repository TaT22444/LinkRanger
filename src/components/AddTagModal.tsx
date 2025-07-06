import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Dimensions,
  Animated,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { PanGestureHandler, State } from 'react-native-gesture-handler';

const { height: screenHeight } = Dimensions.get('window');

interface Tag {
  id: string;
  name: string;
}

interface AddTagModalProps {
  visible: boolean;
  onClose: () => void;
  availableTags?: Tag[];
  selectedTags?: string[];
  onTagsChange: (tags: string[]) => void;
  onCreateTag: (tagName: string, type?: 'manual' | 'ai' | 'recommended') => Promise<string>;
  onDeleteTag?: (tagName: string) => Promise<void>;
  onAITagSuggestion?: () => Promise<void>;
  linkTitle?: string;
  linkUrl?: string;
}

interface UndoState {
  visible: boolean;
  tagName: string;
  timeoutId?: NodeJS.Timeout;
}

// 一般的なタグのサンプル（ユーザーが持っていない場合のおすすめ用）
const SUGGESTED_TAGS = [
  'プログラミング', 'デザイン', 'マーケティング', 'ビジネス', 'ニュース',
  'エンターテイメント', '教育', 'ライフスタイル', 'テクノロジー', 'AI',
  'ソフトウェア', 'ハードウェア', 'クラウド', 'セキュリティ', 'データ',
  'アプリ', 'ウェブ', 'モバイル', 'ゲーム', 'アート',
  '音楽', '映画', '本', '料理', '旅行',
  'スポーツ', '健康', 'フィットネス', 'ファッション', '写真',
  'DIY', 'ガジェット', 'レビュー', 'チュートリアル', 'ツール'
];

// モーダルの高さ状態
const MODAL_HEIGHTS = {
  COLLAPSED: screenHeight * 0.4,  // 最小高さ
  EXPANDED: screenHeight * 0.85,  // 最大高さ
  THRESHOLD: screenHeight * 0.15, // スワイプの閾値
};

export const AddTagModal: React.FC<AddTagModalProps> = ({
  visible,
  onClose,
  availableTags = [],
  selectedTags = [],
  onTagsChange,
  onCreateTag,
  onDeleteTag,
  onAITagSuggestion,
  linkTitle,
  linkUrl,
}) => {
  const [newTagName, setNewTagName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isAIAnalyzing, setIsAIAnalyzing] = useState(false);
  const [localSelectedTags, setLocalSelectedTags] = useState<string[]>([]);
  const [undoState, setUndoState] = useState<UndoState>({ visible: false, tagName: '' });
  const [deletedTags, setDeletedTags] = useState<Set<string>>(new Set());
  const [recommendedTags, setRecommendedTags] = useState<string[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedRecommendedTags, setSelectedRecommendedTags] = useState<string[]>([]);
  
  // アニメーション用の値
  const translateY = useRef(new Animated.Value(screenHeight)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const modalTranslateY = useRef(new Animated.Value(0)).current; // モーダル位置用
  const scrollViewRef = useRef<ScrollView>(null);

  // ジェスチャー用の値
  const gestureTranslateY = useRef(new Animated.Value(0)).current;
  const panGestureRef = useRef<PanGestureHandler>(null);

  // おすすめタグを生成する関数
  const generateRecommendedTags = (tags: Tag[]) => {
    const existingTagNames = tags.map(tag => tag.name.toLowerCase());
    
    // ユーザーが持っていないタグを提案
    const newTagSuggestions = SUGGESTED_TAGS.filter(tag => 
      !existingTagNames.includes(tag.toLowerCase())
    );
    
    // ランダムに5-8個選択
    const shuffled = newTagSuggestions.sort(() => 0.5 - Math.random());
    const selectedCount = Math.min(Math.max(5, Math.floor(Math.random() * 4) + 5), shuffled.length);
    
    return shuffled.slice(0, selectedCount);
  };

  // データの初期化
  useEffect(() => {
    if (visible) {
      console.log('=== AddTagModal Data Initialization ===');
      console.log('availableTags:', availableTags);
      console.log('availableTags length:', availableTags?.length || 0);
      console.log('selectedTags:', selectedTags);
      
      setLocalSelectedTags(selectedTags || []);
      setSelectedRecommendedTags([]);
      setNewTagName('');
      setDeletedTags(new Set());
      setUndoState({ visible: false, tagName: '' });
      setIsExpanded(false);
      
      // おすすめタグを生成
      const newRecommendedTags = generateRecommendedTags(availableTags);
      console.log('Generated recommended tags:', newRecommendedTags);
      setRecommendedTags(newRecommendedTags);
      
      console.log('=== End Data Initialization ===');
    }
  }, [visible]);

  // モーダル表示/非表示の状態管理とアニメーション
  useEffect(() => {
    if (visible) {
      console.log('AddTagModal: showing modal');
      setIsVisible(true);
      
      // アニメーション値を初期状態にリセット
      fadeAnim.setValue(0);
      translateY.setValue(screenHeight);
      modalTranslateY.setValue(0);
      gestureTranslateY.setValue(0);
      
      // アニメーション開始
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          tension: 65,
          friction: 11,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      console.log('AddTagModal: hiding modal');
      
      // 非表示アニメーション
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: screenHeight,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setIsVisible(false);
        setIsExpanded(false);
      });
    }
  }, [visible]);

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

  // ジェスチャーハンドラー
  const onGestureEvent = Animated.event(
    [{ nativeEvent: { translationY: gestureTranslateY } }],
    { useNativeDriver: true }
  );

  const onHandlerStateChange = (event: any) => {
    const { state, translationY, velocityY } = event.nativeEvent;
    
    if (state === State.BEGAN) {
      // スクロールビューのスクロールを無効化
      if (scrollViewRef.current) {
        scrollViewRef.current.setNativeProps({ scrollEnabled: false });
      }
    } else if (state === State.END) {
      const shouldExpand = translationY < -MODAL_HEIGHTS.THRESHOLD || velocityY < -1000;
      const shouldCollapse = translationY > MODAL_HEIGHTS.THRESHOLD || velocityY > 1000;
      const shouldClose = translationY > MODAL_HEIGHTS.COLLAPSED * 0.5 && velocityY > 500;

      // スクロールビューのスクロールを再有効化
      if (scrollViewRef.current) {
        scrollViewRef.current.setNativeProps({ scrollEnabled: true });
      }

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
    }
  };

  const handleTagToggle = (tagName: string) => {
    const newSelection = localSelectedTags.includes(tagName)
      ? localSelectedTags.filter(tag => tag !== tagName)
      : [...localSelectedTags, tagName];
    setLocalSelectedTags(newSelection);
  };

  const handleRecommendedTagToggle = (tagName: string) => {
    const newSelection = selectedRecommendedTags.includes(tagName)
      ? selectedRecommendedTags.filter(tag => tag !== tagName)
      : [...selectedRecommendedTags, tagName];
    setSelectedRecommendedTags(newSelection);
    
    // タグが選択されたら滑らかに展開
    if (newSelection.length > 0 && !isExpanded) {
      setIsExpanded(true);
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) {
      return;
    }

    if (availableTags && availableTags.some(tag => tag.name.toLowerCase() === newTagName.toLowerCase())) {
      Alert.alert('エラー', 'このタグは既に存在します');
      return;
    }

    setIsCreating(true);
    try {
      const tagId = await onCreateTag(newTagName.trim(), 'manual');
      console.log('AddTagModal: created tag with ID:', tagId);
      setNewTagName('');
      // 新しく作成したタグを選択状態にする
      const newTags = [...localSelectedTags, tagId];
      setLocalSelectedTags(newTags);
      // 選択したタグを保存して閉じる
      onTagsChange(newTags);
      onClose();
    } catch (error) {
      console.error('AddTagModal: tag creation error:', error);
      Alert.alert('エラー', 'タグの作成に失敗しました');
    } finally {
      setIsCreating(false);
    }
  };

  const handleAddSelectedTags = async () => {
    if (selectedRecommendedTags.length === 0) {
      return;
    }

    try {
      // 選択されたおすすめタグを作成し、IDを取得
      const tagIds: string[] = [];
      for (const tagName of selectedRecommendedTags) {
        const tagId = await onCreateTag(tagName, 'recommended');
        console.log('AddTagModal: created recommended tag with ID:', tagId);
        tagIds.push(tagId);
      }
      
      // 選択されたおすすめタグを追加
      const newTags = [...localSelectedTags, ...tagIds];
      setLocalSelectedTags(newTags);
      onTagsChange(newTags);
      onClose();
    } catch (error) {
      console.error('AddTagModal: recommended tag creation error:', error);
      Alert.alert('エラー', 'タグの作成に失敗しました');
    }
  };

  const handleAITagSuggestion = async () => {
    if (!onAITagSuggestion) return;

    setIsAIAnalyzing(true);
    try {
      await onAITagSuggestion();
    } catch (error) {
      Alert.alert('エラー', 'AIタグ提案に失敗しました');
    } finally {
      setIsAIAnalyzing(false);
    }
  };

  const handleTagSelect = (tagName: string) => {
    const newSelection = localSelectedTags.includes(tagName)
      ? localSelectedTags.filter(tag => tag !== tagName)
      : [...localSelectedTags, tagName];
    setLocalSelectedTags(newSelection);
    // 選択したタグを保存して閉じる
    onTagsChange(newSelection);
    onClose();
  };

  const handleClose = () => {
    // Undoタイマーをクリア
    if (undoState.timeoutId) {
      clearTimeout(undoState.timeoutId);
    }
    
    setLocalSelectedTags(selectedTags || []);
    setSelectedRecommendedTags([]);
    setNewTagName('');
    setDeletedTags(new Set());
    setUndoState({ visible: false, tagName: '' });
    onClose();
  };

  const handleBackdropPress = () => {
    onTagsChange(localSelectedTags);
    handleClose();
  };

  // デバッグ用（visibleの時のみ、かつ初回レンダリング時のみ）
  if (visible && recommendedTags.length > 0) {
    console.log('AddTagModal render - recommendedTags:', recommendedTags);
    console.log('AddTagModal render - recommendedTags.length:', recommendedTags.length);
  }

  return (
    <Modal
      visible={isVisible}
      animationType="none"
      presentationStyle="overFullScreen"
      transparent={true}
      onRequestClose={handleBackdropPress}
    >
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* 背景：フェードイン */}
        <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
          <TouchableOpacity 
            style={styles.backdropTouchable} 
            activeOpacity={1} 
            onPress={handleBackdropPress}
          />
        </Animated.View>
        
        {/* モーダルコンテンツ：スライドイン + ジェスチャー */}
        <PanGestureHandler
          ref={panGestureRef}
          onGestureEvent={onGestureEvent}
          onHandlerStateChange={onHandlerStateChange}
        >
          <Animated.View 
            style={[
              styles.modalContainer,
              {
                transform: [
                  { translateY: translateY },
                  { translateY: modalTranslateY },
                  { translateY: gestureTranslateY }
                ]
              }
            ]}
          >
            {/* ドラッグハンドル */}
            <View style={styles.dragHandle}>
              <View style={styles.dragIndicator} />
            </View>

            {/* タグ作成セクション */}
            <View style={styles.createSection}>
              <TextInput
                style={styles.createInput}
                placeholder="新しいタグを作成..."
                placeholderTextColor="#666"
                value={newTagName}
                onChangeText={setNewTagName}
                returnKeyType="done"
                onSubmitEditing={handleCreateTag}
              />
              <TouchableOpacity
                style={styles.createTextButton}
                onPress={handleCreateTag}
                disabled={!newTagName.trim() || isCreating}
              >
                {isCreating ? (
                  <ActivityIndicator size="small" color="#8A2BE2" />
                ) : (
                  <Text style={[
                    styles.createTextButtonText,
                    (!newTagName.trim() || isCreating) && styles.createTextButtonTextDisabled
                  ]}>
                    作成
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* 区切り線 */}
            <View style={styles.divider} />

            {/* おすすめタグセクション */}
            <View style={styles.recommendedSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>おすすめのタグ ({recommendedTags.length})</Text>
                {onAITagSuggestion && (
                  <TouchableOpacity
                    style={styles.aiButton}
                    onPress={handleAITagSuggestion}
                    disabled={isAIAnalyzing}
                  >
                    {isAIAnalyzing ? (
                      <ActivityIndicator size="small" color="#8A2BE2" />
                    ) : (
                      <>
                        <Feather name="zap" size={12} color="#8A2BE2" />
                        <Text style={styles.aiButtonText}>AI提案</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              {/* タグリスト */}
              <ScrollView 
                ref={scrollViewRef}
                style={styles.scrollContainer}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                bounces={false}
              >
                {recommendedTags.length > 0 ? (
                  <View style={styles.tagsGrid}>
                    {recommendedTags.map((tagName, index) => {
                      const isSelected = selectedRecommendedTags.includes(tagName);
                      return (
                        <TouchableOpacity
                          key={`${tagName}-${index}`}
                          style={[
                            styles.tagChip,
                            isSelected && styles.tagChipSelected,
                          ]}
                          onPress={() => handleRecommendedTagToggle(tagName)}
                        >
                          <Text
                            style={[
                              styles.tagChipText,
                              isSelected && styles.tagChipTextSelected,
                            ]}
                          >
                            #{tagName}
                          </Text>
                          {isSelected && (
                            <Feather name="check" size={12} color="#00FFFF" style={styles.checkIcon} />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.emptyState}>
                    <Feather name="star" size={24} color="#666" />
                    <Text style={styles.emptyText}>すべてのタグを使用済み</Text>
                    <Text style={styles.emptySubText}>上のフィールドから新しいタグを作成してください</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </Animated.View>
        </PanGestureHandler>
        
        {/* 選択されたタグがある場合の追加ボタン（固定位置） */}
        {selectedRecommendedTags.length > 0 && (
          <View style={styles.fixedAddButtonContainer}>
            <TouchableOpacity
              style={styles.fixedAddButton}
              onPress={handleAddSelectedTags}
            >
              <Text style={styles.fixedAddButtonText}>
                選択したタグを作成 ({selectedRecommendedTags.length})
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  keyboardAvoidingView: {
    flex: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  backdropTouchable: {
    flex: 1,
  },
  modalContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: MODAL_HEIGHTS.EXPANDED,
    paddingBottom: 34, // Safe area bottom padding
  },
  dragHandle: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  dragIndicator: {
    width: 36,
    height: 4,
    backgroundColor: '#666',
    borderRadius: 2,
  },
  createSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  createInput: {
    flex: 1,
    fontSize: 16,
    color: '#FFF',
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#404040',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  createTextButton: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createTextButtonText: {
    fontSize: 16,
    color: '#8A2BE2',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  createTextButtonTextDisabled: {
    color: '#666',
    textDecorationLine: 'none',
  },
  divider: {
    height: 1,
    backgroundColor: '#333',
    marginHorizontal: 20,
    marginBottom: 20,
  },
  recommendedSection: {
    flex: 1,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#AAA',
  },
  aiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  aiButtonText: {
    fontSize: 12,
    color: '#8A2BE2',
    fontWeight: '600',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 80, // 固定ボタンのスペースを確保
  },
  tagsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 20,
  },
  tagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#2A2A2A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 8,
  },
  tagChipSelected: {
    backgroundColor: '#00FFFF20',
    borderColor: '#00FFFF',
  },
  tagChipText: {
    fontSize: 14,
    color: '#FFF',
  },
  tagChipTextSelected: {
    color: '#00FFFF',
    fontWeight: '600',
  },
  checkIcon: {
    marginLeft: 6,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginTop: 12,
    textAlign: 'center',
  },
  emptySubText: {
    fontSize: 14,
    color: '#555',
    marginTop: 4,
    textAlign: 'center',
  },
  fixedAddButtonContainer: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1000,
    elevation: 10,
    pointerEvents: 'box-none',
  },
  fixedAddButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#666',
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'auto',
  },
  fixedAddButtonText: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '500',
  },

}); 
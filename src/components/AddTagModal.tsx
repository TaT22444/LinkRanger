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
  const [undoState, setUndoState] = useState<UndoState>({ visible: false, tagName: '' });
  const [deletedTags, setDeletedTags] = useState<Set<string>>(new Set());
  const [recommendedTags, setRecommendedTags] = useState<string[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [pendingTags, setPendingTags] = useState<string[]>([]); // 作成予定のタグ
  const [createdTags, setCreatedTags] = useState<string[]>([]); // 作成済みタグの管理
  
  // アニメーション用の値
  const translateY = useRef(new Animated.Value(screenHeight)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const modalTranslateY = useRef(new Animated.Value(0)).current; // モーダル位置用
  const scrollViewRef = useRef<ScrollView>(null);

  // ジェスチャー用の値
  const gestureTranslateY = useRef(new Animated.Value(0)).current;
  const panGestureRef = useRef<PanGestureHandler>(null);
  const createSectionGestureRef = useRef<PanGestureHandler>(null);
  const dividerGestureRef = useRef<PanGestureHandler>(null);

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
      
      // setLocalSelectedTags(selectedTags || []); // この行は削除
      setCreatedTags([]);
      setPendingTags([]);
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
    
    if (state === State.END) {
      gestureTranslateY.flattenOffset(); // アニメーションのオフセットをリセット

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

  const handleRecommendedTagCreate = async (tagName: string) => {
    // 既に作成予定リストにある場合は削除、ない場合は追加
    if (pendingTags.includes(tagName)) {
      setPendingTags(prev => prev.filter(tag => tag !== tagName));
    } else {
      setPendingTags(prev => [...prev, tagName]);
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) {
      return;
    }

    const trimmedName = newTagName.trim();

    // 既存のタグと重複チェック
    if (availableTags && availableTags.some(tag => tag.name.toLowerCase() === trimmedName.toLowerCase())) {
      Alert.alert('エラー', 'このタグは既に存在します');
      return;
    }

    // 作成予定リストと重複チェック
    if (pendingTags.some(tag => tag.toLowerCase() === trimmedName.toLowerCase())) {
      Alert.alert('エラー', 'このタグは既に作成予定リストにあります');
      return;
    }

    // 作成予定リストに追加
    setPendingTags(prev => [...prev, trimmedName]);
    setNewTagName('');
  };

  const handleCreateAllTags = async () => {
    if (pendingTags.length === 0) {
      return;
    }

    setIsCreating(true);
    try {
      const newTagIds: string[] = [];
      
      // 作成予定のタグを順次作成
      for (const tagName of pendingTags) {
        const tagId = await onCreateTag(tagName, 'manual');
        console.log('AddTagModal: created tag with ID:', tagId);
        newTagIds.push(tagId);
      }
      
      // 既存のタグ + 新規作成したタグを合わせて適用して閉じる
      const allTagIds = [...(selectedTags || []), ...newTagIds];
      onTagsChange(allTagIds);
      performClose();
    } catch (error) {
      console.error('AddTagModal: bulk tag creation error:', error);
      Alert.alert('エラー', 'タグの作成に失敗しました');
    } finally {
      setIsCreating(false);
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

  // 変更があるかどうかをチェック
  const hasUnsavedChanges = () => {
    return (
      pendingTags.length > 0 || // 作成予定のタグがある
      createdTags.length > 0 || // 作成済みのタグがある
      deletedTags.size > 0 // 削除されたタグがある
      // newTagName.trim() !== '' は除外（入力途中はアラート不要）
    );
  };

  const handleClose = () => {
    if (hasUnsavedChanges()) {
      Alert.alert(
        '未保存の変更があります',
        '作成中のタグや変更を破棄して閉じますか？',
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
    // Undoタイマーをクリア
    if (undoState.timeoutId) {
      clearTimeout(undoState.timeoutId);
    }
    
    setCreatedTags([]);
    setPendingTags([]);
    setNewTagName('');
    setDeletedTags(new Set());
    setUndoState({ visible: false, tagName: '' });
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
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
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
          {/* ★★★ ジェスチャーハンドラをモーダル全体に適用 ★★★ */}
          <PanGestureHandler
            ref={panGestureRef}
            onGestureEvent={onGestureEvent}
            onHandlerStateChange={onHandlerStateChange}
            activeOffsetY={[-20, 20]} // 判定を少し緩やかに
            failOffsetX={[-100, 100]}
          >
            <Animated.View style={[{flex: 1}, { transform: [{ translateY: gestureTranslateY }] }]}>
              {/* ドラッグハンドル */}
              <View style={styles.dragHandle}>
                <View style={styles.dragIndicator} />
              </View>

              {/* --- コンテンツここから --- */}
              
              {/* タグ作成セクション */}
              <View style={styles.createSection}>
                <View style={styles.createInputContainer}>
                  <Feather name="hash" size={16} color="#8A2BE2" style={styles.hashIcon} />
                  <TextInput
                    style={styles.createInput}
                    placeholder="新しいタグ名を入力..."
                    placeholderTextColor="#666"
                    value={newTagName}
                    onChangeText={setNewTagName}
                    autoCapitalize="none"
                    autoCorrect={true}
                    keyboardType="default"
                    returnKeyType="done"
                    onSubmitEditing={handleCreateTag}
                    onFocus={handleInputFocus} // ★ フォーカス時のハンドラを追加
                    clearButtonMode="while-editing"
                    autoComplete="off"
                    maxLength={50}
                    blurOnSubmit={false}
                  />
                  {newTagName.trim() ? (
                    <TouchableOpacity
                      style={styles.addToPendingButton}
                      onPress={handleCreateTag}
                      disabled={isCreating}
                    >
                      <Text style={styles.addToPendingButtonText}>追加</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.addButtonPlaceholder} />
                  )}
                </View>
              </View>

              {/* 作成予定タグリスト */}
              {pendingTags.length > 0 && (
                <View style={styles.pendingTagsSection}>
                  <View style={styles.pendingSectionHeader}>
                    <Text style={styles.pendingSectionTitle}>
                      作成予定のタグ ({pendingTags.length})
                    </Text>
                    <TouchableOpacity
                      style={styles.clearPendingButton}
                      onPress={() => setPendingTags([])}
                    >
                      <Text style={styles.clearPendingButtonText}>クリア</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.pendingTagsGrid}>
                    {pendingTags.map((tagName, index) => (
                      <View key={`pending-${tagName}-${index}`} style={styles.pendingTagChip}>
                        <Text style={styles.pendingTagText}>#{tagName}</Text>
                        <TouchableOpacity
                          onPress={() => setPendingTags(prev => prev.filter(tag => tag !== tagName))}
                          style={styles.removePendingButton}
                        >
                          <Feather name="x" size={12} color="#FF6B6B" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                  <TouchableOpacity
                    style={styles.createAllButton}
                    onPress={handleCreateAllTags}
                    disabled={isCreating}
                  >
                    {isCreating ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Text style={styles.createAllButtonText}>
                        タグを作成 ({pendingTags.length})
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {/* 区切り線 */}
              <View style={styles.dividerContainer}>
                <View style={styles.divider} />
              </View>

              {/* おすすめタグセクション (ScrollViewをViewに変更) */}
              <View style={styles.recommendedSection}>
                  {/* おすすめタグのヘッダー */}
                  <View style={styles.sectionHeader}>
                    <View style={styles.sectionTitleContainer}>
                      <Text style={styles.sectionTitle}>おすすめタグ</Text>
                      <View style={styles.tagCount}>
                        <Text style={styles.tagCountText}>{recommendedTags.length}</Text>
                      </View>
                    </View>
                  </View>
                  {/* おすすめタグ */}
                  {recommendedTags.length > 0 ? (
                    <View style={styles.tagsGrid}>
                      {recommendedTags.map((tagName, index) => {
                        const isInPending = pendingTags.includes(tagName);
                        return (
                          <TouchableOpacity
                            key={`recommended-${tagName}-${index}`}
                            style={[
                              styles.recommendedTagButton,
                              isInPending && styles.recommendedTagButtonSelected,
                            ]}
                            onPress={() => handleRecommendedTagCreate(tagName)}
                            disabled={isCreating}
                          >
                            <Feather 
                              name={isInPending ? "check" : "plus"} 
                              size={14} 
                              color={isInPending ? "#8A2BE2" : "#666"} 
                              style={styles.recommendedTagIcon}
                            />
                            <Text
                              style={[
                                styles.recommendedTagText,
                                isInPending && styles.recommendedTagTextSelected,
                              ]}
                            >
                              #{tagName}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : (
                    <View style={styles.emptyState}>
                      <Feather name="star" size={24} color="#666" />
                      <Text style={styles.emptyText}>おすすめタグを生成中...</Text>
                      <Text style={styles.emptySubText}>上のフィールドから新しいタグを作成してください</Text>
                    </View>
                  )}
              </View>
            </Animated.View>
          </PanGestureHandler>
        </Animated.View>
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
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
    minHeight: 44, // タッチエリアを広くする
    justifyContent: 'center',
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
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 16, // 余白を広げる
  },
  createInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    backgroundColor: '#2A2A2A',
    borderRadius: 12, // 角を少し丸くする
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: 12,
    minHeight: 48, // ★ 固定の高さを設定
  },
  hashIcon: {
    marginRight: 8,
  },
  createInput: {
    flex: 1,
    fontSize: 16, // フォントサイズを少し大きく
    color: '#FFF',
    backgroundColor: 'transparent',
    paddingVertical: 0,
  },
  addToPendingButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#8A2BE2',
    borderRadius: 8,
    marginLeft: 8, // 入力欄との間に余白を追加
  },
  addToPendingButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  addButtonPlaceholder: {
    width: 58, // ボタンのおおよその幅に合わせる (padding + text)
    marginLeft: 8,
  },
  pendingTagsSection: {
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  pendingSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pendingSectionTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#888',
  },
  clearPendingButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'transparent',
    borderRadius: 8,
  },
  clearPendingButtonText: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
  pendingTagsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  pendingTagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pendingTagText: {
    fontSize: 13,
    color: '#CCC',
    fontWeight: '400',
  },
  removePendingButton: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    marginLeft: 4,
  },
  createAllButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#8A2BE2',
    borderRadius: 10,
  },
  createAllButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  dividerContainer: {
    paddingVertical: 10, // タッチエリアを広くする
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  divider: {
    height: 1,
    backgroundColor: '#333',
    marginHorizontal: 0, // containerで管理するため0に変更
    marginBottom: 0,
  },
  recommendedSection: {
    flex: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 20,
    marginTop: 0,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#888',
  },
  tagCount: {
    backgroundColor: '#2A2A2A',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagCountText: {
    fontSize: 11,
    color: '#888',
    fontWeight: '500',
  },
  aiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  aiButtonText: {
    fontSize: 11,
    color: '#8A2BE2',
    fontWeight: '500',
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    paddingBottom: 100, // 固定ボタンのスペースを確保
    flexGrow: 1,
  },
  tagsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingBottom: 16,
    paddingHorizontal: 20,
    marginHorizontal: 0,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
    marginTop: 8,
    textAlign: 'center',
  },
  emptySubText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  recommendedTagButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#2A2A2A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 6,
  },
  recommendedTagButtonSelected: {
    backgroundColor: '#8A2BE220',
    borderColor: '#8A2BE2',
  },
  recommendedTagIcon: {
    marginRight: 6,
  },
  recommendedTagText: {
    fontSize: 13,
    color: '#CCC',
    fontWeight: '400',
  },
  recommendedTagTextSelected: {
    color: '#8A2BE2',
    fontWeight: '500',
  },

}); 
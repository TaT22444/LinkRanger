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
  onCreateTag: (tagName: string, type?: 'manual' | 'ai') => Promise<string>;
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

  // データの初期化
  useEffect(() => {
    if (visible) {
      setCreatedTags([]);
      setPendingTags([]);
      setNewTagName('');
      setDeletedTags(new Set());
      setUndoState({ visible: false, tagName: '' });
      setIsExpanded(false);
    }
  }, [visible]);

  // モーダル表示/非表示の状態管理とアニメーション
  useEffect(() => {
    if (visible) {

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
}); 
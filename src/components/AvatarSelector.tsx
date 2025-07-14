import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Dimensions,
  Animated,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PanGestureHandler, State } from 'react-native-gesture-handler';

// プリセットのアバターアイコン定義
const PRESET_AVATARS = [
  { id: 'cat', icon: '🐱', label: 'ねこ' },
  { id: 'dog', icon: '🐶', label: 'いぬ' },
  { id: 'bear', icon: '🐻', label: 'くま' },
  { id: 'rabbit', icon: '🐰', label: 'うさぎ' },
  { id: 'fox', icon: '🦊', label: 'きつね' },
  { id: 'panda', icon: '🐼', label: 'パンダ' },
  { id: 'penguin', icon: '🐧', label: 'ペンギン' },
  { id: 'owl', icon: '🦉', label: 'ふくろう' },
  { id: 'unicorn', icon: '🦄', label: 'ユニコーン' },
  { id: 'dragon', icon: '🐲', label: 'ドラゴン' },
];

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const GRID_PADDING = 16;
const ITEMS_PER_ROW = 2;
const ITEM_SPACING = 16;
const AVAILABLE_WIDTH = SCREEN_WIDTH - (GRID_PADDING * 2);
const ITEM_WIDTH = (AVAILABLE_WIDTH - (ITEM_SPACING * (ITEMS_PER_ROW - 1))) / ITEMS_PER_ROW;

// モーダルの高さ設定
const MODAL_HEIGHTS = {
  COLLAPSED: SCREEN_HEIGHT * 0.4,  // 最小高さ
  EXPANDED: SCREEN_HEIGHT * 0.7,   // 最大高さ
  THRESHOLD: SCREEN_HEIGHT * 0.15,  // スワイプの閾値
};

interface AvatarSelectorProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (avatar: { id: string; icon: string }) => void;
  selectedAvatarId?: string;
}

export const AvatarSelector: React.FC<AvatarSelectorProps> = ({
  visible,
  onClose,
  onSelect,
  selectedAvatarId,
}) => {
  // アニメーション用の値
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const modalHeight = useRef(new Animated.Value(MODAL_HEIGHTS.COLLAPSED)).current;
  const panY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // 背景のフェードイン
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();

      // モーダルのスライドイン
      Animated.spring(slideAnim, {
        toValue: 0,
        tension: 65,
        friction: 11,
        useNativeDriver: true,
      }).start();
    } else {
      // 背景のフェードアウト
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();

      // モーダルのスライドアウト
      Animated.spring(slideAnim, {
        toValue: SCREEN_HEIGHT,
        tension: 65,
        friction: 11,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const onGestureEvent = Animated.event(
    [{ nativeEvent: { translationY: panY } }],
    { useNativeDriver: true }
  );

  const onHandlerStateChange = (event: any) => {
    if (event.nativeEvent.oldState === State.ACTIVE) {
      const { translationY, velocityY } = event.nativeEvent;
      
      // 閾値を超えた場合はモーダルを閉じる
      if (translationY > MODAL_HEIGHTS.THRESHOLD || velocityY > 500) {
        onClose();
        return;
      }

      // 元の位置に戻す
      Animated.spring(panY, {
        toValue: 0,
        tension: 65,
        friction: 11,
        useNativeDriver: true,
      }).start();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        {/* 背景のオーバーレイ */}
        <Animated.View 
          style={[
            styles.overlay,
            { opacity: fadeAnim }
          ]}
        >
          <TouchableOpacity 
            style={styles.overlayTouch}
            activeOpacity={1} 
            onPress={onClose}
          />
        </Animated.View>

        {/* モーダルコンテンツ */}
        <PanGestureHandler
          onGestureEvent={onGestureEvent}
          onHandlerStateChange={onHandlerStateChange}
        >
          <Animated.View
            style={[
              styles.modalContent,
              {
                transform: [
                  { translateY: Animated.add(slideAnim, panY) }
                ]
              }
            ]}
          >
            <View style={styles.header}>
              <Text style={styles.title}>アイコンを選択</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Feather name="x" size={24} color="#FFF" />
              </TouchableOpacity>
            </View>
            
            <ScrollView 
              style={styles.avatarGrid} 
              contentContainerStyle={styles.gridContent}
              showsVerticalScrollIndicator={false}
            >
              {PRESET_AVATARS.map((avatar) => (
                <TouchableOpacity
                  key={avatar.id}
                  style={[
                    styles.avatarItem,
                    selectedAvatarId === avatar.id && styles.selectedAvatar,
                  ]}
                  onPress={() => onSelect(avatar)}
                >
                  <Text style={styles.avatarIcon}>{avatar.icon}</Text>
                  <Text style={styles.avatarLabel}>{avatar.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Animated.View>
        </PanGestureHandler>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  overlayTouch: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: '#181818',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: MODAL_HEIGHTS.EXPANDED,
    minHeight: MODAL_HEIGHTS.COLLAPSED,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  title: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 4,
  },
  avatarGrid: {
    maxHeight: '100%',
  },
  gridContent: {
    padding: GRID_PADDING,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  avatarItem: {
    width: ITEM_WIDTH,
    aspectRatio: 1,
    backgroundColor: '#222',
    borderRadius: 12,
    marginBottom: ITEM_SPACING,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedAvatar: {
    backgroundColor: '#8A2BE2',
  },
  avatarIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  avatarLabel: {
    color: '#FFF',
    fontSize: 12,
    textAlign: 'center',
  },
}); 
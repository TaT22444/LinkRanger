import React from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Text,
  Animated,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinkViewMode } from '../types';

interface ViewModeSelectorProps {
  currentMode: LinkViewMode;
  onModeChange: (mode: LinkViewMode) => void;
}

export const ViewModeSelector: React.FC<ViewModeSelectorProps> = ({
  currentMode,
  onModeChange,
}) => {
  const handleModeChange = (mode: LinkViewMode) => {
    if (mode !== currentMode) {
      // 軽い振動フィードバック（iOS/Android対応）
      // Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onModeChange(mode);
    }
  };

  const modes = [
    {
      key: 'list' as LinkViewMode,
      icon: 'list',
      label: 'リスト',
      description: '全てのリンクを時系列で表示',
    },
    {
      key: 'folder' as LinkViewMode,
      icon: 'folder',
      label: 'フォルダ',
      description: 'フォルダ別にグループ化して表示',
    },
    {
      key: 'tag' as LinkViewMode,
      icon: 'hash',
      label: 'タグ',
      description: 'タグ別にグループ化して表示',
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.modeButtons}>
        {modes.map((mode) => (
          <TouchableOpacity
            key={mode.key}
            style={[
              styles.modeButton,
              currentMode === mode.key && styles.modeButtonActive,
            ]}
            onPress={() => handleModeChange(mode.key)}
            accessibilityLabel={`${mode.label}表示に切り替え`}
            accessibilityHint={mode.description}
          >
            <Feather
              name={mode.icon as any}
              size={16}
              color={currentMode === mode.key ? '#8A2BE2' : '#666'}
            />
            <Text
              style={[
                styles.modeButtonText,
                currentMode === mode.key && styles.modeButtonTextActive,
              ]}
            >
              {mode.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  modeButtons: {
    flexDirection: 'row',
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    padding: 4,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    gap: 6,
  },
  modeButtonActive: {
    backgroundColor: '#12121290',
  },
  modeButtonText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  modeButtonTextActive: {
    color: '#8A2BE2',
    fontWeight: '600',
  },
  modeDescription: {
    fontSize: 11,
    color: '#888',
    textAlign: 'center',
    marginTop: 6,
  },
  swipeHint: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 15,
    backgroundColor: '#121212',
    borderRadius: 6,
  },
  swipeHintText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
}); 
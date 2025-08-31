import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CheckboxComponent } from './CheckboxComponent';

interface TagFilterProps {
  tags: string[];
  selectedTags: string[];
  onTagToggle: (tag: string) => void;
  onClearAll: () => void;
  onAddTag: () => void;
}

export const TagFilter: React.FC<TagFilterProps> = ({
  tags,
  selectedTags,
  onTagToggle,
  onClearAll,
  onAddTag,
}) => {
  const [showAllTags, setShowAllTags] = useState(false);
  
  // デバッグログ
  
  
  // タグが0個で、選択されたタグもない場合は+ボタンのみ表示
  const showOnlyAddButton = tags.length === 0 && selectedTags.length === 0;
  
  // 表示するタグの制限
  const MAX_VISIBLE_TAGS = 8; // 12から8に減らす
  const displayTags = showAllTags ? tags : tags.slice(0, MAX_VISIBLE_TAGS);
  const hasMoreTags = tags.length > MAX_VISIBLE_TAGS;

  return (
    <View style={styles.container}>
      {/* 上部コントロールバー */}
      <View style={styles.controlBar}>
        {/* 左側：タグ数表示 */}
        <Text style={styles.tagCountText}>
          {tags.length > 0 ? (
            selectedTags.length > 0 
              ? `${selectedTags.length}/${tags.length} 選択中`
              : `${tags.length}個のタグ`
          ) : (
            'タグなし'
          )}
        </Text>

        {/* 右側：操作ボタン群 */}
        <View style={styles.actionButtons}>
          

          {/* もっと見る/折りたたむボタン */}
          {hasMoreTags && (
            <TouchableOpacity
              style={styles.expandButton}
              onPress={() => setShowAllTags(!showAllTags)}
            >
              <Text style={styles.expandButtonText}>
                {showAllTags ? '折りたたむ' : `+${tags.length - MAX_VISIBLE_TAGS}個`}
              </Text>
              <Feather 
                name={showAllTags ? 'chevron-up' : 'chevron-down'} 
                size={12} 
                color="#8A2BE2" 
              />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 折り返し表示のタグリスト */}
      {!showOnlyAddButton && (
        <ScrollView
          style={styles.tagsContainer}
          contentContainerStyle={styles.tagsContentContainer}
          contentInset={{ bottom: 120 }}
          showsVerticalScrollIndicator={false}
        >
          {displayTags.map((tag) => (
            <TouchableOpacity
              key={tag}
              style={[
                styles.tagButton,
                selectedTags.includes(tag) && styles.tagButtonSelected,
              ]}
              onPress={() => onTagToggle(tag)}
            >
              <Text
                style={[
                  styles.tagText,
                  selectedTags.includes(tag) && styles.tagTextSelected,
                ]}
              >
                #{tag}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    paddingTop: 8, // 12から8に減らす
    paddingBottom: 6, // 8から6に減らす
    paddingHorizontal: 20,
  },
  controlBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10, // 12から10に減らす
  },
  tagCountText: {
    fontSize: 13, // 14から13に減らす
    color: '#888', // グレーに変更
    fontWeight: '500', // 600から500に軽く
    flex: 0,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editButton: {
    backgroundColor: '#8A2BE2',
    width: 26, // 28から26に減らす
    height: 26, // 28から26に減らす
    borderRadius: 13, // 14から13に調整
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearButton: {
    backgroundColor: '#FF6B6B',
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    paddingHorizontal: 10, // 12から10に減らす
    paddingVertical: 12, // 6から5に減らす
    borderRadius: 14, // 16から14に減らす
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
  },
  expandButtonText: {
    fontSize: 11, // 12から11に減らす
    color: '#8A2BE2',
    fontWeight: '600',
    marginRight: 3, // 4から3に減らす
  },
  tagsContainer: {
  },
  tagsContentContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagButton: {
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 10, // 12から10に減らす
    paddingVertical: 5, // 6から5に減らす
    borderRadius: 14, // 16から14に減らす
    borderWidth: 1,
    borderColor: '#444',
    marginBottom: 4,
  },
  tagButtonSelected: {
    backgroundColor: '#8A2BE2',
    borderColor: '#8A2BE2',
  },
  tagText: {
    fontSize: 11, // 12から11に減らす
    color: '#CCC',
    fontWeight: '500',
  },
  tagTextSelected: {
    color: '#FFF',
  },
}); 
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

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
  // デバッグログ
  console.log('TagFilter - tags:', tags);
  console.log('TagFilter - tags.length:', tags.length);
  console.log('TagFilter - selectedTags:', selectedTags);
  
  // タグが0個で、選択されたタグもない場合は+ボタンのみ表示
  const showOnlyAddButton = tags.length === 0 && selectedTags.length === 0;

  return (
    <View style={styles.container}>
      <View style={styles.contentContainer}>
        {/* 固定の編集ボタン / クリアボタン */}
        <TouchableOpacity
          style={[
            styles.addButton,
            selectedTags.length > 0 && styles.clearButton
          ]}
          onPress={selectedTags.length > 0 ? onClearAll : onAddTag}
        >
          {selectedTags.length > 0 ? (
            <Text style={styles.clearButtonText}>×</Text>
          ) : tags.length === 0 ? (
            <Text style={styles.addButtonText}>+</Text>
          ) : (
            <Feather name="edit-2" size={14} color="#FFF" />
          )}
        </TouchableOpacity>

        {/* スクロール可能なタグリスト */}
        {!showOnlyAddButton && (
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            style={styles.scrollView}
          >
            {tags.map((tag) => (
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    paddingVertical: 12,
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    alignItems: 'center',
    paddingLeft: 8,
  },
  addButton: {
    backgroundColor: '#8A2BE2',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  addButtonText: {
    fontSize: 16,
    color: '#FFF',
    fontWeight: '500',
  },
  clearButton: {
    backgroundColor: '#FF6B6B',
  },
  clearButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
  tagButton: {
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#444',
  },
  tagButtonSelected: {
    backgroundColor: '#8A2BE2',
    borderColor: '#8A2BE2',
  },
  tagText: {
    fontSize: 12,
    color: '#CCC',
    fontWeight: '500',
  },
  tagTextSelected: {
    color: '#FFF',
  },

}); 
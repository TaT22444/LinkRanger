import React, { useState, useEffect } from 'react';
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
  SafeAreaView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { AddTagModal } from './AddTagModal';

interface Tag {
  id: string;
  name: string;
}

interface TagSelectorModalProps {
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

export const TagSelectorModal: React.FC<TagSelectorModalProps> = ({
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
  const [localSelectedTags, setLocalSelectedTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddTagModal, setShowAddTagModal] = useState(false);

  // 初期化
  useEffect(() => {
    if (visible) {
      setLocalSelectedTags([...selectedTags]);
      setSearchQuery('');
    }
  }, [visible, selectedTags]);

  // タグのフィルタリング
  const filteredTags = availableTags.filter(tag =>
    tag.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // タグの選択/選択解除
  const handleTagToggle = (tagId: string) => {
    const newSelection = localSelectedTags.includes(tagId)
      ? localSelectedTags.filter(id => id !== tagId)
      : [...localSelectedTags, tagId];
    setLocalSelectedTags(newSelection);
  };

  // AddTagModalでのタグ変更処理
  const handleAddTagModalChange = (newTags: string[]) => {
    setLocalSelectedTags(newTags);
  };

  // 変更を保存して閉じる
  const handleSave = () => {
    onTagsChange(localSelectedTags);
    onClose();
  };

  // キャンセル
  const handleCancel = () => {
    setLocalSelectedTags([...selectedTags]);
    onClose();
  };

  // タグ名を取得
  const getTagName = (tagId: string): string => {
    const tag = availableTags.find(t => t.id === tagId);
    return tag ? tag.name : tagId;
  };

  // 選択されたタグ数
  const selectedCount = localSelectedTags.length;
  const hasChanges = JSON.stringify(localSelectedTags.sort()) !== JSON.stringify(selectedTags.sort());

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleCancel}
    >
      <SafeAreaView style={styles.container}>
        {/* ヘッダー */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerButton} onPress={handleCancel}>
            <Text style={styles.cancelText}>キャンセル</Text>
          </TouchableOpacity>
          
          <Text style={styles.headerTitle}>タグを選択</Text>
          
          <TouchableOpacity 
            style={[styles.headerButton, styles.saveButton, !hasChanges && styles.saveButtonDisabled]} 
            onPress={handleSave}
            disabled={!hasChanges}
          >
            <Text style={[styles.saveText, !hasChanges && styles.saveTextDisabled]}>保存</Text>
          </TouchableOpacity>
        </View>

                {/* 検索バー */}
        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <Feather name="search" size={16} color="#666" />
            <TextInput
              style={styles.searchInput}
              placeholder="タグを検索..."
              placeholderTextColor="#666"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="default"
              returnKeyType="search"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Feather name="x" size={16} color="#666" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* 選択されたタグ表示 */}
        {selectedCount > 0 && (
          <View style={styles.selectedSection}>
            <Text style={styles.selectedTitle}>選択中 ({selectedCount})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectedTags}>
              {localSelectedTags.map((tagId) => (
                <TouchableOpacity
                  key={tagId}
                  style={styles.selectedTag}
                  onPress={() => handleTagToggle(tagId)}
                >
                  <Text style={styles.selectedTagText}>#{getTagName(tagId)}</Text>
                  <Feather name="x" size={12} color="#8A2BE2" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}



          {/* タグリスト */}
          <ScrollView style={styles.tagList} showsVerticalScrollIndicator={false}>
            <View style={styles.tagGrid}>
              {/* 新規タグ作成ボタン */}
              <TouchableOpacity
                style={styles.addTagItem}
                onPress={() => setShowAddTagModal(true)}
              >
                <Feather name="plus" size={16} color="#8A2BE2" />
                <Text style={styles.addTagText}>新しいタグを作成</Text>
              </TouchableOpacity>

              {/* 既存のタグ */}
              {filteredTags.map((tag) => {
                const isSelected = localSelectedTags.includes(tag.id);
                return (
                  <TouchableOpacity
                    key={tag.id}
                    style={[styles.tagItem, isSelected && styles.tagItemSelected]}
                    onPress={() => handleTagToggle(tag.id)}
                  >
                    <Text style={[styles.tagText, isSelected && styles.tagTextSelected]}>
                      #{tag.name}
                    </Text>
                    {isSelected && (
                      <Feather name="check" size={16} color="#8A2BE2" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 空の状態（検索結果なし時のみ表示） */}
            {filteredTags.length === 0 && searchQuery && (
              <View style={styles.emptyState}>
                <Feather name="search" size={48} color="#666" />
                <Text style={styles.emptyTitle}>タグが見つかりません</Text>
                <Text style={styles.emptySubtitle}>
                  検索条件を変更するか、新しいタグを作成してください
                </Text>
              </View>
            )}
        </ScrollView>

        {/* AddTagModal */}
        <AddTagModal
          visible={showAddTagModal}
          onClose={() => setShowAddTagModal(false)}
          availableTags={availableTags}
          selectedTags={localSelectedTags}
          onTagsChange={handleAddTagModalChange}
          onCreateTag={onCreateTag}
          onDeleteTag={onDeleteTag}
          linkTitle={linkTitle}
          linkUrl={linkUrl}
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
  
  // 検索セクション
  searchSection: {
    padding: 16,
    paddingBottom: 12,
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
  
  // 検索バー
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#FFF',
    marginLeft: 8,
  },
  
  // 選択されたタグセクション
  selectedSection: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  selectedTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 8,
  },
  selectedTags: {
    flexDirection: 'row',
  },
  selectedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#8A2BE2',
  },
  selectedTagText: {
    fontSize: 12,
    color: '#FFF',
    marginRight: 4,
  },
  

  
  // タグリスト
  tagList: {
    flex: 1,
    padding: 16,
  },
  tagGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  tagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    margin: 4,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tagItemSelected: {
    backgroundColor: '#2A2A2A',
    borderColor: '#8A2BE2',
  },
  tagText: {
    fontSize: 14,
    color: '#CCC',
    marginRight: 6,
  },
  tagTextSelected: {
    color: '#FFF',
    fontWeight: '600',
  },
  
  // 新規タグ作成ボタン
  addTagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    margin: 4,
    borderWidth: 1,
    borderColor: '#8A2BE2',
    borderStyle: 'dashed',
  },
  addTagText: {
    fontSize: 14,
    color: '#8A2BE2',
    marginLeft: 6,
  },
  
  // 空の状態
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20,
  },
}); 
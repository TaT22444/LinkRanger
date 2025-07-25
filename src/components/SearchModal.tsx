import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Link } from '../types';

interface SearchModalProps {
  visible: boolean;
  onClose: () => void;
  links: Link[];
  tags: Array<{ id: string; name: string }>;
  onLinkPress: (link: Link) => void;
}

const { height: screenHeight } = Dimensions.get('window');

export const SearchModal: React.FC<SearchModalProps> = ({
  visible,
  onClose,
  links,
  tags,
  onLinkPress,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredLinks, setFilteredLinks] = useState<Link[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredLinks([]);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(() => {
      const query = searchQuery.toLowerCase();
      const filtered = links.filter(link => {
        // タイトルで検索
        if (link.title.toLowerCase().includes(query)) return true;
        
        // 説明で検索
        if (link.description?.toLowerCase().includes(query)) return true;
        
        // URLで検索
        if (link.url.toLowerCase().includes(query)) return true;
        
        // タグで検索
        const linkTags = (link.tagIds || []).map(tagId => 
          tags.find(tag => tag.id === tagId)?.name?.toLowerCase()
        ).filter(Boolean);
        
        return linkTags.some(tagName => tagName?.includes(query));
      });
      
      setFilteredLinks(filtered);
      setIsSearching(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, links, tags]);

  const handleClose = () => {
    setSearchQuery('');
    setFilteredLinks([]);
    onClose();
  };

  const renderLinkItem = ({ item }: { item: Link }) => {
    const linkTags = (item.tagIds || [])
      .map(tagId => tags.find(tag => tag.id === tagId)?.name)
      .filter(Boolean)
      .slice(0, 3);

    return (
      <TouchableOpacity
        style={styles.linkItem}
        onPress={() => {
          onLinkPress(item);
          handleClose();
        }}
      >
        <View style={styles.linkContent}>
          <Text style={styles.linkTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.linkUrl} numberOfLines={1}>
            {item.url}
          </Text>
          {linkTags.length > 0 && (
            <View style={styles.tagsContainer}>
              {linkTags.map((tagName, index) => (
                <View key={index} style={styles.tagChip}>
                  <Text style={styles.tagText}>#{tagName}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
        <Ionicons name="chevron-forward" size={20} color="#666" />
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* ヘッダー */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>リンクを検索</Text>
          <View style={styles.placeholder} />
        </View>

        {/* 検索バー */}
        <View style={styles.searchContainer}>
          <View style={styles.searchInputContainer}>
            <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="タイトル、URL、タグで検索..."
              placeholderTextColor="#666"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                style={styles.clearButton}
              >
                <Ionicons name="close-circle" size={20} color="#666" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* 検索結果 */}
        <View style={styles.resultsContainer}>
          {isSearching ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#8B5CF6" />
              <Text style={styles.loadingText}>検索中...</Text>
            </View>
          ) : searchQuery.trim() === '' ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="search" size={64} color="#444" />
              <Text style={styles.emptyText}>
                キーワードを入力してリンクを検索
              </Text>
            </View>
          ) : filteredLinks.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="search" size={64} color="#444" />
              <Text style={styles.emptyText}>
                「{searchQuery}」に一致するリンクが見つかりません
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredLinks}
              renderItem={renderLinkItem}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContainer}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 16,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  closeButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  placeholder: {
    width: 40,
  },
  searchContainer: {
    padding: 16,
    backgroundColor: '#1a1a1a',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    paddingVertical: 8,
  },
  clearButton: {
    padding: 4,
    marginLeft: 8,
  },
  resultsContainer: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#666',
    fontSize: 16,
    marginTop: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    color: '#666',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 24,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 16,
    marginVertical: 6,
  },
  linkContent: {
    flex: 1,
  },
  linkTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  linkUrl: {
    fontSize: 14,
    color: '#8B5CF6',
    marginBottom: 8,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tagChip: {
    backgroundColor: '#404040',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
    marginBottom: 4,
  },
  tagText: {
    fontSize: 12,
    color: '#ccc',
  },
}); 
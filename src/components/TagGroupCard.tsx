import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Tag, Link } from '../types';

interface TagGroupCardProps {
  tag: Tag;
  links: Link[];
  onPress: (link: Link) => void;
  onToggleExpanded: () => void;
  isExpanded: boolean;
  onMarkAsRead?: (linkId: string) => Promise<void>;
  disabled?: boolean; // 選択モード時にタップを無効にする
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: () => void;
  selectedLinkIds?: Set<string>;
  onToggleLinkSelection?: (linkId: string) => void;
}

export const TagGroupCard: React.FC<TagGroupCardProps> = ({
  tag,
  links,
  onPress,
  onToggleExpanded,
  isExpanded,
  onMarkAsRead,
  disabled = false,
  isSelectionMode = false,
  isSelected = false,
  onToggleSelection,
  selectedLinkIds = new Set(),
  onToggleLinkSelection,
}) => {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const [showAllLinks, setShowAllLinks] = useState(false);

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('ja-JP', {
      month: 'short',
      day: 'numeric',
    }).format(date);
  };

  const getRecentLink = () => {
    if (links.length === 0) return null;
    return links.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  };

  const getUnreadCount = () => {
    return links.filter(link => !link.isRead).length;
  };

  const recentLink = getRecentLink();
  const unreadCount = getUnreadCount();
  const displayLinks = showAllLinks ? links : links.slice(0, 3);

  const handleShowMore = () => {
    setShowAllLinks(!showAllLinks);
  };

  const handleLinkPress = async (link: Link) => {
    // 選択モードの場合は選択状態を切り替え
    if (isSelectionMode) {
      onToggleLinkSelection?.(link.id);
      return;
    }
    
    // 通常モードでリンク詳細を即座に開く
    onPress(link);
    
    // 未読の場合は背景で既読にする（非同期処理）
    if (!link.isRead && onMarkAsRead) {
      // 非同期で実行（awaitしない）
      onMarkAsRead(link.id).catch(error => {
        console.error('Error marking link as read:', error);
      });
    }
  };

  const handleOpenTagDetail = (e: any) => {
    e.stopPropagation(); // Prevent header tap event
    
    // Convert Date objects to serializable format for navigation
    const serializableTag = {
      ...tag,
      createdAt: tag.createdAt.toISOString(),
      updatedAt: tag.updatedAt.toISOString(),
      lastUsedAt: tag.lastUsedAt.toISOString(),
      firstUsedAt: tag.firstUsedAt.toISOString(),
    };
    
    navigation.navigate('TagDetail', { tag: serializableTag });
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={isSelectionMode ? onToggleSelection : onToggleExpanded}
        activeOpacity={0.7}
      >
        <View style={styles.tagInfo}>
          {/* 選択モード時のチェックボックス */}
          {isSelectionMode && (
            <View style={styles.selectionCheckbox}>
              <View style={[
                styles.checkbox,
                isSelected && styles.checkboxSelected
              ]}>
                {isSelected && (
                  <Feather name="check" size={12} color="#FFF" />
                )}
              </View>
            </View>
          )}
          
          <View style={styles.headerToggle}>
            <Feather
              name={isExpanded ? 'chevron-down' : 'chevron-right'}
              size={12}
              color="#545454"
              style={styles.headerToggleIcon}
            />
          </View>
          <View style={styles.tagInfoContainer}>
            {/* <View style={styles.tagIcon}>
              <Feather name="hash" size={16} color="#8A2BE2" />
            </View> */}
            <View style={styles.tagText}>
              <Text style={styles.tagName}>#{tag.name}</Text>
              <View style={styles.linkStats}>
                <Feather name="link" size={10} color="#666" />
                <Text style={styles.linkCount}>{links.length}</Text>
                {unreadCount > 0 && (
                  <>
                    <View style={styles.unreadHeaderDot} />
                    <Text style={styles.unreadCount}>未読{unreadCount}</Text>
                  </>
                )}
              </View>
            </View>
          </View>
          <TouchableOpacity 
            style={styles.openLinkTagsButton}
            onPress={handleOpenTagDetail}
            activeOpacity={0.7}
          >
            <Feather name="arrow-right" size={12} color="#fff" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.linksContainer}>
          {links.length === 0 ? (
            <View style={styles.emptyTagState}>
              <Feather name="folder" size={20} color="#666" style={styles.emptyIcon} />
              <Text style={styles.emptyText}>このタグにはまだリンクがありません</Text>
              <Text style={styles.emptySubText}>リンクを作成してこのタグを付与してください</Text>
            </View>
          ) : (
            <>
              {displayLinks.map((link) => (
                <TouchableOpacity
                  key={link.id}
                  style={styles.linkItem}
                  onPress={() => handleLinkPress(link)}
                  activeOpacity={0.6}
                >
                  {/* 選択モード時のチェックボックス */}
                  {isSelectionMode && (
                    <View style={styles.linkSelectionCheckbox}>
                      <View style={[
                        styles.linkCheckbox,
                        selectedLinkIds.has(link.id) && styles.linkCheckboxSelected
                      ]}>
                        {selectedLinkIds.has(link.id) && (
                          <Feather name="check" size={12} color="#FFF" />
                        )}
                      </View>
                    </View>
                  )}
                  
                  <View style={styles.linkContent}>
                    <View style={styles.linkTextContainer}>
                      {!link.isRead && <View style={styles.unreadDot} />}
                      <View style={styles.linkTitleRow}>
                        <Text 
                          style={[
                            styles.linkTitle,
                            link.isRead && styles.linkTitleRead
                          ]} 
                          numberOfLines={2}
                        >
                          {link.title}
                        </Text>
                      </View>
                      {link.description && (
                        <Text style={styles.linkDescription} numberOfLines={2}>
                          {link.description}
                        </Text>
                      )}
                      <View style={styles.linkMeta}>
                        <Text style={styles.linkDate}>
                          {formatDate(link.createdAt)}
                        </Text>
                        <View style={[
                          styles.externalIconContainer,
                          !link.isRead && styles.unreadExternalIconContainer
                        ]}>
                          <Feather 
                            name="external-link" 
                            size={10} 
                            color={link.isRead ? '#666' : '#FF8C00'} 
                            style={styles.externalIcon}
                          />
                        </View>
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
              
              {links.length > 3 && (
                <TouchableOpacity
                  style={styles.showMoreButton}
                  onPress={handleShowMore}
                >
                  <Text style={styles.showMoreText}>
                    {showAllLinks ? '折りたたむ' : `他 ${links.length - 3}件を表示`}
                  </Text>
                  <Feather 
                    name={showAllLinks ? 'chevron-up' : 'arrow-right'} 
                    size={12} 
                    color="#8A2BE2" 
                  />
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    borderColor: '#333',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  tagInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tagInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  tagText: {
    flex: 1,
  },
  tagName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 2,
  },
  linkStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  linkCount: {
    fontSize: 11,
    color: '#888',
    marginLeft: 3,
  },
  unreadCount: {
    fontSize: 11,
    color: '#EC9C5B',
  },
  headerToggle: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerToggleIcon: {
    marginLeft: 4,
  },
  openLinkTagsButton: {
    backgroundColor: '#333',
    width: 56,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  lastUpdated: {
    fontSize: 11,
    color: '#666',
    marginRight: 8,
  },
  linksContainer: {
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    borderRadius: 6, // 角丸を追加
    marginVertical: 2, // 各アイテム間のマージン
  },
  linkContent: {
    flex: 1,
  },
  linkTextContainer: {
    position: 'relative',
    paddingLeft: 8,
  },
  linkTitleRow: {
    marginBottom: 4,
  },
  linkTitle: {
    fontSize: 14,
    color: '#FFF',
    lineHeight: 18,
    fontWeight: '500',
  },
  linkTitleRead: {
    color: '#AAA',
    fontWeight: '400',
  },
  unreadDot: {
    position: 'absolute',
    left: 0,
    top: 6,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#EC9C5B',
  },
  unreadHeaderDot: {
    width: 3,
    height: 3,
    borderRadius: 10,
    backgroundColor: '#EC9C5B',
    marginLeft: 8,
    marginRight: 3,
  },
  linkDescription: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
    lineHeight: 16,
  },
  linkMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  linkDate: {
    fontSize: 10,
    color: '#666',
    fontWeight: '500',
  },
  externalIcon: {
    marginLeft: 6,
    opacity: 0.7,
  },
  showMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    marginTop: 4,
  },
  showMoreText: {
    fontSize: 12,
    color: '#8A2BE2',
    fontWeight: '500',
    marginRight: 4,
  },
  selectionCheckbox: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkbox: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#545454',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#8A2BE2',
    borderColor: '#8A2BE2',
  },
  linkSelectionCheckbox: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  linkCheckbox: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#545454',
    justifyContent: 'center',
    alignItems: 'center',
  },
  linkCheckboxSelected: {
    backgroundColor: '#8A2BE2',
    borderColor: '#8A2BE2',
  },
  emptyTagState: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 10,
  },
  emptyIcon: {
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 5,
  },
  emptySubText: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
  },
  externalIconContainer: {
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
    marginLeft: 4,
  },
  unreadExternalIconContainer: {
    backgroundColor: 'rgba(255, 140, 0, 0.2)', // 薄いオレンジ背景
    borderWidth: 1,
    borderColor: 'rgba(255, 140, 0, 0.6)', // オレンジ枠線
  },
}); 
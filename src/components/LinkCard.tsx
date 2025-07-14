import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Linking,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Link, Tag } from '../types';

interface LinkCardProps {
  link: Link;
  onPress?: () => void;
  onDelete?: () => void;
  onToggleBookmark?: () => void;
  onTogglePin?: () => void;
  tags?: Tag[]; // タグ情報を追加
}

export const LinkCard: React.FC<LinkCardProps> = ({
  link,
  onPress,
  onDelete,
  onToggleBookmark,
  onTogglePin,
  tags = [],
}) => {
  const handleOpenExternalLink = async (e: any) => {
    e.stopPropagation(); // カードのタップイベントを阻止
    try {
      const supported = await Linking.canOpenURL(link.url);
      if (supported) {
        await Linking.openURL(link.url);
      } else {
        Alert.alert('エラー', 'このリンクを開くことができません');
      }
    } catch (error) {
      Alert.alert('エラー', 'リンクを開く際にエラーが発生しました');
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const getDomainFromUrl = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.content}>
        {/* 左側：サムネイル */}
        <View style={styles.leftSection}>
          {link.imageUrl && (
            <Image
              source={{ uri: link.imageUrl }}
              style={styles.thumbnail}
              resizeMode="cover"
            />
          )}
        </View>

        {/* 中央：メインコンテンツ */}
        <View style={styles.mainContent}>
          <Text style={styles.title} numberOfLines={1}>
            {link.title}
          </Text>
          
          <Text style={styles.domain} numberOfLines={1}>
            {getDomainFromUrl(link.url)}
          </Text>

          {/* タグ表示（最大2個） */}
          {link.tagIds && link.tagIds.length > 0 && (
            <View style={styles.tagsContainer}>
              {link.tagIds.slice(0, 2).map((tagId, index) => {
                // タグIDからタグ名を取得
                const tag = tags.find(t => t.id === tagId);
                const displayName = tag ? tag.name : tagId; // タグが見つからない場合はIDを表示
                
                return (
                  <View key={`${tagId}-${index}`} style={styles.tag}>
                    <Text style={styles.tagText}>#{displayName}</Text>
                  </View>
                );
              })}
              {link.tagIds.length > 2 && (
                <Text style={styles.moreTagsText}>
                  +{link.tagIds.length - 2}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* 右側：アクションと日付 */}
        <View style={styles.rightSection}>
          {/* アクションボタン列 */}
          <View style={styles.actionsRow}>
            {/* ピン留めボタン */}
            {onTogglePin && (
              <TouchableOpacity
                style={[styles.actionButton, link.isPinned && styles.pinnedButton]}
                onPress={(e) => {
                  e.stopPropagation();
                  onTogglePin();
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather 
                  name="bookmark" 
                  size={14} 
                  color={link.isPinned ? '#FFD700' : '#666'} 
                />
              </TouchableOpacity>
            )}
            
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleOpenExternalLink}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="external-link" size={14} color="#00FFFF" />
            </TouchableOpacity>
          </View>
          
          <Text style={styles.date}>
            {formatDate(link.createdAt)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1F1F1F',
    borderWidth: 1,
    borderColor: '#323232',
    borderRadius: 8,
    marginBottom: 8,
    marginHorizontal: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    minHeight: 70,
  },
  leftSection: {
    marginRight: 12,
  },
  thumbnail: {
    width: 40,
    height: 40,
    borderRadius: 6,
  },
  mainContent: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 4,
  },
  domain: {
    fontSize: 12,
    color: '#00FFFF',
    marginBottom: 6,
  },
  tagsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tag: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#666',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginRight: 4,
  },
  tagText: {
    fontSize: 10,
    color: '#AAA',
    fontWeight: '500',
  },
  moreTagsText: {
    fontSize: 10,
    color: '#AAA',
    marginLeft: 2,
  },
  rightSection: {
    alignItems: 'center',
    marginLeft: 8,
  },
  date: {
    fontSize: 9,
    color: '#666',
    textAlign: 'center',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
  },
  actionButton: {
    backgroundColor: '#3A3A3A',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pinnedButton: {
    backgroundColor: '#4A4A00',
  },
}); 
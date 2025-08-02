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
  tags: Tag[];
  onPress: () => void;
  onToggleBookmark: () => void;
  onDelete: () => void;
  onMarkAsRead?: () => void;
}

export const LinkCard: React.FC<LinkCardProps> = ({
  link,
  onPress,
  onDelete,
  onToggleBookmark,
  tags = [],
  onMarkAsRead,
}) => {
  const handleOpenExternalLink = async (e: any) => {
    e.stopPropagation(); // カードのタップイベントを阻止
    try {
      const supported = await Linking.canOpenURL(link.url);
      if (supported) {
        // 外部リンクを開く前に既読マーク
        if (onMarkAsRead && !link.isRead) {
          onMarkAsRead();
        }
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

  const isGoogleMapsLink = () => {
    const patterns = [
      /maps\.google\./,
      /goo\.gl\/maps/,
      /maps\.app\.goo\.gl/,
      /google\..*\/maps/,
    ];
    
    return patterns.some(pattern => pattern.test(link.url));
  };

  const getTimeUntilExpiry = () => {
    if (link.isRead) return null; // 既読の場合は表示しない
    
    const now = new Date();
    const expiresAt = new Date(link.expiresAt);
    const timeDiff = expiresAt.getTime() - now.getTime();
    
    if (timeDiff <= 0) return '期限切れ';
    
    const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) {
      return `あと${days}日`;
    } else if (hours > 0) {
      return `あと${hours}時間`;
    } else {
      const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
      return `あと${minutes}分`;
    }
  };

  const expiryText = getTimeUntilExpiry();
  const isNearExpiry = expiryText && (expiryText.includes('時間') || expiryText.includes('分'));

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
          
          <View style={styles.domainContainer}>
            {isGoogleMapsLink() && (
              <Feather name="map-pin" size={12} color="#4285F4" style={styles.mapIcon} />
            )}
            <Text style={styles.domain} numberOfLines={1}>
              {getDomainFromUrl(link.url)}
            </Text>
          </View>

          {/* タグ表示（最大2個） */}
          {link.tagIds && Array.isArray(link.tagIds) && link.tagIds.length > 0 && (
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
            {/* ピン留めボタン */}
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
          
          {/* 期限切れまでの時間表示 */}
          {expiryText && (
            <Text style={[
              styles.expiryText,
              isNearExpiry && styles.expiryTextUrgent,
              link.isRead && styles.expiryTextRead
            ]}>
              {expiryText}
            </Text>
          )}
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
  domainContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  mapIcon: {
    marginRight: 4,
  },
  domain: {
    fontSize: 12,
    color: '#00FFFF',
  },
  tagsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tag: {
    marginRight: 8,
  },
  tagText: {
    fontSize: 10,
    color: '#666',
    fontWeight: '500',
  },
  moreTagsText: {
    fontSize: 10,
    color: '#666',
    marginLeft: 4,
    fontWeight: '500',
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  expiryText: {
    fontSize: 9,
    color: '#666',
    marginTop: 4,
  },
  expiryTextUrgent: {
    color: '#FF0000',
    fontWeight: 'bold',
  },
  expiryTextRead: {
    textDecorationLine: 'line-through',
    color: '#666',
  },
}); 
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
import { formatDateTimeShort } from '../utils/dateFormatter';
import { notificationService } from '../services/notificationService';

interface LinkCardProps {
  link: Link;
  tags: Tag[];
  onPress: () => void;
  onToggleBookmark: () => void;
  onDelete: () => void;
  onMarkAsRead?: () => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: () => void;
}

export const LinkCard: React.FC<LinkCardProps> = ({
  link,
  onPress,
  onDelete,
  onToggleBookmark,
  tags = [],
  onMarkAsRead,
  isSelectionMode = false,
  isSelected = false,
  onToggleSelection,
}) => {
  const handleOpenExternalLink = async (e: any) => {
    e.stopPropagation(); // カードのタップイベントを阻止
    try {
      const supported = await Linking.canOpenURL(link.url);
      if (supported) {
        // 3日間未アクセス通知システム：リンクアクセス時の処理
        await notificationService.handleLinkAccess(link);
        
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

  // 期限切れ表示機能を削除（3日間未アクセス通知機能に置き換え）

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={isSelectionMode ? onToggleSelection : onPress}
      activeOpacity={0.7}
    >
      <View style={styles.content}>
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
            <TouchableOpacity
              style={[
                styles.actionButton,
                !link.isRead && styles.unreadActionButton // 未読の場合にオレンジ色の枠線を適用
              ]}
              onPress={handleOpenExternalLink}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather 
                name="external-link" 
                size={14} 
                color={link.isRead ? "#00FFFF" : "#FF8C00"} 
              />
            </TouchableOpacity>
          </View>
          
          <Text style={styles.date}>
            {formatDateTimeShort(link.createdAt)}
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
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
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
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  unreadActionButton: {
    borderColor: 'rgba(255, 140, 0, 0.6)', // 控えめなオレンジ色の枠線
    borderWidth: 1, // 1pxの控えめな枠線  
    backgroundColor: 'rgba(255, 140, 0, 0.1)', // 非常に薄いオレンジ背景
  },
  selectionCheckbox: {
    marginRight: 12,
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#666',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#8A2BE2',
    borderColor: '#8A2BE2',
  },
}); 
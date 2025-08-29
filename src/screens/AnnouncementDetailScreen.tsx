import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import { AntDesign } from '@expo/vector-icons';
import { Announcement, AnnouncementType, AnnouncementPriority } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useAnnouncements } from '../contexts/AnnouncementContext';
import { announcementService } from '../services/announcementService';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { linkService } from '../services/linkService';

interface AnnouncementDetailScreenProps {
  navigation: any;
  route: {
    params: {
      announcementId: string;
    };
  };
}

export const AnnouncementDetailScreen: React.FC<AnnouncementDetailScreenProps> = ({ 
  navigation, 
  route 
}) => {
  const { user } = useAuth();
  const { decrementUnreadCount } = useAnnouncements();
  const { announcementId } = route.params;
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRead, setIsRead] = useState(false);

  useEffect(() => {
    loadAnnouncementDetail();
  }, []);

  const loadAnnouncementDetail = async () => {
    if (!user || !announcementId) return;

    try {
      setLoading(true);
      const actualPlan = user?.subscription?.plan === 'plus' ? 'plus' : 'free';
      const data = await announcementService.getAnnouncements(user.uid, actualPlan);
      
      const targetAnnouncement = data.announcements.find(a => a.id === announcementId);
      if (targetAnnouncement) {
        setAnnouncement(targetAnnouncement);
        setIsRead(targetAnnouncement.isRead);
        
        // 未読の場合は既読にする
        if (!targetAnnouncement.isRead) {
          await markAsRead();
        }
      }
    } catch (error) {
      console.error('お知らせ詳細取得エラー:', error);
      Alert.alert('エラー', 'お知らせの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async () => {
    if (!user || !announcementId || isRead) return;

    try {
      await announcementService.markAsRead(user.uid, announcementId);
      setIsRead(true);
      // 未読数を減らす
      decrementUnreadCount();
      console.log('✅ お知らせを既読にしました:', announcementId);
    } catch (error) {
      console.error('既読更新エラー:', error);
    }
  };

  const handleActionPress = async () => {
    if (!announcement?.actionUrl) return;

    try {
      const canOpen = await Linking.canOpenURL(announcement.actionUrl);
      if (canOpen) {
        await Linking.openURL(announcement.actionUrl);
      } else {
        Alert.alert('エラー', 'リンクを開くことができません');
      }
    } catch (error) {
      console.error('リンクオープンエラー:', error);
      Alert.alert('エラー', 'リンクを開くことができません');
    }
  };

  const handleOpenLinkPress = async () => {
    if (!user || !announcement?.linkId) return;

    try {
      // 既読状態に更新
      await markAsRead();
      
      // リンクの既読状態も更新（所有者チェックを追加）
      const link = await linkService.getLink(announcement.linkId);
      if (link && link.userId === user.uid) {
        await linkService.markAsRead(announcement.linkId);
      }

      // HomeScreenに遷移し、リンクIDをパラメータとして渡す
      navigation.navigate('Main', {
        screen: 'Home',
        params: { linkIdToOpen: announcement.linkId },
      });
    } catch (error) {
      console.error('リンクオープンエラー:', error);
      // Firebaseの権限エラーの場合、HomeScreenに遷移するだけにする
      if (error instanceof Error && error.message.includes('Missing or insufficient permissions')) {
        navigation.navigate('Main', {
          screen: 'Home',
          params: { linkIdToOpen: announcement.linkId },
        });
      } else {
        Alert.alert('エラー', 'リンクの処理中にエラーが発生しました');
      }
    }
  };

  const getTypeIcon = (type: AnnouncementType): string => {
    switch (type) {
      case 'info': return 'infocirlce';
      case 'update': return 'rocket1';
      case 'maintenance': return 'tool';
      case 'feature': return 'star';
      case 'warning': return 'warning';
      default: return 'notification';
    }
  };

  const getTypeColor = (type: AnnouncementType): string => {
    switch (type) {
      case 'info': return '#3498db';
      case 'update': return '#2ecc71';
      case 'maintenance': return '#f39c12';
      case 'feature': return '#9b59b6';
      case 'warning': return '#e74c3c';
      default: return '#95a5a6';
    }
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const weeks = Math.floor(days / 7);
    
    // 1日以内は時間表記
    if (hours < 24) {
      if (hours <= 0) return '今';
      return `${hours}時間前`;
    }
    
    // 1週間未満は日表記
    if (days < 7) {
      return `${days}日前`;
    }
    
    // 1週間以上は週表記
    return `${weeks}週間前`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8A2BE2" />
        <Text style={styles.loadingText}>読み込み中...</Text>
      </View>
    );
  }

  if (!announcement) {
    return (
      <View style={styles.errorContainer}>
        <AntDesign name="exclamationcircle" size={64} color="#FF6B6B" />
        <Text style={styles.errorTitle}>お知らせが見つかりません</Text>
        <Text style={styles.errorDescription}>
          お知らせが削除されたか、アクセス権限がない可能性があります
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>戻る</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
      >
        {/* 日付 */}
        <View style={styles.dateSection}>
          <Text style={styles.dateText}>
            {formatDate(announcement?.publishedAt || announcement?.createdAt)}
          </Text>
        </View>

        {/* タイトル */}
        <View style={styles.titleSection}>
          <Text style={styles.title}>{announcement?.title}</Text>
        </View>

        {/* コンテンツ */}
        <View style={styles.contentSection}>
          {announcement?.type !== 'reminder' && (
            <Text style={styles.contentText}>{announcement?.content}</Text>
          )}
        </View>

        {/* アクションボタン */}
        {announcement?.actionText && announcement?.actionUrl && (
          <View style={styles.actionSection}>
            <TouchableOpacity style={styles.actionButton} onPress={handleActionPress}>
              <Text style={styles.actionButtonText}>{announcement.actionText}</Text>
              <AntDesign name="right" size={16} color="#FFF" />
            </TouchableOpacity>
          </View>
        )}

        {/* リンクを開くボタン（未読リンクのお知らせの場合） */}
        {announcement?.type === 'reminder' && announcement?.linkId && (
          <View style={styles.actionSection}>
            <TouchableOpacity style={styles.openLinkButton} onPress={handleOpenLinkPress}>
              <AntDesign name="link" size={16} color="#FFF" />
              <Text style={styles.openLinkButtonText}>リンクを開く</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 底部スペース */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
  },
  loadingText: {
    color: '#FFF',
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#121212',
    paddingHorizontal: 40,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 20,
    marginBottom: 8,
  },
  errorDescription: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30,
  },
  content: {
    flex: 1,
  },
  dateSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  dateText: {
    fontSize: 14,
    color: '#999',
  },
  titleSection: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
    lineHeight: 24,
  },
  contentSection: {
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  contentText: {
    fontSize: 16,
    color: '#E0E0E0',
    lineHeight: 26,
  },
  actionSection: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8A2BE2',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 8,
  },
  actionButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  openLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8A2BE2',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 8,
  },
  openLinkButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  backButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  bottomSpacer: {
    height: 40,
  },
});
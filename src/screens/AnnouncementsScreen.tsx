import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Linking,
} from 'react-native';
import { AntDesign } from '@expo/vector-icons';
import { Announcement, AnnouncementType, AnnouncementPriority } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { announcementService } from '../services/announcementService';

// 既読状態を含むお知らせ型
interface AnnouncementWithReadStatus extends Announcement {
  isRead: boolean;
}

interface AnnouncementsScreenProps {
  navigation: any;
}

export const AnnouncementsScreen: React.FC<AnnouncementsScreenProps> = ({ navigation }) => {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<AnnouncementWithReadStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastFetch, setLastFetch] = useState<number>(0);

  // キャッシュ有効期限（5分）
  const CACHE_DURATION = 5 * 60 * 1000;

  useEffect(() => {
    const now = Date.now();
    const shouldRefresh = (now - lastFetch) > CACHE_DURATION;
    
    if (shouldRefresh || announcements.length === 0) {
      console.log('🔄 お知らせを新規読み込み');
      loadAnnouncements();
    } else {
      console.log('💾 キャッシュからお知らせを表示');
      setLoading(false);
    }
  }, []);

  const loadAnnouncements = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      // 実際のFirestoreプラン値を使用
      const actualPlan = user?.subscription?.plan === 'plus' ? 'plus' : 'free';
      const data = await announcementService.getAnnouncements(user.uid, actualPlan);
      setAnnouncements(data.announcements);
      setUnreadCount(data.unreadCount);
      setLastFetch(Date.now());
      console.log(`✅ お知らせ取得完了: ${data.announcements.length}件`);
    } catch (error) {
      console.error('お知らせ取得エラー:', error);
      Alert.alert('エラー', 'お知らせの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAnnouncements();
    setRefreshing(false);
  };

  const handleAnnouncementPress = (announcement: AnnouncementWithReadStatus) => {
    // 詳細画面へ遷移
    navigation.navigate('AnnouncementDetail', {
      announcementId: announcement.id
    });
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

  const getPriorityBadge = (priority: AnnouncementPriority) => {
    if (priority === 'high') {
      return (
        <View style={styles.priorityBadge}>
          <Text style={styles.priorityText}>重要</Text>
        </View>
      );
    }
    return null;
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

  const renderAnnouncement = (announcement: AnnouncementWithReadStatus) => {
    const isRead = announcement.isRead;
    
    return (
      <TouchableOpacity
        key={announcement.id}
        style={[styles.announcementCard, isRead && styles.readCard]}
        onPress={() => handleAnnouncementPress(announcement)}
        activeOpacity={0.7}
      >
        <View style={styles.announcementHeader}>
          {getPriorityBadge(announcement.priority)}
          <Text style={[styles.date, isRead && styles.readDate]}>
            {formatDate(announcement.publishedAt || announcement.createdAt)}
          </Text>
        </View>
        <View style={styles.contentSection}>
          <Text style={[styles.title, isRead && styles.readTitle]} numberOfLines={2}>
            {announcement.title}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8A2BE2" />
        <Text style={styles.loadingText}>お知らせを読み込み中...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {announcements.length === 0 ? (
          <View style={styles.emptyContainer}>
            <AntDesign name="notification" size={64} color="#555" />
            <Text style={styles.emptyTitle}>お知らせはありません</Text>
            <Text style={styles.emptyDescription}>
              新しいお知らせがあると、ここに表示されます
            </Text>
          </View>
        ) : (
          <View style={styles.announcementsList}>
            {announcements.map(renderAnnouncement)}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#121212',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
  },
  unreadBadge: {
    backgroundColor: '#e74c3c',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 24,
    alignItems: 'center',
  },
  unreadText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
    marginTop: 16,
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 100,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 20,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    lineHeight: 24,
  },
  announcementsList: {
    padding: 16,
  },
  announcementCard: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  readCard: {
    backgroundColor: '#222',
    opacity: 1,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  typeIcon: {
    marginRight: 12,
  },
  readTypeIcon: {
    opacity: 0.5,
  },
  contentSection: {
    flex: 1,
  },
  announcementHeader: {
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '400',
    color: '#FFF',
    marginBottom: 4,
  },
  readTitle: {
    color: '#999',
  },
  date: {
    fontSize: 12,
    color: '#999',
  },
  readDate: {
    color: '#666',
  },
  priorityBadge: {
    backgroundColor: '#FF5722',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  priorityText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '600',
  },
});
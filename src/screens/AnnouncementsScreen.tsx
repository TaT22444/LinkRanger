import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { useFocusEffect } from '@react-navigation/native'; // 追加
import { AntDesign } from '@expo/vector-icons';
import { Announcement, AnnouncementType, AnnouncementPriority } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useAnnouncements } from '../contexts/AnnouncementContext';
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
  const { decrementUnreadCount } = useAnnouncements();
  const [announcements, setAnnouncements] = useState<AnnouncementWithReadStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastFetch, setLastFetch] = useState<number>(0);
  const [filter, setFilter] = useState<'all' | 'important'>('all'); // フィルター状態を変更

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
    // ローカルで既読状態を更新
    if (!announcement.isRead) {
      setAnnouncements(prev => 
        prev.map(item => 
          item.id === announcement.id ? {...item, isRead: true} : item
        )
      );
      
      // 未読数を減らす
      decrementUnreadCount();
      
      // Firebaseにも既読情報を送信
      announcementService.markAsRead(user!.uid, announcement.id);
    }
    
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

  // お知らせを再読み込みする関数
  const reloadAnnouncements = useCallback(async () => {
    if (!user) return;
    
    try {
      // 実際のFirestoreプラン値を使用
      const actualPlan = user?.subscription?.plan === 'plus' ? 'plus' : 'free';
      const data = await announcementService.getAnnouncements(user.uid, actualPlan);
      setAnnouncements(data.announcements);
      setUnreadCount(data.unreadCount);
      setLastFetch(Date.now());
      console.log(`✅ お知らせ再読み込み完了: ${data.announcements.length}件`);
    } catch (error) {
      console.error('お知らせ再読み込みエラー:', error);
    }
  }, [user]);

  // 画面がフォーカスされたときに再読み込み
  useFocusEffect(
    useCallback(() => {
      console.log('🔄 お知らせを再読み込み（フォーカス時）');
      reloadAnnouncements();
    }, [reloadAnnouncements])
  );

  // フィルターされたお知らせを計算
  const filteredAnnouncements = useMemo(() => {
    // 日付順にソート（新しい順）
    const sortedAnnouncements = [...announcements].sort((a, b) => {
      const dateA = a.publishedAt || a.createdAt;
      const dateB = b.publishedAt || b.createdAt;
      return dateB.getTime() - dateA.getTime();
    });

    return sortedAnnouncements.filter(announcement => {
      // 'reminder'タイプのお知らせは表示しない
      if (announcement.type === 'reminder') return false;
      
      // 'all' フィルターでは'reminder'以外のすべて表示
      if (filter === 'all') return true;
      
      // 'important' フィルターでは高優先度のお知らせのみ表示
      if (filter === 'important') return announcement.priority === 'high';
      
      return true;
    });
  }, [announcements, filter]);

  // フィルターされた未読数を計算
  const filteredUnreadCount = useMemo(() => {
    return filteredAnnouncements.filter(a => !a.isRead).length;
  }, [filteredAnnouncements]);

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

  // フィルターボタンのスタイル
  const getFilterButtonStyle = (filterType: 'all' | 'important') => [
    styles.filterButton,
    filter === filterType && styles.activeFilterButton
  ];

  // フィルターボタンのテキストスタイル
  const getFilterTextStyle = (filterType: 'all' | 'important') => [
    styles.filterText,
    filter === filterType && styles.activeFilterText
  ];

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
      {/* フィルターボタンを変更 */}
      <View style={styles.filterContainer}>
        <TouchableOpacity 
          style={getFilterButtonStyle('all')}
          onPress={() => setFilter('all')}
        >
          <Text style={getFilterTextStyle('all')}>全て</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={getFilterButtonStyle('important')}
          onPress={() => setFilter('important')}
        >
          <Text style={getFilterTextStyle('important')}>重要</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {filteredAnnouncements.length === 0 ? (
          <View style={styles.emptyContainer}>
            <AntDesign name="notification" size={64} color="#555" />
            <Text style={styles.emptyTitle}>お知らせはありません</Text>
            <Text style={styles.emptyDescription}>
              {filter === 'all' && '新しいお知らせがあると、ここに表示されます'}
              {filter === 'important' && '重要なお知らせはありません'}
            </Text>
          </View>
        ) : (
          <View style={styles.announcementsList}>
            {filteredAnnouncements.map(renderAnnouncement)}
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
  scrollView: {
    flex: 1,
    marginTop: 8,
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
    backgroundColor: '#1f1f1f',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  readCard: {
    backgroundColor: '#1a1a1a',
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
  // フィルターボタン用の新しいスタイルを追加
  filterContainer: {
    flexDirection: 'row',
    marginTop: 16,
    paddingHorizontal: 16,
  },
  filterButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginHorizontal: 4,
    borderRadius: 20,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  activeFilterButton: {
    backgroundColor: '#1f1f1f',
    borderColor: '#333',
  },
  filterText: {
    fontSize: 14,
    color: '#999',
    fontWeight: '500',
  },
  activeFilterText: {
    color: '#FFF',
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    backgroundColor: '#FF5722',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 8,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  filterButtonText: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '600',
  },
});
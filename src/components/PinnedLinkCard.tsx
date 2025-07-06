import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Link } from '../types';

interface PinnedLinkCardProps {
  link: Link;
  onPress: () => void;
  onUnpin: () => void;
  onOpenExternal: () => void;
}

export const PinnedLinkCard: React.FC<PinnedLinkCardProps> = ({
  link,
  onPress,
  onUnpin,
  onOpenExternal,
}) => {
  const getDomainFromUrl = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  const truncateTitle = (title: string, maxLength: number = 40) => {
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength) + '...';
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.card} onPress={onPress}>
        {/* コンテンツ */}
        <View style={styles.content}>
          <Text style={styles.title} numberOfLines={2}>
            {truncateTitle(link.title, 40)}
          </Text>
          <Text style={styles.domain} numberOfLines={1}>
            {getDomainFromUrl(link.url)}
          </Text>
        </View>

        {/* アクションボタン */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={onOpenExternal}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="external-link" size={14} color="#00FFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={onUnpin}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="bookmark" size={14} color="#FFD700" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 160,
    marginRight: 12,
  },
  card: {
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    overflow: 'hidden',
    height: 80,
    flexDirection: 'row',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: 12,
    paddingRight: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
    lineHeight: 16,
    marginBottom: 4,
  },
  domain: {
    fontSize: 11,
    color: '#00FFFF',
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'column',
    gap: 8,
    paddingRight: 8,
  },
  actionButton: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 14,
  },
}); 
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Folder, Link } from '../types';
import { formatDateShort } from '../utils/dateFormatter';

interface FolderCardProps {
  folder: Folder;
  linkCount: number;
  recentLinks: Link[];
  onPress: () => void;
}

export const FolderCard: React.FC<FolderCardProps> = ({
  folder,
  linkCount,
  recentLinks,
  onPress,
}) => {

  const getLastUpdated = () => {
    if (recentLinks.length === 0) return folder.createdAt;
    return recentLinks[0].createdAt;
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Feather name="folder" size={20} color="#8A2BE2" />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.folderName} numberOfLines={1}>
            {folder.name}
          </Text>
          <Text style={styles.linkCount}>
            {linkCount}個のリンク
          </Text>
        </View>
      </View>

      {folder.description && (
        <Text style={styles.description} numberOfLines={2}>
          {folder.description}
        </Text>
      )}

      <View style={styles.footer}>
        <Text style={styles.lastUpdated}>
          {formatDateShort(getLastUpdated())}
        </Text>
        {recentLinks.length > 0 && (
          <View style={styles.recentPreview}>
            <Text style={styles.recentTitle} numberOfLines={1}>
              {recentLinks[0].title}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#8A2BE220',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  folderName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 2,
  },
  linkCount: {
    fontSize: 12,
    color: '#888',
  },
  description: {
    fontSize: 13,
    color: '#CCC',
    lineHeight: 18,
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastUpdated: {
    fontSize: 11,
    color: '#666',
  },
  recentPreview: {
    flex: 1,
    marginLeft: 12,
  },
  recentTitle: {
    fontSize: 11,
    color: '#AAA',
    textAlign: 'right',
  },
}); 
import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  Modal,
  TouchableWithoutFeedback,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Link } from '../types';
import { CheckboxComponent } from './CheckboxComponent';
import { formatDateShort } from '../utils/dateFormatter';

interface AddTagToLinksModalProps {
  visible: boolean;
  onClose: () => void;
  links: Link[];
  tagName: string;
  onConfirm: (selectedLinkIds: string[]) => void;
}

export const AddTagToLinksModal: React.FC<AddTagToLinksModalProps> = ({
  visible,
  onClose,
  links,
  tagName,
  onConfirm,
}) => {
  const [selectedLinkIds, setSelectedLinkIds] = useState<Set<string>>(new Set());

  // デバッグ用ログ
  console.log('🔍 AddTagToLinksModal: received props', {
    visible,
    linksCount: links?.length || 0,
    tagName,
    sampleLinks: links?.slice(0, 3).map(l => ({ id: l.id, title: l.title }))
  });

  // モーダルの表示状態をログ
  useEffect(() => {
    if (visible) {
      console.log('🔍 AddTagToLinksModal: Modal opened', {
        linksCount: links?.length || 0,
        tagName
      });
    }
  }, [visible, links, tagName]);

  const handleToggleLinkSelection = (linkId: string) => {
    setSelectedLinkIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(linkId)) {
        newSet.delete(linkId);
      } else {
        newSet.add(linkId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedLinkIds.size === links.length) {
      setSelectedLinkIds(new Set());
    } else {
      setSelectedLinkIds(new Set(links.map(link => link.id)));
    }
  };

  const handleConfirm = () => {
    if (selectedLinkIds.size === 0) {
      Alert.alert('エラー', 'リンクを選択してください');
      return;
    }

    Alert.alert(
      '確認',
      `${selectedLinkIds.size}件のリンクに「${tagName}」タグを付与しますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '付与',
          style: 'default',
          onPress: () => {
            onConfirm(Array.from(selectedLinkIds));
            setSelectedLinkIds(new Set());
          },
        },
      ]
    );
  };

  const renderLinkItem = ({ item }: { item: Link }) => (
    <TouchableOpacity
      style={styles.linkItem}
      onPress={() => handleToggleLinkSelection(item.id)}
      activeOpacity={0.7}
    >
      <View style={styles.linkSelectionCheckbox}>
        <CheckboxComponent isSelected={selectedLinkIds.has(item.id)} />
      </View>
      
      <View style={styles.linkContent}>
        <View style={styles.linkTextContainer}>
          <View style={styles.linkTitleRow}>
            <Text 
              style={[
                styles.linkTitle,
                item.isRead && styles.linkTitleRead
              ]} 
              numberOfLines={2}
            >
              {item.title}
            </Text>
            {!item.isRead && <View style={styles.unreadBadge} />}
          </View>
          
          {item.description && (
            <Text style={styles.linkDescription} numberOfLines={1}>
              {item.description}
            </Text>
          )}
          
          <View style={styles.linkMeta}>
            <Text style={styles.linkDate}>
              {formatDateShort(item.createdAt)}
            </Text>
            <View style={styles.domainContainer}>
              <Text style={styles.domainText}>
                {new URL(item.url).hostname.replace('www.', '')}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  const allSelected = selectedLinkIds.size === links.length;
  const someSelected = selectedLinkIds.size > 0;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View style={styles.container}>
              {/* ヘッダー */}
              <View style={styles.header}>
                <Text style={styles.headerTitle}>タグ「{tagName}」を付与</Text>
                <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                  <Feather name="x" size={20} color="#666" />
                </TouchableOpacity>
              </View>

              {/* 選択状況と全選択ボタン */}
              <View style={styles.selectionBar}>
                <TouchableOpacity style={styles.selectAllButton} onPress={handleSelectAll}>
                  <CheckboxComponent isSelected={allSelected} />
                  <Text style={styles.selectAllText}>
                    {allSelected ? 'すべて解除' : 'すべて選択'}
                  </Text>
                </TouchableOpacity>
                
                <View style={styles.selectionBadge}>
                  <Text style={styles.selectionCount}>{selectedLinkIds.size}</Text>
                  <Text style={styles.selectionLabel}>件選択中</Text>
                </View>
              </View>

              {/* リンクリスト */}
              {!links || links.length === 0 ? (
                <View style={styles.emptyState}>
                  <Feather name="check-circle" size={48} color="#8A2BE2" />
                  <Text style={styles.emptyStateTitle}>
                    すべてのリンクに既に「{tagName}」タグが付与されています
                  </Text>
                  <Text style={styles.emptyStateSubtitle}>
                    新しいリンクを保存すると、ここでタグを付与できます
                  </Text>
                  {/* デバッグ情報 */}
                  <View style={styles.debugInfo}>
                    <Text style={styles.debugText}>Debug: links = {JSON.stringify(links)}</Text>
                    <Text style={styles.debugText}>Debug: links.length = {links?.length || 'undefined'}</Text>
                  </View>
                </View>
              ) : (
                <>
                  {/* デバッグ情報 */}
                  <View style={styles.debugInfo}>
                    <Text style={styles.debugText}>Debug: {links.length} links received</Text>
                  </View>
                  
                  <FlatList
                    data={links}
                    renderItem={renderLinkItem}
                    keyExtractor={(item) => item.id}
                    style={styles.linksList}
                    contentContainerStyle={styles.linksContent}
                    showsVerticalScrollIndicator={false}
                    ItemSeparatorComponent={() => <View style={styles.separator} />}
                  />
                </>
              )}

              {/* フッター */}
              <View style={styles.footer}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={onClose}
                >
                  <Text style={styles.cancelButtonText}>キャンセル</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={[
                    styles.confirmButton,
                    !someSelected && styles.confirmButtonDisabled
                  ]}
                  onPress={handleConfirm}
                  disabled={!someSelected}
                >
                  <Text style={[
                    styles.confirmButtonText,
                    !someSelected && styles.confirmButtonTextDisabled
                  ]}>
                    付与する
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: '#1A1A1A',
    borderRadius: 20,
    maxHeight: '85%',
    width: '92%',
    maxWidth: 480,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  
  // ヘッダー
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFF',
    flex: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  
  // 選択バー
  selectionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#2A2A2A',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  selectAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  selectAllText: {
    fontSize: 15,
    color: '#8A2BE2',
    fontWeight: '600',
  },
  selectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8A2BE2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  selectionCount: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '700',
  },
  selectionLabel: {
    fontSize: 12,
    color: '#E8E8E8',
    fontWeight: '500',
  },
  
  // リンクリスト
  linksList: {
    flex: 1,
  },
  linksContent: {
    paddingVertical: 8,
  },
  linkItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  linkSelectionCheckbox: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    marginTop: 2,
  },
  linkContent: {
    flex: 1,
  },
  linkTextContainer: {
    flex: 1,
  },
  linkTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  linkTitle: {
    fontSize: 16,
    color: '#FFF',
    lineHeight: 22,
    fontWeight: '600',
    flex: 1,
  },
  linkTitleRead: {
    color: '#AAA',
    fontWeight: '500',
  },
  unreadBadge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EC9C5B',
    marginLeft: 8,
    marginTop: 8,
  },
  linkDescription: {
    fontSize: 14,
    color: '#888',
    lineHeight: 20,
    marginBottom: 8,
  },
  linkMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  linkDate: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  domainContainer: {
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  domainText: {
    fontSize: 11,
    color: '#888',
    fontWeight: '500',
  },
  separator: {
    height: 1,
    backgroundColor: '#2A2A2A',
    marginHorizontal: 24,
  },
  
  // フッター
  footer: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
    backgroundColor: '#1A1A1A',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: '#CCC',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#8A2BE2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonDisabled: {
    backgroundColor: '#333',
    opacity: 0.6,
  },
  confirmButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  confirmButtonTextDisabled: {
    color: '#666',
  },
  
  // 空状態
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  emptyStateTitle: {
    fontSize: 18,
    color: '#8A2BE2',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 12,
    lineHeight: 26,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20,
  },
  
  // デバッグ用スタイル
  debugInfo: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#8A2BE2',
  },
  debugText: {
    fontSize: 12,
    color: '#8A2BE2',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
});

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
  TouchableWithoutFeedback,
  Animated,
} from 'react-native';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { Link } from '../types';
import { AIProgressCircle } from './AIProgressCircle';

interface AIStatusMonitorProps {
  processingLinks: Link[];
  failedLinks: Link[];
  untaggedLinks: Link[];
  onRetry: (linkId: string, linkData: Partial<Link>) => void;
  onExecuteAI: (linkId: string) => void;
  onDismissUntagged: (linkId: string) => void;
  aiProcessingStatus: { [key: string]: number };
  canUseAI: boolean;
  aiUsageCount: number;
  aiUsageLimit: number;
}

export const AIStatusMonitor: React.FC<AIStatusMonitorProps> = ({ 
  processingLinks, 
  failedLinks, 
  untaggedLinks,
  onRetry,
  onExecuteAI,
  onDismissUntagged,
  aiProcessingStatus,
  canUseAI,
  aiUsageCount,
  aiUsageLimit
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  const processingCount = processingLinks.length;
  const failedCount = failedLinks.length;
  const untaggedCount = untaggedLinks.length;
  const totalItems = processingCount + failedCount + untaggedCount;
  
  const previousProcessingCount = useRef(processingCount);

  // AI処理完了時のアニメーション
  useEffect(() => {
    if (previousProcessingCount.current > 0 && processingCount === 0) {
      // 処理完了時のポップアニメーション
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scaleAnim, {
            toValue: 1.2,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0.7,
            duration: 100,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.spring(scaleAnim, {
            toValue: 1,
            tension: 300,
            friction: 10,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    }
    previousProcessingCount.current = processingCount;
  }, [processingCount, scaleAnim, opacityAnim]);

  const renderModal = () => (
    <Modal
      transparent={true}
      visible={modalVisible}
      animationType="fade"
      onRequestClose={() => setModalVisible(false)}
    >
      <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <TouchableWithoutFeedback>
            <View style={styles.modalContent}>
              <FlatList
                data={[...processingLinks, ...failedLinks, ...untaggedLinks]}
                renderItem={({ item }) => {
                  const isFailed = item.status === 'error';
                  const isUntagged = untaggedLinks.includes(item);
                  return (
                    <View style={[
                      styles.itemContainer, 
                      isFailed && styles.failedItemContainer,
                      isUntagged && styles.untaggedItemContainer
                    ]}>
                      <View style={styles.itemTextContainer}>
                        <Text style={styles.itemText} numberOfLines={1}>{item.title}</Text>
                        {isUntagged && (
                          <Text style={styles.untaggedLabel}>タグ付与待ち</Text>
                        )}
                      </View>
                      <View style={styles.itemActionContainer}>
                        {isFailed ? (
                          <TouchableOpacity onPress={() => onRetry(item.id, item)} style={styles.retryButton}>
                            <Feather name="refresh-cw" size={14} color="#FBBF24" />
                            <Text style={styles.retryText}>再試行</Text>
                          </TouchableOpacity>
                        ) : isUntagged ? (
                          <View style={styles.untaggedActions}>
                            <TouchableOpacity 
                              onPress={() => onExecuteAI(item.id)} 
                              style={[styles.aiButton, !canUseAI && styles.aiButtonDisabled]}
                              disabled={!canUseAI}
                            >
                              <Feather name="play" size={12} color={canUseAI ? "#FFF" : "#6B7280"} />
                              <Text style={[styles.aiButtonText, !canUseAI && styles.aiButtonTextDisabled]}>
                                {canUseAI ? "実行" : "制限"}
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => onDismissUntagged(item.id)} style={styles.dismissButton}>
                              <Feather name="x" size={16} color="#9CA3AF" />
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <AIProgressCircle progress={aiProcessingStatus[item.id] || 0} size={28} />
                        )}
                      </View>
                    </View>
                  );
                }}
                keyExtractor={(item) => item.id}
                ListHeaderComponent={
                  <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>AIタグ付与</Text>
                    {!canUseAI && (
                      <View style={styles.usageLimitContainer}>
                        <Text style={styles.usageLimitText}>
                          使用回数: {aiUsageCount}/{aiUsageLimit}
                        </Text>
                        <TouchableOpacity style={styles.upgradeButton}>
                          <Text style={styles.upgradeButtonText}>アップグレード</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                }
              />
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );

  const renderContent = () => {
    // AIタグ付与機能が進行中の場合、進行しているリンクを表示
    if (processingCount > 0) {
      const processingLink = processingLinks[0];
      return (
        <TouchableOpacity style={styles.singleItemContainer} onPress={() => setModalVisible(true)}>
          <Text style={styles.singleItemText} numberOfLines={1}>{processingLink.title}</Text>
          <View style={styles.singleItemRight}>
            <AIProgressCircle progress={aiProcessingStatus[processingLink.id] || 0} size={24} />
            <Feather name="chevron-right" size={16} color="#9CA3AF" style={styles.singleItemChevron} />
          </View>
        </TouchableOpacity>
      );
    }

    // AIタグ付与機能が進行していない場合は常にAIアイコンを表示
    return (
      <TouchableOpacity style={styles.aiContainer} onPress={() => setModalVisible(true)}>
        <Animated.View 
          style={[
            styles.aiIconContainer,
            {
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
            }
          ]}
        >
          <Text style={styles.aiText}>Wink</Text>
          {/* <MaterialIcons name="auto-awesome" size={16} color="rgb(164, 164, 164)" /> */}
        </Animated.View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.monitorContainer}>
      {renderContent()}
      {renderModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  monitorContainer: {
    flex: 1,
    height: 44,
    marginHorizontal: 16,
    backgroundColor: '#18181B', // Deep, solid color
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(133, 133, 133, 0.25)',
    paddingHorizontal: 14,
    justifyContent: 'center',
    boxShadow: '0px 0px 24px 0px rgba(155, 79, 237, 0.25)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  // AI Icon Container
  aiContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  aiIconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  aiText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 1,
  },
  // Single Item
  singleItemContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  singleItemText: { flex: 1, color: '#E5E7EB', fontSize: 13, marginRight: 12 },
  // Multi Item
  multiItemContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  multiItemLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', marginRight: 8 },
  multiItemText: { flex: 1, color: '#D1D5DB', fontSize: 13, marginLeft: 8 },
  multiItemFailedText: { color: '#FBBF24' },
  multiItemUntaggedText: { color: '#A78BFA' },
  multiItemRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  singleItemRight: { flexDirection: 'row', alignItems: 'center' },
  singleItemChevron: { marginLeft: 8 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.7)', justifyContent: 'flex-start', paddingTop: 120, },
  modalContent: { backgroundColor: '#18181B', borderRadius: 12, marginHorizontal: 20, padding: 16, borderWidth: 1, borderColor: 'rgba(139, 92, 246, 0.3)', maxHeight: '80%' },
  modalTitle: { fontSize: 16, fontWeight: 'bold', color: '#FFF'},
  itemContainer: {flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#3F3F46' },
  failedItemContainer: { backgroundColor: 'rgba(251, 191, 36, 0.05)' },
  itemTextContainer: { flex: 1, paddingRight: 12, paddingVertical: 12 },
  itemText: { color: '#E5E7EB', fontSize: 14 },
  itemActionContainer: { minWidth: 80, alignItems: 'flex-end' },
  retryButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(251, 191, 36, 0.2)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 },
  retryText: { color: '#FBBF24', fontSize: 12, fontWeight: '600', marginLeft: 6 },
  // Untagged items
  untaggedItemContainer: {  },
  untaggedLabel: { color: '#A78BFA', fontSize: 11, fontWeight: '500', marginTop: 2 },
  untaggedActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#A78BFA', 
    paddingHorizontal: 10, 
    paddingVertical: 6, 
    borderRadius: 16 
  },
  aiButtonDisabled: { backgroundColor: 'rgba(107, 114, 128, 0.3)' },
  aiButtonText: { color: '#FFF', fontSize: 12, fontWeight: '600', marginLeft: 4 },
  aiButtonTextDisabled: { color: '#9CA3AF' },
  dismissButton: { 
    padding: 6, 
    backgroundColor: 'rgba(156, 163, 175, 0.15)', 
    borderRadius: 12 
  },
  // Modal header
  modalHeader: { marginBottom: 16 },
  usageLimitContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    marginTop: 8,
    padding: 8,
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderRadius: 8
  },
  usageLimitText: { color: '#FBBF24', fontSize: 12, fontWeight: '500' },
  upgradeButton: { 
    backgroundColor: '#A78BFA', 
    paddingHorizontal: 12, 
    paddingVertical: 4, 
    borderRadius: 12 
  },
  upgradeButtonText: { color: '#FFF', fontSize: 11, fontWeight: '600' },
});
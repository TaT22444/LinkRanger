import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Animated,
  Alert,
  SafeAreaView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
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
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const processingCount = processingLinks.length;
  const failedCount = failedLinks.length;
  const untaggedCount = untaggedLinks.length;
  const totalItems = processingCount + failedCount + untaggedCount;

  // デバッグログ: AIStatusMonitorの受け取った情報をログ出力
  useEffect(() => {
    console.log('🖥️ AIStatusMonitor: 受け取った情報', {
      処理中リンク数: processingCount,
      失敗リンク数: failedCount,
      未処理リンク数: untaggedCount,
      全体アイテム数: totalItems,
      未処理リンク詳細: untaggedLinks.map(link => ({
        id: link.id,
        title: link.title?.slice(0, 30) + '...',
        status: link.status,
        tagIds: link.tagIds?.length || 0
      })),
      aiProcessingStatusキー: Object.keys(aiProcessingStatus)
    });
  }, [processingCount, failedCount, untaggedCount, untaggedLinks, aiProcessingStatus]);

  // AI処理中の脈動アニメーション
  useEffect(() => {
    if (processingCount > 0) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [processingCount, pulseAnim]);

  const handleClose = () => {
    setModalVisible(false);
  };

  // 適切なタイトルを取得するヘルパー関数
  const getDisplayTitle = (link: Link) => {
    // タイトルが存在し、URLと異なる場合はそのまま使用
    if (link.title && link.title.trim() !== '' && link.title !== link.url) {
      return link.title;
    }
    
    // Share Extension由来のタイトルがある場合
    if (link.shareExtensionData?.originalTitle && 
        link.shareExtensionData.originalTitle !== link.url) {
      return link.shareExtensionData.originalTitle;
    }
    
    // ドメイン名を取得してタイトルとして使用
    try {
      const domain = new URL(link.url).hostname;
      return domain.replace('www.', ''); // www.を除去
    } catch (error) {
      // URLが無効な場合は最後の手段としてURLをそのまま表示
      return link.url;
    }
  };

  const renderModal = () => (
    <Modal
      visible={modalVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.container}>
        {/* ヘッダー */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerButton} onPress={handleClose}>
            <Text style={styles.cancelText}>閉じる</Text>
          </TouchableOpacity>
          
          <Text style={styles.headerTitle}>AIタグ付け管理</Text>
          
        </View>

        {/* コンテンツ */}
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* 処理中セクション */}
                {processingCount > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Text style={styles.sectionTitle}>処理中 ({processingCount})</Text>
                    </View>
                    {processingLinks.map((link) => (
                      <View key={link.id} style={styles.itemRow}>
                        <View style={styles.itemContent}>
                          <Text style={styles.itemTitle} numberOfLines={2}>
                            {getDisplayTitle(link)}
                          </Text>
                          <View style={styles.itemProgress}>
                            <AIProgressCircle 
                              progress={aiProcessingStatus[link.id] || 0} 
                              size={20} 
                            />
                            <Text style={styles.progressText}>
                              {Math.round((aiProcessingStatus[link.id] || 0) * 100)}%
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* 失敗セクション */}
                {failedCount > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Feather name="alert-triangle" size={16} color="#FBBF24" />
                      <Text style={styles.sectionTitle}>エラーが発生したリンク</Text>
                    </View>
                    {failedLinks.map((link) => (
                      <View key={link.id} style={styles.itemRow}>
                        <View style={styles.itemContent}>
                          <Text style={styles.itemTitle} numberOfLines={2}>
                            {getDisplayTitle(link)}
                          </Text>
                        </View>
                        <TouchableOpacity 
                          onPress={() => onRetry(link.id, link)} 
                          style={styles.actionButton}
                        >
                          <Feather name="refresh-cw" size={14} color="#FFF" />
                          <Text style={styles.actionButtonText}>再試行</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {/* 未実行セクション */}
                {untaggedCount > 0 && (
                  <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                      <Feather name="clock" size={16} color="#8A2BE2" />
                      <Text style={styles.sectionTitle}>AIタグ付けを実行</Text>
                    </View>
                    <Text style={styles.sectionDescription}>
                      以下のリンクにAIタグ付けを実行するか選択してください
                    </Text>
                    {untaggedLinks.map((link) => (
                      <View key={link.id} style={styles.itemRow}>
                        <View style={styles.itemContent}>
                          <Text style={styles.itemTitle} numberOfLines={2}>
                            {getDisplayTitle(link)}
                          </Text>
                        </View>
                        <View style={styles.itemActions}>
                          <TouchableOpacity 
                            onPress={() => canUseAI ? onExecuteAI(link.id) : Alert.alert(
                              'AI使用制限',
                              'AI機能の利用制限に達しています。\n\nPlusプランでより多くご利用いただけます。'
                            )}
                            style={[styles.executeButton, !canUseAI && styles.executeButtonDisabled]}
                          >
                            <Text style={[
                              styles.executeButtonText,
                              !canUseAI && styles.executeButtonTextDisabled
                            ]}>
                              {canUseAI ? "実行" : "制限中"}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity 
                            onPress={() => {
                              console.log('🔘 スキップボタンが押されました:', link.id);
                              onDismissUntagged(link.id);
                            }}
                            style={styles.skipButton}
                          >
                            <Text style={styles.skipButtonText}>スキップ</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* 空の状態 */}
                {totalItems === 0 && (
                  <View style={styles.emptyState}>
                    <Feather name="check-circle" size={48} color="#8A2BE2" />
                    <Text style={styles.emptyStateTitle}>すべて完了</Text>
                    <Text style={styles.emptyStateText}>
                      AIタグ付けが必要なリンクはありません
                    </Text>
                  </View>
                )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );

  const getStatusInfo = () => {
    if (processingCount > 0) {
      const processingLink = processingLinks[0];
      return {
        icon: 'cpu',
        text: getDisplayTitle(processingLink),
        color: '#8A2BE2',
        showProgress: true,
        showBadge: false
      };
    }
    if (failedCount > 0) {
      return {
        icon: 'alert-triangle',
        text: `処理失敗 (${failedCount})`,
        color: '#FBBF24',
        showProgress: false,
        showBadge: false
      };
    }
    // タグつけ待ちがある場合も「.Wink」を表示し、バッジで通知
    return {
      icon: null,
      text: '.Wink',
      color: '#FFF',
      showProgress: false,
      showBadge: untaggedCount > 0,
      badgeCount: untaggedCount
    };
  };

  const renderContent = () => {
    const status = getStatusInfo();
    
    return (
      <TouchableOpacity 
        style={styles.statusButton} 
        onPress={() => setModalVisible(true)}
        activeOpacity={0.8}
      >
        <Animated.View 
          style={[
            styles.statusContent,
            { transform: [{ scale: pulseAnim }] }
          ]}
        >
          {status.icon ? (
            // 処理状況がある場合の表示
            <>
              <View style={styles.statusLeft}>
                <Feather name={status.icon as any} size={16} color={status.color} />
                <Text style={styles.statusText} numberOfLines={1}>
                  {status.text}
                </Text>
              </View>
              
              <View style={styles.statusRight}>
                {status.showProgress && processingLinks.length > 0 && (
                  <AIProgressCircle 
                    progress={aiProcessingStatus[processingLinks[0].id] || 0} 
                    size={20} 
                  />
                )}
                <Feather name="chevron-right" size={14} color="#666" />
              </View>
            </>
          ) : (
            // デフォルト表示（.Wink + バッジ）
            <View style={styles.defaultDisplay}>
              <Text style={styles.appNameText}>
                {status.text}
              </Text>
              {status.showBadge && status.badgeCount && (
                <Text style={styles.badgeText}>{status.badgeCount}</Text>
              )}
            </View>
          )}
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
  // メインボタン
  monitorContainer: {
    flex: 1,
    height: 44,
    marginHorizontal: 16,
  },
  statusButton: {
    flex: 1,
    backgroundColor: '#18181B',
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(138, 43, 226, 0.2)',
    paddingHorizontal: 16,
    justifyContent: 'center',
    shadowColor: '#8A2BE2',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  statusContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 8,
  },
  statusRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  
  // デフォルト表示
  defaultDisplay: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  appNameText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 1,
  },
  badgeText: {
    position: 'absolute',
    top: 1,
    right: 4,
    color: '#999',
    fontSize: 12,
    fontWeight: '500',
  },

  // モーダル
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  
  // ヘッダー
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    minHeight: 64,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerButton: {
    paddingHorizontal: 16,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#1A1A1A',
    zIndex: 10,
  },
  headerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
  },
  cancelText: {
    fontSize: 14,
    color: '#fff',
  },

  // コンテンツ
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
    marginLeft: 8,
  },
  sectionDescription: {
    fontSize: 13,
    color: '#CCC',
    marginBottom: 12,
    lineHeight: 18,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    marginBottom: 8,
  },
  itemContent: {
    flex: 1,
    marginRight: 12,
  },
  itemTitle: {
    fontSize: 14,
    color: '#FFF',
    lineHeight: 20,
    fontWeight: '500',
  },

  itemProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  progressText: {
    fontSize: 11,
    color: '#8A2BE2',
    marginLeft: 8,
    fontWeight: '600',
  },
  itemActions: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    minWidth: 80,
  },

  // アクションボタン
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FBBF24',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  actionButtonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },

  // 実行ボタン
  executeButton: {
    backgroundColor: '#8A2BE2',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  executeButtonDisabled: {
    backgroundColor: '#444',
  },
  executeButtonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  executeButtonTextDisabled: {
    color: '#999',
  },

  // スキップボタン
  skipButton: {
    backgroundColor: 'rgba(153, 153, 153, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: 60,
    alignItems: 'center',
  },
  skipButtonText: {
    color: '#CCC',
    fontSize: 11,
    fontWeight: '500',
  },

  // 空の状態
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#CCC',
    textAlign: 'center',
    lineHeight: 20,
  },
});
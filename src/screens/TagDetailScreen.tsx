import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  FlatList,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  TouchableWithoutFeedback,
  Linking,
  ScrollView,
  Dimensions,
  AppState,
  AppStateStatus,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Modalize } from 'react-native-modalize';
import { useNavigation, useRoute, RouteProp, useFocusEffect, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { useLinks, useTags } from '../hooks/useFirestore';
import { LinkCard } from '../components/LinkCard';
import { UpgradeModal } from '../components/UpgradeModal';
import { LinkDetailScreen } from './LinkDetailScreen';
import { Link, Tag } from '../types';
import { 
  linkService, 
  tagService, 
  savedAnalysisService, 
  userService 
} from '../services/firestoreService';
import { metadataService } from '../services/metadataService';
import { aiService, AnalysisSuggestion } from '../services/aiService';
import { AIUsageManager } from '../services/aiUsageService';
import { SavedAnalysis } from '../types';
import { PlanService } from '../services/planService';
import { isUnlimitedTestAccount } from '../utils/testAccountUtils';
import AsyncStorage from '@react-native-async-storage/async-storage';

type TagDetailScreenRouteProp = RouteProp<{ TagDetail: { tag: Tag } }, 'TagDetail'>;

export const TagDetailScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const route = useRoute<TagDetailScreenRouteProp>();
  
  // 🔧 早期リターン: ルートパラメータが不正な場合
  if (!route?.params?.tag) {
    console.error('❌ TagDetailScreen: 必要なパラメータが不足しています');
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#FFF', fontSize: 16 }}>エラー: タグ情報が見つかりません</Text>
        <TouchableOpacity 
          style={{ marginTop: 20, backgroundColor: '#8A2BE2', padding: 12, borderRadius: 8 }}
          onPress={() => navigation.goBack()}
        >
          <Text style={{ color: '#FFF', fontSize: 14 }}>戻る</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }
  
  // Convert serialized dates back to Date objects
  const tag = useMemo(() => {
    const rawTag = route?.params?.tag;
    
    // 🔧 安全チェック: パラメータが存在しない場合のフォールバック
    if (!rawTag) {
      console.error('❌ TagDetailScreen: タグパラメータが不正です', { route: route?.params });
      // デフォルトタグを返すか、エラーを表示
      return {
        id: 'error',
        name: 'エラー',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastUsedAt: new Date(),
        firstUsedAt: new Date(),
        userId: '',
        type: 'manual' as const
      };
    }
    return {
      ...rawTag,
      createdAt: typeof rawTag.createdAt === 'string' ? new Date(rawTag.createdAt) : rawTag.createdAt,
      updatedAt: typeof rawTag.updatedAt === 'string' ? new Date(rawTag.updatedAt) : rawTag.updatedAt,
      lastUsedAt: typeof rawTag.lastUsedAt === 'string' ? new Date(rawTag.lastUsedAt) : rawTag.lastUsedAt,
      firstUsedAt: typeof rawTag.firstUsedAt === 'string' ? new Date(rawTag.firstUsedAt) : rawTag.firstUsedAt,
    } as Tag;
  }, [route?.params?.tag]);
  const { user } = useAuth();
  const { links, loading: linksLoading, updateLink, deleteLink } = useLinks(user?.uid || null);
  const { tags, deleteTag: deleteTagById, createOrGetTag, loading: tagsLoading } = useTags(user?.uid || null);

  // State management
  const [refreshing, setRefreshing] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeTargetTag, setMergeTargetTag] = useState('');
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiUsageCount, setAiUsageCount] = useState(0);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [currentAnalyzingTheme, setCurrentAnalyzingTheme] = useState<string | null>(null);
  const [selectedLink, setSelectedLink] = useState<Link | null>(null);
  const [showLinkDetail, setShowLinkDetail] = useState(false);
  const [showExitConfirmAlert, setShowExitConfirmAlert] = useState(false);
  const [isNavigatingAway, setIsNavigatingAway] = useState(false);
  
  // 🔧 バックグラウンド処理管理用のstate
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [backgroundAnalysis, setBackgroundAnalysis] = useState<{
    tagName: string;
    theme: string;
    startTime: number;
    isCompleted: boolean;
  } | null>(null);
  const [wasBackgrounded, setWasBackgrounded] = useState(false); // AI分析中にバックグラウンド移行したかのフラグ
  const modalizeRef = useRef<Modalize>(null);
  
  // 🚀 キャッシュ効率化のための状態追加
  const [savedAnalysesCache, setSavedAnalysesCache] = useState<Map<string, SavedAnalysis[]>>(new Map());
  const [aiUsageCache, setAiUsageCache] = useState<Map<string, {count: number, timestamp: number}>>(new Map());
  const [lastFetchTimestamp, setLastFetchTimestamp] = useState<{[key: string]: number}>({});
  
  // AI分析中のページ離脱確認
  const isFocused = useIsFocused();
  const previousFocusedRef = useRef(isFocused);
  
  // 🔧 AI分析中のページ遷移は許可（確認アラートなし）
  useEffect(() => {
    // 🔧 新仕様: AI分析中のページ遷移はOK、確認アラートを表示しない
    // ページ遷移してもAI分析は継続実行される
    if (previousFocusedRef.current && !isFocused && aiAnalyzing && currentAnalyzingTheme) {
      console.log('📱 AI分析中のページ遷移検知: 分析継続（確認アラートなし）', {
        theme: currentAnalyzingTheme,
        isAnalyzing: aiAnalyzing,
        reason: 'page_navigation_allowed_during_analysis'
      });
    }
    
    // フォーカス状態を更新
    previousFocusedRef.current = isFocused;
  }, [isFocused, aiAnalyzing, currentAnalyzingTheme]);
  
  // AI analysis history management
  interface AnalysisResult {
    id: string;
    timestamp: Date;
    selectedLinks: Link[];
    result: string;
    tokensUsed: number;
    cost: number;
    analysisType: 'suggested';
    suggestedTheme?: string;
  }
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisResult[]>([]);
  
  // 🔧 AI分析中断関数（新仕様: 不要）
  const cancelAIAnalysis = useCallback(() => {
    console.log('🔇 中断関数呼び出し: 新仕様では使用されません');
    // 新仕様では確認アラートを表示しないため、この関数は使用されない
  }, []);
  
  // 🔧 AI分析継続関数（新仕様: 不要）
  const continueAIAnalysis = useCallback(() => {
    console.log('🔇 継続関数呼び出し: 新仕様では使用されません');
    // 新仕様では確認アラートを表示しないため、この関数は使用されない
  }, []);
  
  // Create analyzing placeholder item
  const createAnalyzingPlaceholder = (theme: string): AnalysisResult => ({
    id: 'analyzing-placeholder',
    timestamp: new Date(),
    selectedLinks: [],
    result: '', // Empty result for skeleton rendering
    tokensUsed: 0,
    cost: 0,
    analysisType: 'suggested',
    suggestedTheme: theme
  });

  // Render skeleton placeholder for analyzing content
  const renderAnalyzingSkeleton = (theme: string) => {
    return (
      <View style={styles.analyzingSkeletonContainer}>
        <View style={styles.skeletonTitle}>
          <Text style={styles.skeletonTitleText}>## {theme}</Text>
        </View>
        
        <View style={styles.skeletonSection}>
          <View style={styles.skeletonSubtitle} />
          <View style={styles.skeletonLine} />
          <View style={styles.skeletonLine} />
          <View style={[styles.skeletonLine, { width: '80%' }]} />
        </View>

        <View style={styles.analyzingIndicator}>
          <ActivityIndicator size="small" color="#666" />
          <Text style={styles.analyzingIndicatorText}>AIが分析中...</Text>
        </View>
      </View>
    );
  };
  
  // AI suggestions management
  const [aiSuggestions, setAiSuggestions] = useState<AnalysisSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [generatedThemes, setGeneratedThemes] = useState<Set<string>>(new Set());
  const [themeGenerationAttempts, setThemeGenerationAttempts] = useState(0);
  
  // Saved analysis management (全プランで利用可能)
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([]);
  const [loadingSavedAnalyses, setLoadingSavedAnalyses] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [expandedAnalysisId, setExpandedAnalysisId] = useState<string | null>(null);
  const [showAllSavedAnalyses, setShowAllSavedAnalyses] = useState(false);
  const [deletingAnalysisId, setDeletingAnalysisId] = useState<string | null>(null);
  
  // 分析完了から一定時間後の自動移行タイマー
  const [analysisTimer, setAnalysisTimer] = useState<NodeJS.Timeout | null>(null);
  
  // プラン管理統一
  const planInfo = useMemo(() => PlanService.getDebugInfo(user), [user]);
  const isProPlan = PlanService.canSaveAnalysis();
  const currentPlan = PlanService.getUserPlan(user);

  // 🚀 AI分析確認アラート設定
  const [showAIAnalysisAlert, setShowAIAnalysisAlert] = useState(true);
  const [loadingUserSettings, setLoadingUserSettings] = useState(true);

  // 🔧 安全チェック: 初期化時にundefinedエラーを防ぐ
  const safeLinks = links || [];
  const safeTags = tags || [];
  const safeAnalysisHistory = analysisHistory || [];
  const safeSavedAnalyses = savedAnalyses || [];
  const safeAiSuggestions = aiSuggestions || [];
  
  // 🚀 カスタム確認アラートの状態
  const [showCustomAlert, setShowCustomAlert] = useState(false);
  const [alertTheme, setAlertTheme] = useState('');
  const [alertCallback, setAlertCallback] = useState<(() => void) | null>(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // 🚀 ユーザー設定をAsyncStorageから取得・保存
  const loadUserSettings = useCallback(async () => {
    if (!user?.uid) {
      setLoadingUserSettings(false);
      return;
    }

    try {
      const settingsKey = `hideAIAnalysisAlert_${user.uid}`;
      console.log('🔧 ユーザー設定を取得中...', { userId: user.uid, settingsKey });
      
      const storedValue = await AsyncStorage.getItem(settingsKey);
      
      if (storedValue !== null) {
        const hideAlert = JSON.parse(storedValue);
        setShowAIAnalysisAlert(!hideAlert);
        console.log('✅ ユーザー設定取得完了:', {
          hideAIAnalysisAlert: hideAlert,
          showAIAnalysisAlert: !hideAlert,
          storedValue
        });
      } else {
        // デフォルト値：アラートを表示
        setShowAIAnalysisAlert(true);
        console.log('📝 デフォルト設定適用: アラート表示ON');
      }
    } catch (error) {
      console.error('❌ ユーザー設定取得エラー:', error);
      // エラー時はデフォルト値
      setShowAIAnalysisAlert(true);
    } finally {
      setLoadingUserSettings(false);
    }
  }, [user?.uid]);

  // 🚀 ユーザー設定をAsyncStorageに保存
  const updateUserSettings = useCallback(async (hideAlert: boolean) => {
    if (!user?.uid) return;

    try {
      const settingsKey = `hideAIAnalysisAlert_${user.uid}`;
      console.log('💾 ユーザー設定を保存中...', {
        userId: user.uid,
        hideAIAnalysisAlert: hideAlert,
        settingsKey
      });

      await AsyncStorage.setItem(settingsKey, JSON.stringify(hideAlert));
      setShowAIAnalysisAlert(!hideAlert);
      
      console.log('✅ ユーザー設定保存完了:', {
        hideAIAnalysisAlert: hideAlert,
        showAIAnalysisAlert: !hideAlert
      });
    } catch (error) {
      console.error('❌ ユーザー設定保存エラー:', error);
      Alert.alert('エラー', '設定の保存に失敗しました');
    }
  }, [user?.uid]);

  // ユーザー設定をページ読み込み時に取得
  useEffect(() => {
    loadUserSettings();
  }, [loadUserSettings]);

  // 🔧 AppState監視 - バックグラウンド処理管理
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      console.log('📱 AppState変更:', {
        previous: appState,
        current: nextAppState,
        aiAnalyzing,
        currentTheme: currentAnalyzingTheme,
        backgroundAnalysis
      });

      // バックグラウンドになるタイミング
      if (appState.match(/inactive|background/) && nextAppState === 'active') {
        // フォアグラウンドに復帰した時の処理
        handleForegroundReturn();
      } else if (appState === 'active' && nextAppState.match(/inactive|background/)) {
        // バックグラウンドに移行した時の処理
        handleBackgroundTransition();
      }

      setAppState(nextAppState);
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [appState, aiAnalyzing, currentAnalyzingTheme, backgroundAnalysis]);

  // 🔧 バックグラウンド移行時の処理（分析継続）
  const handleBackgroundTransition = useCallback(() => {
    if (aiAnalyzing && currentAnalyzingTheme) {
      console.log('🌙 AI分析中にバックグラウンド移行: 分析継続（中断なし）', {
        tagName: tag.name,
        theme: currentAnalyzingTheme,
        startTime: Date.now(),
        continuousAnalysis: true
      });

      // バックグラウンド分析情報を記録（完了チェック用）
      setBackgroundAnalysis({
        tagName: tag.name,
        theme: currentAnalyzingTheme,
        startTime: Date.now(),
        isCompleted: false
      });
    }
  }, [aiAnalyzing, currentAnalyzingTheme, tag.name]);

  // 🔧 フォアグラウンド復帰時の処理（完了チェック）
  const handleForegroundReturn = useCallback(() => {
    if (backgroundAnalysis) {
      // AI分析が完了している可能性をチェック
      const analysisWasCompleted = analysisHistory.some(analysis => 
        analysis.suggestedTheme === backgroundAnalysis.theme && 
        analysis.id !== 'analyzing-placeholder'
      );

      if (analysisWasCompleted) {
        console.log('🎉 バックグラウンドでAI分析が完了: 完了通知を表示', {
          tagName: backgroundAnalysis.tagName,
          theme: backgroundAnalysis.theme,
          duration: Date.now() - backgroundAnalysis.startTime
        });

        // 完了通知アラートを表示
        setTimeout(() => {
          Alert.alert(
            '🎉 AI解説が完了しました！',
            `「${backgroundAnalysis.tagName}」タグの「${backgroundAnalysis.theme}」の解説が完了しました。

バックグラウンドで処理が完了していました。`,
            [
              {
                text: '結果を確認',
                style: 'default',
                onPress: () => {
                  // 解説結果リストを開いて該当分析を展開
                  setShowAllSavedAnalyses(true);
                  const completedAnalysis = analysisHistory.find(analysis => 
                    analysis.suggestedTheme === backgroundAnalysis!.theme
                  );
                  if (completedAnalysis) {
                    setExpandedAnalysisId(`current-${completedAnalysis.id}`);
                  }
                }
              }
            ],
            {
              cancelable: true,
              userInterfaceStyle: 'dark'
            }
          );
        }, 500); // 少し遅延させて確実に表示

        // バックグラウンド分析情報をクリア
        setBackgroundAnalysis(null);
      } else if (!aiAnalyzing) {
        // Development環境でのタイムアウト対応
        console.log('🔄 バックグラウンド分析状態をクリア', {
          theme: backgroundAnalysis.theme,
          isDevelopment: __DEV__,
          reason: 'analysis_not_running_or_timeout'
        });
        
        // Development環境では制限があることをログのみで記録（アラート表示なし）
        
        setBackgroundAnalysis(null);
      }
    }
  }, [backgroundAnalysis, analysisHistory, aiAnalyzing, tag.name]);

    // 統合された分析リスト（現在の分析 + 保存済み分析）- 重複除去強化版
  const unifiedAnalyses = useMemo(() => {
    console.log('🔄 統合分析リスト構築開始:', {
      currentHistoryCount: safeAnalysisHistory.length,
      savedAnalysesCount: safeSavedAnalyses.length,
      tagName: tag.name
    });

    // 現在の分析履歴があれば、最新のものを準備
    if (safeAnalysisHistory.length > 0) {
      const currentAnalysis = safeAnalysisHistory[0];
      const currentTheme = currentAnalysis.suggestedTheme;
      
      const currentAnalysisFormatted = {
        id: `current-${currentAnalysis.id}`,
        title: currentTheme ? `${currentTheme}について（${currentAnalysis.selectedLinks?.length || 0}件分析）` : `${tag.name}タグの深掘り分析（${currentAnalysis.selectedLinks?.length || 0}件対象）`,
        result: currentAnalysis.result,
        createdAt: currentAnalysis.timestamp,
        metadata: {
          linkCount: currentAnalysis.selectedLinks?.length || 0,
          analysisType: 'current' as const
        },
        isCurrent: true
      };
      
      console.log('📝 現在の分析情報:', {
        currentId: currentAnalysisFormatted.id,
        currentTheme,
        currentTitle: currentAnalysisFormatted.title
      });
      
      // 重複除去：複数の条件で厳密にチェック
      const filteredSavedAnalyses = safeSavedAnalyses.filter(saved => {
        // 1. テーマベースの重複チェック
        if (currentTheme) {
          const savedTheme = saved.result.match(/^## (.+?)について?$/m)?.[1]?.trim();
          if (savedTheme === currentTheme) {
            console.log('🚫 テーマ重複により除外:', {
              savedId: saved.id,
              savedTitle: saved.title,
              savedTheme,
              currentTheme,
              reason: 'theme_duplicate'
            });
            return false;
          }
        }
        
        // 2. タイトルベースの重複チェック
        if (saved.title === currentAnalysisFormatted.title) {
          console.log('🚫 タイトル重複により除外:', {
            savedId: saved.id,
            savedTitle: saved.title,
            currentTitle: currentAnalysisFormatted.title,
            reason: 'title_duplicate'
          });
          return false;
        }
        
        // 3. 内容の類似性チェック（簡易版）
        const savedResultPreview = saved.result.slice(0, 200);
        const currentResultPreview = currentAnalysis.result.slice(0, 200);
        if (savedResultPreview === currentResultPreview) {
          console.log('🚫 内容重複により除外:', {
            savedId: saved.id,
            savedTitle: saved.title,
            reason: 'content_duplicate'
          });
          return false;
        }
        
        // 4. 時間的重複チェック（直近5分以内の類似分析）
        const timeDiff = Math.abs(currentAnalysis.timestamp.getTime() - saved.createdAt.getTime());
        if (timeDiff < 5 * 60 * 1000 && currentTheme) { // 5分以内
          const savedTheme = saved.result.match(/^## (.+?)について?$/m)?.[1]?.trim();
          if (savedTheme === currentTheme) {
            console.log('🚫 時間的重複により除外:', {
              savedId: saved.id,
              savedTitle: saved.title,
              timeDiffMinutes: Math.round(timeDiff / (1000 * 60)),
              reason: 'temporal_duplicate'
            });
            return false;
          }
        }
        
        return true;
      });
      
      console.log('✅ 重複除去完了:', {
        originalSavedCount: safeSavedAnalyses.length,
        filteredSavedCount: filteredSavedAnalyses.length,
        removedCount: safeSavedAnalyses.length - filteredSavedAnalyses.length,
        finalListCount: filteredSavedAnalyses.length + 1 // +1 for current
      });
      
      return [currentAnalysisFormatted, ...filteredSavedAnalyses];
    }
    
    console.log('📄 現在の分析なし - 保存済み分析のみ表示:', {
      savedAnalysesCount: safeSavedAnalyses.length
    });
    
    return safeSavedAnalyses;
  }, [safeAnalysisHistory, safeSavedAnalyses, tag.name]);

  // 🔧 unifiedAnalysesの安全性チェック
  const safeUnifiedAnalyses = unifiedAnalyses || [];

  // Filter links for this tag - moved before useFocusEffect to fix declaration order
  const tagLinks = useMemo(() => {
    return safeLinks.filter(link => link?.tagIds?.includes(tag.id));
  }, [safeLinks, tag.id]);



  // 現在の分析が追加されたら自動的に展開
  useEffect(() => {
    if (unifiedAnalyses.length > 0 && 'isCurrent' in unifiedAnalyses[0] && unifiedAnalyses[0].isCurrent) {
      setExpandedAnalysisId(unifiedAnalyses[0].id);
    }
  }, [unifiedAnalyses]);

  // 🔧 AI分析状態のクリーンアップ（失敗時の通知はexecuteAIAnalysis内で処理）
  useFocusEffect(
    useCallback(() => {
      console.log('📱 TagDetailScreen: ページにフォーカス', {
        currentHistoryCount: analysisHistory.length,
        savedAnalysesCount: savedAnalyses.length,
        isAnalyzing: aiAnalyzing,
        currentTheme: currentAnalyzingTheme
      });
      
      // 🔧 アプリ完全終了後の再開時処理
      if (aiAnalyzing && currentAnalyzingTheme) {
        const hasAnalyzingPlaceholder = analysisHistory.some(item => item.id === 'analyzing-placeholder');
        const hasRecentCompletedAnalysis = analysisHistory.some(item => 
          item.id !== 'analyzing-placeholder' && 
          item.suggestedTheme === currentAnalyzingTheme &&
          (Date.now() - new Date(item.timestamp).getTime()) < 5 * 60 * 1000
        );
        
        // 正常完了している場合のみ状態クリーンアップ
        if (hasRecentCompletedAnalysis && !hasAnalyzingPlaceholder) {
          console.log('🔄 正常完了した分析の状態をクリーンアップ', {
            theme: currentAnalyzingTheme,
            action: 'cleanup_completed_analysis'
          });
          setAiAnalyzing(false);
          setCurrentAnalyzingTheme(null);
          setIsNavigatingAway(false);
        } 
        // 🔧 中断検知は完全に削除（AI分析は継続実行される）
        // 中断アラートは表示しない - AI分析は実際に継続されるため
      }
    }, [
      analysisHistory.length, 
      savedAnalyses.length, 
      aiAnalyzing, 
      currentAnalyzingTheme,
      links?.length,
      tag.id
    ])
  );



  // Available tags for merge (excluding current tag)
  const availableTagsForMerge = useMemo(() => {
    return safeTags.filter(t => t?.id !== tag.id);
  }, [safeTags, tag.id]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    // Refresh is handled by the hooks automatically
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const handleLinkPress = (link: Link) => {
    // Show link detail screen as modal
    console.log('Link pressed:', link.title);
    setSelectedLink(link);
    setShowLinkDetail(true);
  };

  const handleMarkAsRead = useCallback(async (linkId: string) => {
    try {
      await updateLink(linkId, { isRead: true });
    } catch (error) {
      console.error('Error marking link as read:', error);
    }
  }, [updateLink]);

  const handleToggleBookmark = useCallback(async (link: Link) => {
    try {
      await updateLink(link.id, { isBookmarked: !link.isBookmarked });
    } catch (error) {
      console.error('Error toggling bookmark:', error);
      Alert.alert('エラー', 'ブックマークの更新に失敗しました');
    }
  }, [updateLink]);

  const handleDeleteLink = useCallback(async (linkId: string) => {
    if (!user?.uid) return;
    
    Alert.alert(
      'リンクを削除',
      'このリンクを削除しますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteLink(linkId, user.uid);
            } catch (error) {
              console.error('Error deleting link:', error);
              Alert.alert('エラー', 'リンクの削除に失敗しました');
            }
          },
        },
      ]
    );
  }, [deleteLink, user?.uid]);

  const handleAnalysisLinkPress = useCallback(async (url: string) => {
    try {
      console.log('🔗 参考資料リンクをタップ:', url);
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Alert.alert('エラー', 'このリンクを開くことができません');
      }
    } catch (error) {
      console.error('Error opening link:', error);
      Alert.alert('エラー', 'リンクの開設に失敗しました');
    }
  }, []);

  const handleSavedAnalysisPress = useCallback((analysisId: string) => {
    console.log('📄 保存済み分析をタップ:', {
      analysisId,
      currentExpanded: expandedAnalysisId,
      willExpand: expandedAnalysisId !== analysisId
    });
    
    // 同じIDをタップした場合は閉じる、違うIDなら切り替える
    setExpandedAnalysisId(prevId => prevId === analysisId ? null : analysisId);
  }, [expandedAnalysisId]);

  const handleDeleteTag = useCallback(() => {
    Alert.alert(
      'タグを削除',
      `「${tag.name}」タグを削除しますか？\n関連するリンクからもこのタグが削除されます。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteTagById(tag.id);
              navigation.goBack();
            } catch (error) {
              console.error('Error deleting tag:', error);
              Alert.alert('エラー', 'タグの削除に失敗しました');
            }
          },
        },
      ]
    );
  }, [tag, deleteTagById, navigation]);

  const handleAddTag = useCallback(async (tagName: string, type: 'manual' | 'ai' | 'recommended' = 'manual') => {
    if (!user?.uid) return '';
    
    try {
      const tagId = await createOrGetTag(tagName, type);
      return tagId;
    } catch (error) {
      Alert.alert('エラー', 'タグの作成に失敗しました');
      throw error;
    }
  }, [user?.uid]);

  const handleDeleteTagByName = useCallback(async (tagName: string) => {
    if (!user?.uid) return;
    
    const tagToDelete = tags.find(t => t.name === tagName);
    if (tagToDelete) {
      try {
        await deleteTagById(tagToDelete.id);
      } catch (error) {
        Alert.alert('エラー', 'タグの削除に失敗しました');
      }
    }
  }, [user?.uid, tags, deleteTagById]);

  const handleMergeTag = useCallback(async () => {
    if (!mergeTargetTag.trim() || !user?.uid) return;

    try {
      // Find or create target tag
      const targetTagId = await createOrGetTag(mergeTargetTag.trim());
      
      if (targetTagId === tag.id) {
        Alert.alert('エラー', '同じタグには統合できません');
        return;
      }

      // Update all links to use the target tag instead
      const updatePromises = tagLinks.map(link => {
        const newTagIds = link.tagIds
          .filter(id => id !== tag.id) // Remove current tag
          .concat(targetTagId); // Add target tag
        
        return updateLink(link.id, { tagIds: Array.from(new Set(newTagIds)) });
      });

      await Promise.all(updatePromises);

      // Delete the current tag
      await deleteTagById(tag.id);

      setShowMergeModal(false);
      navigation.goBack();
    } catch (error) {
      console.error('Error merging tag:', error);
      Alert.alert('エラー', 'タグの統合に失敗しました');
    }
  }, [mergeTargetTag, user?.uid, createOrGetTag, tag, tagLinks, updateLink, deleteTagById, navigation]);

  // Get AI usage limits based on plan
  const getAIUsageLimit = useCallback(() => {
    return PlanService.getAIUsageLimit(user);
  }, [user]);

  // Load AI usage from Firebase with caching
  const loadAIUsage = useCallback(async (forceRefresh = false) => {
    if (!user?.uid) return;
    
    const cacheKey = user.uid;
    const now = Date.now();
    const CACHE_DURATION = 2 * 60 * 1000; // 2分間キャッシュ
    
    // キャッシュチェック
    const cachedUsage = aiUsageCache.get(cacheKey);
    if (!forceRefresh && cachedUsage && (now - cachedUsage.timestamp) < CACHE_DURATION) {
      console.log('💾 AI使用量キャッシュヒット:', {
        userId: user.uid,
        cachedCount: cachedUsage.count,
        ageMinutes: Math.round((now - cachedUsage.timestamp) / (1000 * 60))
      });
      setAiUsageCount(cachedUsage.count);
      setLoadingUsage(false);
      return;
    }
    
    try {
      setLoadingUsage(true);
      const aiUsageManager = AIUsageManager.getInstance();
      
      console.log('🌐 AI使用量をFirebaseから取得中...', {
        userId: user.uid,
        plan: PlanService.getEffectivePlan(user),
        cacheExpired: cachedUsage ? true : false,
        forceRefresh,
      });
      
      const usageStats = await aiUsageManager.getUserUsageStats(user.uid);
      const totalAnalysisUsage = usageStats.analysisUsage; // AI解説機能のみの使用回数
      
      console.log('📊 AI使用量取得結果:', {
        totalAnalysisUsage,
        usageStats,
        userId: user.uid,
        plan: PlanService.getEffectivePlan(user)
      });
      
      // キャッシュに保存
      setAiUsageCache(prev => new Map(prev.set(cacheKey, {
        count: totalAnalysisUsage,
        timestamp: now
      })));
      
      console.log('✅ AI使用量取得完了（キャッシュ更新）:', {
        totalAnalysisUsage,
        limit: getAIUsageLimit(),
        remaining: Math.max(0, getAIUsageLimit() - totalAnalysisUsage),
        monthlyStats: usageStats.currentMonth,
        analysisUsage: usageStats.analysisUsage
      });
      
      setAiUsageCount(totalAnalysisUsage);
      console.log('🔢 aiUsageCount設定:', totalAnalysisUsage);
    } catch (error) {
      console.error('❌ AI使用量取得エラー:', error);
      // エラーの場合はキャッシュがあれば使用
      if (cachedUsage) {
        console.log('🔄 エラー時キャッシュフォールバック:', cachedUsage);
        setAiUsageCount(cachedUsage.count);
      } else {
        setAiUsageCount(0);
      }
    } finally {
      setLoadingUsage(false);
    }
  }, [user?.uid, getAIUsageLimit, aiUsageCache]);

  // Check if current user is a test account
  const isTestAccount = useMemo(() => {
    if (!user) return false;
    
    // 環境変数でテストアカウント機能を制御（本番環境では無効化）
    const enableTestAccounts = process.env.EXPO_PUBLIC_ENABLE_TEST_ACCOUNTS === 'true';
    
    if (!enableTestAccounts) {
      console.log('🔒 テストアカウント機能は無効化されています (EXPO_PUBLIC_ENABLE_TEST_ACCOUNTS=false)');
      return false;
    }
    
    const isTest = PlanService.isTestAccount(user);
    
    if (isTest) {
      console.log('🧪 テストアカウント機能が有効です', planInfo);
    }
    
    return isTest;
  }, [user, planInfo]);
  
  const isUnlimitedTest = useMemo(() => isUnlimitedTestAccount(user?.email || null), [user?.email]);

  const canUseAI = useMemo(() => {
    // Test accounts have unlimited access
    if (isTestAccount) {
      console.log('🧪 テストアカウント: AI制限をバイパス', {
        uid: user?.uid,
        email: user?.email,
        isTestAccount: user?.isTestAccount,
        role: user?.role
      });
      return true;
    }
    
    const limit = getAIUsageLimit();
    const canUse = aiUsageCount < limit;
    
    console.log('🔍 canUseAI計算:', {
      aiUsageCount,
      limit,
      canUse,
      userPlan: user?.subscription?.plan || 'free',
      isTestAccount
    });
    
    return canUse;
  }, [isTestAccount, aiUsageCount, getAIUsageLimit, user?.uid, user?.email, user?.isTestAccount, user?.role]);

  // Load AI usage from Firebase on mount
  useEffect(() => {
    loadAIUsage();
  }, [loadAIUsage]);

  // Debug: aiUsageCountの変更を監視
  useEffect(() => {
    console.log('🔍 aiUsageCount変更:', {
      aiUsageCount,
      canUseAI,
      limit: getAIUsageLimit(),
      userPlan: user?.subscription?.plan || 'free'
    });
  }, [aiUsageCount, canUseAI, getAIUsageLimit, user?.subscription?.plan]);

  // Load saved analyses for all plan users and test accounts with caching
  useEffect(() => {
    if ((isProPlan || isTestAccount) && user?.uid) {
      const cacheKey = `${user.uid}-${tag.id}`;
      const now = Date.now();
      const CACHE_DURATION = 1 * 60 * 1000; // 1分間キャッシュ
      
      // キャッシュチェック
      const cachedAnalyses = savedAnalysesCache.get(cacheKey);
      const lastFetch = lastFetchTimestamp[cacheKey] || 0;
      
      if (cachedAnalyses && (now - lastFetch) < CACHE_DURATION) {
        console.log('💾 保存済み分析キャッシュヒット:', {
          userId: user.uid,
          tagId: tag.id,
          tagName: tag.name,
          cachedCount: cachedAnalyses.length,
          ageMinutes: Math.round((now - lastFetch) / (1000 * 60))
        });
        setSavedAnalyses(cachedAnalyses);
        setLoadingSavedAnalyses(false);
        return;
      }
      
      console.log('🌐 保存済み分析をFirebaseから読み込み中...', {
        userId: user.uid,
        tagId: tag.id,
        tagName: tag.name,
        isProPlan,
        isTestAccount,
        cacheExpired: cachedAnalyses ? true : false
      });
      setLoadingSavedAnalyses(true);
      savedAnalysisService.getAnalysesByTag(user.uid, tag.id)
        .then(analyses => {
          console.log('📥 保存済み分析を取得完了（キャッシュ更新）:', {
            count: analyses.length,
            analyses: analyses.map(a => ({
              id: a.id,
              title: a.title,
              resultLength: a.result?.length || 0,
              createdAt: a.createdAt
            }))
          });
          
          // キャッシュに保存
          setSavedAnalysesCache(prev => new Map(prev.set(cacheKey, analyses)));
          setLastFetchTimestamp(prev => ({...prev, [cacheKey]: now}));
          setSavedAnalyses(analyses);
        })
        .catch(error => {
          console.error('❌ 保存済み分析の読み込み失敗:', error);
          // エラーの場合はキャッシュがあれば使用
          if (cachedAnalyses) {
            console.log('🔄 エラー時キャッシュフォールバック:', {
              cachedCount: cachedAnalyses.length
            });
            setSavedAnalyses(cachedAnalyses);
          }
        })
        .finally(() => setLoadingSavedAnalyses(false));
    }
  }, [isProPlan, isTestAccount, user?.uid, tag.id, savedAnalysesCache, lastFetchTimestamp]);

  // Generate AI analysis suggestions on demand (for modal)
  const generateSuggestionsInternal = useCallback(async () => {
    if (!user?.uid || tagLinks.length === 0) return;
    
    // テーマ生成時に前回の分析履歴をクリア（新しいセッションの開始）
    if (analysisHistory.length > 0) {
      console.log('🆕 テーマ生成開始 - 前回の分析履歴をクリア', {
        previousHistoryCount: analysisHistory.length,
        reason: 'new_theme_generation'
      });
      setAnalysisHistory([]);
    }
    
    // 既存のタイマーをクリア
    if (analysisTimer) {
      clearTimeout(analysisTimer);
      setAnalysisTimer(null);
    }

    // テーマ生成試行回数を増加
    setThemeGenerationAttempts(prev => prev + 1);
    
    setLoadingSuggestions(true);
    const linkTitles = tagLinks.map(link => link.title);
    const userPlan = PlanService.getEffectivePlan(user);
    
    console.log('🔍 AI候補生成開始:', {
      tagName: tag.name,
      linkCount: tagLinks.length,
      linkTitles: linkTitles.slice(0, 3), // 最初の3つだけログ出力
      previousThemes: Array.from(generatedThemes),
      generationAttempts: themeGenerationAttempts + 1
    });

    try {
      // 既に生成されたテーマを除外するためのプロンプトを強化
      const excludedThemes = Array.from(generatedThemes);
      const response = await aiService.generateSuggestions(
        tag.name, 
        linkTitles, 
        user.uid, 
        userPlan,
        excludedThemes // 除外するテーマを渡す
      );
      
      console.log('✅ AI候補生成完了:', {
        suggestionsCount: response.suggestions.length,
        cost: response.cost,
        tokensUsed: response.tokensUsed,
        newThemes: response.suggestions.map(s => s.title),
        excludedThemes: excludedThemes
      });
      
      // 重複を除外して新しいテーマのみを追加（より厳密な重複検出）
      const newThemes = response.suggestions.map(s => s.title);
      
      // 既存テーマとの重複をチェック（完全一致のみ）
      const isDuplicate = (newTheme: string, existingThemes: Set<string>) => {
        return existingThemes.has(newTheme);
      };
      
      const uniqueNewThemes = newThemes.filter(theme => !isDuplicate(theme, generatedThemes));
      
      if (uniqueNewThemes.length === 0) {
        console.log('⚠️ 新しいテーマが生成されませんでした。既存テーマとの重複を検出', {
          newThemes,
          existingThemes: Array.from(generatedThemes)
        });
        
        // 重複が検出された場合は、ユーザーに通知して処理を停止
        Alert.alert(
          'テーマ生成の制限',
          '新しいテーマを生成できませんでした。既存のテーマから選択するか、新しいリンクを追加してから再度お試しください。',
          [
            { text: '既存テーマを表示', onPress: () => {} },
            { text: 'キャンセル', style: 'cancel' }
          ]
        );
        return;
      }
      
      // 新しいテーマを生成されたテーマセットに追加
      setGeneratedThemes(prev => new Set([...prev, ...uniqueNewThemes]));
      
      setAiSuggestions(response.suggestions);
      // 🎯 修正: テーマ生成後に必ずモーダルを開く
      modalizeRef.current?.open();
    } catch (error) {
      console.error('❌ AI候補生成失敗:', error);
      
      // テーマ生成試行回数が多すぎる場合は、テーマが出尽くしたことをユーザーに伝える
      if (themeGenerationAttempts >= 3) {
        Alert.alert(
          'テーマ生成の制限に達しました',
          'このタグのリンクから生成できる新しいテーマが出尽くしました。\n\n既存のテーマから選択するか、新しいリンクを追加してから再度お試しください。',
          [
            { text: '既存テーマを表示', onPress: () => modalizeRef.current?.open() },
            { text: 'キャンセル', style: 'cancel' }
          ]
        );
        setLoadingSuggestions(false);
        return;
      }
      
      // フォールバック候補を設定
      const fallbackSuggestions = [
        {
          title: `${tag.name}とは`,
          description: '基本的な概念について',
          keywords: ['基本', '概念']
        },
        {
          title: `${tag.name}の活用法`,
          description: '実践的な使い方について',
          keywords: ['活用', '実践']
        }
      ];
      
      // フォールバックテーマも生成されたテーマセットに追加
      setGeneratedThemes(prev => new Set([...prev, ...fallbackSuggestions.map(s => s.title)]));
      setAiSuggestions(fallbackSuggestions);
      // 🎯 修正: フォールバック時もモーダルを開く
      modalizeRef.current?.open();
    } finally {
      setLoadingSuggestions(false);
    }
  }, [user?.uid, tag.name, tagLinks, analysisHistory.length, analysisTimer, generatedThemes, themeGenerationAttempts]);

  // Show theme generation modal or generate suggestions directly if already have themes
  const handleGenerateSuggestions = useCallback(async () => {
    if (!user?.uid || tagLinks.length === 0) return;
    
    // If we already have suggestions, show the modal immediately
    if (aiSuggestions.length > 0) {
      modalizeRef.current?.open();
    } else {
      // Otherwise, generate new suggestions and then show modal
      await generateSuggestionsInternal();
    }
  }, [user?.uid, tagLinks.length, aiSuggestions.length, generateSuggestionsInternal]);

  // テーマ生成履歴をリセットする関数
  const resetThemeGeneration = useCallback(() => {
    setGeneratedThemes(new Set());
    setThemeGenerationAttempts(0);
    setAiSuggestions([]);
    console.log('🔄 テーマ生成履歴をリセットしました');
  }, []);

  // 🚀 AI分析確認アラートの表示
  const showAIAnalysisConfirmation = useCallback((theme: string, onConfirm: () => void) => {
    Alert.alert(
      'AI分析を開始しますか？',
      `「${theme}」について、リンク内容を読み込んで詳細な分析を行います。\n\nこの処理には数秒〜1分程度かかる場合があります。`,
      [
        {
          text: 'キャンセル',
          style: 'cancel'
        },
        {
          text: '分析開始',
          style: 'default',
          onPress: onConfirm
        }
      ],
      {
        cancelable: true,
        userInterfaceStyle: 'dark'
      }
    );
  }, []);

  // 🚀 チェックボックス付きAI分析確認アラートの表示
  const showAIAnalysisConfirmationWithSettings = useCallback((theme: string, onConfirm: () => void) => {
    Alert.alert(
      'AI分析を開始しますか？',
      `「${theme}」について、リンク内容を読み込んで詳細な分析を行います。\n\nこの処理には数秒〜1分程度かかる場合があります。`,
      [
        {
          text: 'キャンセル',
          style: 'cancel'
        },
        {
          text: '今後確認しない',
          style: 'default',
          onPress: () => {
            // 今後このアラートを表示しない設定を保存
            updateUserSettings(true);
            onConfirm();
          }
        },
        {
          text: '分析開始',
          style: 'default',
          onPress: onConfirm
        }
      ],
      {
        cancelable: true,
        userInterfaceStyle: 'dark'
      }
    );
  }, [updateUserSettings]);

  // Smart link selection for suggested analysis - キーワードベース選択に戻しました
  const selectLinksForSuggestedAnalysis = useCallback((links: Link[], suggestion: AnalysisSuggestion): Link[] => {
    console.log('🔍 キーワードベースリンク選択開始:', {
      totalLinks: links.length,
      linkTitles: links.map(l => l.title),
      suggestionTitle: suggestion.title,
      keywords: suggestion.keywords,
      relatedLinkIndices: suggestion.relatedLinkIndices,
      suggestionDetails: suggestion
    });

    // 🎯 優先リンク処理: テーマ生成時に記録された関連リンクを優先的に参照
    let priorityLinks: Link[] = [];
    if (suggestion.relatedLinkIndices && suggestion.relatedLinkIndices.length > 0) {
      priorityLinks = suggestion.relatedLinkIndices
        .filter(index => index >= 0 && index < links.length)
        .map(index => links[index]);
      
      console.log('🎯 テーマ生成時の関連リンクを優先参照:', {
        relatedLinkIndices: suggestion.relatedLinkIndices,
        priorityLinksCount: priorityLinks.length,
        priorityLinkTitles: priorityLinks.map(l => l.title.slice(0, 30) + '...')
      });
      
      // 優先リンクの関連性を再確認
      if (priorityLinks.length >= 1) {
        const themeKeywords = suggestion.title.toLowerCase().split(/[^a-zA-Z0-9ぁ-んァ-ヶ一-龠]+/).filter(k => k.length > 1);
        const relevantPriorityLinks = priorityLinks.filter(link => {
          const content = `${link.title} ${link.description || ''}`.toLowerCase();
          return themeKeywords.some(keyword => content.includes(keyword));
        });
        
        console.log('🔍 優先リンクの関連性チェック:', {
          themeKeywords,
          totalPriorityLinks: priorityLinks.length,
          relevantPriorityLinks: relevantPriorityLinks.length,
          relevantTitles: relevantPriorityLinks.map(l => l.title.slice(0, 30) + '...')
        });
        
        if (relevantPriorityLinks.length >= 2) {
          console.log('✅ 関連性の高い優先リンクを選択:', {
            selectedCount: Math.min(relevantPriorityLinks.length, 3),
            selectedTitles: relevantPriorityLinks.slice(0, 3).map(l => l.title.slice(0, 30) + '...')
          });
          return relevantPriorityLinks.slice(0, 3);
        } else if (relevantPriorityLinks.length === 1) {
          console.log('⚠️ 関連性のある優先リンクは1つのみ、スコアリングと組み合わせます');
          priorityLinks = relevantPriorityLinks;
        } else {
          console.log('⚠️ 優先リンクに関連性が見つからず、通常のスコアリングを使用');
          priorityLinks = [];
        }
      }
    }

    // テーマとの関連度をスコアリング
    const scoredLinks = links.map(link => {
      let score = 0;
      const content = `${link.title} ${link.description || ''}`.toLowerCase();
      const suggestionLower = suggestion.title.toLowerCase();
      
      // 優先リンクボーナス
      const isPriorityLink = priorityLinks.some(priorityLink => priorityLink.id === link.id);
      if (isPriorityLink) {
        score += 30;
        console.log('🎯 優先リンクボーナス適用:', {
          linkTitle: link.title.slice(0, 30) + '...',
          bonusScore: 30
        });
      }
      
      // 1. テーマタイトルとの完全一致
      if (content.includes(suggestionLower)) {
        score += 50;
        console.log('🎯 テーマ完全一致:', {
          suggestionLower,
          linkTitle: link.title.slice(0, 50) + '...',
          addedScore: 50
        });
      }
      
      // 🔧 1.5. より柔軟なマッチング（大文字小文字、記号を無視）
      const normalizedContent = content.replace(/[（）()「」\[\]【】]/g, '').toLowerCase();
      const normalizedSuggestion = suggestionLower.replace(/[（）()「」\[\]【】]/g, '');
      
      if (normalizedContent.includes(normalizedSuggestion) && !content.includes(suggestionLower)) {
        score += 30;
        console.log('🎯 正規化マッチング:', {
          normalizedSuggestion,
          linkTitle: link.title.slice(0, 50) + '...',
          addedScore: 30
        });
      }
      
      // 2. テーマの主要単語との一致（改良版）
      const excludeWords = ['とは', 'について', 'の', 'と', 'は', 'が', 'を', 'に', 'で', 'から', '?', '？', '!', '！'];
      
      // 🔧 アルファベットと日本語を適切に分割
      let themeWords: string[] = [];
      
      // アルファベット部分を抽出（例：MCP）
      const alphabetMatches = suggestionLower.match(/[a-zA-Z]+/g);
      if (alphabetMatches) {
        themeWords = themeWords.concat(alphabetMatches);
      }
      
      // 日本語部分を抽出
      const japaneseMatches = suggestionLower.match(/[ぁ-んァ-ヶ一-龠]+/g);
      if (japaneseMatches) {
        themeWords = themeWords.concat(
          japaneseMatches.filter(word => word.length > 1 && !excludeWords.includes(word))
        );
      }
      
      // 重複を除去
      themeWords = [...new Set(themeWords)];
      
      console.log('🔍 テーマ単語抽出:', {
        originalTheme: suggestion.title,
        extractedWords: themeWords,
        linkTitle: link.title.slice(0, 30) + '...'
      });
      
      let themeWordMatches = 0;
      themeWords.forEach(word => {
        if (content.includes(word)) {
          themeWordMatches++;
          score += 20;
          console.log('✅ テーマ単語マッチ:', {
            word,
            linkTitle: link.title.slice(0, 50) + '...',
            addedScore: 20
          });
        }
      });
      
      // 3. suggestionのキーワードとの一致
      let keywordMatches = 0;
      suggestion.keywords.forEach((keyword, index) => {
        const keywordLower = keyword.toLowerCase();
        if (content.includes(keywordLower)) {
          keywordMatches++;
          const keywordScore = 25 - (index * 3);
          score += keywordScore;
          console.log('🎯 キーワードマッチ:', {
            keyword,
            linkTitle: link.title.slice(0, 40) + '...',
            keywordScore,
            index
          });
        }
      });
      
      // 4. コンテンツ品質評価
      let qualityScore = 0;
      if (link.title.length > 15) qualityScore += 5;
      if (link.description && link.description.length > 50) qualityScore += 8;
      
      // 新しさ評価
      const daysSinceCreated = (Date.now() - link.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceCreated < 30) {
        qualityScore += 5;
      } else if (daysSinceCreated < 90) {
        qualityScore += 3;
      }
      
      score += qualityScore;
      
      // 5. 関連性評価
      const relevanceScore = themeWordMatches + keywordMatches;
      if (relevanceScore === 0) {
        score = Math.max(0, score - 30); // 関連性が全くない場合は減点
      }
      
      return { 
        link, 
        score,
        themeWordMatches,
        keywordMatches,
        qualityScore,
        relevanceScore,
        isPriorityLink
      };
    });

    // スコアでソート
    const sortedLinks = scoredLinks.sort((a, b) => b.score - a.score);
    
    // 関連性のあるリンクを選択
    const minRelevanceScore = 1; // 最低1つの関連要素があればOK
    const minTotalScore = 20; // 最低スコア
    
    const relevantLinks = sortedLinks.filter(item => 
      item.relevanceScore >= minRelevanceScore && item.score >= minTotalScore
    );
    
    console.log('📊 キーワードベースリンク評価結果:', {
      allLinks: sortedLinks.map(item => ({
        title: item.link.title.slice(0, 30) + '...',
        score: Math.round(item.score),
        relevanceScore: item.relevanceScore,
        themeWords: item.themeWordMatches,
        keywords: item.keywordMatches,
        isPriorityLink: item.isPriorityLink
      })),
      relevantLinksCount: relevantLinks.length,
      minRelevanceScore,
      minTotalScore
    });
    
    // 選択戦略
    let selected: Link[] = [];
    
    if (relevantLinks.length >= 3) {
      selected = relevantLinks.slice(0, 3).map(item => item.link);
    } else if (relevantLinks.length > 0) {
      selected = relevantLinks.map(item => item.link);
    } else {
      // 第一フォールバック: minTotalScoreを満たすリンク
      const fallbackLinks = sortedLinks
        .filter(item => item.score >= minTotalScore)
        .slice(0, 2);
      
      if (fallbackLinks.length > 0) {
        selected = fallbackLinks.map(item => item.link);
        console.log('🔄 第一フォールバック: スコア制限で選択', {
          selectedCount: selected.length,
          minScore: minTotalScore,
          selectedScores: fallbackLinks.map(item => item.score)
        });
      } else {
        // 第二フォールバック: スコアに関係なく上位2つを強制選択
        selected = sortedLinks.slice(0, 2).map(item => item.link);
        console.log('🆘 第二フォールバック: 強制選択', {
          selectedCount: selected.length,
          reason: 'no_links_met_score_criteria',
          selectedScores: sortedLinks.slice(0, 2).map(item => item.score),
          allScores: sortedLinks.map(item => ({ title: item.link.title.slice(0, 20), score: item.score }))
        });
      }
    }
    
    selected = selected.slice(0, 3);
    
    console.log('✅ キーワードベース選択されたリンク:', {
      count: selected.length,
      titles: selected.map(link => link.title.slice(0, 40) + '...'),
      scores: sortedLinks
        .filter(item => selected.includes(item.link))
        .map(item => Math.round(item.score)),
      strategy: relevantLinks.length >= 3 ? 'top_three' : 
                relevantLinks.length > 0 ? 'relevant_only' : 'fallback_limited'
    });
    
    return selected;
  }, []);

  // Execute AI analysis with selected links
  const executeAIAnalysis = useCallback(async (
    selectedLinks: Link[], 
    analysisType: 'suggested' = 'suggested',
    suggestedTheme?: string
  ) => {
    const analysisStartTime = Date.now();
    setAiAnalyzing(true);
    setCurrentAnalyzingTheme(suggestedTheme || null);
    
    // 🔧 中断検知フラグを初期化
    let wasInterrupted = false;
    
    // 🔧 中断検知関数（新仕様: ページ遷移中断なし）
    const checkIfInterrupted = () => {
      // 🔧 新仕様: ページ遷移では中断しない、AI分析は継続実行
      // 明示的にユーザーが中断を選択した場合のみ中断
      console.log('🔍 中断チェック: ページ遷移中断は無効化済み', {
        isFocused,
        isNavigatingAway,
        aiAnalyzing,
        theme: suggestedTheme,
        allowPageNavigation: true
      });
      
      // 常に中断なしとして扱う（AI分析は継続）
      return false;
    };
    
    // Add analyzing placeholder to history
    if (suggestedTheme) {
      const placeholder = createAnalyzingPlaceholder(suggestedTheme);
      setAnalysisHistory(prev => [placeholder, ...prev]);
      // プレースホルダー追加時に解説結果リストを開き、プレースホルダーを展開
      setShowAllSavedAnalyses(true);
      setExpandedAnalysisId('analyzing-placeholder');
    }
    
    console.log('🤖 AI分析実行開始:', {
      analysisType,
      suggestedTheme,
      linkCount: selectedLinks.length,
      selectedTitles: selectedLinks.map(l => l.title)
    });

    try {
      // Validate inputs
      if (!user?.uid || selectedLinks.length === 0) {
        console.log('❌ AI分析中止: 条件不足', {
          hasUser: !!user?.uid,
          linkCount: selectedLinks.length,
          suggestedTheme: suggestedTheme
        });
        
        // UI状態をリセット
        setAiAnalyzing(false);
        setCurrentAnalyzingTheme(null);
        
        // 分析プレースホルダーをクリア
        setAnalysisHistory(prev => prev.filter(item => item.id !== 'analyzing-placeholder'));
        
        // エラーメッセージを表示
        Alert.alert(
          'AI分析エラー', 
          `分析対象のリンクが選択されませんでした。\n\nテーマ: ${suggestedTheme || '不明'}\n利用可能リンク数: ${tagLinks.length}\n選択されたリンク数: ${selectedLinks.length}`
        );
        return;
      }

      // 厳密な制限チェック（ローカル状態とFirebase両方）
      const plan = PlanService.getEffectivePlan(user);
      const limit = getAIUsageLimit();
      const currentUsage = aiUsageCount ?? 0;
      
      if (currentUsage >= limit) {
        console.log('❌ AI分析中止: ローカル制限チェック失敗', {
          plan,
          currentUsage,
          limit,
          canUseAI
        });
        
        // 分析プレースホルダーをクリア
        setAnalysisHistory(prev => prev.filter(item => item.id !== 'analyzing-placeholder'));
        
        // 使用量を再読み込み（表示を更新）
        await loadAIUsage();
        
        Alert.alert(
          'AI分析の上限に達しました',
          `${plan}プランでは月${limit}回まで利用できます。プランをアップグレードして上限を増やすことができます。`
        );
        return;
      }
      
      // 追加の安全チェック
      if (!canUseAI) {
        console.log('❌ AI分析中止: canUseAIチェック失敗', {
          plan,
          currentUsage,
          limit,
          canUseAI
        });
        
        // 分析プレースホルダーをクリア
        setAnalysisHistory(prev => prev.filter(item => item.id !== 'analyzing-placeholder'));
        
        
        Alert.alert(
          'AI分析を実行できません',
          '使用制限に達しているか、アカウントに問題があります。'
        );
        return;
      }

      // 🔧 修正: オプティミスティック更新を削除し、実際の成功後のみカウントを更新
      
      // コスト追跡用の変数
      let totalCost = 0;
      const processCosts: Array<{step: string, cost: number, time: number, details?: any}> = [];
      
      console.log('🔄 AI分析処理開始...', {
        processId: analysisStartTime,
        expectedSteps: ['content_fetch', 'ai_analysis']
      });

        // Fetch actual web page content for selected links
        const contentFetchStartTime = Date.now();
        console.log('🌐 Webページコンテンツ取得開始...', {
          linkCount: selectedLinks.length,
          startTime: new Date().toISOString()
        });
        
        const linksWithContent = await Promise.all(
          selectedLinks.map(async (link) => {
            try {
              // メタデータ取得にタイムアウトを追加（30秒）
              const metadataPromise = metadataService.fetchMetadata(link.url, user.uid);
              const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`メタデータ取得タイムアウト: ${link.url}`)), 30000);
              });
              
              const metadata = await Promise.race([metadataPromise, timeoutPromise]);
              return {
                ...link,
                enhancedMetadata: metadata as import('../services/metadataService').LinkMetadata
              };
            } catch (error) {
              console.warn(`Failed to fetch content for ${link.url}:`, error);
              return {
                ...link,
                enhancedMetadata: null
              };
            }
          })
        );
        
        const contentFetchTime = Date.now() - contentFetchStartTime;
        processCosts.push({
          step: 'content_fetch',
          cost: 0, // fetchMetadataは無料
          time: contentFetchTime,
          details: {
            linksProcessed: selectedLinks.length,
            successfulFetches: linksWithContent.filter(l => l.enhancedMetadata?.fullContent).length
          }
        });
        
        console.log('🌐 Webページコンテンツ取得完了:', {
          linksWithContent: linksWithContent.filter(l => l.enhancedMetadata?.fullContent).length,
          totalAttempted: linksWithContent.length,
          fetchTime: `${contentFetchTime}ms`,
          averageTimePerLink: `${Math.round(contentFetchTime / selectedLinks.length)}ms`
        });
      
              // Create analysis context from links with enhanced content
        const analysisContext = linksWithContent.map(link => ({
          title: link.title,
          description: link.description || '',
          url: link.url,
          domain: link.metadata?.domain || link.enhancedMetadata?.domain || '',
          summary: link.summary || '',
          fullContent: link.enhancedMetadata?.fullContent || '',
          headings: link.enhancedMetadata?.headings || [],
          contentType: link.enhancedMetadata?.contentType?.category || 'unknown'
        }));
        console.log('📋 分析コンテキスト作成:', {
          selectedLinks: analysisContext.length,
          linksWithDescription: analysisContext.filter(l => l.description).length,
          linksWithSummary: analysisContext.filter(l => l.summary).length,
          linksWithFullContent: analysisContext.filter(l => l.fullContent).length
        });

              // Create a theme explanation prompt that focuses on explaining the theme using the links as references
        const analysisPrompt = `以下の${selectedLinks.length}件のWebページを参考資料として、「${suggestedTheme || tag.name}」について解説する文章を作成してください。

🎯 重要: これらのリンクは「${suggestedTheme || tag.name}」を説明するための参考資料です。リンクの要約ではなく、テーマ「${suggestedTheme || tag.name}」についての解説文を作成してください。

【参考資料（${selectedLinks.length}件）】
${analysisContext.map((link, index) => 
  `${index + 1}. 【${link.title}】
${link.description || '説明なし'}

参考内容: ${link.fullContent ? link.fullContent.slice(0, 6000).replace(/\s+/g, ' ') : 'コンテンツ取得失敗'}${link.fullContent && link.fullContent.length > 6000 ? '...' : ''}`
).join('\n\n')}

【出力形式の指示】
## ${suggestedTheme || tag.name}

**概要**
「${suggestedTheme || tag.name}」について、参考資料に基づいて2-3行で簡潔に説明

「${suggestedTheme || tag.name}」に関連する見出しを2-3個作成し、**見出し名** の形式で構成してください。
各見出しの下には、参考資料の内容を基にした解説を必ず「・」（中黒）を使用して箇条書きで記載してください。

見出し例：
- 概念系なら「**定義と特徴**」「**活用場面**」「**今後の展望**」
- 技術系なら「**基本概念**」「**主要機能**」「**実用例**」
- 比較系なら「**概要**」「**メリット**」「**注意点**」

箇条書き例：
**定義と特徴**
・ 参考資料Aによると、この技術はAIを活用した開発支援ツール
・ 参考資料Bでは、大規模言語モデル（LLM）を基盤として動作すると説明
・ 参考資料Cでは、コードの生成や編集を自動化する機能があると紹介

---
**参考資料** (${analysisContext.length}件)
${analysisContext.map((link, index) => 
  `${index + 1}. [${link.title}](${link.url})`
).join('\n')}

【厳格な指示】
1. タイトル「${suggestedTheme || tag.name}」は絶対に変更しない
2. 箇条書きは必ず「・」（中黒）を使用する（「*」「-」「•」は使用禁止）
3. 🎯 必須: 上記の${analysisContext.length}件の参考資料のみを基にテーマを解説する
4. 🚫 禁止: 参考資料に含まれない情報や、テーマから脱線する内容は一切含めない
5. ✅ 必須: 各箇条書きは必ず参考資料の具体的な内容に基づいて記載する
6. 🎯 目標: 「${suggestedTheme || tag.name}」について分かりやすく解説する文章を作成する`;

              const userPlan = PlanService.getEffectivePlan(user);
        const aiAnalysisStartTime = Date.now();
        
        // Firebase-based detailed usage limit check (skip for test accounts)
        if (isTestAccount) {
          console.log('🧪 テストアカウント: Firebase制限チェックをスキップ', {
            uid: user.uid,
            email: user.email,
            plan: userPlan,
            promptLength: analysisPrompt.length
          });
        } else {
          try {
            const aiUsageManager = AIUsageManager.getInstance();
            
            // サーバー側AI使用制限チェック
            const usageCheck = await aiUsageManager.checkUsageLimit(
              user.uid,
              userPlan,
              'analysis'
            );
            
            if (!usageCheck.allowed) {
              console.log('❌ AI分析中止: Firebase詳細制限チェック失敗', {
                reason: usageCheck.reason,
                plan: userPlan,
                promptLength: analysisPrompt.length
              });
              
              // 分析プレースホルダーをクリア
              setAnalysisHistory(prev => prev.filter(item => item.id !== 'analyzing-placeholder'));
              
              // 使用量を再読み込み（表示を更新）
              await loadAIUsage();
              
              Alert.alert(
                'AI分析を実行できません',
                usageCheck.reason || 'プランの制限に達しています。'
              );
              return;
            }
            
            console.log('✅ Firebase詳細制限チェック通過:', {
              plan: userPlan,
              textLength: analysisPrompt.length
            });
          } catch (limitCheckError) {
            console.error('❌ サーバー側制限チェックエラー:', limitCheckError);
            
            // サーバーエラーの場合は分析を中止
            console.log('❌ AI分析中止: サーバー側制限チェック失敗');
            
            // 分析プレースホルダーをクリア
            setAnalysisHistory(prev => prev.filter(item => item.id !== 'analyzing-placeholder'));
            
            Alert.alert(
              'AI分析の実行に失敗しました',
              'サーバーエラーが発生しました。しばらく時間をおいてから再度お試しください。'
            );
            return;
          }
        }
        // 実際のプロンプト詳細分析
        const webContentSummary = linksWithContent.map(link => ({
          title: link.title,
          contentLength: link.enhancedMetadata?.fullContent?.length || 0,
          headingsCount: link.enhancedMetadata?.headings?.length || 0,
          domain: link.enhancedMetadata?.domain || ''
        }));
        
        const totalWebContentChars = linksWithContent.reduce((total, link) => 
          total + (link.enhancedMetadata?.fullContent?.length || 0), 0);
        
        console.log('🚀 AI API呼び出し開始:', {
          title: `${tag.name}タグの深掘り分析（${selectedLinks.length}件対象）`,
          userPlan,
          promptDetails: {
            totalPromptLength: analysisPrompt.length,
            webContentIncluded: totalWebContentChars,
            basePromptLength: analysisPrompt.length - totalWebContentChars,
            compressionRatio: totalWebContentChars > 0 ? (analysisPrompt.length / totalWebContentChars).toFixed(2) : 'N/A'
          },
          estimatedTokens: {
            fromPromptLength: Math.ceil(analysisPrompt.length / 4),
            expectedRange: `${Math.ceil(analysisPrompt.length / 5)} - ${Math.ceil(analysisPrompt.length / 3)}`
          },
          webContentBreakdown: webContentSummary,
          startTime: new Date().toISOString()
        });
        
        // Use the new AI analysis function that returns detailed text analysis
        const response = await aiService.generateAnalysis(
          `${tag.name}タグの深掘り分析（${selectedLinks.length}件対象）`,
          analysisPrompt,
          user.uid,
          userPlan
        );
        
        const aiAnalysisTime = Date.now() - aiAnalysisStartTime;
        totalCost += response.cost;
        processCosts.push({
          step: 'ai_analysis',
          cost: response.cost,
          time: aiAnalysisTime,
          details: {
            model: response.usage?.model || 'unknown',
            inputTokens: response.usage?.inputTokens || 0,
            outputTokens: response.usage?.outputTokens || 0,
            inputCost: response.usage?.inputCost || 0,
            outputCost: response.usage?.outputCost || 0
          }
        });
      
      console.log('📥 AI API応答受信:', {
        success: true,
        analysisLength: response.analysis.length,
        fromCache: response.fromCache,
        tokensUsed: response.tokensUsed,
        cost: response.cost,
        responsePreview: response.analysis.slice(0, 200) + '...',
        usage: response.usage,
        processingTime: `${aiAnalysisTime}ms`
      });

              if (response.analysis && response.analysis.trim().length > 0) {
        console.log('🎯 AI分析結果（生データ）:', {
          analysisLength: response.analysis.length,
          analysisPreview: response.analysis.slice(0, 300) + '...'
        });
        
        // 🔧 エラーレスポンスのチェック（正常なエラーのみ処理）
        const isErrorResponse = response.analysis.includes('分析に失敗しました') || 
                               response.analysis.includes('エラーが発生しました') ||
                               response.analysis.includes('処理に失敗');
        
        if (isErrorResponse) {
          console.log('❌ エラーレスポンス検出:', {
            responseContent: response.analysis,
            tokensUsed: response.tokensUsed,
            cost: response.cost,
            appState,
            isDevelopment: __DEV__,
            backgroundAnalysis
          });
          
          // 🔧 バックグラウンド処理中のエラー（アラート表示をスキップ）
          if (backgroundAnalysis || appState !== 'active') {
            console.log('🌙 バックグラウンド処理中のエラー: アラート表示をスキップ', {
              isDevelopment: __DEV__,
              appState,
              backgroundAnalysis
            });
            
            // プレースホルダーをクリア（アラート表示なし）
            setAnalysisHistory(prev => prev.filter(item => item.id !== 'analyzing-placeholder'));
            
            // バックグラウンド状態をクリア
            if (backgroundAnalysis) {
              setBackgroundAnalysis(null);
            }
            
            return; // エラーアラート表示をスキップ
          }
          
          // フォアグラウンドでの通常エラーのみアラート表示
          setAnalysisHistory(prev => prev.filter(item => item.id !== 'analyzing-placeholder'));
          
          setTimeout(() => {
            Alert.alert(
              '📱 AI解説機能が失敗しました',
              `「${suggestedTheme}」の解説分析に失敗しました。

📱 ネットワークエラーやサーバーエラーが発生した可能性があります

✅ AI使用回数はカウントされていません
✅ 再度テーマを選択して分析を開始できます`,
              [
                {
                  text: 'OK',
                  style: 'default'
                }
              ],
              {
                cancelable: true,
                userInterfaceStyle: 'dark'
              }
            );
          }, 500);
          
          return;
        }

        // Ensure the title matches the selected theme
        let correctedAnalysis = response.analysis;
        const expectedTitle = `## ${suggestedTheme || tag.name}`;
        
        // Replace any existing title with the correct one
        correctedAnalysis = correctedAnalysis.replace(/^##\s*.+$/m, expectedTitle);
        
        // Replace bullet points with Japanese middle dot
        correctedAnalysis = correctedAnalysis.replace(/^\s*[\*\-\•]\s+/gm, '・ ');
        
        console.log('🔧 タイトル・記号修正:', {
          originalTitle: response.analysis.match(/^##\s*.+$/m)?.[0] || 'なし',
          correctedTitle: expectedTitle,
          suggestedTheme: suggestedTheme,
          bulletPointsFixed: (response.analysis.match(/^\s*[\*\-\•]\s+/gm) || []).length
        });

        // Format the AI response (clean version)
        const formattedResult = correctedAnalysis;

        console.log('📝 整形済み分析結果:', {
          originalLength: response.analysis.length,
          formattedLength: formattedResult.length,
          formattedPreview: formattedResult.slice(0, 200) + '...'
        });

        // Remove analyzing placeholder and add actual result
        const newAnalysis: AnalysisResult = {
          id: Date.now().toString(),
          timestamp: new Date(),
          selectedLinks,
          result: formattedResult,
          tokensUsed: response.tokensUsed,
          cost: response.cost,
          analysisType: 'suggested',
          suggestedTheme
        };
        
        setAnalysisHistory(prev => {
          // Remove placeholder and add actual result
          const filtered = prev.filter(item => item.id !== 'analyzing-placeholder');
          const updatedHistory = [newAnalysis, ...filtered];
          
          // バックグラウンド分析の完了を記録
          if (appState === 'background') {
            setBackgroundAnalysis({
              tagName: tag.name,
              theme: suggestedTheme || tag.name,
              startTime: analysisStartTime,
              isCompleted: true
            });
          }
          
          // 分析完了時に自動的に結果を展開（正しいID形式で設定）
          setExpandedAnalysisId(`current-${newAnalysis.id}`);
          // 解説結果リストを自動的に開く
          setShowAllSavedAnalyses(true);
          
          return updatedHistory;
        });
        
        // 分析完了後、適切な時間で自動移行タイマーを設定（5分後）
        if (analysisTimer) {
          clearTimeout(analysisTimer);
        }
        const newTimer = setTimeout(() => {
          console.log('⏰ 自動移行: 分析履歴をクリア（5分経過）', {
            analysisId: newAnalysis.id,
            theme: suggestedTheme,
            reason: 'auto_transition_after_5min'
          });
          setAnalysisHistory([]);
          setAnalysisTimer(null);
        }, 5 * 60 * 1000); // 5分
        setAnalysisTimer(newTimer);
        
        // 🔧 AI分析完全成功の厳密チェックと使用量記録
        const isAnalysisSuccessful = () => {
          // 中断チェック
          if (wasInterrupted || checkIfInterrupted()) {
            console.log('❌ 使用量記録スキップ: 分析が中断されました', {
              wasInterrupted,
              isFocused,
              isNavigatingAway,
              aiAnalyzing
            });
            return false;
          }
          
          // レスポンス品質チェック
          if (!response.analysis || response.analysis.trim().length < 50) {
            console.log('❌ 使用量記録スキップ: 分析結果が不十分', {
              analysisLength: response.analysis?.length || 0,
              hasAnalysis: !!response.analysis
            });
            return false;
          }
          
          // 期待されるフォーマットチェック
          const hasExpectedTitle = response.analysis.includes(`## ${suggestedTheme || tag.name}`);
          const hasBulletPoints = response.analysis.includes('・ ') || response.analysis.includes('• ');
          
          if (!hasExpectedTitle || !hasBulletPoints) {
            console.log('❌ 使用量記録スキップ: 分析フォーマットが不適切', {
              hasExpectedTitle,
              hasBulletPoints,
              expectedTitle: `## ${suggestedTheme || tag.name}`
            });
            return false;
          }
          
          console.log('✅ AI分析完全成功確認: 使用量記録条件を満たしました', {
            analysisLength: response.analysis.length,
            hasExpectedTitle,
            hasBulletPoints,
            wasInterrupted: false
          });
          return true;
        };

        // 分析が完全に成功した場合のみ使用量を記録
        if (isAnalysisSuccessful()) {
          try {
            const aiUsageManager = AIUsageManager.getInstance();
            const userPlan = PlanService.getEffectivePlan(user);
            
            await aiUsageManager.recordUsage(
              user.uid,
              'analysis',
              response.tokensUsed,
              response.cost
            );
            
            console.log('📝 AI使用量をFirebaseに記録完了（完全成功時のみ）:', {
              type: 'analysis',
              tokensUsed: response.tokensUsed,
              textLength: analysisPrompt.length,
              cost: response.cost,
              plan: userPlan,
              isTestAccount: isTestAccount,
              analysisLength: response.analysis.length,
              theme: suggestedTheme
            });
            
            // 成功時にカウントを確定
            console.log('✅ AI分析完全成功 - 使用量カウント確定:', {
              currentCount: aiUsageCount,
              limit: getAIUsageLimit(),
              newCount: aiUsageCount + 1
            });
            
            // 使用状況を即座に再読み込みして、ボタン状態を更新
            try {
              await loadAIUsage(true);
              console.log('✅ AI使用量同期完了 - ボタン状態更新（完全成功時）');
            } catch (error) {
              console.error('❌ バックグラウンド同期エラー:', error);
            }
            
            console.log('🔄 使用量表示更新完了（完全成功時）');
          } catch (recordError) {
            console.error('❌ AI使用量記録エラー:', recordError);
            // エラー時は使用量記録をスキップ（不完全な分析の可能性）
            console.log('⚠️ 使用量記録エラー: カウントしません（分析結果は表示）');
          }
        } else {
          console.log('⚠️ 使用量記録スキップ: 分析が不完全または中断されました');
        }
        
        // Hide theme list after analysis completion
        setAiSuggestions([]);

        // Save to database for all plan users (全プランでAI分析結果保存可能)
        if ((isProPlan || isTestAccount) && user?.uid) {
          const analysisTitle = suggestedTheme ? `${suggestedTheme}について（${selectedLinks.length}件分析）` : `${tag.name}タグの深掘り分析（${selectedLinks.length}件対象）`;
          
          try {
            console.log('💾 Firebase保存準備:', {
              suggestedTheme: suggestedTheme,
              tagName: tag.name,
              generatedTitle: analysisTitle,
              hasSuggestedTheme: !!suggestedTheme,
              suggestedThemeType: typeof suggestedTheme
            });
            
            console.log('🔍 Firebase保存データ詳細:', {
              userId: user.uid,
              tagId: tag.id,
              tagName: tag.name,
              title: analysisTitle,
              resultLength: formattedResult.length,
              selectedLinksCount: selectedLinks.length,
              tokensUsed: response.tokensUsed,
              cost: response.cost,
              metadata: {
                model: response.usage?.model || 'gemini-2.0-flash-exp',
                linkCount: selectedLinks.length,
                analysisType: 'tag_summary',
                processingTime: Date.now() - analysisStartTime
              }
            });
            
            const savedAnalysisId = await savedAnalysisService.saveAnalysis(
              user.uid,
              tag.id,
              tag.name,
              analysisTitle,
              formattedResult,
              selectedLinks.map(link => ({
                id: link.id,
                title: link.title,
                url: link.url,
                description: link.description
              })),
              response.tokensUsed,
              response.cost,
              {
                model: response.usage?.model || 'gemini-2.0-flash-exp',
                linkCount: selectedLinks.length,
                analysisType: 'tag_summary',
                processingTime: Date.now() - analysisStartTime
              }
            );
            
            console.log('🔥 AI分析結果を保存:', {
              savedAnalysisId,
              tagName: tag.name,
              linkCount: selectedLinks.length
            });

            // 🚀 効率的キャッシュ更新：全体再読み込みではなく新規分析のみ追加
            const newSavedAnalysis: SavedAnalysis = {
              id: savedAnalysisId,
              userId: user.uid,
              tagId: tag.id,
              tagName: tag.name,
              title: analysisTitle,
              result: formattedResult,
              selectedLinks: selectedLinks.map(link => ({
                id: link.id,
                title: link.title,
                url: link.url,
                description: link.description
              })),
              tokensUsed: response.tokensUsed,
              cost: response.cost,
              createdAt: new Date(),
              updatedAt: new Date(),
              metadata: {
                model: response.usage?.model || 'gemini-2.0-flash-exp',
                linkCount: selectedLinks.length,
                analysisType: 'tag_summary',
                processingTime: Date.now() - analysisStartTime
              }
            };
            
            console.log('🚀 効率的キャッシュ更新 - 新規分析をリストに追加:', {
              savedAnalysisId,
              newAnalysisTitle: analysisTitle,
              strategy: 'incremental_update'
            });
            
            // ローカル状態を即座に更新（Firebase読み取り不要）
            setSavedAnalyses(prev => [newSavedAnalysis, ...prev]);
            
            // キャッシュも更新
            const cacheKey = `${user.uid}-${tag.id}`;
            setSavedAnalysesCache(prev => {
              const updated = new Map(prev);
              const currentCache = updated.get(cacheKey) || [];
              updated.set(cacheKey, [newSavedAnalysis, ...currentCache]);
              return updated;
            });
            setLastFetchTimestamp(prev => ({...prev, [cacheKey]: Date.now()}));
            
            console.log('✅ Firebase保存完了 - 分析履歴は保持（ページ離脱まで表示継続）', {
              savedAnalysisId,
              currentHistoryCount: analysisHistory.length,
              savedAnalysesCount: savedAnalyses.length + 1,
              currentTheme: suggestedTheme,
              strategy: 'incremental_cache_update'
            });
            
          } catch (saveError) {
            console.error('❌ AI分析結果の保存に失敗:', {
              error: saveError,
              errorMessage: saveError instanceof Error ? saveError.message : String(saveError),
              errorCode: saveError instanceof Error && 'code' in saveError ? saveError.code : undefined,
              userId: user.uid,
              tagId: tag.id,
              tagName: tag.name,
              analysisTitle,
              selectedLinksCount: selectedLinks.length,
              formattedResultLength: formattedResult.length,
              tokensUsed: response.tokensUsed,
              cost: response.cost
            });
            
            // 保存に失敗した場合はユーザーにアラートを表示
            Alert.alert(
              'エラー',
              `AI分析結果の保存に失敗しました: ${saveError instanceof Error ? saveError.message : String(saveError)}`,
              [{ text: 'OK' }]
            );
          }
        }
        
        // 全体的な処理結果とコストサマリー
        const totalProcessingTime = Date.now() - analysisStartTime;
        console.log('✅ AI分析完了 - 履歴に追加:', {
          analysisId: newAnalysis.id,
          resultLength: formattedResult.length,
          webContentFetched: linksWithContent.filter(l => l.enhancedMetadata?.fullContent).length,
          newUsageCount: aiUsageCount + 1,
          historyCount: analysisHistory.length + 1,
          analysisPreview: newAnalysis.result.slice(0, 100) + '...'
        });
        
        // 📊 詳細なコスト・パフォーマンス分析
        const totalCharactersProcessed = linksWithContent.reduce((total, link) => 
          total + (link.enhancedMetadata?.fullContent?.length || 0), 0);
        
        console.log('📊 AI分析 - コスト・パフォーマンス詳細:', {
          timing: {
            totalProcessingTime: `${totalProcessingTime}ms`,
            contentFetchTime: `${processCosts.find(p => p.step === 'content_fetch')?.time || 0}ms`,
            aiAnalysisTime: `${processCosts.find(p => p.step === 'ai_analysis')?.time || 0}ms`
          },
          costs: {
            totalCost: `$${totalCost.toFixed(8)}`,
            totalCostJPY: `¥${(totalCost * 150).toFixed(4)}`, // 概算レート
            inputCost: response.usage?.inputCost ? `$${response.usage.inputCost.toFixed(8)}` : 'N/A',
            outputCost: response.usage?.outputCost ? `$${response.usage.outputCost.toFixed(8)}` : 'N/A',
            costBreakdown: response.usage?.inputCost && response.usage?.outputCost 
              ? `入力: ${((response.usage.inputCost / totalCost) * 100).toFixed(1)}%, 出力: ${((response.usage.outputCost / totalCost) * 100).toFixed(1)}%`
              : 'N/A'
          },
          tokens: {
            totalTokens: response.tokensUsed,
            inputTokens: response.usage?.inputTokens || 'N/A',
            outputTokens: response.usage?.outputTokens || 'N/A',
            hasActualUsage: response.usage?.hasActualUsage || false
          },
          dataAnalysis: {
            charactersProcessed: totalCharactersProcessed,
            promptLength: response.usage?.promptCharacterCount || 'N/A',
            responseLength: response.usage?.responseCharacterCount || analysisHistory[0]?.result?.length || 'N/A',
            compressionRatio: totalCharactersProcessed > 0 
              ? `${((response.usage?.responseCharacterCount || 0) / totalCharactersProcessed * 100).toFixed(1)}%`
              : 'N/A'
          },
          efficiency: {
            costPerSecond: `$${(totalCost / (totalProcessingTime / 1000)).toFixed(10)}`,
            tokensPerSecond: Math.round(response.tokensUsed / (totalProcessingTime / 1000)),
            costPerToken: `$${(totalCost / response.tokensUsed).toFixed(10)}`,
            costPerCharacter: totalCharactersProcessed > 0 
              ? `$${(totalCost / totalCharactersProcessed).toFixed(12)}`
              : 'N/A',
            costPer1000Chars: totalCharactersProcessed > 0 
              ? `$${(totalCost / totalCharactersProcessed * 1000).toFixed(8)}`
              : 'N/A'
          },
          processBreakdown: processCosts,
          costAssessment: {
            level: totalCost > 0.01 ? 'HIGH' : totalCost > 0.001 ? 'MEDIUM' : 'LOW',
            recommendations: totalCost > 0.01 ? 
              ['⚠️ 高コスト分析です', 'プロンプトの最適化を検討', 'リンク数を削減検討'] :
              totalCost > 0.001 ?
              ['💡 中程度のコスト', '効率性は良好'] :
              totalProcessingTime > 10000 ?
              ['⏱️ 処理時間が長め', 'リンク数の制限を検討'] :
              ['✅ 効率的な分析完了', '最適なコストパフォーマンス']
          }
        });
      } else {
        const noResultMessage = `## ${suggestedTheme || tag.name}について

**分析結果**
・ 選択されたリンクからは十分な分析情報を抽出できませんでした
・ より詳細なコンテンツを含むリンクを追加することをお勧めします`;
        
        const newAnalysis: AnalysisResult = {
          id: Date.now().toString(),
          timestamp: new Date(),
          selectedLinks,
          result: noResultMessage,
          tokensUsed: response.tokensUsed,
          cost: response.cost,
          analysisType: 'suggested',
          suggestedTheme
        };
        
        setAnalysisHistory(prev => {
          // Remove placeholder and add actual result
          const filtered = prev.filter(item => item.id !== 'analyzing-placeholder');
          const updatedHistory = [newAnalysis, ...filtered];
          
          // 分析完了時に自動的に結果を展開（正しいID形式で設定）
          setExpandedAnalysisId(`current-${newAnalysis.id}`);
          // 解説結果リストを自動的に開く
          setShowAllSavedAnalyses(true);
          
          return updatedHistory;
        });
        
        // 🔧 情報不足の場合も中断チェックを行い、正当な処理の場合のみ使用量記録
        if (!wasInterrupted && !checkIfInterrupted()) {
          try {
            const aiUsageManager = AIUsageManager.getInstance();
            const userPlan = PlanService.getEffectivePlan(user);
            
            await aiUsageManager.recordUsage(
              user.uid,
              'analysis',
              response.tokensUsed,
              response.cost
            );
            
            console.log('📝 AI使用量をFirebaseに記録完了（情報不足・中断なし）:', {
              type: 'analysis',
              tokensUsed: response.tokensUsed,
              textLength: analysisPrompt.length,
              cost: response.cost,
              plan: userPlan,
              isTestAccount: isTestAccount,
              reason: 'insufficient_content_but_completed',
              theme: suggestedTheme
            });
            
            // 成功時にカウントを確定
            console.log('✅ AI分析完了（情報不足・中断なし） - 使用量カウント確定:', {
              currentCount: aiUsageCount,
              limit: getAIUsageLimit()
            });
            
            // 使用状況を即座に再読み込みして、ボタン状態を更新
            try {
              await loadAIUsage(true);
              console.log('✅ AI使用量同期完了 - ボタン状態更新（情報不足・完了時）');
            } catch (error) {
              console.error('❌ バックグラウンド同期エラー（情報不足）:', error);
            }
          } catch (recordError) {
            console.error('❌ AI使用量記録エラー:', recordError);
            // エラー時は使用量記録をスキップ
            console.log('⚠️ 使用量記録エラー: カウントしません（情報不足時）');
          }
        } else {
          console.log('⚠️ 使用量記録スキップ: 分析が中断されました（情報不足時）', {
            wasInterrupted,
            isFocused,
            isNavigatingAway
          });
        }
        
        // Hide theme list after analysis completion
        setAiSuggestions([]);
        
        console.log('⚠️ AI分析完了 - 情報不足（履歴に追加）:', {
          analysisId: newAnalysis.id,
          reason: 'insufficient_content'
        });
      }
    } catch (error) {
      console.error('❌ AI分析エラー:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        tagName: tag.name,
        linkCount: tagLinks.length,
        wasInterrupted,
        currentTheme: suggestedTheme
      });
      
      // 🔧 Firebase エラーの特別処理（新仕様: deadline-exceededエラー表示を抑制）
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isDeadlineExceeded = errorMessage.includes('deadline-exceeded') || 
                                errorMessage.includes('DEADLINE_EXCEEDED');
      const isFirebaseInternal = errorMessage.includes('internal') && errorMessage.includes('Firebase');
      
      if (isDeadlineExceeded) {
        console.log('⏰ deadline-exceeded エラー: エラー表示を抑制（新仕様）', {
          errorType: 'deadline-exceeded',
          theme: suggestedTheme,
          skipErrorDisplay: true
        });
        wasInterrupted = true; // 中断扱いにしてエラー表示をスキップ
      } else if (isFirebaseInternal) {
        console.log('🔥 Firebase internal エラー: エラー表示を抑制（新仕様）', {
          errorType: 'firebase-internal',
          theme: suggestedTheme,
          skipErrorDisplay: true
        });
        wasInterrupted = true; // Firebase内部エラーも中断扱い
      }
      
      // 🔧 エラー時は使用量記録を行わない（正しい判断）
      console.log('⚠️ AI分析エラー: 使用量記録をスキップします', {
        reason: isDeadlineExceeded ? 'deadline_exceeded' : 'analysis_error',
        wasInterrupted,
        theme: suggestedTheme
      });
      
      // Remove analyzing placeholder on error
      setAnalysisHistory(prev => prev.filter(item => item.id !== 'analyzing-placeholder'));
      
      // Hide theme list after analysis error
      setAiSuggestions([]);
      
      // 🔧 新仕様: ユーザー選択による中断の場合は、エラーアラートを表示しない
      if (wasInterrupted || isDeadlineExceeded || isFirebaseInternal) {
        console.log('🔄 AI分析中断/エラー: エラーアラートをスキップ（新仕様対応）', {
          wasInterrupted,
          isDeadlineExceeded,
          isFirebaseInternal,
          userInterruption: wasInterrupted && isNavigatingAway,
          errorType: isFirebaseInternal ? 'firebase-internal' : isDeadlineExceeded ? 'deadline-exceeded' : 'user-interrupted',
          skipErrorDisplay: true // 新仕様: エラー表示を抑制
        });
        return; // アラート表示をスキップ
      }
      
      // 🔧 新仕様: deadline-exceededおよびFirebaseエラーは表示しない
      const displayMessage = error instanceof Error ? error.message : 'AI分析に失敗しました';
      
      // deadline-exceededやFirebaseエラーの場合は何も表示しない（既に抑制済み）
      if (displayMessage.includes('timeout') || 
          displayMessage.includes('DEADLINE_EXCEEDED') || 
          displayMessage.includes('deadline-exceeded') ||
          displayMessage.includes('Firebase') ||
          displayMessage.includes('処理時間が長すぎます')) {
        console.log('🔇 エラー表示スキップ: deadline-exceeded/Firebaseエラー', {
          errorType: displayMessage.includes('deadline') ? 'deadline-exceeded' : 'firebase-error',
          skipReason: 'user_requested_suppression'
        });
        // 何も表示しない
      } else {
        // その他のエラーのみ表示
        Alert.alert('エラー', `${displayMessage}

しばらく時間をおいてから再度お試しください。`);
      }
    } finally {
      // 🔧 分析状態のクリーンアップ
      setAiAnalyzing(false);
      setCurrentAnalyzingTheme(null);
      
      // 🔧 中断確認アラートの適切な制御
      if (wasInterrupted) {
        console.log('🔄 AI分析中断完了: アラートを適切に閉じます');
      }
      setShowExitConfirmAlert(false);
      setIsNavigatingAway(false);
      
      const finalProcessingTime = Date.now() - analysisStartTime;
      console.log('🏁 AI分析処理終了:', {
        totalTime: `${finalProcessingTime}ms`,
        status: wasInterrupted ? 'interrupted' : 'completed',
        wasInterrupted,
        theme: suggestedTheme
      });
    }
  }, [user, tagLinks, tag.name, canUseAI, getAIUsageLimit, isFocused, isNavigatingAway, aiAnalyzing, loadAIUsage]);

  // 🚀 提案されたテーマでの分析処理（確認アラート付き）
  const handleSuggestedAnalysis = useCallback(async (suggestedTheme: string) => {
    console.log('🎯 提案されたテーマでの分析開始:', {
      theme: suggestedTheme,
      showAlert: showAIAnalysisAlert,
      loadingSettings: loadingUserSettings
    });

    // 設定読み込み中は待機
    if (loadingUserSettings) {
      console.log('⏳ ユーザー設定読み込み中...');
      return;
    }

    // 🔍 既存分析のチェック機能（更新確認プロセス）
    const checkExistingAnalysis = () => {
      const expectedTitle = `${suggestedTheme}について（3件分析）`; // 通常のタイトル形式
      const existingAnalysis = savedAnalyses?.find(analysis => 
        analysis.title === expectedTitle || 
        analysis.title.startsWith(`${suggestedTheme}について（`) ||
        analysis.title.includes(suggestedTheme)
      );

      if (existingAnalysis) {
        const createdAtString = existingAnalysis.createdAt instanceof Date 
          ? existingAnalysis.createdAt.toLocaleString() 
          : (existingAnalysis.createdAt && typeof existingAnalysis.createdAt === 'object' && 'seconds' in existingAnalysis.createdAt 
            ? new Date((existingAnalysis.createdAt as any).seconds * 1000).toLocaleString()
            : (existingAnalysis.createdAt && typeof existingAnalysis.createdAt === 'object' && 'toDate' in existingAnalysis.createdAt
              ? (existingAnalysis.createdAt as any).toDate().toLocaleString()
              : '不明'));

        console.log('💡 既存の分析結果を発見 - 更新確認を表示:', {
          existingTitle: existingAnalysis.title,
          existingId: existingAnalysis.id,
          theme: suggestedTheme,
          createdAt: createdAtString
        });

        // 更新確認アラートを表示
        Alert.alert(
          '既存の分析結果があります',
          `「${suggestedTheme}」のテーマで既に分析結果があります。\n\n作成日時: ${createdAtString}\n\nリンクの内容が更新されている可能性があります。分析を更新しますか？`,
          [
            {
              text: '既存結果を表示（消費なし）',
              style: 'cancel',
              onPress: () => {
                console.log('✅ 既存分析結果を表示選択（カウント増加なし）');
                
                // 既存の分析アイテムを直接開く（新しいアイテムは作らない）
                setShowAllSavedAnalyses(true);
                setExpandedAnalysisId(existingAnalysis.id);
                
                console.log('💡 既存結果アイテムを開きました - AI使用回数は消費されていません:', {
                  openedAnalysisId: existingAnalysis.id,
                  analysisTitle: existingAnalysis.title
                });
              }
            },
            {
              text: '分析を更新（1回消費）',
              style: 'default',
              onPress: () => {
                console.log('🔄 分析更新を選択 - 新規分析を実行（AI使用回数消費）');
                // 新規分析を実行（executeAnalysisの残りの処理を実行）
                proceedWithNewAnalysis();
              }
            }
          ],
          { 
            cancelable: false,
            userInterfaceStyle: 'dark'
          }
        );
        
        return true; // 確認プロセスを実行したため、通常の処理は停止
      }
      
      return false; // 新規分析が必要
    };

    // 🆕 新規分析実行関数
    const proceedWithNewAnalysis = () => {
      // 既存のタイマーをクリア
      if (analysisTimer) {
        clearTimeout(analysisTimer);
        setAnalysisTimer(null);
      }

      // 前の分析結果をクリア
      setAnalysisHistory([]);
      
      // テーマ選択時に解説結果リストを即座に開く
      setShowAllSavedAnalyses(true);

      // AIが提案されたテーマに基づいて適切なリンクを選択
      // 🚀 修正: 実際に生成されたsuggestionを使用してキーワードも活用
      const actualSuggestion = aiSuggestions.find(s => s.title === suggestedTheme);
      
      // 🔧 フォールバック: suggestionが見つからない場合はテーマからキーワードを生成
      const suggestion = actualSuggestion || { 
        title: suggestedTheme, 
        keywords: suggestedTheme.split(/[^a-zA-Z0-9ぁ-んァ-ヶ一-龠]+/).filter(k => k.length > 1),
        description: '' 
      };
      
      console.log('🎯 リンク選択用suggestion:', {
        theme: suggestedTheme,
        hasActualSuggestion: !!actualSuggestion,
        keywords: suggestion.keywords,
        description: suggestion.description,
        keywordCount: suggestion.keywords.length,
        availableSuggestions: aiSuggestions.map(s => s.title)
      });
      
      console.log('📋 リンク選択前の状況:', {
        theme: suggestedTheme,
        totalTagLinks: tagLinks.length,
        tagLinkTitles: tagLinks.map(l => l.title),
        suggestionKeywords: suggestion.keywords,
        suggestionTitle: suggestion.title
      });
      
      const selectedLinks = selectLinksForSuggestedAnalysis(tagLinks, suggestion);
      
      console.log('🔗 選択されたリンク:', {
        theme: suggestedTheme,
        linkCount: selectedLinks.length,
        linkTitles: selectedLinks.map(l => l.title),
        selectionSuccess: selectedLinks.length > 0
      });

      // AI分析実行（テーマと説明文の両方を渡す）
      const themeWithDescription = suggestion.description 
        ? `${suggestedTheme}（${suggestion.description}）`
        : suggestedTheme;
      executeAIAnalysis(selectedLinks, 'suggested', themeWithDescription);
    };

    // 🚀 確認アラートの表示判定
    const executeAnalysis = () => {
      // 既存分析をチェック
      if (checkExistingAnalysis()) {
        console.log('📋 既存分析の確認プロセスを開始');
        return; // 確認プロセスを実行したので、通常の処理は停止
      }

      // 既存分析がない場合は、直接新規分析を実行
      proceedWithNewAnalysis();
    };

    if (showAIAnalysisAlert) {
      // カスタム確認アラートを表示
      setAlertTheme(suggestedTheme);
      setAlertCallback(() => executeAnalysis);
      setDontShowAgain(false);
      setShowCustomAlert(true);
    } else {
      // 直接分析実行
      console.log('🚀 確認アラートスキップ: 直接分析実行');
      executeAnalysis();
    }
  }, [
    showAIAnalysisAlert, 
    loadingUserSettings, 
    analysisTimer, 
    tagLinks, 
    selectLinksForSuggestedAnalysis, 
    executeAIAnalysis
  ]);



  // Markdown content renderer for better formatting
  const renderMarkdownContent = (content: string) => {
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let key = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) {
        elements.push(<View key={key++} style={styles.lineBreak} />);
        continue;
      }

      // H2 Headers (## Header)
      if (trimmedLine.startsWith('## ')) {
        elements.push(
          <Text key={key++} style={styles.analysisH2}>
            {trimmedLine.replace('## ', '')}
          </Text>
        );
      }
      // Bold text (**text**)
      else if (trimmedLine.startsWith('**') && trimmedLine.endsWith('**')) {
        elements.push(
          <Text key={key++} style={styles.analysisBold}>
            {trimmedLine.replace(/\*\*/g, '')}
          </Text>
        );
      }
      // Bullet points (• text, - text, or ・ text)
      else if (trimmedLine.startsWith('• ') || trimmedLine.startsWith('- ') || trimmedLine.startsWith('・ ')) {
        elements.push(
          <View key={key++} style={styles.bulletContainer}>
            <Text style={styles.bulletPoint}>•</Text>
            <Text style={styles.bulletText}>
              {trimmedLine.replace(/^[•\-・]\s/, '')}
            </Text>
          </View>
        );
      }
      // Links ([text](url))
      else if (trimmedLine.match(/^\d+\.\s\[.+\]\(.+\)$/)) {
        const linkMatch = trimmedLine.match(/^(\d+)\.\s\[(.+)\]\((.+)\)$/);
        if (linkMatch) {
          const [, number, title, url] = linkMatch;
          elements.push(
            <TouchableOpacity 
              key={key++} 
              onPress={() => handleAnalysisLinkPress(url)}
              style={styles.analysisLinkContainer}
            >
              <Text style={styles.analysisLink}>
                {number}. {title}
              </Text>
              <Feather name="external-link" size={12} color="#8A2BE2" style={styles.linkIcon} />
            </TouchableOpacity>
          );
        }
      }
      // Horizontal line (---)
      else if (trimmedLine === '---') {
        elements.push(
          <View key={key++} style={styles.divider} />
        );
      }
      // Regular text
      else {
        elements.push(
          <Text key={key++} style={styles.analysisText}>
            {trimmedLine}
          </Text>
        );
      }
    }

    return elements;
  };

  const renderLinkItem = ({ item }: { item: Link }) => {
    const linkTags = tags.filter(t => item.tagIds.includes(t.id));
    
    return (
      <View style={styles.linkItemContainer}>
        <LinkCard
          link={item}
          tags={linkTags}
          onPress={() => handleLinkPress(item)}
          onToggleBookmark={() => handleToggleBookmark(item)}
          onDelete={() => handleDeleteLink(item.id)}
          onMarkAsRead={() => handleMarkAsRead(item.id)}
        />
      </View>
    );
  };

  // 🚀 分析結果削除ハンドラー
  const handleDeleteAnalysis = useCallback(async (analysisId: string, analysisTitle: string) => {
    if (!user?.uid) return;

    // 現在の分析は削除できない
    if (analysisId.startsWith('current-')) {
      Alert.alert('情報', '現在の分析結果は時間経過で自動的に消去されます');
      return;
    }

    Alert.alert(
      '分析結果を削除',
      `「${analysisTitle}」を削除しますか？\n\nこの操作は取り消すことができません。`,
      [
        {
          text: 'キャンセル',
          style: 'cancel'
        },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              await savedAnalysisService.deleteAnalysis(analysisId);
              
              console.log('✅ 分析結果削除完了:', {
                analysisId,
                analysisTitle: analysisTitle.slice(0, 30) + '...'
              });
              
              // ローカル状態とキャッシュから削除
              setSavedAnalyses(prev => prev.filter(analysis => analysis.id !== analysisId));
              
              // キャッシュからも削除
              const cacheKey = `saved-${user.uid}-${tag.id}`;
              const cachedEntry = savedAnalysesCache.get(cacheKey);
              if (cachedEntry) {
                const updatedAnalyses = cachedEntry.filter(analysis => analysis.id !== analysisId);
                setSavedAnalysesCache(prev => new Map(prev.set(cacheKey, updatedAnalyses)));
              }
              
              // 展開中の分析が削除された場合は展開を閉じる
              if (expandedAnalysisId === analysisId) {
                setExpandedAnalysisId(null);
              }
              
              // 成功フィードバック
              Alert.alert('削除完了', '分析結果を削除しました', [{ text: 'OK' }]);
            } catch (error) {
              console.error('❌ 分析結果削除エラー:', error);
              Alert.alert('エラー', '分析結果の削除に失敗しました');
            } finally {
              setDeletingAnalysisId(null);
            }
          }
        }
      ]
    );
  }, [user?.uid, tag.id, savedAnalysesCache, expandedAnalysisId]);

  // 🚀 カスタム確認アラートの表示


  // 🚀 カスタムアラートの確認処理
  const handleCustomAlertConfirm = useCallback(() => {
    setShowCustomAlert(false);
    
    // 「今後表示しない」がチェックされている場合は設定を保存
    if (dontShowAgain) {
      updateUserSettings(true); // hideAlert = true
    }
    
    // 実際の分析処理を実行
    if (alertCallback) {
      alertCallback();
    }
    
    // 状態をリセット
    setAlertCallback(null);
    setAlertTheme('');
    setDontShowAgain(false);
  }, [dontShowAgain, alertCallback, updateUserSettings]);

  // 🚀 カスタムアラートのキャンセル処理
  const handleCustomAlertCancel = useCallback(() => {
    setShowCustomAlert(false);
    setAlertCallback(null);
    setAlertTheme('');
    setDontShowAgain(false);
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Feather name="arrow-left" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>#{tag.name}</Text>
        <TouchableOpacity
          style={styles.optionsButton}
          onPress={() => setShowOptionsMenu(true)}
        >
          <Feather name="more-vertical" size={20} color="#FFF" />
        </TouchableOpacity>
      </View>

      {/* Scrollable Content */}
      <FlatList
        data={tagLinks}
        renderItem={renderLinkItem}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#8A2BE2"
          />
        }
        contentContainerStyle={styles.scrollContentContainer}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.headerContainer}>
            {/* AI Analysis Section */}
            <View style={styles.aiAnalysisSection}>
              <View style={styles.aiSectionHeader}>
                <View style={styles.aiSectionTitleContainer}>
                  <Text style={styles.aiSectionTitle}>AI解説</Text>
                  <Text style={styles.aiSectionDescription}>
                    保存したリンクから学習テーマを提案し、内容を要約します
                  </Text>
                </View>
                <View style={styles.usageBadgeContainer}>
                  <Text style={styles.usageBadgeLabel}>
                    {planInfo.displayName}プラン
                  </Text>
                  <View style={[
                    styles.usageBadge,
                    isUnlimitedTest && styles.usageBadgeTest
                  ]}>
                    <Text style={[
                      styles.usageBadgeText,
                      isUnlimitedTest && styles.usageBadgeTextTest
                    ]}>
                        {isUnlimitedTest 
                          ? '無制限' 
                          : (() => {
                              const limit = getAIUsageLimit();
                              const currentUsage = aiUsageCount ?? 0; // undefinedの場合は0を使用
                              const remaining = Math.max(0, limit - currentUsage);
                              console.log('🔢 使用回数表示デバッグ:', {
                                aiUsageCount,
                                currentUsage,
                                limit,
                                remaining,
                                canUseAI,
                                userPlan: user?.subscription?.plan || 'free'
                              });
                              return `${remaining} / ${limit} 回`;
                            })()
                        }
                    </Text>
                  </View>
                </View>
              </View>
              
              <View style={styles.suggestionsContainer}>
                {!canUseAI ? (
                  // AI使用回数が制限に達している場合は「回数を増やす」ボタンを表示
                  <TouchableOpacity
                    style={styles.upgradePromptButton}
                    onPress={() => setShowUpgradeModal(true)}
                  >
                    <View style={styles.upgradePromptButtonContent}>
                      <Feather name="trending-up" size={16} color="#FFF" />
                      <Text style={styles.upgradePromptButtonText}>回数を増やす</Text>
                    </View>
                    <Text style={styles.upgradePromptButtonHint}>
                      今月のAI解説回数上限に達しました
                    </Text>
                  </TouchableOpacity>
                ) : (
                  // テーマが未生成かつ制限内の場合は「分析テーマを生成」ボタンを表示（新デザイン）
                  <TouchableOpacity
                    style={[
                      styles.newGenerateButton,
                      (tagLinks.length === 0 || loadingSuggestions) && styles.newGenerateButtonDisabled
                    ]}
                    onPress={handleGenerateSuggestions}
                    disabled={tagLinks.length === 0 || loadingSuggestions}
                  >
                    <View style={styles.newGenerateButtonContent}>
                      <View style={styles.newGenerateButtonIcon}>
                        {loadingSuggestions ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Feather name="zap" size={16} color="#FFFFFF" />
                        )}
                      </View>
                      <View style={styles.newGenerateButtonTextContainer}>
                        <Text style={styles.newGenerateButtonTitle}>
                          {loadingSuggestions ? 'テーマ生成中...' : 'テーマを生成'}
                        </Text>
                        <Text style={styles.newGenerateButtonSubtitle}>
                          {tagLinks.length === 0 ? 
                            'リンクを追加してから利用可能です' : 
                            `${tagLinks.length}件のリンクから学習テーマを提案`
                          }
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            </View>
            
            {/* Results Section */}
            {unifiedAnalyses.length > 0 && (
              <View style={styles.resultsSection}>
                <TouchableOpacity 
                  style={styles.resultsSectionHeader}
                  onPress={() => setShowAllSavedAnalyses(!showAllSavedAnalyses)}
                >
                  <Text style={styles.resultsSectionTitle}>
                    解説結果 {unifiedAnalyses.length > 0 && `(${unifiedAnalyses.length})`}
                  </Text>
                  <Feather 
                    name={showAllSavedAnalyses ? "chevron-up" : "chevron-down"} 
                    size={16} 
                    color="#666" 
                  />
                </TouchableOpacity>

                {showAllSavedAnalyses && (
                  <View style={styles.resultsContent}>
                    {(showAllSavedAnalyses ? unifiedAnalyses : unifiedAnalyses.slice(0, 3)).map((analysis) => {
                      const isAnalyzing = analysis.id.includes('analyzing-placeholder');
                      const isCurrent = 'isCurrent' in analysis && analysis.isCurrent;
                      
                      return (
                        <TouchableOpacity 
                          key={analysis.id} 
                          style={[
                            styles.resultItem,
                            isCurrent && styles.resultItemCurrent
                          ]}
                          onPress={() => handleSavedAnalysisPress(analysis.id)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.resultHeader}>
                            <View style={styles.resultTitleContainer}>
                              <Text style={styles.resultTitle}>
                                {(() => {
                                  if (isCurrent) {
                                    const titleMatch = analysis.result.match(/^## (.+?)について?$/m);
                                    if (titleMatch) {
                                      return titleMatch[1].trim();
                                    }
                                  }
                                  
                                  const titleMatch = analysis.result.match(/^## (.+?)について?$/m);
                                  if (titleMatch) {
                                    const extractedTheme = titleMatch[1].trim();
                                    if (extractedTheme !== tag.name) {
                                      return extractedTheme;
                                    }
                                  }
                                  
                                  if (analysis.title) {
                                    const aboutMatch = analysis.title.match(/^(.+?)について（\d+件分析）$/);
                                    if (aboutMatch) {
                                      const extractedTheme = aboutMatch[1].trim();
                                      if (extractedTheme !== tag.name) {
                                        return extractedTheme;
                                      }
                                    }
                                  }
                                  
                                  return '分析結果';
                                })()}
                              </Text>
                              {isCurrent && (
                                <View style={styles.currentBadge}>
                                  <Text style={styles.currentBadgeText}>最新</Text>
                                </View>
                              )}
                            </View>
                            
                            <View style={styles.resultActions}>
                              <Feather 
                                name={expandedAnalysisId === analysis.id ? "chevron-up" : "chevron-down"} 
                                size={14} 
                                color="#666" 
                              />
                            </View>
                          </View>
                          
                          <Text style={styles.resultMeta}>
                            {analysis.createdAt.toLocaleDateString('ja-JP')} • 
                            {analysis.metadata?.linkCount || 0}件分析
                          </Text>
                          
                          {/* Expanded Content */}
                          {expandedAnalysisId === analysis.id && (
                            <View style={styles.resultContent}>
                              {!isCurrent && (isProPlan || isTestAccount) && (
                                <TouchableOpacity
                                  style={styles.deleteButton}
                                  onPress={(e) => {
                                    e.stopPropagation();
                                    const analysisTitle = (() => {
                                      const titleMatch = analysis.result.match(/^## (.+?)について?$/m);
                                      if (titleMatch) {
                                        return titleMatch[1].trim();
                                      }
                                      if (analysis.title) {
                                        const aboutMatch = analysis.title.match(/^(.+?)について（\d+件分析）$/);
                                        if (aboutMatch) {
                                          return aboutMatch[1].trim();
                                        }
                                      }
                                      return '分析結果';
                                    })();
                                    handleDeleteAnalysis(analysis.id, analysisTitle);
                                  }}
                                  disabled={deletingAnalysisId === analysis.id}
                                >
                                  {deletingAnalysisId === analysis.id ? (
                                    <ActivityIndicator size="small" color="#FF6B6B" />
                                  ) : (
                                    <Feather name="trash-2" size={16} color="#888" />
                                  )}
                                </TouchableOpacity>
                              )}
                              
                              <View style={styles.resultText}>
                                {isAnalyzing ? 
                                  renderAnalyzingSkeleton('AI分析') :
                                  renderMarkdownContent(analysis.result)
                                }
                              </View>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            {/* Links Section Header */}
            <View style={styles.linksSectionHeader}>
              <Text style={styles.linksSectionTitle}>
                保存リンク ({tagLinks.length})
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          linksLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#8A2BE2" />
              <Text style={styles.loadingText}>読み込み中...</Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Feather name="link" size={48} color="#666" />
              <Text style={styles.emptyText}>このタグのリンクはありません</Text>
            </View>
          )
        }
      />

      {/* Options Menu Modal */}
      <Modal
        visible={showOptionsMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowOptionsMenu(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowOptionsMenu(false)}>
          <View style={styles.optionsOverlay}>
            <View style={styles.optionsMenu}>
              {/* <TouchableOpacity
                style={styles.optionItem}
                onPress={() => {
                  setShowOptionsMenu(false);
                  setShowMergeModal(true);
                }}
              >
                <Feather name="git-merge" size={20} color="#FFF" />
                <Text style={styles.optionText}>タグを統合</Text>
              </TouchableOpacity> */}
              
              <View style={styles.optionSeparator} />
              
              {/* AI分析確認設定 */}
              {/* <TouchableOpacity
                style={styles.optionItem}
                onPress={() => {
                  setShowOptionsMenu(false);
                  Alert.alert(
                    'AI分析確認設定',
                    `現在の設定: ${showAIAnalysisAlert ? 'アラート表示中' : 'アラート非表示'}\n\n設定を変更しますか？`,
                    [
                      { text: 'キャンセル', style: 'cancel' },
                      {
                        text: showAIAnalysisAlert ? 'アラートを無効化' : 'アラートを有効化',
                        style: 'default',
                        onPress: () => {
                          const newSetting = !showAIAnalysisAlert;
                          updateUserSettings(!newSetting); // hideAlert = !showAlert
                          
                          Alert.alert(
                            '設定変更完了',
                            newSetting 
                              ? 'AI分析確認アラートを有効化しました' 
                              : 'AI分析確認アラートを無効化しました'
                          );
                        }
                      }
                    ]
                  );
                }}
              >
                <Feather 
                  name={showAIAnalysisAlert ? "bell" : "bell-off"} 
                  size={20} 
                  color="#FFF" 
                />
                <Text style={styles.optionText}>
                  AI解説確認{showAIAnalysisAlert ? '無効化' : '有効化'}
                </Text>
              </TouchableOpacity> */}
              
              <TouchableOpacity
                style={styles.optionItem}
                onPress={() => {
                  setShowOptionsMenu(false);
                  Alert.alert(
                    'AI解説機能とは？',
                    'AI解説機能は、保存されたリンクの内容を分析し、指定されたテーマに基づいて包括的な解説を生成する機能です。\n\n主な特徴：\n• 指定のタグが付与された複数のリンクから関連情報を自動収集\n• AIによる解説生成\n\nGoogle Gemini AIを使用して、知識のインプットをお助けします。',
                    [{ text: 'OK', style: 'default' }]
                  );
                }}
              >
                <Feather name="help-circle" size={20} color="#FFF" />
                <Text style={styles.optionText}>AI解説機能とは？</Text>
              </TouchableOpacity>
              
              <View style={styles.optionSeparator} />
              
              <TouchableOpacity
                style={[styles.optionItem, styles.deleteOption]}
                onPress={() => {
                  setShowOptionsMenu(false);
                  handleDeleteTag();
                }}
              >
                <Feather name="trash-2" size={20} color="#FF6B6B" />
                <Text style={[styles.optionText, { color: '#FF6B6B' }]}>タグを削除</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Merge Modal */}
      {/* <Modal
        visible={showMergeModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowMergeModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>タグを統合</Text>
            <Text style={styles.modalDescription}>
              「{tag.name}」を他のタグに統合します。
              {'\n'}統合先のタグ名を入力してください。
            </Text>
            
            <TextInput
              style={styles.modalInput}
              value={mergeTargetTag}
              onChangeText={setMergeTargetTag}
              placeholder="統合先タグ名"
              placeholderTextColor="#666"
              autoFocus={true}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => {
                  setShowMergeModal(false);
                  setMergeTargetTag('');
                }}
              >
                <Text style={styles.modalCancelText}>キャンセル</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirmButton]}
                onPress={handleMergeTag}
                disabled={!mergeTargetTag.trim()}
              >
                <Text style={styles.modalConfirmText}>統合</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal> */}



      {/* Upgrade Modal (hidden for test accounts) */}
      {!isTestAccount && (
        <UpgradeModal
          visible={showUpgradeModal}
          onClose={() => setShowUpgradeModal(false)}
          currentPlan={currentPlan as 'free' | 'plus' | 'pro'}
          heroTitle={!canUseAI ? 
            "AI解説回数を\n増やしませんか？" : 
            "AIリンク内容まとめの文章を\n永続保存しよう"
          }
          heroDescription={!canUseAI ? 
            "今月の分析回数上限に達しました。\nプランをアップグレードしてもっと分析しましょう" :
            "Proプランなら分析結果が永続保存され、\nアプリを閉じてもいつでも確認できます"
          }
          sourceContext="ai_limit"
        />
      )}

      {/* Custom AI Analysis Confirmation Alert */}
      <Modal
        visible={showCustomAlert}
        transparent={true}
        animationType="fade"
        onRequestClose={handleCustomAlertCancel}
      >
        <View style={styles.customAlertOverlay}>
          <View style={styles.customAlertContent}>
            {/* Alert Title */}
            <Text style={styles.customAlertTitle}>AI解説を開始しますか？</Text>
            
            {/* Alert Message */}
            <Text style={styles.customAlertMessage}>
              「{alertTheme}」について、リンク内容を読み込んで詳細な分析を行います。{'\n\n'}この処理には数秒〜1分程度かかる場合があります。
            </Text>
            
            {/* Checkbox */}
            <TouchableOpacity 
              style={styles.customAlertCheckbox}
              onPress={() => setDontShowAgain(!dontShowAgain)}
              activeOpacity={0.7}
            >
              <View style={[
                styles.checkbox,
                dontShowAgain && styles.checkboxChecked
              ]}>
                {dontShowAgain && (
                  <Feather name="check" size={12} color="#FFFFFF" />
                )}
              </View>
              <Text style={styles.customAlertCheckboxText}>今後確認しない</Text>
            </TouchableOpacity>
            
            {/* Buttons */}
            <View style={styles.customAlertButtons}>
              <TouchableOpacity
                style={[styles.customAlertButton, styles.customAlertCancelButton]}
                onPress={handleCustomAlertCancel}
              >
                <Text style={styles.customAlertCancelText}>キャンセル</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.customAlertButton, styles.customAlertConfirmButton]}
                onPress={handleCustomAlertConfirm}
              >
                <Text style={styles.customAlertConfirmText}>分析開始</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      <Modalize
        ref={modalizeRef}
        adjustToContentHeight={false}
        modalHeight={Dimensions.get('window').height * 0.85}
        handleStyle={{ backgroundColor: '#444' }}
        handlePosition="inside"
        modalStyle={styles.themeModalContent}
        onClosed={() => {
          // モーダルが閉じられた時にテーマ生成履歴をリセット
          resetThemeGeneration();
        }}
        HeaderComponent={
          <View style={styles.themeModalHeader}>
            <TouchableOpacity
              style={styles.themeModalCloseButton}
              onPress={() => modalizeRef.current?.close()}
            >
              <Feather name="x" size={22} color="#999" />
            </TouchableOpacity>
            <Text style={styles.themeModalTitle}>解説テーマを選択</Text>
            <TouchableOpacity
              style={[
                styles.themeModalRegenerateButton,
                (loadingSuggestions || themeGenerationAttempts >= 3) && styles.themeModalRegenerateButtonDisabled
              ]}
              onPress={() => {
                generateSuggestionsInternal();
              }}
              disabled={loadingSuggestions || themeGenerationAttempts >= 3}
            >
              <Feather 
                name="refresh-cw" 
                size={16} 
                color={themeGenerationAttempts >= 3 ? "#666" : "#8A2BE2"} 
              />
              <Text style={[
                styles.themeModalRegenerateText,
                themeGenerationAttempts >= 3 && styles.themeModalRegenerateTextDisabled
              ]}>
                {themeGenerationAttempts >= 3 ? '生成済み' : '再生成'}
              </Text>
            </TouchableOpacity>

          </View>
        }
      >
        <ScrollView style={styles.themeModalScroll} showsVerticalScrollIndicator={false}>
          <View style={styles.themeModalInfo}>
            <Text style={styles.themeModalInfoText}>
              {tagLinks.length}件のリンクから生成されたテーマです。選択したテーマでAI解説を開始します。
            </Text>
            {themeGenerationAttempts >= 3 && (
              <View style={styles.themeModalLimitInfo}>
                <Feather name="info" size={14} color="#666" />
                <Text style={styles.themeModalLimitText}>
                  このタグから生成できる新しいテーマが出尽くしました。新しいリンクを追加すると、さらにテーマを生成できます。
                </Text>
              </View>
            )}
          </View>
          
          {loadingSuggestions ? (
            // ローディング状態の表示
            <View style={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
              paddingVertical: 60,
              paddingHorizontal: 20
            }}>
              <ActivityIndicator size="large" color="#8A2BE2" />
              <Text style={{
                fontSize: 16,
                fontWeight: '600',
                color: '#FFF',
                marginTop: 16,
                textAlign: 'center'
              }}>
                新しいテーマを生成中...
              </Text>
              <Text style={{
                fontSize: 13,
                color: '#999',
                marginTop: 8,
                textAlign: 'center',
                lineHeight: 18
              }}>
                リンクの内容を分析して最適なテーマを生成しています
              </Text>
            </View>
          ) : (
            // テーマリストの表示
            aiSuggestions.map((suggestion, index) => {
              const wasAnalyzed = analysisHistory.some(analysis => 
                analysis.suggestedTheme === suggestion.title && analysis.id !== 'analyzing-placeholder'
              );
              
              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.themeModalItem,
                    wasAnalyzed && styles.themeModalItemAnalyzed,
                    !canUseAI && styles.themeModalItemDisabled
                  ]}
                  onPress={() => {
                    modalizeRef.current?.close();
                    handleSuggestedAnalysis(suggestion.title);
                  }}
                  disabled={!canUseAI}
                >
                  <View style={styles.themeItemContent}>
                    <View style={styles.themeItemIcon}>
                      <Feather name="file-text" size={18} color="#8A2BE2" />
                    </View>
                    <View style={styles.themeItemTextContainer}>
                      <Text style={styles.themeModalItemTitle}>
                        {suggestion.title}
                      </Text>
                      <Text style={styles.themeModalItemDescription}>
                        {suggestion.description}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={20} color="#444" />
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
            </Modalize>
      
      {/* AI分析中断確認アラート */}
      <Modal
        visible={showExitConfirmAlert}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowExitConfirmAlert(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.exitConfirmHeader}>
              <Feather name="alert-triangle" size={24} color="#FF6B6B" />
              <Text style={styles.exitConfirmTitle}>ページを離れますか？</Text>
            </View>
            
            <Text style={styles.exitConfirmDescription}>
              AI分析「{currentAnalyzingTheme}」が実行中です。{'\n'}
              ページを離れると分析が中断されますが、使用回数はカウントされません。
            </Text>
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={cancelAIAnalysis}
              >
                <Text style={styles.modalCancelText}>ページを離れる</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirmButton]}
                onPress={continueAIAnalysis}
              >
                <Text style={styles.modalConfirmText}>このページに留まる</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* LinkDetailScreen Modal */}
      {selectedLink && (
        <Modal
          visible={showLinkDetail}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowLinkDetail(false)}
        >
          <LinkDetailScreen
            link={selectedLink}
            onClose={() => setShowLinkDetail(false)}
            onUpdateLink={async (linkId: string, updatedData: Partial<Link>) => {
              await updateLink(linkId, updatedData);
              setShowLinkDetail(false);
            }}
            userPlan={currentPlan}
            availableTags={tags.map(tag => ({ id: tag.id, name: tag.name }))}
            onCreateTag={handleAddTag}
            onDeleteTag={handleDeleteTagByName}
            onDelete={async () => {
              try {
                await deleteLink(selectedLink.id, user?.uid || '');
                setShowLinkDetail(false);
                setSelectedLink(null);
              } catch (error) {
                Alert.alert('エラー', 'リンクの削除に失敗しました');
              }
            }}
          />
        </Modal>
      )}
    </SafeAreaView>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
  },
  optionsButton: {
    padding: 8,
  },
  scrollContentContainer: {
    paddingBottom: 20,
  },
  tagInfoSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1A1A1A',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  tagHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tagIconContainer: {
    width: 40,
    height: 40,
    backgroundColor: '#2A2A2A',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  tagTextContainer: {
    flex: 1,
  },
  tagName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 4,
  },
  tagMeta: {
    fontSize: 12,
    color: '#888',
  },
  tagDescription: {
    fontSize: 12,
    color: '#AAA',
    lineHeight: 18,
    marginBottom: 12,
  },
  aiAnalysisButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8A2BE2',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  aiAnalysisButtonDisabled: {
    backgroundColor: '#444',
    opacity: 0.5,
  },
  aiButtonText: {
    fontSize: 13,
    color: '#FFF',
    fontWeight: '500',
  },

  analysisHistorySection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  analysisHistoryTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 12,
  },
  analysisItem: {
    backgroundColor: '#1A1A1A',
    borderRadius: 6,
    padding: 14,
    marginBottom: 12,
  },

  analysisHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  analysisLinkCount: {
    fontSize: 10,
    color: '#777',
    backgroundColor: '#333',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  analysisStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  analysisStatusText: {
    fontSize: 10,
    color: '#8A2BE2',
    fontWeight: '600',
    backgroundColor: 'rgba(138, 43, 226, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  analysisStatusTextSimple: {
    fontSize: 10,
    color: '#888',
    fontWeight: '500',
  },

  analysisResult: {
    fontSize: 14,
    color: '#E8E8E8',
    lineHeight: 20,
    marginBottom: 10,
  },
  analysisFooter: {
    borderTopWidth: 1,
    borderTopColor: '#2A2A2A',
    paddingTop: 8,
    marginTop: 4,
  },
  analysisStats: {
    fontSize: 9,
    color: '#666',
    textAlign: 'right',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#121212',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    color: '#666',
    fontSize: 16,
    marginTop: 12,
  },
  linkItemContainer: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#2A2A2A',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalDescription: {
    fontSize: 14,
    color: '#AAA',
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  modalInput: {
    backgroundColor: '#121212',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#FFF',
    borderWidth: 1,
    borderColor: '#333',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#666',
  },
  modalConfirmButton: {
    backgroundColor: '#8A2BE2',
  },
  modalCancelText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
  },
  modalConfirmText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Options menu styles
  optionsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 100,
    paddingRight: 16,
  },
  optionsMenu: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    paddingVertical: 8,
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  optionText: {
    fontSize: 16,
    color: '#FFF',
    fontWeight: '500',
  },
  optionSeparator: {
    height: 1,
    backgroundColor: '#333',
    marginHorizontal: 16,
  },
  deleteOption: {
    // Additional styling for delete option if needed
  },
  // Markdown content styles for better formatting
  analysisResultContainer: {
    paddingTop: 4,
  },
  lineBreak: {
    height: 8,
  },
  analysisH2: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
    marginTop: 16,
    marginBottom: 8,
    lineHeight: 24,
  },
  analysisBold: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E8E8E8',
    marginTop: 12,
    marginBottom: 6,
    lineHeight: 20,
  },
  bulletContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
    marginBottom: 4,
    paddingLeft: 8,
  },
  bulletPoint: {
    fontSize: 14,
    color: '#8A2BE2',
    marginRight: 8,
    marginTop: 2,
    fontWeight: '600',
  },
  bulletText: {
    fontSize: 14,
    color: '#D0D0D0',
    lineHeight: 20,
    flex: 1,
  },
  analysisLinkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 2,
  },
  analysisLink: {
    fontSize: 13,
    color: '#8A2BE2',
    lineHeight: 18,
    textDecorationLine: 'underline',
    flex: 1,
  },
  linkIcon: {
    marginLeft: 6,
  },
  divider: {
    height: 1,
    backgroundColor: '#333',
    marginVertical: 12,
  },
  analysisText: {
    fontSize: 14,
    color: '#E8E8E8',
    lineHeight: 20,
    marginTop: 2,
    marginBottom: 2,
  },
  // Saved Analysis & CTA styles
  savedAnalysisHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  proFeatureBadge: {
    fontSize: 10,
    color: '#8A2BE2',
    backgroundColor: 'rgba(138, 43, 226, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  loadingAnalysisContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  loadingAnalysisText: {
    fontSize: 12,
    color: '#888',
    marginLeft: 8,
  },
  savedAnalysisItem: {
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  noSavedAnalysisContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  noSavedAnalysisText: {
    fontSize: 13,
    color: '#777',
    fontStyle: 'italic',
  },
  ctaSection: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  ctaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(138, 43, 226, 0.06)',
    borderRadius: 6,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(138, 43, 226, 0.15)',
  },
  ctaTextContainer: {
    flex: 1,
    marginRight: 8,
  },
  ctaTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FFF',
    marginBottom: 2,
    lineHeight: 16,
  },
  ctaDescription: {
    fontSize: 10,
    color: '#BBB',
    lineHeight: 14,
  },
  ctaButton: {
    backgroundColor: '#8A2BE2',
    borderRadius: 8,
    paddingHorizontal: 24,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaButtonText: {
    fontSize: 11,
    color: '#FFF',
    fontWeight: '600',
  },
  // Refined AI Analysis Styles
  aiAnalysisSection: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 8,
  },
  aiSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  aiSectionTitleContainer: {
    flex: 1,
    paddingRight: 16,
  },
  aiSectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  usageBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  usageBadge: {
    backgroundColor: '#2A2A2A',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 50,
    alignItems: 'center',
  },
  usageBadgeLabel: {
    fontSize: 10,
    color: '#888',
    fontWeight: '500',
  },
  usageBadgeText: {
    fontSize: 10,
    color: '#CCCCCC',
    fontWeight: '600',
  },
  usageBadgeTest: {
    backgroundColor: '#FF6B35',
    borderWidth: 1,
    borderColor: '#FF8C69',
  },
  usageBadgeTextTest: {
    color: '#FFF',
    fontWeight: '600',
  },
  aiSectionDescription: {
    fontSize: 12,
    color: '#AAAAAA',
    lineHeight: 16,
    letterSpacing: -0.2,
  },

  suggestionsContainer: {
    // No specific styles needed
  },
  // Generate Button Styles
  generateButton: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },
  generateButtonDisabled: {
    borderColor: '#2A2A2A',
    opacity: 0.6,
  },
  generateButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  generateButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8A2BE2',
  },
  generateButtonHint: {
    fontSize: 10,
    color: '#777777',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 14,
  },
  
  // New Generate Button Styles (Redesigned)
  newGenerateButton: {
    backgroundColor: '#8A2BE2',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 4,
    marginVertical: 8,
    shadowColor: '#8A2BE2',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  newGenerateButtonDisabled: {
    backgroundColor: '#333',
    shadowOpacity: 0,
    elevation: 0,
  },
  newGenerateButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  newGenerateButtonIcon: {
    width: 36,
    height: 36,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  newGenerateButtonTextContainer: {
    flex: 1,
  },
  newGenerateButtonTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  newGenerateButtonSubtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 18,
  },
  // Loading Styles
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  loadingText: {
    fontSize: 12,
    color: '#888',
    marginLeft: 8,
  },

  // Themes Styles
  themesContainer: {
    // No specific styles needed
  },
  themesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  themesTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
  },
  themesList: {
    gap: 8,
  },
  themeItem: {
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  themeItemDisabled: {
    opacity: 0.5,
  },

  themeItemAnalyzed: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderColor: '#4CAF50',
  },
  themeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  themeTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
    flex: 1,
  },

  themeTitleAnalyzed: {
    color: '#4CAF50',
  },
  themeDescription: {
    fontSize: 11,
    color: '#AAA',
    lineHeight: 16,
  },
  themeDescriptionAnalyzed: {
    color: '#81C784',
  },
  // Skeleton Styles for Analyzing Placeholder
  analyzingSkeletonContainer: {
    paddingTop: 4,
  },
  skeletonTitle: {
    marginBottom: 16,
  },
  skeletonTitleText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
    lineHeight: 24,
  },
  skeletonSection: {
    marginBottom: 16,
  },
  skeletonSubtitle: {
    height: 14,
    backgroundColor: '#333',
    borderRadius: 3,
    marginBottom: 8,
    width: '30%',
  },
  skeletonLine: {
    height: 12,
    backgroundColor: '#2A2A2A',
    borderRadius: 2,
    marginBottom: 6,
  },
  skeletonBulletContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  skeletonBullet: {
    width: 4,
    height: 4,
    backgroundColor: '#444',
    borderRadius: 2,
  },
  analyzingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 12,
  },
  analyzingIndicatorText: {
    fontSize: 12,
    color: '#888',
    marginLeft: 8,
    fontStyle: 'italic',
  },


  regenerateButton: {
    padding: 6,
    borderRadius: 6,
  },
  regenerateButtonDisabled: {
    opacity: 0.5,
  },
  
  // Upgrade Prompt Button Styles
  upgradePromptButton: {
    backgroundColor: '#8A2BE2',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
  },
  upgradePromptButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  upgradePromptButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
  },
  upgradePromptButtonHint: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 14,
  },
  testFeatureBadge: {
    fontSize: 10,
    color: '#FF6B35',
    backgroundColor: 'rgba(255, 107, 53, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  currentAnalysisSection: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  currentAnalysisTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 12,
  },
  savedAnalysisSection: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  savedAnalysisHeaderInline: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  savedAnalysisHeaderTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  savedAnalysisThemeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  savedAnalysisTheme: {
    fontSize: 14,
    fontWeight: '400',
    color: '#E8E8E8',
    lineHeight: 18,
    flex: 1,
  },
  // Expanded Analysis Styles
  expandedAnalysisContent: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  expandedAnalysisMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  expandedAnalysisInfo: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  expandedAnalysisDate: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  expandedAnalysisLinkCount: {
    fontSize: 11,
    color: '#777',
  },
  expandedAnalysisResult: {
    paddingTop: 8,
  },
  // Show More Button Styles
  showMoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(138, 43, 226, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(138, 43, 226, 0.3)',
  },
  showMoreButtonText: {
    fontSize: 13,
    color: '#8A2BE2',
    fontWeight: '500',
    marginRight: 6,
  },
  // Unified Analysis Styles
  unifiedAnalysisSection: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  unifiedAnalysisHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  unifiedAnalysisHeaderTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  unifiedAnalysisItem: {
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  currentAnalysisItem: {
    borderColor: '#8A2BE2',
    backgroundColor: 'rgba(138, 43, 226, 0.05)',
  },
  analysisHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  currentAnalysisBadge: {
    backgroundColor: '#8A2BE2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  currentAnalysisBadgeText: {
    fontSize: 10,
    color: '#FFF',
    fontWeight: '600',
  },
  // Saved Analysis Modal Styles
  savedAnalysisModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  savedAnalysisModalContent: {
    backgroundColor: '#2A2A2A',
    borderRadius: 16,
    width: '90%',
    height: '80%',
    maxWidth: 500,
  },
  savedAnalysisModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  savedAnalysisModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFF',
  },
  savedAnalysisModalClose: {
    padding: 4,
  },
  savedAnalysisModalScroll: {
    flex: 1,
  },
  savedAnalysisModalMeta: {
    padding: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  savedAnalysisModalDate: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  savedAnalysisModalLinkCount: {
    fontSize: 11,
    color: '#777',
  },
  savedAnalysisModalResult: {
    padding: 20,
  },
  analysisHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deleteAnalysisButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.8,
    marginTop: 2,
  },
  deleteAnalysisButtonDisabled: {
    opacity: 0.3,
  },
  savedAnalysisModalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  savedAnalysisModalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  savedAnalysisModalButtonText: {
    fontSize: 16,
    color: '#FFF',
    fontWeight: '500',
  },
  customAlertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  customAlertContent: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  customAlertTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  customAlertMessage: {
    fontSize: 15,
    color: '#CCCCCC',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: -0.3,
  },
  customAlertCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    paddingVertical: 4,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: '#666666',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#8A2BE2',
    borderColor: '#8A2BE2',
  },
  customAlertCheckboxText: {
    fontSize: 15,
    color: '#CCCCCC',
    fontWeight: '500',
    letterSpacing: -0.3,
  },
  customAlertButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  customAlertButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customAlertCancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: '#444444',
  },
  customAlertConfirmButton: {
    backgroundColor: '#8A2BE2',
    shadowColor: '#8A2BE2',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  customAlertCancelText: {
    color: '#CCCCCC',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  customAlertConfirmText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  
  // AI分析中断確認アラート用スタイル
  exitConfirmHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    gap: 8,
  },
  exitConfirmTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FF6B6B',
    textAlign: 'center',
  },
  exitConfirmDescription: {
    fontSize: 14,
    color: '#AAA',
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
  },

  // New reorganized UI styles
  headerContainer: {
    backgroundColor: '#121212',
  },
  
  // Results Section - Collapsible secondary priority
  resultsSection: {
    backgroundColor: '#1A1A1A',
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  resultsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  resultsSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  resultsContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  
  // Result items - Clean and minimal
  resultItem: {
    backgroundColor: '#2A2A2A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  resultItemCurrent: {
    borderColor: '#8A2BE2',
    backgroundColor: '#2A2A3A',
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  resultTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  resultTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
    flex: 1,
  },
  currentBadge: {
    backgroundColor: '#8A2BE2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  currentBadgeText: {
    fontSize: 11,
    color: '#FFF',
    fontWeight: '600',
  },
  resultActions: {
    marginLeft: 12,
  },
  resultMeta: {
    fontSize: 12,
    color: '#888',
    // marginBottom: 12,
  },
  resultContent: {
    paddingTop: 12,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  deleteButton: {
    position: 'absolute',
    top: 16,
    right: 0,
    padding: 4,
    backgroundColor: '#333',
    borderRadius: 4,
    zIndex: 1000,
  },
  resultText: {
    paddingTop: 8,
  },
  
  // Links Section Header - Simple and clean
  linksSectionHeader: {
    paddingHorizontal: 16,
    paddingTop: 32,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
    marginTop: 16,
  },
  linksSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  
  // Theme Selection Modal Styles
  themeModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'flex-end',
  },
  themeModalContent: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    minHeight: '50%',
  },
  themeModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  themeModalTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  themeModalCloseButton: {
    padding: 8,
  },
  themeModalRegenerateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#333',
  },
  themeModalRegenerateText: {
    fontSize: 14,
    color: '#8A2BE2',
    fontWeight: '600',
  },
  themeModalRegenerateButtonDisabled: {
    opacity: 0.5,
  },
  themeModalRegenerateTextDisabled: {
    color: '#666',
  },
  themeModalScroll: {
    flex: 1,
  },
  themeModalInfo: {
    padding: 16,
    paddingBottom: 10,
  },
  themeModalInfoText: {
    fontSize: 13,
    color: '#999',
    lineHeight: 18,
    textAlign: 'center',
  },
  themeModalLimitInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 12,
    padding: 10,
    backgroundColor: 'rgba(102, 102, 102, 0.1)',
    borderRadius: 8,
  },
  themeModalLimitText: {
    fontSize: 12,
    color: '#666',
    lineHeight: 16,
    marginLeft: 6,
    flex: 1,
  },
  themeModalItem: {
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 12,
    backgroundColor: '#2A2A2A',
    borderWidth: 1,
    borderColor: '#333',
  },
  themeItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 16,
  },
  themeItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(138, 43, 226, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  themeItemTextContainer: {
    flex: 1,
  },
  themeModalItemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 4,
  },
  themeModalItemDescription: {
    fontSize: 13,
    color: '#999',
    lineHeight: 18,
  },
  themeModalItemAnalyzed: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderColor: 'rgba(76, 175, 80, 0.3)',
  },
  themeModalItemDisabled: {
    opacity: 0.5,
  },
}); 
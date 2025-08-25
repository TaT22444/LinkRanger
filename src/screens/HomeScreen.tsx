import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  FlatList,
  RefreshControl,
  Modal,
  ScrollView,
  Animated,
  TextInput,
  TouchableWithoutFeedback,
  Dimensions,
} from 'react-native';
import { PanGestureHandler, State, GestureHandlerRootView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { useUser } from '../hooks/useFirestore';
import { useLinks, useTags } from '../hooks/useFirestore';
import { Link, UserPlan, LinkViewMode, LinkStatus } from '../types';
import { LinkCard } from '../components/LinkCard';
import { FloatingActionButton } from '../components/FloatingActionButton';
import { TagFilter } from '../components/TagFilter';
import { ViewModeSelector } from '../components/ViewModeSelector';
import { TagGroupCard } from '../components/TagGroupCard';
import { AddLinkModal } from '../components/AddLinkModal';
import { AddTagModal } from '../components/AddTagModal';
import { SearchModal } from '../components/SearchModal';
import { LinkDetailScreen } from './LinkDetailScreen';
import { linkService, batchService } from '../services';
import { aiService } from '../services/aiService';
import { metadataService } from '../services/metadataService';
import { PlanService } from '../services/planService';
import { notificationService } from '../services/notificationService';
import { AIStatusMonitor } from '../components/AIStatusMonitor';
import { UpgradeModal } from '../components/UpgradeModal';
import { db } from '../config/firebase';
import { doc, getDoc } from 'firebase/firestore';


// 共有リンク用のデータ型
interface SharedLinkData {
  url: string;
  title?: string;
  source: 'deep-link';
}

export const HomeScreen: React.FC<{ sharedLinkData?: SharedLinkData | null }> = ({ sharedLinkData }) => {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { user: authUser, getUserEmail } = useAuth();
  // リアルタイムでユーザー情報を監視
  const { user: realtimeUser, loading: userLoading } = useUser(authUser?.uid || null);
  
  // リアルタイムユーザー情報を優先、なければ認証ユーザーを使用
  const user = realtimeUser || authUser;
  
  // 🔧 ダウングレード処理の実行フラグ（Hooksルールに従ってトップレベルで定義）
  const hasRunDowngradeRef = useRef(false);

  const [prefillUrl, setPrefillUrl] = useState<string>('');
  const lastHandledSharedUrlRef = useRef<string | null>(null);
  
  // 🚀 最適化されたHooksの使用
  
  const { links, loading, error, createLink, updateLink, deleteLink, hasMore, isLoadingMore, loadMore } = useLinks(user?.uid || null);
  const { tags: userTags, createOrGetTag, deleteTag: deleteTagById } = useTags(user?.uid || null);
  
  
  
  const [aiProcessingStatus, setAiProcessingStatus] = useState<{ [key: string]: number }>({});
  

  const { processingLinks, failedLinks, untaggedLinks } = useMemo(() => {
    const processing = links.filter(link => aiProcessingStatus[link.id] !== undefined);
    const failed: Link[] = []; // failedLinksを空にして「エラーが発生したリンク」セクションを非表示
    const untagged = links.filter(link => 
      (link.status === 'pending' || link.status === 'error') && 
      (!link.tagIds || link.tagIds.length === 0) &&
      aiProcessingStatus[link.id] === undefined
    );

    // 🔍 詳細なフィルタリングデバッグログ
    const filteredOutLinks = links.filter(link => {
      const statusMatch = link.status === 'pending' || link.status === 'error';
      const noTags = !link.tagIds || link.tagIds.length === 0;
      const notProcessing = aiProcessingStatus[link.id] === undefined;
      
      if (!statusMatch || !noTags || !notProcessing) {
        return {
          id: link.id,
          status: link.status,
          tagIds: link.tagIds?.length || 0,
          statusMatch,
          noTags,
          notProcessing,
          reason: !statusMatch ? 'status不適合' : !noTags ? 'タグあり' : '処理中'
        };
      }
      return null;
    }).filter(Boolean);



    return { processingLinks: processing, failedLinks: failed, untaggedLinks: untagged };
  }, [links, aiProcessingStatus]);
  
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddTagModal, setShowAddTagModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [selectedLink, setSelectedLink] = useState<Link | null>(null);
  
  // 削除中の状態管理
  const [deletingLinkIds, setDeletingLinkIds] = useState<Set<string>>(new Set());
  const [deletingTagIds, setDeletingTagIds] = useState<Set<string>>(new Set());
  
  // 共有リンクデータがある場合、AddLinkModalを自動で開く
    useEffect(() => {
      const incoming = sharedLinkData?.url;
      if (!incoming) return;
      let normalized = incoming;
      try {
        normalized = decodeURIComponent(incoming);
      } catch {}

      // すでに同じURLを処理していて、かつモーダルが開いているなら無視
      if (lastHandledSharedUrlRef.current === normalized && showAddModal) return;

      lastHandledSharedUrlRef.current = normalized;
      setPrefillUrl(normalized);
      setShowAddModal(true);
    }, [sharedLinkData?.url]); // URLの変化にのみ反応

  // ユーザー情報を監視してダウングレード処理を実行
  useEffect(() => {
    // 🔧 ダウングレード処理が必要で、まだ完了していない場合のみ実行
    if (user?.subscription?.downgradeTo && 
        user?.subscription?.downgradeEffectiveDate && 
        !user?.subscription?.downgradeCompletedAt) {
      
      console.log('🔍 Current user plan:', PlanService.getDisplayPlan(user));
      console.log('🔍 Plan debug info:', PlanService.getDebugInfo(user));
      
      // 🔧 無限ループ防止: 一度実行したらフラグを設定
      if (hasRunDowngradeRef.current) {
        console.log('🔄 ダウングレード処理は既に実行済み');
        return;
      }
      hasRunDowngradeRef.current = true;
      
      // ダウングレード検出とクリーンアップ実行
      const checkDowngrade = async () => {
        try {
          const result = await PlanService.checkAndApplyDowngrade(user);
          if (result.applied) {
            console.log('🔄 ダウングレード処理完了:', result);
            // データが削除された場合、リストを再取得
            if (result.deletedLinks > 0 || result.deletedTags > 0) {
              console.log('🔄 データが削除されたため、リストの再取得をトリガー');
              // 既存のHooksが自動的に再取得することを期待
            }
          }
        } catch (error) {
          console.error('❌ ダウングレードチェックエラー:', error);
        }
      };
      
      checkDowngrade();
    }
  }, [
    user?.subscription?.downgradeTo,
    user?.subscription?.downgradeEffectiveDate,
    user?.subscription?.downgradeCompletedAt // 🔧 完了時刻も監視
  ]);

  // 通知タップ時の処理を設定
  useEffect(() => {
    // 通知タップ時のコールバックを設定（一度だけ）
    notificationService.setNotificationTapCallback(async (linkId: string) => {
      console.log('🔗 HomeScreen: 通知タップ検出 - リンクID:', linkId);
      
      try {
        // リンクIDからリンクデータを検索
        let targetLink = links.find(link => link.id === linkId);
        
        if (targetLink) {
          console.log('✅ HomeScreen: リンクデータ発見 - タイトル:', targetLink.title);
          setSelectedLink(targetLink);
          setShowDetailModal(true);
        } else {
          console.log('⚠️ HomeScreen: リンクデータが見つかりません - ID:', linkId);
          // リンクが見つからない場合は、Firestoreから再取得を試行
          try {
            const linkDoc = await getDoc(doc(db, 'links', linkId));
            if (linkDoc.exists()) {
              const linkData = linkDoc.data();
              const fetchedLink = {
                id: linkDoc.id,
                title: linkData.title || '無題のリンク',
                url: linkData.url,
                userId: linkData.userId,
                status: linkData.status || 'pending',
                createdAt: linkData.createdAt?.toDate() || new Date(),
                updatedAt: linkData.updatedAt?.toDate() || new Date(),
                isRead: linkData.isRead || false,
                isArchived: linkData.isArchived || false,
                tagIds: linkData.tagIds || [],
                notificationsSent: linkData.notificationsSent || { unused3Days: false },
                expiresAt: linkData.expiresAt?.toDate(),
                isExpired: linkData.isExpired || false,
                error: linkData.error,
              } as Link;
              
              console.log('✅ HomeScreen: Firestoreからリンクデータ取得完了 - タイトル:', fetchedLink.title);
              setSelectedLink(fetchedLink);
              setShowDetailModal(true);
            } else {
              console.log('❌ HomeScreen: Firestoreにもリンクデータが存在しません - ID:', linkId);
              Alert.alert('エラー', '指定されたリンクが見つかりません');
            }
          } catch (fetchError) {
            console.error('❌ HomeScreen: Firestoreからのリンクデータ取得エラー:', fetchError);
            Alert.alert('エラー', 'リンクデータの取得に失敗しました');
          }
        }
      } catch (error) {
        console.error('❌ HomeScreen: 通知タップ処理エラー:', error);
        Alert.alert('エラー', '通知処理中にエラーが発生しました');
      }
    });

    console.log('📱 HomeScreen: 通知タップコールバック設定完了');
    
    // クリーンアップ関数
    return () => {
      // 必要に応じてコールバックをクリア
      console.log('📱 HomeScreen: 通知タップコールバッククリーンアップ');
    };
  }, []); // 依存配列を空にして一度だけ実行
  
  // インライン検索用の状態
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchMode, setIsSearchMode] = useState(false);

  // 表示モード関連の状態
  const [viewMode, setViewMode] = useState<LinkViewMode>('list');
  const [expandedTagIds, setExpandedTagIds] = useState<Set<string>>(new Set());
  
  // 🚀 段階的タグ表示用の状態
  const [visibleTagCount, setVisibleTagCount] = useState(8); // 初期表示タグ数
  const [isLoadingMoreTags, setIsLoadingMoreTags] = useState(false);
  
  // 🚀 タグモード切り替え時の初期展開設定
  useEffect(() => {
    if (viewMode === 'tag' && userTags.length > 0) {
      // 初期状態では全てのタグを閉じた状態にする
      setExpandedTagIds(new Set());
      // 段階的表示をリセット
      setVisibleTagCount(8);
    }
  }, [viewMode, userTags]);
  
  // 選択モード関連の状態
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedLinkIds, setSelectedLinkIds] = useState<Set<string>>(new Set());
  const [selectedTagIdsForDeletion, setSelectedTagIdsForDeletion] = useState<Set<string>>(new Set());
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeModalContext, setUpgradeModalContext] = useState<'link_limit' | 'tag_limit' | 'daily_limit' | 'account' | 'general'>('general');

  // スワイプジェスチャー用の状態
  const swipeGestureRef = useRef<PanGestureHandler>(null);
  const [isSwipeEnabled, setIsSwipeEnabled] = useState(true);
  const swipeTranslateX = useRef(new Animated.Value(0)).current;
  const lastScrollTime = useRef(0);
  const [isSwipeActive, setIsSwipeActive] = useState(false);


  // Animated Header
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerTranslateY = useRef(new Animated.Value(0)).current;
  const lastScrollY = useRef(0);
  const isAnimating = useRef(false); // アニメーション実行中フラグ
  const [staticHeaderHeight, setStaticHeaderHeight] = useState(0);
  const [dynamicHeaderHeight, setDynamicHeaderHeight] = useState(0);

  const listPaddingTop = isSearchMode ? dynamicHeaderHeight : 24;

  // ユーザープラン（PlanServiceを使用）
  const userPlan: UserPlan = PlanService.getEffectivePlan(user); // 機能制限用
  const displayPlan: UserPlan = PlanService.getDisplayPlan(user); // 表示用


  const handleAccountPress = () => {
    navigation.navigate('Account');
  };

  const handleAddLink = async (linkData: Partial<Link>) => {
    if (!user?.uid) return;
    
    // 🔧 1日リンク追加制限チェック
    try {
      const todayLinksAdded = await PlanService.getTodayLinksAddedCount(user.uid);
      if (!PlanService.canCreateLinkPerDay(user, todayLinksAdded)) {
        const limitMessage = PlanService.getLimitExceededMessage(user, 'linksPerDay');
        Alert.alert('1日の制限に達しました', limitMessage, [
          { text: 'キャンセル', style: 'cancel' },
          { text: 'プラン変更', onPress: () => {
            setUpgradeModalContext('daily_limit');
            setShowUpgradeModal(true);
          }}
        ]);
        return;
      }
    } catch (error) {
      console.error('❌ 1日制限チェックエラー:', error);
      // エラー時は制限チェックをスキップして続行
    }
    
    // プラン制限チェック
    const currentLinkCount = links.length;
    if (!PlanService.canCreateLink(user, currentLinkCount)) {
      const limitMessage = PlanService.getLimitExceededMessage(user, 'links');
      Alert.alert('制限に達しました', limitMessage, [
        { text: 'キャンセル', style: 'cancel' },
        { text: 'プラン変更', onPress: () => {
          setUpgradeModalContext('link_limit');
          setShowUpgradeModal(true);
        }}
      ]);
      return;
    }
    
    // ... (URL重複チェックのロジックは変更なし)
    if (linkData.url) {
      try {
        const existingLink = await linkService.findExistingLinkByUrl(user.uid, linkData.url);
        if (existingLink) {
          if (existingLink.isExpired) {
            await linkService.reviveExpiredLink(existingLink.id);
            Alert.alert('復活しました', '以前保存したリンクが見つかりました。新しい期限で復活させました。');
            return;
          } else {
            Alert.alert('すでに保存済み', 'このリンクはすでに保存されています。');
            return;
          }
        }
      } catch (error) {
        // エラーが発生しても新規作成は続行
      }
    }
    
    const fullLinkData = {
      ...linkData,
      userId: user.uid,
      status: 'pending', // 'processing' → 'pending' に修正（タグ制限時もuntaggedLinksに表示されるように）
      tagIds: [], // 🔧 重要: リンク作成時は常に空の配列（AI処理で後から設定される）
      isBookmarked: false,
      isArchived: false,
      priority: 'medium',
    } as Omit<Link, 'id' | 'createdAt' | 'updatedAt'>;
    
    try {
      const newLinkId = await createLink(fullLinkData);

      // 🔍 リンク作成後の状態確認ログ
      console.log('✅ handleAddLink: リンク作成完了', {
        linkId: newLinkId,
        status: fullLinkData.status,
        hasTagIds: !!(fullLinkData.tagIds?.length),
        totalLinks: links.length + 1 // 作成後の総リンク数
      });
      
      // 通知は3日間未読だった場合のみ発行するため、リンク作成時の即座通知は削除
      // const newLink = { ...fullLinkData, id: newLinkId } as Link;
      // await notificationService.scheduleUnusedLinkNotification(newLink);
      
      // 🚀 手動選択されたタグがある場合の処理
      const hasManualTags = (linkData.tagIds || []).length > 0;
      
      if (hasManualTags) {
        // 🔧 手動選択されたタグがある場合は、それらをリンクに設定
        console.log('🔧 handleAddLink: 手動選択されたタグを設定', { 
          linkId: newLinkId, 
          manualTagIds: linkData.tagIds,
          manualTagCount: linkData.tagIds?.length || 0
        });
        
        // 手動選択されたタグをリンクに設定
        await updateLink(newLinkId, { 
          tagIds: linkData.tagIds || [],
          status: 'completed' // 手動タグがある場合は完了状態
        });
        
        console.log('✅ handleAddLink: 手動タグ設定完了');
      } else {
        // AI処理を即座に実行（タグ制限チェックを早期に行う）
        console.log('🔄 handleAddLink: AI処理を開始', { linkId: newLinkId, hasTagIds: false });
        setTimeout(() => {
          processAITagging(newLinkId, fullLinkData);
        }, 100); // 500ms → 100ms に短縮（UI応答性向上）
      }

      // 🔧 今日のリンク追加数を増加
      try {
        await PlanService.incrementTodayLinksAdded(user.uid);
        console.log('✅ 今日のリンク追加数を増加完了');
      } catch (error) {
        console.error('❌ 今日のリンク追加数増加エラー:', error);
        // エラー時は処理を続行（統計のみの問題）
      }

      // 追加に成功したらモーダルは閉じ、入力をリセット
      setShowAddModal(false);
      setPrefillUrl('');
      lastHandledSharedUrlRef.current = null;
 

    } catch (error) {
      Alert.alert('エラー', 'リンクの保存に失敗しました');
    }
  };

  const processAITagging = async (linkId: string, linkData: Partial<Link>) => {
    if (!user?.uid) return;

    console.log('🔍 processAITagging: 開始', { linkId, hasTagIds: !!(linkData.tagIds?.length) });

    // 🔒 タグ制限の事前チェック（aiProcessingStatus設定前に実行）
    const currentTagCount = userTags.length;
    const maxTags = PlanService.getMaxTags(user);
    const canCreateNewTags = maxTags === -1 || currentTagCount < maxTags;
    
    if (!canCreateNewTags) {
      console.log('🚫 processAITagging: タグ制限に達しているためスキップ', {
        linkId,
        currentTagCount,
        maxTags,
        canCreateNewTags
      });

      Alert.alert(
        'タグ制限に達しました',
        'タグの保持上限に達しているため、AIタグ付けを実行できません。\n\n既存のタグを削除するか、プランをアップグレードしてください。',
        [
          { text: 'OK', style: 'default' },
          { 
            text: 'プランアップ', 
            onPress: () => {
              setUpgradeModalContext('tag_limit');
              setShowUpgradeModal(true);
            }
          }
        ]
      );
      
      // ⚠️ 重要: aiProcessingStatusには一切登録せずにreturn
      // これによりリンクは確実にuntaggedLinksに表示される
      console.log('📝 processAITagging: リンクはuntaggedLinksに表示される', { linkId });
      return;
    }

    // タグ制限チェック通過後にのみaiProcessingStatusに登録
    console.log('✅ processAITagging: タグ制限チェック通過、AI処理開始', { linkId });
    setAiProcessingStatus(prev => ({ ...prev, [linkId]: 0.1 }));

    try {
      setAiProcessingStatus(prev => ({ ...prev, [linkId]: 0.3 }));

      // 🚀 メタデータ取得（重複防止のため短時間のキャッシュを考慮）
      console.log('🔄 processAITagging: メタデータ取得開始', { url: linkData.url });
      const metadata = await metadataService.fetchMetadata(linkData.url || '', user.uid);
      console.log('📄 processAITagging: メタデータ取得完了', { 
        title: metadata.title?.slice(0, 50) + '...',
        hasDescription: !!metadata.description 
      });
      setAiProcessingStatus(prev => ({ ...prev, [linkId]: 0.6 }));

      const aiResponse = await aiService.generateEnhancedTags(
        metadata,
        user.uid,
        userPlan
      );
      setAiProcessingStatus(prev => ({ ...prev, [linkId]: 0.8 }));

      // 🔧 重要: finalTagIdsを空の配列で初期化（元のタグIDは使用しない）
      const finalTagIds: string[] = [];
      
      // 🔒 AI生成タグの事前制限チェック
      const newTagsToCreate: string[] = [];
      const existingTagsToAdd: string[] = [];
      
      // まず既存タグと新規作成が必要なタグを分類
      for (const tagName of aiResponse.tags) {
        const normalizedTagName = tagName.trim();
        const existingTag = userTags.find(t => t.name.trim().toLowerCase() === normalizedTagName.toLowerCase());
        
        if (existingTag) {
          // 既存タグは直接finalTagIdsに追加
          existingTagsToAdd.push(existingTag.id);
        } else {
          newTagsToCreate.push(normalizedTagName);
        }
      }
      
      // 🔒 新規タグ作成可能数をチェック
      const currentTagCount = userTags.length;
      const maxNewTags = Math.max(0, PlanService.getMaxTags(user) - currentTagCount);
      const canCreateTags = PlanService.getMaxTags(user) === -1 || maxNewTags >= newTagsToCreate.length;
      
      // 🔍 デバッグログ: タグ制限チェックの詳細
      console.log('🔍 AI生成タグ制限チェック:', {
        currentTagCount,
        maxTags: PlanService.getMaxTags(user),
        requestedNewTags: newTagsToCreate.length,
        maxNewTags,
        canCreateTags,
        existingTagsToAdd,
        newTagsToCreate
      });
      
      if (!canCreateTags && newTagsToCreate.length > 0) {
        console.warn('🚫 AI生成タグ制限超過:', {
          currentTags: currentTagCount,
          maxTags: PlanService.getMaxTags(user),
          requestedNewTags: newTagsToCreate.length,
          maxNewTags,
          limitedTags: newTagsToCreate.slice(0, maxNewTags)
        });
        
        // 🔔 ユーザーに部分制限を通知（一部タグは作成可能な場合のみ）
        if (maxNewTags > 0) {
          const skippedCount = newTagsToCreate.length - maxNewTags;
          Alert.alert(
            'タグ制限に達しました',
            `AI生成タグのうち${skippedCount}個が制限により作成できませんでした。\n\n作成可能な${maxNewTags}個のタグのみ保存します。`,
            [
              { text: 'OK', style: 'default' },
              { 
                text: 'プランアップ', 
                onPress: () => {
                  setUpgradeModalContext('tag_limit');
                  setShowUpgradeModal(true);
                }
              }
            ]
          );
          
          // 制限内のタグのみ作成
          newTagsToCreate.splice(maxNewTags);
        } else {
          // 1つもタグを作成できない場合は事前チェックで既に処理済み
          console.error('❌ This should not happen - no tags can be created but passed pre-check');
          return;
        }
      }
      
      // 既存タグを追加
      finalTagIds.push(...existingTagsToAdd);
      
      // 新規タグを作成
      for (const tagName of newTagsToCreate) {
        try {
          const newTagId = await handleAddTag(tagName, 'ai');
          if (newTagId && !finalTagIds.includes(newTagId)) {
            finalTagIds.push(newTagId);
          }
        } catch (error) {
          console.error('⚠️ AI生成タグ作成失敗:', { tagName, error });
          // タグ作成失敗は許容（制限チェック済みのため、別の理由での失敗）
        }
      }

      const updateData: Partial<Link> = {
        status: 'completed',
        tagIds: finalTagIds,
        aiAnalysis: {
          sentiment: 'neutral',
          category: 'General',
          keywords: aiResponse.tags,
          confidence: 0.8,
          fromCache: aiResponse.fromCache,
          tokensUsed: aiResponse.tokensUsed,
          cost: aiResponse.cost,
        },
      };

      await updateLink(linkId, updateData);
      
      // 🔍 最終的なタグIDの詳細ログ
      console.log('🎉 AIタグ付与完了:', { 
        linkId, 
        finalTagIds,
        finalTagIds詳細: finalTagIds.map(tagId => {
          const tag = userTags.find(t => t.id === tagId);
          return {
            tagId,
            tagName: tag?.name || 'タグが見つかりません',
            tagExists: !!tag
          };
        }),
        aiResponseTags: aiResponse.tags,
        existingTagsToAdd,
        newTagsToCreate,
        createdTagsCount: newTagsToCreate.length
      });
      
      // ... (Alert表示のロジックは変更なし)
      const userTagCount = (linkData.tagIds || []).length;
      const aiTagCount = finalTagIds.length - userTagCount;
      let message = `🤖 AI解説が完了しました！\n\n`;
      if (userTagCount > 0) message += `👤 ユーザー選択: ${userTagCount}個\n`;
      if (aiTagCount > 0) message += `🤖 AI生成: ${aiTagCount}個\n`;
      message += `\n📊 合計: ${finalTagIds.length}個のタグ\n\n`;
      message += `🏷️ 生成されたタグ: ${aiResponse.tags.join(', ')}\n\n`;
      if (aiResponse.fromCache) {
        message += '💾 キャッシュから取得';
      } else {
        message += `🔥 新規AI解説 (トークン: ${aiResponse.tokensUsed})`;
      }
      // Alert.alert('🎉 自動AI解説完了', message); // アラート削除

    } catch (error: any) {
      
      // エラーが発生してもerror状態にはせず、pending状態のまま維持
      // これにより「エラーが発生したリンク」ではなく「AIタグ付けを実行」に表示される
      
      const isQuotaError = error.message?.includes('quota') || error.code === 'resource-exhausted';
      const errorMessage = isQuotaError 
        ? 'AIタグ付けの月間上限に達しました。' 
        : 'AI自動タグ生成中にエラーが発生しました';

      // エラー状態には設定せず、pending状態のまま維持
      // await updateLink(linkId, { status: 'error', ... }); // コメントアウト
      
      if (!isQuotaError) {
        // エラーアラートも削除し、静かに失敗
        // Alert.alert('⚠️ AI処理エラー', '...'); // コメントアウト
      }
    } finally {


      // 処理が完了または失敗したら、進捗表示から削除
      setAiProcessingStatus(prev => {
        const newState = { ...prev };
        delete newState[linkId];
        return newState;
      });
    }
  };

  const handleExecuteAI = (linkId: string) => {
    const link = links.find(l => l.id === linkId);
    if (link) {
      processAITagging(linkId, link);
    }
  };

  const handleDismissUntagged = async (linkId: string) => {
    try {
      console.log('🔘 AIタグ付けをスキップします:', linkId);
      
      // リンクのstatusを'completed'に変更してuntaggedLinksから除外
      await updateLink(linkId, { 
        status: 'completed' as const,
        updatedAt: new Date()
      });
      
      console.log('✅ スキップ完了:', linkId);
      
      // 成功通知（控えめに）
      Alert.alert('完了', 'AIタグ付けをスキップしました');
    } catch (error) {
      console.error('❌ スキップに失敗しました:', error);
      Alert.alert(
        'エラー',
        'リンクのスキップに失敗しました。\n再度お試しください。',
        [{ text: 'OK' }]
      );
    }
  };

  const mockAiUsageCount = 8;
  const mockAiUsageLimit = 10;
  const canUseAI = mockAiUsageCount < mockAiUsageLimit;


  const handleDeleteLink = async (link: Link) => {
    Alert.alert(
      '削除確認',
      'このリンクを削除しますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingLinkIds(prev => new Set(prev).add(link.id));
              await deleteLink(link.id, user?.uid || '');
            } catch (error) {
              Alert.alert('エラー', 'リンクの削除に失敗しました');
            } finally {
              setDeletingLinkIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(link.id);
                return newSet;
              });
            }
          },
        },
      ]
    );
  };

  




  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      //
    } finally {
      setRefreshing(false);
    }
  };

  const filteredLinks = useMemo(() => {
    if (!links || !Array.isArray(links)) return [];
    
    let filtered = links;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(link => {
        if (link.title.toLowerCase().includes(query)) return true;
        if (link.description?.toLowerCase().includes(query)) return true;
        if (link.url.toLowerCase().includes(query)) return true;
        
        const linkTags = (link.tagIds || []).map(tagId => 
          userTags.find(tag => tag.id === tagId)?.name?.toLowerCase()
        ).filter(Boolean);
        
        return linkTags.some(tagName => tagName?.includes(query));
      });
    }

    if (selectedTagIds.length > 0) {
      filtered = filtered.filter(link => 
        selectedTagIds.some(selectedTagId => 
          link.tagIds?.includes(selectedTagId)
        )
      );
    }

    return filtered;
  }, [links, searchQuery, selectedTagIds, userTags]);



  const handleTagToggle = (tagId: string) => {
    setSelectedTagIds(prev => 
      prev.includes(tagId) 
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
  };

  const handleClearTags = () => {
    setSelectedTagIds([]);
  };


  const handleClearAll = () => {
    setSearchQuery('');
    setSelectedTagIds([]);
  };

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { 
      useNativeDriver: false,
      listener: (event: any) => {
        if (!isSearchMode) return;
        
        const currentScrollY = event.nativeEvent.contentOffset.y;
        const diff = currentScrollY - lastScrollY.current;

        lastScrollTime.current = Date.now();
        setIsSwipeEnabled(false);
        
        setTimeout(() => {
          if (Date.now() - lastScrollTime.current >= 150) {
            setIsSwipeEnabled(true);
          }
        }, 150);


        if (isAnimating.current) return;

        if (currentScrollY <= 0) {
          isAnimating.current = true;
          Animated.timing(headerTranslateY, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            isAnimating.current = false;
          });
        } else if (diff > 5 && currentScrollY > 50) {
          isAnimating.current = true;
          Animated.timing(headerTranslateY, {
            toValue: -dynamicHeaderHeight,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            isAnimating.current = false;
          });
        } else if (diff < -5) {
          isAnimating.current = true;
          Animated.timing(headerTranslateY, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            isAnimating.current = false;
          });
        }

        lastScrollY.current = currentScrollY;
      }
    }
  );

  const handleStaticHeaderLayout = (event: any) => {
    setStaticHeaderHeight(event.nativeEvent.layout.height);
  };

  const handleDynamicHeaderLayout = (event: any) => {
    setDynamicHeaderHeight(event.nativeEvent.layout.height);
  };

  const handleSearchTextChange = (text: string) => {
    setSearchQuery(text);
  };

  const getUserInitial = () => {
    return getUserEmail()?.charAt(0).toUpperCase() || 'U';
  };

  const handleAddTag = async (tagName: string, type: 'manual' | 'ai' | 'recommended' = 'manual') => {
    if (!user?.uid) return '';
    
    // プラン制限チェック
    const currentTagCount = userTags.length;
    if (!PlanService.canCreateTag(user, currentTagCount)) {
      const limitMessage = PlanService.getLimitExceededMessage(user, 'tags');
      
      // AI自動作成の場合はエラーをthrowして制限を通知
      if (type === 'ai') {
        const error = new Error(`制限エラー: ${limitMessage}`);
        error.name = 'PlanLimitError';
        throw error;
      }
      
      // 手動作成の場合は従来通りアラート表示
      Alert.alert('制限に達しました', limitMessage, [
        { text: 'キャンセル', style: 'cancel' },
        { text: 'プラン変更', onPress: () => {
          setUpgradeModalContext('tag_limit');
          setShowUpgradeModal(true);
        }}
      ]);
      return '';
    }
    
    try {
      const tagId = await createOrGetTag(tagName, type);
      return tagId;
    } catch (error) {
      // 制限エラーは再throw
      if (error instanceof Error && error.name === 'PlanLimitError') {
        throw error;
      }
      Alert.alert('エラー', 'タグの作成に失敗しました');
      throw error;
    }
  };

  const handleDeleteTag = async (tagId: string) => {
    if (!user?.uid) return;
    
    try {
      setDeletingTagIds(prev => new Set(prev).add(tagId));
      await deleteTagById(tagId);
    } catch (error) {
      Alert.alert('エラー', 'タグの削除に失敗しました');
    } finally {
      setDeletingTagIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(tagId);
        return newSet;
      });
    }
  };

  const handleDeleteTagByName = async (tagName: string) => {
    if (!user?.uid) return;
    
    const tag = userTags.find(t => t.name === tagName);
    if (tag) {
      await handleDeleteTag(tag.id);
    }
  };

  // 選択モード関連の関数
  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedLinkIds(new Set()); // 選択をクリア
    setSelectedTagIdsForDeletion(new Set()); // タグ選択もクリア
  };

  const toggleLinkSelection = (linkId: string) => {
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

  const selectAllLinks = () => {
    const allLinkIds = new Set(filteredLinks.map(link => link.id));
    setSelectedLinkIds(allLinkIds);
  };

  const clearSelection = () => {
    setSelectedLinkIds(new Set());
  };

  const toggleTagSelection = (tagId: string) => {
    setSelectedTagIdsForDeletion(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tagId)) {
        newSet.delete(tagId);
      } else {
        newSet.add(tagId);
      }
      return newSet;
    });
  };

  const selectAllTags = () => {
    if (viewMode === 'tag' && (groupedData as any).tagGroups) {
      const allTagIds = new Set((groupedData as any).tagGroups.map((group: any) => group?.tag.id).filter(Boolean) as string[]);
      setSelectedTagIdsForDeletion(allTagIds);
    }
  };

  // 追加: 安定したrenderItemを用意
  const renderTagGroupItem = React.useCallback(
    ({ item }: { item: { tag: any; links: Link[] } }) => {
      const { tag, links } = item;
      return (
        <TagGroupCard
          key={tag.id}
          tag={tag}
          links={links}
          isExpanded={expandedTagIds.has(tag.id)}
          onToggleExpanded={() => toggleTagExpansion(tag.id)}
          onPress={(link) => {
            if (isSwipeActive) return;
            if (isSelectionMode) {
              toggleLinkSelection(link.id);
            } else {
              setSelectedLink(link);
              setShowDetailModal(true);
            }
          }}
          onMarkAsRead={async (linkId: string) => {
            try { await linkService.markAsRead(linkId); } catch {}
          }}
          isSelectionMode={isSelectionMode}
          isSelected={selectedTagIdsForDeletion.has(tag.id)}
          onToggleSelection={() => toggleTagSelection(tag.id)}
          selectedLinkIds={selectedLinkIds}
          onToggleLinkSelection={toggleLinkSelection}
          isDeleting={deletingTagIds.has(tag.id)}
        />
      );
    },
    [
      expandedTagIds,
      isSwipeActive,
      isSelectionMode,
      selectedTagIdsForDeletion,
      selectedLinkIds,
      toggleLinkSelection,
    ]
  );

  const clearTagSelection = () => {
    setSelectedTagIdsForDeletion(new Set());
  };

  // 🚀 タグの追加読み込み関数
  const loadMoreTags = useCallback(() => {
    if (isLoadingMoreTags || visibleTagCount >= userTags.length) return;
    
    setIsLoadingMoreTags(true);
    
    // 次の8個のタグを追加表示
    setTimeout(() => {
      setVisibleTagCount(prev => Math.min(prev + 8, userTags.length));
      setIsLoadingMoreTags(false);
    }, 100); // 軽い遅延でスムーズな表示
  }, [isLoadingMoreTags, visibleTagCount, userTags.length]);

  // ViewModeHeader コンポーネント
  const renderViewModeHeader = () => {
    if (viewMode === 'folder') return null; // folderモードでは表示しない

    const getHeaderInfo = () => {
      if (viewMode === 'list') {
        return {
          label: 'リンク',
          count: links.length, // Firebaseに保存されている実際のリンク数
          items: filteredLinks
        };
      } else if (viewMode === 'tag') {
        // タグモードでの表示用データを計算
        return {
          label: 'タグ',
          count: userTags.length, // Firebaseに保存されている実際のタグ数
          items: filteredLinks
        };
      }
      return { label: '', count: 0, items: [] };
    };

    const { label, count } = getHeaderInfo();

    return (
      <View style={styles.viewModeHeaderContainer}>
        <View style={styles.viewModeHeader}>
          <View style={styles.viewModeHeaderLeft}>
            <Text style={styles.viewModeHeaderLabel}>{label}</Text>
            <Text style={styles.viewModeHeaderCount}>({count})</Text>
          </View>
          
          <View style={styles.viewModeHeaderRight}>
            {/* タグモード時のアクションボタン */}
            {viewMode === 'tag' && (
              <>
                <TouchableOpacity 
                  style={styles.tagActionButton}
                  onPress={() => {
                    setShowAddTagModal(true);
                  }}
                >
                  <Feather name="plus" size={16} color="#8A2BE2" />
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.tagActionButton}
                  onPress={() => {
                    // タグ結合機能（今後実装予定）
                    Alert.alert('タグ結合', 'タグ結合機能は近日公開予定です');
                  }}
                >
                  <Feather name="git-merge" size={16} color="#8A2BE2" />
                </TouchableOpacity>
              </>
            )}
            

            
            <TouchableOpacity 
              style={[
                styles.selectionButton,
                isSelectionMode && styles.selectionButtonActive
              ]}
              onPress={toggleSelectionMode}
            >
              <Text style={[
                styles.selectionButtonText,
                isSelectionMode && styles.selectionButtonTextActive
              ]}>
                {isSelectionMode ? 'キャンセル' : '選択'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        
        {/* 選択モード時の状態バー */}
        {isSelectionMode && (
          <View style={styles.selectionStatusBar}>
            <View style={styles.selectionStatusLeft}>
              <Text style={styles.selectionStatusText}>
                {viewMode === 'tag' 
                  ? `${selectedTagIdsForDeletion.size}件選択中`
                  : `${selectedLinkIds.size}件選択中`
                }
              </Text>
              {((viewMode === 'tag' && (groupedData as any).tagGroups && (groupedData as any).tagGroups.length > 0) ||
                (viewMode !== 'tag' && filteredLinks.length > 0)) && (
                <TouchableOpacity 
                  style={styles.selectAllButton}
                  onPress={() => {
                    if (viewMode === 'tag') {
                      const allTagsSelected = (groupedData as any).tagGroups?.length === selectedTagIdsForDeletion.size;
                      if (allTagsSelected) {
                        clearTagSelection();
                      } else {
                        selectAllTags();
                      }
                    } else {
                      const allLinksSelected = selectedLinkIds.size === filteredLinks.length;
                      if (allLinksSelected) {
                        clearSelection();
                      } else {
                        selectAllLinks();
                      }
                    }
                  }}
                >
                  <Text style={styles.selectAllButtonText}>
                    {viewMode === 'tag' 
                      ? ((groupedData as any).tagGroups?.length === selectedTagIdsForDeletion.size ? 'すべて解除' : 'すべて選択')
                      : (selectedLinkIds.size === filteredLinks.length ? 'すべて解除' : 'すべて選択')
                    }
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            
            <View style={styles.selectionActions}>
              <TouchableOpacity 
                style={[
                  styles.selectionActionButton,
                  ((viewMode === 'tag' && selectedTagIdsForDeletion.size === 0) ||
                   (viewMode !== 'tag' && selectedLinkIds.size === 0)) && styles.selectionActionButtonDisabled
                ]}
                onPress={() => {
                  if (viewMode === 'tag' && selectedTagIdsForDeletion.size > 0) {
                    Alert.alert(
                      'タグの削除',
                      `${selectedTagIdsForDeletion.size}件のタグを削除しますか？`,
                      [
                        { text: 'キャンセル', style: 'cancel' },
                        {
                          text: '削除',
                          style: 'destructive',
                          onPress: async () => {
                            const tagIdsArray = Array.from(selectedTagIdsForDeletion);
                            
                            try {
                              // 削除中の状態を設定
                              setDeletingTagIds(prev => {
                                const newSet = new Set(prev);
                                tagIdsArray.forEach(id => newSet.add(id));
                                return newSet;
                              });
                              
                              // タグの一括削除を実行
                              await batchService.bulkDeleteTags(tagIdsArray, user?.uid || '');
                              // 選択をクリア
                              setSelectedTagIdsForDeletion(new Set());
                              // 選択モードを終了
                              setIsSelectionMode(false);
                            } catch (error) {
                              Alert.alert('エラー', 'タグの削除に失敗しました');
                            } finally {
                              // 削除中の状態をクリア
                              setDeletingTagIds(prev => {
                                const newSet = new Set(prev);
                                tagIdsArray.forEach(id => newSet.delete(id));
                                return newSet;
                              });
                            }
                          }
                        }
                      ]
                    );
                  } else if (viewMode !== 'tag' && selectedLinkIds.size > 0) {
                    Alert.alert(
                      'リンクの削除',
                      `${selectedLinkIds.size}件のリンクを削除しますか？`,
                      [
                        { text: 'キャンセル', style: 'cancel' },
                        {
                          text: '削除',
                          style: 'destructive',
                          onPress: async () => {
                            const linkIdsArray = Array.from(selectedLinkIds);
                            
                            try {
                              // 削除中の状態を設定
                              setDeletingLinkIds(prev => {
                                const newSet = new Set(prev);
                                linkIdsArray.forEach(id => newSet.add(id));
                                return newSet;
                              });
                              
                              // リンクの一括削除を実行
                              await batchService.bulkDeleteLinks(linkIdsArray, user?.uid || '');
                              // 選択をクリア
                              setSelectedLinkIds(new Set());
                              // 選択モードを終了
                              setIsSelectionMode(false);
                            } catch (error) {
                              Alert.alert('エラー', 'リンクの削除に失敗しました');
                            } finally {
                              // 削除中の状態をクリア
                              setDeletingLinkIds(prev => {
                                const newSet = new Set(prev);
                                linkIdsArray.forEach(id => newSet.delete(id));
                                return newSet;
                              });
                            }
                          }
                        }
                      ]
                    );
                  }
                }}
                disabled={(viewMode === 'tag' && selectedTagIdsForDeletion.size === 0) ||
                         (viewMode !== 'tag' && selectedLinkIds.size === 0)}
              >
                <Feather 
                  name="trash-2" 
                  size={16} 
                  color={((viewMode === 'tag' && selectedTagIdsForDeletion.size === 0) ||
                          (viewMode !== 'tag' && selectedLinkIds.size === 0)) ? "#666" : "#FF6B6B"} 
                />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  const renderLinkItem = ({ item }: { item: Link }) => (
    <View style={styles.linkItem}>
      <LinkCard
        key={item.id}
        link={item}
        tags={userTags}
        onPress={() => {
          console.log('🔥 LinkCard tapped:', {
            linkId: item.id,
            title: item.title,
            isSwipeActive,
            isSelectionMode
          });
          
          // 実際にスワイプ中の場合はタップを無効化
          if (isSwipeActive) {
            console.log('🚫 Tap blocked by active swipe gesture');
            return;
          }
          
          if (isSelectionMode) {
            console.log('📝 Selection mode - toggling selection');
            toggleLinkSelection(item.id);
          } else {
            console.log('✅ Opening detail modal for link:', item.title);
            setSelectedLink(item);
            setShowDetailModal(true);
          }
        }}
        onToggleBookmark={() => {
          //
        }}
        onDelete={() => handleDeleteLink(item)}
        onMarkAsRead={async () => {
          try {
            await linkService.markAsRead(item.id);
          } catch (error) {
            //
          }
        }}
        isSelectionMode={isSelectionMode}
        isSelected={selectedLinkIds.has(item.id)}
        onToggleSelection={() => toggleLinkSelection(item.id)}
        isDeleting={deletingLinkIds.has(item.id)}
      />
    </View>
  );

  const toggleTagExpansion = (tagId: string) => {
    setExpandedTagIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(tagId)) {
        newSet.delete(tagId);
      } else {
        newSet.add(tagId);
      }
      return newSet;
    });
  };

  const modes: LinkViewMode[] = ['list', 'tag', 'folder'];
  
  const getNextMode = () => {
    const currentIndex = modes.indexOf(viewMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    return modes[nextIndex];
  };
  
  const getPrevMode = () => {
    const currentIndex = modes.indexOf(viewMode);
    const prevIndex = (currentIndex - 1 + modes.length) % modes.length;
    return modes[prevIndex];
  };
  
  const switchToNextMode = () => {
    setViewMode(getNextMode());
  };
  
  const switchToPrevMode = () => {
    setViewMode(getPrevMode());
  };

  const handleSwipeGesture = (event: any) => {
    const { translationX, velocityX, state } = event.nativeEvent;
    
    if (state === State.BEGAN) {
      // スワイプ開始時は一度リセットしておく
      setIsSwipeActive(false);
    }
    
    if (state === State.ACTIVE) {
      // 実際に移動が発生した場合のみスワイプ状態にする
      const minSwipeDistance = 10; // 最小スワイプ距離
      if (Math.abs(translationX) > minSwipeDistance) {
        setIsSwipeActive(true);
      }
      const dampedTranslation = translationX * 0.5;
      swipeTranslateX.setValue(dampedTranslation);
    }
    
    if (state === State.END) {
      const swipeThreshold = 100; // 閾値を上げてより明確なスワイプを要求
      const velocityThreshold = 600; // 速度閾値も上げる
      const shouldSwitch = Math.abs(translationX) > swipeThreshold || Math.abs(velocityX) > velocityThreshold;
      
      if (shouldSwitch) {
        if (translationX > 0 || velocityX > 0) switchToPrevMode();
        else switchToNextMode();
        
        swipeTranslateX.setValue(translationX > 0 ? -300 : 300);
        
        Animated.timing(swipeTranslateX, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }).start(() => {
          setIsSwipeActive(false);
          setIsSwipeEnabled(true);
        });
      } else {
        Animated.spring(swipeTranslateX, {
          toValue: 0,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }).start(() => {
          setIsSwipeActive(false);
          setIsSwipeEnabled(true);
        });
      }
      
      // 即座にスワイプ状態をリセット
      setIsSwipeActive(false);
      setIsSwipeEnabled(true);
    }
    
    if (state === State.CANCELLED || state === State.FAILED) {
      Animated.spring(swipeTranslateX, {
        toValue: 0,
        tension: 100,
        friction: 8,
        useNativeDriver: true,
      }).start(() => {
        setIsSwipeActive(false);
        setIsSwipeEnabled(true);
      });
      
      // 即座にスワイプ状態をリセット
      setIsSwipeActive(false);
      setIsSwipeEnabled(true);
    }
  };

  const renderMainContent = () => {
    if (viewMode === 'tag') {
      return (
        <FlatList
          style={styles.scrollView}
          contentContainerStyle={{ paddingTop: listPaddingTop, paddingBottom: 100 }}
          data={(groupedData as any).tagGroups ?? []}               // ← グループ配列をそのまま渡す
          keyExtractor={(item) => item.tag.id}
          renderItem={renderTagGroupItem}
          showsVerticalScrollIndicator={false}
          // 検索ヘッダなど
          ListHeaderComponent={renderViewModeHeader}
          // フッター（無限スクロール用のみ）
          ListFooterComponent={() => (
            <View style={styles.bottomSpacer}>
              {isLoadingMore && (
                <View style={styles.loadMoreContainer}>
                  <Text style={styles.loadMoreText}>さらに読み込み中...</Text>
                </View>
              )}
            </View>
          )}
          // パフォーマンス設定
          initialNumToRender={8}
          maxToRenderPerBatch={12}
          windowSize={21}
          updateCellsBatchingPeriod={16}
          removeClippedSubviews
          onEndReached={() => {
            // 🚀 タグ用の追加読み込み
            if (visibleTagCount < userTags.length && !isLoadingMoreTags) {
              loadMoreTags();
            }
          }}
          onEndReachedThreshold={0.3}
          // 検索時ヘッダのアニメ適用（必要なときだけ）
          onScroll={isSearchMode ? handleScroll : undefined}
          scrollEventThrottle={isSearchMode ? 8 : 16}
        />
      );
    }

    if (viewMode === 'folder') {
      return (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={{ paddingTop: listPaddingTop, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={8}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#8A2BE2" />}
        >
          {renderViewModeHeader()}
          <View style={styles.comingSoonContainer}>
            <Feather name="folder" size={48} color="#666" />
            <Text style={styles.comingSoonTitle}>フォルダ機能</Text>
            <Text style={styles.comingSoonText}>
              フォルダ機能は近日公開予定です。{'\n'}
              しばらくお待ちください。
            </Text>
          </View>
        </ScrollView>
      );
    }

    return (
      <FlatList
        style={styles.scrollView}
        contentContainerStyle={{ paddingTop: listPaddingTop, paddingBottom: 100 }}
        data={(groupedData as any).listLinks}
        keyExtractor={(item) => item.id}
        renderItem={renderLinkItem}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={8}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#8A2BE2" />}
        ListHeaderComponent={renderViewModeHeader}
        ListEmptyComponent={() => (
          <View style={styles.emptyStateContainer}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>読み込み中...</Text>
              </View>
            ) : error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
                  <Text style={styles.retryButtonText}>再試行</Text>
                </TouchableOpacity>
              </View>
            ) : (
              renderEmptyState()
            )}
          </View>
        )}
        ListFooterComponent={() => (
          <View style={styles.bottomSpacer}>
            {/* 🚀 無限スクロール用のローディングインジケーター */}
            {isLoadingMore && (
              <View style={styles.loadMoreContainer}>
                <Text style={styles.loadMoreText}>さらに読み込み中...</Text>
              </View>
            )}
          </View>
        )}
        onEndReached={() => {
          console.log('📚 FlatList: onEndReached triggered', { hasMore, isLoadingMore, loading });
          if (hasMore && !isLoadingMore && !loading) {
            loadMore();
          }
        }}
        onEndReachedThreshold={0.3}
        windowSize={10}
        removeClippedSubviews={true}
        maxToRenderPerBatch={10}
        initialNumToRender={10}
        updateCellsBatchingPeriod={50}
      />
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      {searchQuery.trim() ? (
        <>
          <Text style={styles.emptyStateTitle}>🔍 検索結果がありません</Text>
          <Text style={styles.emptyStateText}>
            {`「${searchQuery}」に一致するリンクが見つかりません。別のキーワードで検索してみてください。`}
          </Text>
        </>
      ) : selectedTagIds.length > 0 ? (
        <>
          <Text style={styles.emptyStateTitle}>🏷️ 該当するリンクがありません</Text>
          <Text style={styles.emptyStateText}>
            選択したタグに一致するリンクが見つかりません。{'\n'}
            フィルターをクリアして全てのリンクを表示してください。
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.emptyStateTitle}>📎 リンクがありません</Text>
          <Text style={styles.emptyStateText}>
            {`右下のボタンを押して最初のリンクを保存しましょう！`}
          </Text>
        </>
      )}
    </View>
  );

  // タグ別グループ化の最適化されたメモ化（段階的表示対応）
  const tagGroupData = useMemo(() => {
    if (viewMode !== 'tag') return null;
    
    // 🚀 全タグを事前にソート（リンク数順）
    const sortedTags = [...userTags].sort((a, b) => {
      // 各タグに付与されているリンク数を計算
      const aLinkCount = filteredLinks.filter(link => 
        link.tagIds && link.tagIds.includes(a.id)
      ).length;
      const bLinkCount = filteredLinks.filter(link => 
        link.tagIds && link.tagIds.includes(b.id)
      ).length;
      
      // リンク数の多い順、同じ場合は名前順
      if (bLinkCount !== aLinkCount) {
        return bLinkCount - aLinkCount;
      }
      return a.name.localeCompare(b.name);
    });
    
    // 🚀 段階的表示: ソート済みタグから表示中のタグのみ処理
    const visibleTags = sortedTags.slice(0, visibleTagCount);
    
    const tagGroups = new Map<string, Link[]>();
    const untaggedLinks: Link[] = [];
    
    // 表示中のタグのみ初期化
    visibleTags.forEach(tag => {
      tagGroups.set(tag.id, []);
    });
    
    // 表示中のタグのリンクのみ分類（大幅に軽量化）
    filteredLinks.forEach(link => {
      if (!link.tagIds || link.tagIds.length === 0) {
        untaggedLinks.push(link);
      } else {
        // 表示中のタグに属するリンクのみ処理
        const hasVisibleTag = link.tagIds.some(tagId => 
          visibleTags.some(t => t.id === tagId)
        );
        
        if (hasVisibleTag) {
          link.tagIds.forEach(tagId => {
            if (visibleTags.some(t => t.id === tagId)) {
              const tagLinks = tagGroups.get(tagId);
              if (tagLinks) {
                tagLinks.push(link);
              }
            }
          });
        }
      }
    });
    
    const tagGroupsArray = Array.from(tagGroups.entries())
      .map(([tagId, links]) => {
        const tag = userTags.find(t => t.id === tagId);
        return tag ? { tag, links } : null;
      })
      .filter(Boolean);
    
    // ソートは既に完了しているので、表示順序はそのまま
    return { tagGroups: tagGroupsArray, untaggedLinks };
  }, [viewMode, filteredLinks, userTags, visibleTagCount]); // visibleTagCountを依存に追加

  const groupedData = useMemo(() => {
    if (viewMode === 'folder') {
      const folderGroups: { folder: any; links: Link[] }[] = [];
      const unfolderLinks = filteredLinks.filter(link => !link.folderId);
      return { folderGroups, unfolderLinks };
    }
    
    if (viewMode === 'tag') {
      return tagGroupData || { tagGroups: [], untaggedLinks: [] };
    }
    
    return { listLinks: filteredLinks };
  }, [viewMode, filteredLinks, tagGroupData]);

  useEffect(() => {
    if (!isSearchMode) {
      headerTranslateY.setValue(0);
      isAnimating.current = false;
    }
  }, [isSearchMode]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <TouchableWithoutFeedback>
        <View style={styles.container}>
          {/* 固定ヘッダー */}
          <View style={styles.header} onLayout={handleStaticHeaderLayout}>
            {isSearchMode ? (
              <>
                <TouchableOpacity 
                  style={styles.searchCloseButton}
                  onPress={() => {
                    setSearchQuery('');
                    setSelectedTagIds([]);
                    setIsSearchMode(false);
                  }}
                >
                  <Feather name="x" size={20} color="#666" />
                </TouchableOpacity>
                <View style={styles.searchInputContainer}>
                  <TextInput
                    style={styles.headerSearchInput}
                    placeholder="リンクやタグを検索..."
                    placeholderTextColor="#666"
                    value={searchQuery}
                    onChangeText={handleSearchTextChange}
                    returnKeyType="search"
                    autoCapitalize="none"
                    autoCorrect={true}
                    autoComplete="off"
                    keyboardType="default"
                    autoFocus
                    clearButtonMode="while-editing"
                    onSubmitEditing={() => {
                      // 検索実行時にキーボードを隠す
                      if (searchQuery.trim()) {
                        // 既に filteredLinks で結果は表示される
                      }
                    }}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setSearchQuery('')}
                      style={styles.searchClearButton}
                    >
                      <Feather name="x-circle" size={16} color="#666" />
                    </TouchableOpacity>
                  )}
                </View>
              </>
            ) : (
              <>
                <TouchableOpacity 
                  style={styles.searchHeaderButton}
                  onPress={() => setIsSearchMode(true)}
                >
                  <Feather name="search" size={20} color="#8B5CF6" />
                </TouchableOpacity>
                <AIStatusMonitor 
                  processingLinks={processingLinks}
                  failedLinks={failedLinks}
                  untaggedLinks={untaggedLinks}
                  onRetry={processAITagging}
                  onExecuteAI={handleExecuteAI}
                  onDismissUntagged={handleDismissUntagged}
                  aiProcessingStatus={aiProcessingStatus}
                  canUseAI={canUseAI}
                  aiUsageCount={mockAiUsageCount}
                  aiUsageLimit={mockAiUsageLimit}
                />
                <TouchableOpacity style={styles.accountButton} onPress={handleAccountPress}>
                  {user?.avatarIcon ? (
                    <Text style={styles.avatarIcon}>{user.avatarIcon}</Text>
                  ) : (
                    <Text style={styles.accountText}>{getUserInitial()}</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* 動的ヘッダー */}
          <Animated.View 
            style={[
              styles.animatedHeaderContainer,
              { 
                top: staticHeaderHeight,
                transform: [{ translateY: headerTranslateY }] 
              }
            ]}
            onLayout={handleDynamicHeaderLayout}
          >
            {isSearchMode && (
              <View style={styles.searchSectionContainer}>
                <View style={styles.tagFilterSection}>
                  <TagFilter
                    tags={userTags.map(tag => tag.name)}
                    selectedTags={selectedTagIds.map(tagId => {
                      const tag = userTags.find(t => t.id === tagId);
                      return tag ? tag.name : '';
                    }).filter(Boolean)}
                    onTagToggle={(tagName: string) => {
                      const tag = userTags.find(t => t.name === tagName);
                      if (tag) handleTagToggle(tag.id);
                    }}
                    onClearAll={handleClearTags}
                    onAddTag={() => setShowAddTagModal(true)}
                  />
                </View>

                {(searchQuery.trim() || selectedTagIds.length > 0) && (
                  <View style={styles.searchStatusSection}>
                    <Text style={styles.searchStatusText}>
                      {searchQuery.trim() && selectedTagIds.length > 0 
                        ? `「${searchQuery}」で検索中 + ${selectedTagIds.length}個のタグでフィルタ中`
                        : searchQuery.trim() 
                        ? `「${searchQuery}」で検索中`
                        : `${selectedTagIds.length}個のタグでフィルタ中`
                      }
                    </Text>
                    <TouchableOpacity onPress={handleClearAll} style={styles.searchStatusClear}>
                      <Text style={styles.searchStatusClearText}>すべてクリア</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </Animated.View>

          {!isSearchMode && (
            <ViewModeSelector
              currentMode={viewMode}
              onModeChange={setViewMode}
            />
          )}

          <PanGestureHandler
            ref={swipeGestureRef}
            onGestureEvent={handleSwipeGesture}
            onHandlerStateChange={handleSwipeGesture}
            activeOffsetX={[-20, 20]}
            failOffsetY={[-80, 80]}
            shouldCancelWhenOutside={false}
            enabled={isSwipeEnabled && !isSearchMode}
          >
            <Animated.View 
              style={{ 
                flex: 1,
                transform: [{ translateX: swipeTranslateX }]
              }}
            >
              {renderMainContent()}
            </Animated.View>
          </PanGestureHandler>

          {isSelectionMode ? null : (
            <FloatingActionButton
              onPress={() => {
                setPrefillUrl('');      // 手動追加は空で開始
                setShowAddModal(true);
              }}
            />
          )}

          <AddLinkModal
            visible={showAddModal}
            onClose={() => {
              setShowAddModal(false);
              // 共有リンクデータをクリア
              setPrefillUrl('');
              // 同じURLをもう一度共有しても開けるように、ローカルの既処理記録はクリア
              lastHandledSharedUrlRef.current = null;
            }}
            onSubmit={handleAddLink}
            initialUrl={prefillUrl}
            userId={user?.uid}
            availableTags={userTags.map(tag => ({ id: tag.id, name: tag.name }))}
            onAddTag={handleAddTag}
            onDeleteTag={handleDeleteTagByName}
          />

          <AddTagModal
            visible={showAddTagModal}
            onClose={() => setShowAddTagModal(false)}
            availableTags={userTags.map(tag => ({ id: tag.id, name: tag.name }))}
            selectedTags={[]}
            onTagsChange={() => {
              // タグ作成完了時の処理
              // モーダルを閉じる（タグ作成が完了したため）
              setShowAddTagModal(false);
              // 手動でリフレッシュを実行してタグリストを更新
              handleRefresh();
            }}
            onCreateTag={handleAddTag}
            onDeleteTag={handleDeleteTagByName}
          />
          
          <SearchModal
            visible={showSearchModal}
            onClose={() => setShowSearchModal(false)}
            links={links || []}
            tags={userTags}
            onLinkPress={(link) => {
              setSelectedLink(link);
              setShowDetailModal(true);
            }}
          />

          {selectedLink && (
            <Modal
              visible={showDetailModal}
              animationType="slide"
              presentationStyle="pageSheet"
              onRequestClose={() => setShowDetailModal(false)}
            >
              <LinkDetailScreen
                link={selectedLink}
                onClose={() => setShowDetailModal(false)}
                onUpdateLink={async (linkId: string, updatedData: Partial<Link>) => {
                  await updateLink(linkId, updatedData);
                  setShowDetailModal(false);
                }}
                userPlan={userPlan}
                availableTags={userTags.map(tag => ({ id: tag.id, name: tag.name }))}
                onCreateTag={handleAddTag}
                onDeleteTag={handleDeleteTagByName}
                onDelete={async () => {
                  try {
                    await deleteLink(selectedLink.id, user?.uid || '');
                    setShowDetailModal(false);
                    setSelectedLink(null);
                  } catch (error) {
                    Alert.alert('エラー', 'リンクの削除に失敗しました');
                  }
                }}
              />
            </Modal>
          )}
          
          {/* UpgradeModal */}
          <UpgradeModal
            visible={showUpgradeModal}
            onClose={() => setShowUpgradeModal(false)}
            currentPlan={PlanService.getDisplayPlan(user)}
            heroTitle="リンクの保持数を増やそう！"
            heroDescription="Plusプランではリンクの保持数を50個まで増やせます"
            sourceContext={upgradeModalContext}
          />
        </View>
      </TouchableWithoutFeedback>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 72,
    paddingBottom: 16,
    marginBottom: 16,
    backgroundColor: '#121212',
    zIndex: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#CCC',
  },

  searchStatusSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
    marginHorizontal: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(81, 81, 82, 0.2)',
  },
  searchStatusText: {
    flex: 1,
    fontSize: 13,
    color: '#B794F6',
    fontWeight: '500',
  },
  searchStatusClear: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderRadius: 8,
  },
  searchStatusClearText: {
    color: '#E9D5FF',
    fontWeight: '700',
    fontSize: 12,
  },
  searchHeaderButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
    backgroundColor: '#1A1A1A',
  },
  searchCloseButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
    backgroundColor: '#1A1A1A',
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 44,
    marginLeft: 12,
  },
  headerSearchInput: {
    flex: 1,
    fontSize: 16,
    color: '#fff',
    paddingVertical: 0,
  },
  searchClearButton: {
    padding: 4,
    marginLeft: 8,
  },

  accountButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
    backgroundColor: '#1A1A1A',
  },
  accountText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#CCC',
  },
  avatarIcon: {
    fontSize: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#CCC',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#FFF',
    marginBottom: 20,
  },
  retryButton: {
    padding: 12,
    backgroundColor: '#00FFFF',
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#121212',
  },
  linkItem: {
    marginHorizontal: 16,
    marginBottom: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateTitle: {
    fontSize: 24,
    color: '#FFF',
    marginBottom: 15,
    textAlign: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: '#AAA',
    textAlign: 'center',
    lineHeight: 24,
  },
  emptyStateContainer: {
    flex: 1,
    minHeight: 300,
  },
  bottomSpacer: {
    height: 100,
  },
  loadMoreContainer: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  loadMoreText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  tagFilterSection: {
    //
  },
  searchSectionContainer: {
    backgroundColor: '#121212',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  animatedHeaderContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: '#121212',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 12,
    marginTop: 20,
    paddingLeft: 16,
  },
  comingSoonContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  comingSoonTitle: {
    fontSize: 24,
    color: '#FFF',
    marginBottom: 15,
    textAlign: 'center',
  },
  comingSoonText: {
    fontSize: 16,
    color: '#AAA',
    textAlign: 'center',
    lineHeight: 24,
  },
  viewModeHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
    backgroundColor: '#121212',
    zIndex: 15,
  },
  viewModeHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewModeHeaderLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#CCC',
  },
  viewModeHeaderCount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ccc',
    marginLeft: 8,
  },
  viewModeHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tagActionButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(138, 43, 226, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(138, 43, 226, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  selectionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#27272A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  selectionButtonActive: {
    backgroundColor: '#27272A',
    borderColor: '#333',
  },
  selectionButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#fff',
  },
  selectionButtonTextActive: {
    color: '#fff',
  },
  viewModeHeaderContainer: {
    marginBottom: 8,
  },
  selectionStatusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginBottom: 8,
    backgroundColor: '#121212',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  selectionStatusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectionStatusText: {
    fontSize: 12,
    color: '#fff',
    marginRight: 10,
  },
  selectAllButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#27272A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.3)',
  },
  selectAllButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8B5CF6',
  },
  selectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectionActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#27272A',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  selectionActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF6B6B',
    marginLeft: 5,
  },
  selectionActionButtonDisabled: {
    opacity: 0.5,
  },
  selectionActionTextDisabled: {
    color: '#666',
  },

});
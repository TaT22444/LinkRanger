import React, { useState, useCallback, useMemo, useEffect } from 'react';
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
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { useLinks, useTags } from '../hooks/useFirestore';
import { LinkCard } from '../components/LinkCard';
import { UpgradeModal } from '../components/UpgradeModal';
import { Link, Tag } from '../types';
import { linkService, savedAnalysisService } from '../services/firestoreService';
import { aiService, AnalysisSuggestion } from '../services/aiService';
import { metadataService } from '../services/metadataService';
import { SavedAnalysis } from '../types';

type TagDetailScreenRouteProp = RouteProp<{ TagDetail: { tag: Tag } }, 'TagDetail'>;

export const TagDetailScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const route = useRoute<TagDetailScreenRouteProp>();
  
  // Convert serialized dates back to Date objects
  const tag = useMemo(() => {
    const rawTag = route.params.tag;
    return {
      ...rawTag,
      createdAt: typeof rawTag.createdAt === 'string' ? new Date(rawTag.createdAt) : rawTag.createdAt,
      updatedAt: typeof rawTag.updatedAt === 'string' ? new Date(rawTag.updatedAt) : rawTag.updatedAt,
      lastUsedAt: typeof rawTag.lastUsedAt === 'string' ? new Date(rawTag.lastUsedAt) : rawTag.lastUsedAt,
      firstUsedAt: typeof rawTag.firstUsedAt === 'string' ? new Date(rawTag.firstUsedAt) : rawTag.firstUsedAt,
    } as Tag;
  }, [route.params.tag]);
  const { user } = useAuth();
  const { links, loading: linksLoading, updateLink, deleteLink } = useLinks(user?.uid || null);
  const { tags, deleteTag: deleteTagById, createOrGetTag, loading: tagsLoading } = useTags(user?.uid || null);

  // State management
  const [refreshing, setRefreshing] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeTargetTag, setMergeTargetTag] = useState('');
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiUsageCount, setAiUsageCount] = useState(0);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  
  // AI analysis history management
  interface AnalysisResult {
    id: string;
    timestamp: Date;
    selectedLinks: Link[];
    result: string;
    tokensUsed: number;
    cost: number;
    analysisType: 'suggested' | 'manual';
    suggestedTheme?: string;
  }
  const [analysisHistory, setAnalysisHistory] = useState<AnalysisResult[]>([]);
  
  // AI suggestions management
  const [aiSuggestions, setAiSuggestions] = useState<AnalysisSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [showManualSelection, setShowManualSelection] = useState(false);
  const [selectedLinkIds, setSelectedLinkIds] = useState<string[]>([]);
  const [analysisMode, setAnalysisMode] = useState<'suggestions' | 'manual'>('suggestions');
  
  // Saved analysis management (Pro plan only)
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([]);
  const [loadingSavedAnalyses, setLoadingSavedAnalyses] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const isProPlan = user?.subscription?.plan === 'pro' || user?.subscription?.plan === 'premium';
  const currentPlan = user?.subscription?.plan || 'free';

  // Filter links for this tag
  const tagLinks = useMemo(() => {
    return links.filter(link => link.tagIds.includes(tag.id));
  }, [links, tag.id]);

  // Available tags for merge (excluding current tag)
  const availableTagsForMerge = useMemo(() => {
    return tags.filter(t => t.id !== tag.id);
  }, [tags, tag.id]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    // Refresh is handled by the hooks automatically
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const handleLinkPress = (link: Link) => {
    // Navigate to link detail or handle link opening
    console.log('Link pressed:', link.title);
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
    const plan = user?.subscription?.plan || 'free';
    switch (plan) {
      case 'free':
        return 1;
      case 'standard':
        return 3;
      case 'pro':
        return 30;
      case 'premium':
        return 100;
      default:
        return 1;
    }
  }, [user?.subscription?.plan]);

  const canUseAI = useMemo(() => {
    return aiUsageCount < getAIUsageLimit();
  }, [aiUsageCount, getAIUsageLimit]);

  // Load saved analyses for Pro plan users
  useEffect(() => {
    if (isProPlan && user?.uid) {
      setLoadingSavedAnalyses(true);
      savedAnalysisService.getAnalysesByTag(user.uid, tag.id)
        .then(setSavedAnalyses)
        .catch(error => {
          console.error('Failed to load saved analyses:', error);
        })
        .finally(() => setLoadingSavedAnalyses(false));
    }
  }, [isProPlan, user?.uid, tag.id]);

  // Load AI analysis suggestions
  useEffect(() => {
    if (user?.uid && tagLinks.length > 0) {
      setLoadingSuggestions(true);
      const linkTitles = tagLinks.map(link => link.title);
      const userPlan = user.subscription?.plan || 'free';
      
      console.log('🔍 AI候補読み込み開始:', {
        tagName: tag.name,
        linkCount: tagLinks.length,
        linkTitles: linkTitles.slice(0, 3) // 最初の3つだけログ出力
      });

      aiService.generateSuggestions(tag.name, linkTitles, user.uid, userPlan)
        .then(response => {
          console.log('✅ AI候補読み込み完了:', {
            suggestionsCount: response.suggestions.length,
            cost: response.cost,
            tokensUsed: response.tokensUsed
          });
          setAiSuggestions(response.suggestions);
        })
        .catch(error => {
          console.error('❌ AI候補読み込み失敗:', error);
          // フォールバック候補を設定
          setAiSuggestions([
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
          ]);
        })
        .finally(() => setLoadingSuggestions(false));
    }
  }, [user?.uid, tag.name, tagLinks.length]);

  // Handle suggested analysis
  const handleSuggestedAnalysis = useCallback(async (suggestion: AnalysisSuggestion) => {
    if (!user?.uid || !canUseAI) return;
    
    console.log('🎯 AI提案分析開始:', {
      suggestionTitle: suggestion.title,
      keywords: suggestion.keywords
    });

    // AIが提案されたテーマに基づいて適切なリンクを選択
    const selectedLinks = selectLinksForSuggestedAnalysis(tagLinks, suggestion);
    await executeAIAnalysis(selectedLinks, 'suggested', suggestion.title);
  }, [user?.uid, canUseAI, tagLinks]);

  // Handle manual analysis
  const handleManualAnalysis = useCallback(async () => {
    if (!user?.uid || !canUseAI || selectedLinkIds.length === 0) return;
    
    const selectedLinks = tagLinks.filter(link => selectedLinkIds.includes(link.id));
    console.log('👆 手動選択分析開始:', {
      selectedCount: selectedLinks.length,
      selectedTitles: selectedLinks.map(l => l.title)
    });

    await executeAIAnalysis(selectedLinks, 'manual');
    setSelectedLinkIds([]); // 分析後にリセット
  }, [user?.uid, canUseAI, selectedLinkIds, tagLinks]);

  // Toggle link selection for manual mode
  const toggleLinkSelection = useCallback((linkId: string) => {
    setSelectedLinkIds(prev => {
      if (prev.includes(linkId)) {
        return prev.filter(id => id !== linkId);
      } else if (prev.length < 3) {
        return [...prev, linkId];
      }
      return prev;
    });
  }, []);

  // Select links for suggested analysis based on keywords
  const selectLinksForSuggestedAnalysis = useCallback((links: Link[], suggestion: AnalysisSuggestion): Link[] => {
    // キーワードベースでリンクを評価
    const scoredLinks = links.map(link => {
      let score = 0;
      const content = `${link.title} ${link.description || ''}`.toLowerCase();
      
      suggestion.keywords.forEach(keyword => {
        if (content.includes(keyword.toLowerCase())) {
          score += 10;
        }
      });
      
      // 最近のリンクにボーナス
      const daysSinceCreated = (Date.now() - link.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      score += Math.max(0, 5 - daysSinceCreated);
      
      // 説明文の長さでボーナス
      score += (link.description?.length || 0) * 0.01;
      
      return { link, score };
    });

    // スコアでソートして上位3つを選択
    return scoredLinks
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(item => item.link);
  }, []);

  // Execute AI analysis with selected links
  const executeAIAnalysis = useCallback(async (
    selectedLinks: Link[], 
    analysisType: 'suggested' | 'manual',
    suggestedTheme?: string
  ) => {
    const analysisStartTime = Date.now();
    setAiAnalyzing(true);
    
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
          linkCount: selectedLinks.length
        });
        return;
      }

      if (!canUseAI) {
        const plan = user.subscription?.plan || 'free';
        const limit = getAIUsageLimit();
        console.log('❌ AI分析中止: 使用制限に達しています', {
          plan,
          currentUsage: aiUsageCount,
          limit
        });
        Alert.alert(
          'AI分析の上限に達しました',
          `${plan}プランでは月${limit}回まで利用できます。プランをアップグレードして上限を増やすことができます。`
        );
        return;
      }

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
              const metadata = await metadataService.fetchMetadata(link.url, user.uid);
              return {
                ...link,
                enhancedMetadata: metadata
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

              // Create an improved analysis prompt for concise, integrated summaries
        const analysisPrompt = `以下の${selectedLinks.length}件のWebページ内容を統合的に分析し、「${tag.name}」について簡潔でわかりやすいまとめを作成してください。

【分析対象Webページ】
${analysisContext.map((link, index) => 
  `${index + 1}. 【${link.title}】
${link.description || '説明なし'}

主要内容: ${link.fullContent ? link.fullContent.slice(0, 1000).replace(/\s+/g, ' ') : 'コンテンツ取得失敗'}${link.fullContent && link.fullContent.length > 1000 ? '...' : ''}`
).join('\n\n')}

【出力形式の指示】
以下の形式で簡潔に統合的なまとめを作成してください：

## ${tag.name}について

**要点まとめ（3-4行）**
各ページの内容を統合し、最も重要なポイントを簡潔に説明

**主要な特徴・機能（3-4項目）**
• 
• 
• 

**活用方法・使い方（2-3項目）**
• 
• 

**注意点・ポイント（2項目）**
• 
• 

---
**参考リンク**
${analysisContext.map((link, index) => 
  `${index + 1}. [${link.title}](${link.url})`
).join('\n')}

【重要】冗長な説明は避け、統合的で実用的な情報のみを含めてください。`;

              const userPlan = user.subscription?.plan || 'free';
        const aiAnalysisStartTime = Date.now();
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

        // Format the AI response with minimal formatting
        const formattedResult = `${response.analysis}

---
分析対象: ${selectedLinks.length}件のWebページ
処理時間: ${new Date().toLocaleTimeString('ja-JP')}`;

        console.log('📝 整形済み分析結果:', {
          originalLength: response.analysis.length,
          formattedLength: formattedResult.length,
          formattedPreview: formattedResult.slice(0, 200) + '...'
        });

        // Add to analysis history
        const newAnalysis: AnalysisResult = {
          id: Date.now().toString(),
          timestamp: new Date(),
          selectedLinks,
          result: formattedResult,
          tokensUsed: response.tokensUsed,
          cost: response.cost,
          analysisType: 'manual' // TODO: 実際のモードに応じて変更
        };
        
        setAnalysisHistory(prev => [newAnalysis, ...prev]);
        setAiUsageCount(prev => prev + 1);

        // Save to database if Pro plan user
        if (isProPlan && user?.uid) {
          try {
            const savedAnalysisId = await savedAnalysisService.saveAnalysis(
              user.uid,
              tag.id,
              tag.name,
              `${tag.name}タグの深掘り分析（${selectedLinks.length}件対象）`,
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
            
            console.log('🔥 AI分析結果をProプラン特典として保存:', {
              savedAnalysisId,
              tagName: tag.name,
              linkCount: selectedLinks.length
            });

            // Refresh saved analyses list
            const updatedSavedAnalyses = await savedAnalysisService.getAnalysesByTag(user.uid, tag.id);
            setSavedAnalyses(updatedSavedAnalyses);
            
          } catch (saveError) {
            console.error('❌ AI分析結果の保存に失敗:', saveError);
            // 保存に失敗してもユーザーには表示はしない（メイン機能ではないため）
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
        const noResultMessage = `分析完了

選択されたリンクからは十分な分析情報を抽出できませんでした。より詳細なコンテンツを含むリンクを追加することをお勧めします。`;
        
        const newAnalysis: AnalysisResult = {
          id: Date.now().toString(),
          timestamp: new Date(),
          selectedLinks,
          result: noResultMessage,
          tokensUsed: response.tokensUsed,
          cost: response.cost,
          analysisType: 'manual' // TODO: 実際のモードに応じて変更
        };
        
        setAnalysisHistory(prev => [newAnalysis, ...prev]);
        setAiUsageCount(prev => prev + 1);
        console.log('⚠️ AI分析完了 - 情報不足（履歴に追加）:', {
          analysisId: newAnalysis.id,
          reason: 'insufficient_content',
          newUsageCount: aiUsageCount + 1
        });
      }
    } catch (error) {
      console.error('❌ AI分析エラー:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        tagName: tag.name,
        linkCount: tagLinks.length
      });
      const errorMessage = error instanceof Error ? error.message : 'AI分析に失敗しました';
      Alert.alert('エラー', `${errorMessage}\n\nしばらく時間をおいてから再度お試しください。`);
    } finally {
      setAiAnalyzing(false);
      const finalProcessingTime = Date.now() - analysisStartTime;
      console.log('🏁 AI分析処理終了:', {
        totalTime: `${finalProcessingTime}ms`,
        finalCost: `$${totalCost.toFixed(6)}`,
        status: 'completed'
      });
    }
  }, [user, tagLinks, tag.name, canUseAI, getAIUsageLimit]);

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  };

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
      // Bullet points (• text or - text)
      else if (trimmedLine.startsWith('• ') || trimmedLine.startsWith('- ')) {
        elements.push(
          <View key={key++} style={styles.bulletContainer}>
            <Text style={styles.bulletPoint}>•</Text>
            <Text style={styles.bulletText}>
              {trimmedLine.replace(/^[•-]\s/, '')}
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
            <Text key={key++} style={styles.analysisLink}>
              {number}. {title}
            </Text>
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
          <View>
            {/* AI Analysis Section */}
            <View style={styles.aiAnalysisSection}>
              <Text style={styles.aiSectionTitle}>AI分析</Text>
              <Text style={styles.aiSectionDescription}>
                リンクの内容を読み取り、学習のコツや実践的なtipsを提供します
              </Text>
              
              {/* Analysis Mode Toggle */}
              <View style={styles.analysisModeTabs}>
                <TouchableOpacity
                  style={[
                    styles.modeTab,
                    analysisMode === 'suggestions' && styles.modeTabActive
                  ]}
                  onPress={() => setAnalysisMode('suggestions')}
                >
                  <Text style={[
                    styles.modeTabText,
                    analysisMode === 'suggestions' && styles.modeTabTextActive
                  ]}>AI提案</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modeTab,
                    analysisMode === 'manual' && styles.modeTabActive
                  ]}
                  onPress={() => setAnalysisMode('manual')}
                >
                  <Text style={[
                    styles.modeTabText,
                    analysisMode === 'manual' && styles.modeTabTextActive
                  ]}>手動選択</Text>
                </TouchableOpacity>
              </View>

              {/* AI Suggestions Mode */}
              {analysisMode === 'suggestions' && (
                <View style={styles.suggestionsContainer}>
                  {loadingSuggestions ? (
                    <View style={styles.loadingSuggestionsContainer}>
                      <ActivityIndicator size="small" color="#8A2BE2" />
                      <Text style={styles.loadingSuggestionsText}>分析テーマを生成中...</Text>
                    </View>
                  ) : aiSuggestions.length > 0 ? (
                    <>
                      <Text style={styles.suggestionsLabel}>おすすめの分析テーマ</Text>
                      <View style={styles.suggestionsList}>
                        {aiSuggestions.map((suggestion, index) => (
                          <TouchableOpacity
                            key={index}
                            style={[
                              styles.suggestionButton,
                              (!canUseAI || aiAnalyzing) && styles.suggestionButtonDisabled
                            ]}
                            onPress={() => handleSuggestedAnalysis(suggestion)}
                            disabled={!canUseAI || aiAnalyzing}
                          >
                            <Text style={styles.suggestionTitle}>{suggestion.title}</Text>
                            <Text style={styles.suggestionDescription}>{suggestion.description}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  ) : (
                    <View style={styles.noSuggestionsContainer}>
                      <Text style={styles.noSuggestionsText}>
                        分析テーマを生成できませんでした
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Manual Selection Mode */}
              {analysisMode === 'manual' && (
                <View style={styles.manualSelectionContainer}>
                  <Text style={styles.manualSelectionLabel}>
                    分析するリンクを選択 (最大3つ)
                  </Text>
                  <View style={styles.linkSelectionList}>
                    {tagLinks.map((link) => (
                      <TouchableOpacity
                        key={link.id}
                        style={[
                          styles.linkSelectionItem,
                          selectedLinkIds.includes(link.id) && styles.linkSelectionItemSelected
                        ]}
                        onPress={() => toggleLinkSelection(link.id)}
                        disabled={!selectedLinkIds.includes(link.id) && selectedLinkIds.length >= 3}
                      >
                        <View style={[
                          styles.linkCheckbox,
                          selectedLinkIds.includes(link.id) && styles.linkCheckboxSelected
                        ]}>
                          {selectedLinkIds.includes(link.id) && (
                            <Feather name="check" size={12} color="#FFF" />
                          )}
                        </View>
                        <View style={styles.linkInfo}>
                          <Text style={styles.linkTitle} numberOfLines={2}>
                            {link.title}
                          </Text>
                          {link.description && (
                            <Text style={styles.linkDescription} numberOfLines={1}>
                              {link.description}
                            </Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                  
                  {selectedLinkIds.length > 0 && (
                    <TouchableOpacity
                      style={[
                        styles.manualAnalysisButton,
                        (!canUseAI || aiAnalyzing) && styles.manualAnalysisButtonDisabled
                      ]}
                      onPress={() => handleManualAnalysis()}
                      disabled={!canUseAI || aiAnalyzing}
                    >
                      {aiAnalyzing ? (
                        <>
                          <ActivityIndicator size="small" color="#FFF" />
                          <Text style={styles.manualAnalysisButtonText}>分析中...</Text>
                        </>
                      ) : (
                        <>
                          <Feather name="play" size={16} color="#FFF" />
                          <Text style={styles.manualAnalysisButtonText}>
                            選択したリンクを分析 ({selectedLinkIds.length})
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              )}

              <View style={styles.usageInfoContainer}>
                <Text style={styles.usageInfoText}>
                  今月の利用状況: {aiUsageCount}/{getAIUsageLimit()}回
                </Text>
              </View>
            </View>

            {/* Saved AI Analysis (Pro Plan) */}
            {isProPlan && (
              <View style={styles.analysisHistorySection}>
                <View style={styles.savedAnalysisHeader}>
                  <Text style={styles.analysisHistoryTitle}>保存されたAI分析</Text>
                  {savedAnalyses.length > 0 && (
                    <Text style={styles.proFeatureBadge}>PRO特典</Text>
                  )}
                </View>
                
                {loadingSavedAnalyses ? (
                  <View style={styles.loadingAnalysisContainer}>
                    <ActivityIndicator size="small" color="#8A2BE2" />
                    <Text style={styles.loadingAnalysisText}>読み込み中...</Text>
                  </View>
                ) : savedAnalyses.length > 0 ? (
                  savedAnalyses.map((analysis) => (
                    <View key={analysis.id} style={styles.savedAnalysisItem}>
                      <View style={styles.analysisHeader}>
                        <Text style={styles.analysisTimestamp}>
                          {analysis.createdAt.toLocaleDateString('ja-JP', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </Text>
                        <Text style={styles.analysisLinkCount}>
                          {analysis.metadata?.linkCount || 0}件分析
                        </Text>
                      </View>
                      <View style={styles.analysisResultContainer}>
                        {renderMarkdownContent(analysis.result)}
                      </View>
                      <View style={styles.analysisFooter}>
                        <Text style={styles.analysisStats}>
                          トークン: {analysis.tokensUsed} | コスト: ¥{analysis.cost.toFixed(2)} | 保存済み
                        </Text>
                      </View>
                    </View>
                  ))
                ) : (
                  <View style={styles.noSavedAnalysisContainer}>
                    <Text style={styles.noSavedAnalysisText}>
                      まだ保存されたAI分析がありません
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Non-Pro Plan CTA */}
            {!isProPlan && analysisHistory.length > 0 && (
              <View style={styles.ctaSection}>
                <View style={styles.ctaContainer}>
                  <View style={styles.ctaIconContainer}>
                    <Feather name="save" size={16} color="#8A2BE2" />
                  </View>
                  <View style={styles.ctaTextContainer}>
                    <Text style={styles.ctaTitle}>現在のプランでは、AIリンク内容まとめの文章は保存されません。</Text>
                    <Text style={styles.ctaDescription}>
                      Proプランなら分析結果を保存していつでも見返せます
                    </Text>
                  </View>
                  <TouchableOpacity 
                    style={styles.ctaButton} 
                    onPress={() => setShowUpgradeModal(true)}
                  >
                    <Text style={styles.ctaButtonText}>詳細</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Current Session AI Analysis History */}
            {analysisHistory.length > 0 && (
              <View style={styles.analysisHistorySection}>
                <Text style={styles.analysisHistoryTitle}>
                  {isProPlan ? 'このセッションの分析' : 'AI分析履歴'}
                </Text>
                {analysisHistory.map((analysis, index) => (
                  <View key={analysis.id} style={styles.analysisItem}>
                    <View style={styles.analysisHeader}>
                      <Text style={styles.analysisTimestamp}>
                        {analysis.timestamp.toLocaleDateString('ja-JP', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </Text>
                      <Text style={styles.analysisLinkCount}>
                        {analysis.selectedLinks.length}件分析
                      </Text>
                    </View>
                    <View style={styles.analysisResultContainer}>
                      {renderMarkdownContent(analysis.result)}
                    </View>
                    <View style={styles.analysisFooter}>
                      <Text style={styles.analysisStats}>
                        トークン: {analysis.tokensUsed} | コスト: ¥{analysis.cost.toFixed(2)}
                        {!isProPlan && ' | 一時的'}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Section Title */}
            <Text style={styles.sectionTitle}>リンク ({tagLinks.length})</Text>
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
              <TouchableOpacity
                style={styles.optionItem}
                onPress={() => {
                  setShowOptionsMenu(false);
                  setShowMergeModal(true);
                }}
              >
                <Feather name="git-merge" size={20} color="#FFF" />
                <Text style={styles.optionText}>タグを統合</Text>
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
      <Modal
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
      </Modal>

      {/* Upgrade Modal */}
      <UpgradeModal
        visible={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        currentPlan={currentPlan as 'free' | 'standard' | 'pro'}
        heroTitle="AIリンク内容まとめの文章を\n永続保存しよう"
        heroDescription="Proプランなら分析結果が永続保存され、\nアプリを閉じてもいつでも確認できます"
      />
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
  usageInfoContainer: {
    alignItems: 'flex-start',
  },
  usageInfoText: {
    fontSize: 10,
    color: '#666',
    fontWeight: '400',
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
    marginBottom: 10,
  },
  analysisTimestamp: {
    fontSize: 11,
    color: '#999',
    fontWeight: '400',
  },
  analysisLinkCount: {
    fontSize: 10,
    color: '#777',
    backgroundColor: '#333',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    color: '#888',
    fontSize: 14,
    marginTop: 12,
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
  analysisLink: {
    fontSize: 13,
    color: '#8A2BE2',
    marginTop: 2,
    marginBottom: 2,
    lineHeight: 18,
    textDecorationLine: 'underline',
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
    backgroundColor: 'rgba(138, 43, 226, 0.05)',
    borderLeftWidth: 3,
    borderLeftColor: '#8A2BE2',
    borderRadius: 6,
    padding: 14,
    marginBottom: 12,
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
    paddingVertical: 12,
  },
  ctaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(138, 43, 226, 0.08)',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(138, 43, 226, 0.2)',
  },
  ctaIconContainer: {
    width: 32,
    height: 32,
    backgroundColor: 'rgba(138, 43, 226, 0.15)',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  ctaTextContainer: {
    flex: 1,
  },
  ctaTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 2,
  },
  ctaDescription: {
    fontSize: 11,
    color: '#BBB',
    lineHeight: 16,
  },
  ctaButton: {
    backgroundColor: '#8A2BE2',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  ctaButtonText: {
    fontSize: 12,
    color: '#FFF',
    fontWeight: '600',
  },
  // New AI Analysis Styles
  aiAnalysisSection: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  aiSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 4,
  },
  aiSectionDescription: {
    fontSize: 12,
    color: '#AAA',
    marginBottom: 16,
    lineHeight: 18,
  },
  analysisModeTabs: {
    flexDirection: 'row',
    backgroundColor: '#2A2A2A',
    borderRadius: 8,
    padding: 2,
    marginBottom: 16,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  modeTabActive: {
    backgroundColor: '#8A2BE2',
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#AAA',
  },
  modeTabTextActive: {
    color: '#FFF',
  },
  suggestionsContainer: {
    marginBottom: 16,
  },
  loadingSuggestionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  loadingSuggestionsText: {
    fontSize: 12,
    color: '#888',
    marginLeft: 8,
  },
  suggestionsLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 8,
  },
  suggestionsList: {
    gap: 8,
  },
  suggestionButton: {
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  suggestionButtonDisabled: {
    opacity: 0.5,
  },
  suggestionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 2,
  },
  suggestionDescription: {
    fontSize: 11,
    color: '#AAA',
    lineHeight: 16,
  },
  noSuggestionsContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  noSuggestionsText: {
    fontSize: 12,
    color: '#777',
    fontStyle: 'italic',
  },
  manualSelectionContainer: {
    marginBottom: 16,
  },
  manualSelectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFF',
    marginBottom: 8,
  },
  linkSelectionList: {
    marginBottom: 12,
  },
  linkSelectionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#1A1A1A',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  linkSelectionItemSelected: {
    borderColor: '#8A2BE2',
    backgroundColor: 'rgba(138, 43, 226, 0.05)',
  },
  linkCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#666',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  linkCheckboxSelected: {
    backgroundColor: '#8A2BE2',
    borderColor: '#8A2BE2',
  },
  linkInfo: {
    flex: 1,
  },
  linkTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#FFF',
    marginBottom: 2,
  },
  linkDescription: {
    fontSize: 11,
    color: '#AAA',
  },
  manualAnalysisButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8A2BE2',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
    gap: 8,
  },
  manualAnalysisButtonDisabled: {
    backgroundColor: '#444',
    opacity: 0.5,
  },
  manualAnalysisButtonText: {
    fontSize: 13,
    color: '#FFF',
    fontWeight: '600',
  },
}); 
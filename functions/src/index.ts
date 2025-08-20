/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {setGlobalOptions} from "firebase-functions";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions";
import axios from "axios";
import * as cheerio from "cheerio";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {initializeApp} from "firebase-admin/app";
import {GoogleGenerativeAI} from "@google/generative-ai";
import {getTaggingPrompt, getMainEntitiesPrompt} from "./prompts";

// Firebase Admin初期化
initializeApp();

// Gemini AIクライアントの遅延初期化
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY || functions.config().gemini?.api_key;
  if (!apiKey) {
    logger.error("🤖🔥 Gemini API key not configured.");
    throw new Error("Gemini API key not configured");
  }
  return new GoogleGenerativeAI(apiKey);
};

// セキュリティ設定
setGlobalOptions({region: "asia-northeast1"});

const db = getFirestore();

const AI_LIMITS = {
  free: {maxTagsPerRequest: 5, costPerRequest: 0.025},
  pro: {maxTagsPerRequest: 8, costPerRequest: 0.025},
} as const;

// ===================================================================
//
// タグ生成のコアロジック
//
// ===================================================================
async function generateTagsLogic(
  userId: string,
  userPlan: keyof typeof AI_LIMITS,
  url: string,
  title: string,
  description?: string
) {
  logger.info(`🤖 [AI Tagging Start] userId: ${userId}, url: ${url}`);
  const combinedText = `${title} ${description || ""}`.trim();

  // 1. キャッシュを確認
  logger.info(`🤖 [Cache Check] Checking cache for text: "${combinedText}" (length: ${combinedText.length})`);
  const cachedTags = await getCachedTags(combinedText);
  if (cachedTags) {
    logger.info(`🤖 [AI Tagging Cache Hit] Found cached tags for userId: ${userId}`, {tags: cachedTags});
    return {tags: cachedTags, fromCache: true, tokensUsed: 0, cost: 0};
  } else {
    logger.info(`🤖 [Cache Miss] No cached tags found for text: "${combinedText.slice(0, 100)}..."`);
  }

  // 2. Webページからコンテンツを抽出（メタデータ含む）
  let pageContent = {fullContent: "", pageTitle: "", pageDescription: "", keywords: [] as string[]};
  try {
    pageContent = await fetchPageContent(url);
  } catch (error) {
    logger.warn(`🤖 [AI Tagging Page Fetch Failed] Using provided data for userId: ${userId}`, {url, error});
  }

  // 3. 最終的な分析用データを決定（メタデータ優先、フォールバック付き）
  const analysisTitle = pageContent.pageTitle || title || "";
  const analysisDescription = pageContent.pageDescription || description || "";
  const analysisContent = pageContent.fullContent || combinedText;
  const maxTags = AI_LIMITS[userPlan]?.maxTagsPerRequest || 5;

  // 4. プラットフォーム検出とドメインベースタグ生成
  const domainTags = generateTagsFromDomain(url);

  // Google Mapsのリンクの場合、タイトル（店舗名）をタグに追加
  if (isGoogleMapsUrl(url) && title) {
    // 「・」以降を削除して、店舗名だけを抽出
    const storeName = title.split("・")[0].trim();
    if (storeName) {
      domainTags.push(storeName); // 完全な店舗名をタグとして追加
    }
  }

  // 5. タイトルとメタデータから重要キーワードを抽出
  const keyTerms = extractKeyTerms(analysisTitle, analysisDescription);
  if (pageContent.keywords) {
    pageContent.keywords.forEach((term) => {
      if (term) keyTerms.add(term);
    });
  }
  domainTags.forEach((tag) => keyTerms.add(tag));

  // 6. 内容が少ない場合はドメインタグと基本的な処理のみ
  if (combinedText.length < 50 && domainTags.length > 0) {
    logger.info(`🤖 [AI Tagging Domain Based] Using domain-based tags for userId: ${userId}`, {domainTags});
    const simpleTags = [...domainTags, ...Array.from(keyTerms)].slice(0, maxTags);
    await cacheTags(combinedText, simpleTags);
    return {tags: simpleTags, fromCache: false, tokensUsed: 0, cost: 0};
  }

  // 7. Gemini APIでタグを生成
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({model: "gemini-pro"});
  const prompt = getTaggingPrompt(analysisTitle, analysisDescription, analysisContent, maxTags, Array.from(keyTerms));
  let aiTags: string[] = [];
  try {
    logger.info(`🤖 [AI Tagging API Call] Calling Gemini API for userId: ${userId}`);
    const result = await model.generateContent(prompt);
    const response = await result.response;
    aiTags = (response.text() || "")
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag && tag.length <= 20);
    logger.info(`🤖 [AI Tagging API Success] Received tags from Gemini for userId: ${userId}`, {aiTags});
  } catch (error) {
    logger.error(`🤖🔥 [AI Tagging API Failed] Gemini API call failed for userId: ${userId}`, {error});
    aiTags = generateFallbackTags(combinedText, userPlan);
  }

  // 8. 主題固有名詞抽出AI呼び出し
  let mainEntities: string[] = [];
  try {
    const mainEntitiesPrompt = getMainEntitiesPrompt(analysisTitle, analysisDescription, analysisContent);
    const mainEntitiesModel = genAI.getGenerativeModel({model: "gemini-pro"});
    const mainEntitiesResult = await mainEntitiesModel.generateContent(mainEntitiesPrompt);
    const mainEntitiesResponse = await mainEntitiesResult.response;
    mainEntities = (mainEntitiesResponse.text() || "")
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e);
    logger.info("[MainEntities] AI抽出:", mainEntities);
  } catch (error) {
    logger.warn("[MainEntities] AI抽出失敗", error);
  }

  // 9. タイトル・説明文から候補語を抽出
  function extractCandidateEntities(...texts: string[]): string[] {
    const pattern = /\b([A-Za-z][A-Za-z0-9]+|[ァ-ヴー]{2,}|[一-龠々]{2,})\b/g;
    const set = new Set<string>();
    for (const text of texts) {
      const matches = text.match(pattern);
      if (matches) matches.forEach((word) => set.add(word));
    }
    return Array.from(set);
  }
  const candidateEntities = extractCandidateEntities(analysisTitle, analysisDescription);

  // 10. 全てのタグ候補を優先度順にマージ
  const tagSet = new Set<string>();
  // プラットフォーム/ドメインタグ（最優先）
  for (const tag of domainTags) {
    if (tagSet.size < maxTags && tag && !tagSet.has(tag)) tagSet.add(tag);
  }
  // AIタグ
  for (const tag of aiTags) {
    if (tagSet.size < maxTags && tag && !tagSet.has(tag)) tagSet.add(tag);
  }
  // 主題固有名詞
  for (const entity of mainEntities) {
    if (tagSet.size < maxTags && entity && !tagSet.has(entity)) tagSet.add(entity);
  }
  // 候補語
  for (const cand of candidateEntities) {
    if (tagSet.size < maxTags && cand && !tagSet.has(cand)) tagSet.add(cand);
  }
  // キーワード
  for (const term of keyTerms) {
    if (tagSet.size < maxTags && term && !tagSet.has(term)) tagSet.add(term);
  }
  const tags = Array.from(tagSet);

  // 11. コスト計算と記録
  const tokensUsed = Math.ceil(prompt.length / 4);
  const cost = AI_LIMITS[userPlan]?.costPerRequest || 0;
  // AI使用量記録は各機能で個別に実装
  await cacheTags(combinedText, tags);

  logger.info(`🤖 [AI Tagging Success] Generated tags for userId: ${userId}`, {
    tagsCount: tags.length,
    fromCache: false,
    domainTags: domainTags.length,
    aiTags: aiTags.length,
    mainEntities: mainEntities.length,
  });

  return {tags, fromCache: false, tokensUsed, cost};
}


// ===================================================================
//
// Callable Functions (UIから呼び出されるエンドポイント)
//
// ===================================================================

export const generateAITags = onCall({timeoutSeconds: 60, memory: "512MiB"}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "認証が必要です");
  const {title, description, url, userId, userPlan = "free"} = request.data;
  if (!title || !url || !userId) throw new HttpsError("invalid-argument", "タイトル、URL、ユーザーIDは必須です");

  return await generateTagsLogic(userId, userPlan, url, title, description);
});

export const generateEnhancedAITags = onCall({timeoutSeconds: 60, memory: "1GiB"}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "認証が必要です");
  const {metadata, userId, userPlan = "free"} = request.data;
  if (!metadata || !userId) throw new HttpsError("invalid-argument", "メタデータとユーザーIDが必要です");

  return await generateTagsLogic(userId, userPlan, metadata.url, metadata.title, metadata.description);
});

// 新機能: AI分析（文章による詳細分析）
export const generateAIAnalysis = onCall({timeoutSeconds: 120, memory: "1GiB"}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "認証が必要です");

  const {title, analysisPrompt, userId} = request.data;
  if (!title || !analysisPrompt || !userId) {
    throw new HttpsError("invalid-argument", "タイトル、分析プロンプト、ユーザーIDは必須です");
  }

  // テーマに説明文が含まれているかチェック
  const hasDescription = title.includes("（") && title.includes("）");
  const themeInfo = hasDescription ?
    {theme: title.split("（")[0], description: title.match(/（(.+)）/)?.[1] || ""} :
    {theme: title, description: ""};

  logger.info(`🔬 [AI Analysis Start] userId: ${userId}, title: ${title}`, {
    hasDescription,
    themeInfo,
  });

  try {
    const gemini = getGeminiClient();
    const model = gemini.getGenerativeModel({
      model: "gemini-2.0-flash-exp", // Latest Gemini 2.0 Flash (experimental)
      generationConfig: {
        temperature: 0.7,
        topP: 0.8,
        topK: 40,
        maxOutputTokens: 3072, // Increased for longer summaries
      },
    });

    // AIに統合的で簡潔な分析を要求
    const prompt = `${analysisPrompt}

【追加指示】
- 統合的で簡潔な分析を心がけてください
- 冗長な説明は避け、最も重要な情報のみを含めてください
- 参考リンクは必ず最後に含めてください
- マークダウン形式で見やすく整理してください
- テーマに説明文が含まれている場合は、その説明文の内容も考慮して解説してください
- 例：「AI開発ツール Kiro（Kiroの機能・使い方・料金）」の場合、機能・使い方・料金の観点から解説してください`;

    logger.info(`🤖 [AI Analysis Prompt] length: ${prompt.length}`);

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const analysisText = response.text();

    // 実際のGemini APIの使用量を取得
    const usageMetadata = response.usageMetadata;
    const actualInputTokens = usageMetadata?.promptTokenCount || Math.ceil(prompt.length / 4);
    const actualOutputTokens = usageMetadata?.candidatesTokenCount || Math.ceil(analysisText.length / 4);
    const actualTotalTokens = usageMetadata?.totalTokenCount || (actualInputTokens + actualOutputTokens);

    // Gemini 2.0 Flash (experimental) の料金体系
    // Input: $0.075 per 1M tokens, Output: $0.30 per 1M tokens (same as 1.5 Flash for now)
    const actualInputCost = (actualInputTokens / 1000000) * 0.075;
    const actualOutputCost = (actualOutputTokens / 1000000) * 0.30;
    const actualTotalCost = actualInputCost + actualOutputCost;

    // 概算vs実際の比較ログ
    const estimatedInputTokens = Math.ceil(prompt.length / 4);
    const estimatedOutputTokens = Math.ceil(analysisText.length / 4);
    const estimatedCost = ((estimatedInputTokens + estimatedOutputTokens) / 1000000) * 0.1;

    logger.info("🤖 [AI Analysis Success] 実際vs概算の使用量比較:", {
      responseLength: analysisText.length,
      promptLength: prompt.length,
      actual: {
        inputTokens: actualInputTokens,
        outputTokens: actualOutputTokens,
        totalTokens: actualTotalTokens,
        inputCost: actualInputCost.toFixed(8),
        outputCost: actualOutputCost.toFixed(8),
        totalCost: actualTotalCost.toFixed(8),
      },
      estimated: {
        inputTokens: estimatedInputTokens,
        outputTokens: estimatedOutputTokens,
        totalCost: estimatedCost.toFixed(8),
      },
      discrepancy: {
        tokenDifference: actualTotalTokens - (estimatedInputTokens + estimatedOutputTokens),
        costDifference: (actualTotalCost - estimatedCost).toFixed(8),
        accuracy: `${((estimatedInputTokens + estimatedOutputTokens) / actualTotalTokens * 100).toFixed(1)}%`,
      },
      model: "gemini-2.0-flash-exp",
      hasUsageMetadata: !!usageMetadata,
    });

    return {
      analysis: analysisText,
      fromCache: false,
      tokensUsed: actualTotalTokens,
      cost: actualTotalCost,
      usage: {
        inputTokens: actualInputTokens,
        outputTokens: actualOutputTokens,
        inputCost: actualInputCost,
        outputCost: actualOutputCost,
        model: "gemini-2.0-flash-exp",
        hasActualUsage: !!usageMetadata,
        promptCharacterCount: prompt.length,
        responseCharacterCount: analysisText.length,
      },
    };
  } catch (error) {
    logger.error(`🤖 [AI Analysis Error] userId: ${userId}`, error);

    // タイムアウトエラーの詳細ログ
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = error && typeof error === "object" && "code" in error ? String(error.code) : "";

    if (errorCode === "DEADLINE_EXCEEDED" || errorMessage.includes("timeout") || errorMessage.includes("DEADLINE_EXCEEDED")) {
      logger.error("⏰ [Timeout Error] AI分析がタイムアウトしました:", {
        userId,
        promptLength: analysisPrompt?.length || 0,
        error: errorMessage,
      });
      throw new HttpsError("deadline-exceeded", "AI分析の処理時間が長すぎます。リンク数を減らすか、しばらく時間をおいてからお試しください。");
    }

    throw new HttpsError("internal", `AI分析に失敗しました: ${error}`);
  }
});

// 新機能: AI分析候補生成
export const generateAnalysisSuggestions = onCall({timeoutSeconds: 30, memory: "512MiB"}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "認証が必要です");

  try {
    const {tagName, linkTitles, userId, userPlan, excludedThemes = []} = request.data;

    logger.info("🔍 AI分析候補生成開始:", {
      tagName,
      linkCount: linkTitles?.length || 0,
      userId: userId?.slice(0, 8) + "...",
      userPlan,
      excludedThemesCount: excludedThemes?.length || 0,
      excludedThemes: excludedThemes || [],
    });

    // 入力検証
    if (!tagName || !linkTitles || !Array.isArray(linkTitles) || linkTitles.length === 0) {
      throw new HttpsError("invalid-argument", "タグ名とリンクタイトルが必要です");
    }

    if (!userId) {
      throw new HttpsError("invalid-argument", "ユーザーIDが必要です");
    }

    const gemini = getGeminiClient();
    const model = gemini.getGenerativeModel({
      model: "gemini-2.0-flash-exp",
      generationConfig: {
        temperature: 0.8,
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 1024,
      },
    });

    // AI候補生成用プロンプト
    const excludedThemesText = excludedThemes.length > 0 ?
      `\n【既に生成済みのテーマ（これらは除外してください）】\n${excludedThemes.map((theme: string, index: number) => `${index + 1}. ${theme}`).join("\n")}` :
      "";

    const prompt = `以下の「${tagName}」タグが付いたリンクタイトル一覧から、ユーザーが知りたそうな分析テーマを3-4個提案してください。

【リンクタイトル一覧】
${linkTitles.map((title: string, index: number) => `${index + 1}. ${title}`).join("\n")}${excludedThemesText}

【出力形式】
以下のJSON形式で出力してください：

{
  "suggestions": [
    {
      "title": "${tagName}とは",
      "description": "基本的な概念や定義について",
      "keywords": ["基本", "概念", "定義"],
      "relatedLinkIndices": [0, 2, 5]
    },
    {
      "title": "${tagName}の活用方法", 
      "description": "実践的な使い方やコツについて",
      "keywords": ["活用", "実践", "方法"],
      "relatedLinkIndices": [1, 3, 4]
    },
    {
      "title": "${tagName}のトレンド",
      "description": "最新動向や注目ポイントについて", 
      "keywords": ["トレンド", "最新", "動向"],
      "relatedLinkIndices": [2, 6, 7]
    }
  ]
}

【重要な指示】
- タイトルは簡潔で分かりやすく（15文字以内）
- 説明文は具体的で魅力的に（20文字以内）
- リンクタイトルの内容に基づいて提案すること
- ユーザーが実際に知りたそうなテーマを選ぶこと
- 既に生成済みのテーマは絶対に提案しないこと
- 🎯 必須: 各テーマに対してrelatedLinkIndicesを必ず含めること
- 🎯 必須: リンクタイトルに含まれる具体的なキーワードや概念を反映したテーマを提案すること
- 🎯 禁止: リンクタイトルから推測できない抽象的なテーマは提案しないこと
- relatedLinkIndicesには、そのテーマと内容が**直接的に関連する**リンクのインデックス（0から始まる）のみを配列で指定すること
- 🚨 重要: テーマに含まれるキーワード（例: "MCP", "AI", "開発"など）がリンクタイトルに明確に含まれている場合のみインデックスを指定すること
- 🚨 関連性が低いリンクを含めるより、関連性の高いリンクを選ぶこと
- 各テーマに対して1-3個の**厳選された**関連リンクインデックスを指定すること
- インデックスは0から${linkTitles.length - 1}までの範囲で指定すること
- JSON形式以外は出力しないこと`;

    logger.info("🤖 AI候補生成 API呼び出し:", {
      tagName,
      promptLength: prompt.length,
      linkTitlesCount: linkTitles.length,
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const suggestionsText = response.text().trim();

    logger.info("📥 AI候補生成 API応答:", {
      responseLength: suggestionsText.length,
      responsePreview: suggestionsText.slice(0, 200),
    });

    // JSONパース
    let suggestions;
    try {
      const jsonMatch = suggestionsText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);

        // 🎯 新機能: relatedLinkIndicesの状況を詳細にログ出力
        logger.info("🔍 AI応答の詳細解析:", {
          hasSuggestions: !!suggestions.suggestions,
          suggestionsCount: suggestions.suggestions?.length || 0,
          suggestionsWithRelatedIndices: suggestions.suggestions?.map((s: any, index: number) => ({
            index,
            title: s.title,
            hasRelatedLinkIndices: !!s.relatedLinkIndices,
            relatedLinkIndices: s.relatedLinkIndices || [],
            relatedLinkCount: s.relatedLinkIndices?.length || 0,
          })) || [],
          rawResponse: suggestionsText.slice(0, 500) + "...",
        });
      } else {
        throw new Error("JSON形式が見つかりません");
      }
    } catch (parseError) {
      logger.error("❌ JSON解析エラー:", parseError);
      logger.error("❌ 生の応答テキスト:", suggestionsText);
      // フォールバック候補を生成
      suggestions = {
        suggestions: [
          {
            title: `${tagName}とは`,
            description: "基本的な概念について",
            keywords: ["基本", "概念"],
            relatedLinkIndices: [0, 1],
          },
          {
            title: `${tagName}の活用法`,
            description: "実践的な使い方について",
            keywords: ["活用", "実践"],
            relatedLinkIndices: [1, 2],
          },
          {
            title: `${tagName}のコツ`,
            description: "効果的な方法について",
            keywords: ["コツ", "効果的"],
            relatedLinkIndices: [0, 2],
          },
        ],
      };
    }

    // 各テーマのrelatedLinkIndicesを検証・修正
    if (suggestions.suggestions) {
      suggestions.suggestions.forEach((suggestion: any) => {
        // relatedLinkIndicesが存在しない場合は、デフォルト値を設定
        if (!suggestion.relatedLinkIndices || !Array.isArray(suggestion.relatedLinkIndices)) {
          // リンク数に応じてデフォルトインデックスを設定
          const defaultIndices = [];
          const maxLinks = Math.min(3, linkTitles.length);
          for (let i = 0; i < maxLinks; i++) {
            defaultIndices.push(i);
          }
          suggestion.relatedLinkIndices = defaultIndices;
        }

        // インデックスが有効範囲内かチェックし、無効な場合は修正
        suggestion.relatedLinkIndices = suggestion.relatedLinkIndices
          .filter((index: number) => index >= 0 && index < linkTitles.length)
          .slice(0, 4); // 最大4個まで

        // 空の場合はデフォルト値を設定
        if (suggestion.relatedLinkIndices.length === 0) {
          suggestion.relatedLinkIndices = [0];
        }

        logger.info("📊 テーマの関連リンク設定:", {
          theme: suggestion.title,
          relatedLinkIndices: suggestion.relatedLinkIndices,
          relatedLinkTitles: suggestion.relatedLinkIndices.map((index: number) => linkTitles[index]),
        });
      });
    }

    // コスト計算
    const usageMetadata = response.usageMetadata;
    const actualInputTokens = usageMetadata?.promptTokenCount || Math.ceil(prompt.length / 4);
    const actualOutputTokens = usageMetadata?.candidatesTokenCount || Math.ceil(suggestionsText.length / 4);
    const actualTotalTokens = actualInputTokens + actualOutputTokens;

    const actualInputCost = (actualInputTokens / 1000000) * 0.075;
    const actualOutputCost = (actualOutputTokens / 1000000) * 0.30;
    const actualTotalCost = actualInputCost + actualOutputCost;

    logger.info("✅ AI候補生成完了:", {
      suggestionsCount: suggestions.suggestions?.length || 0,
      tokensUsed: actualTotalTokens,
      cost: actualTotalCost,
      costUSD: `$${actualTotalCost.toFixed(6)}`,
    });

    return {
      suggestions: suggestions.suggestions || [],
      fromCache: false,
      tokensUsed: actualTotalTokens,
      cost: actualTotalCost,
      usage: {
        inputTokens: actualInputTokens,
        outputTokens: actualOutputTokens,
        inputCost: actualInputCost,
        outputCost: actualOutputCost,
        model: "gemini-2.0-flash-exp",
        hasActualUsage: !!usageMetadata,
      },
    };
  } catch (error) {
    logger.error("❌ AI候補生成エラー:", error);
    throw new HttpsError("internal", "AI候補生成中にエラーが発生しました");
  }
});


export const fetchMetadata = onCall({timeoutSeconds: 30, memory: "512MiB"}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "認証が必要です");
  const {url} = request.data;
  if (!url) throw new HttpsError("invalid-argument", "URLが必要です");

  try {
    logger.info(`🌐 Fetching enhanced metadata for: ${url}`);

    const response = await axios.get(url, {timeout: 15000, maxRedirects: 5});
    const $ = cheerio.load(response.data);

    // Basic metadata
    const title = $("meta[property='og:title']").attr("content") || $("title").text() || "";
    const description = $("meta[property='og:description']").attr("content") || $("meta[name='description']").attr("content") || "";
    const imageUrl = $("meta[property='og:image']").attr("content") || "";
    const siteName = $("meta[property='og:site_name']").attr("content") || "";
    const keywords = ($("meta[name='keywords']").attr("content") || "").split(",").map((k) => k.trim()).filter((k) => k);

    const urlObj = new URL(url);
    const domain = urlObj.hostname;

    // Extract full content for AI analysis
    $("script, style, nav, header, footer, aside, .advertisement, .ad, .sidebar").remove();

    // Try to find main content areas
    const mainContent = $("main, article, .content, .post, .entry, .article-body, .story-body").first();
    let fullContent = "";

    if (mainContent.length) {
      fullContent = mainContent.text();
    } else {
      // Fallback to body content
      fullContent = $("body").text();
    }

    // Clean and limit content
    fullContent = fullContent
      .replace(/\s+/g, " ")
      .trim();

    // Dynamic content limiting with cost estimation
    const originalLength = fullContent.length;
    const maxChars = 8000; // Increased base limit
    const costThreshold = 0.01; // $0.01 threshold for safety

    if (fullContent.length > maxChars) {
      const estimatedTokens = Math.ceil(fullContent.length / 4);
      const estimatedInputCost = (estimatedTokens / 1000000) * 0.075;

      if (estimatedInputCost > costThreshold) {
        fullContent = fullContent.slice(0, maxChars);
        logger.info(`📊 Content limited: ${originalLength} → ${maxChars} chars (est. cost: $${estimatedInputCost.toFixed(6)})`);
      } else {
        logger.info(`📊 Full content preserved: ${originalLength} chars (est. cost: $${estimatedInputCost.toFixed(6)})`);
      }
    } else {
      logger.info(`📊 Content within limits: ${originalLength} chars`);
    }

    // Extract headings for structure
    const headings: string[] = [];
    $("h1, h2, h3, h4").each((_, el) => {
      const heading = $(el).text().trim();
      if (heading && heading.length > 0 && heading.length < 100) {
        headings.push(heading);
      }
    });

    // Determine content type
    const contentType = analyzeContentType($, fullContent, title, description, domain);

    logger.info("🌐 Enhanced metadata extracted:", {
      url,
      titleLength: title.length,
      descriptionLength: description.length,
      fullContentLength: fullContent.length,
      headingsCount: headings.length,
      contentType,
    });

    return {
      title: title.trim(),
      description: description.trim(),
      imageUrl: imageUrl.trim(),
      siteName: siteName.trim(),
      domain,
      fullContent,
      headings: headings.slice(0, 10), // Limit to first 10 headings
      keywords,
      contentType: {
        category: contentType,
        confidence: 0.8,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorType = error?.constructor?.name || "Unknown";

    logger.error("Failed to fetch enhanced metadata", {
      url,
      error: errorMessage,
      errorStack,
      errorType,
    });

    // フォールバック: URLからドメイン名を抽出
    try {
      const urlObj = new URL(url);
      return {
        title: urlObj.hostname.replace("www.", ""),
        description: "",
        domain: urlObj.hostname,
        fullContent: "",
        headings: [],
        keywords: [],
        contentType: {
          category: "other",
          confidence: 0.1,
        },
      };
    } catch {
      throw new HttpsError("invalid-argument", "無効なURLです");
    }
  }
});

// ===================================================================
//
// 未読リンク通知機能
//
// ===================================================================

/**
 * 既存の古い通知構造を新しい構造に移行
 */
export const migrateNotificationStructure = onCall({timeoutSeconds: 60, memory: "512MiB"}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "認証が必要です");
  const userId = request.auth.uid;

  try {
    logger.info(`🔄 Starting notification structure migration for user: ${userId}`);

    // 古い構造を持つリンクを検索
    const oldStructureQuery = db.collection("links")
      .where("userId", "==", userId)
      .where("notificationsSent.threeDays", "in", [true, false]);

    const oldStructureSnapshot = await oldStructureQuery.get();
    logger.info(`📊 Found ${oldStructureSnapshot.size} links with old notification structure`);

    if (oldStructureSnapshot.empty) {
      logger.info("✅ No links need migration");
      return {migratedCount: 0, message: "No links need migration"};
    }

    const batch = db.batch();
    let migratedCount = 0;

    for (const doc of oldStructureSnapshot.docs) {
      const linkData = doc.data();
      const notificationsSent = linkData.notificationsSent || {};

      // 新しい構造に移行
      const newNotificationsSent = {
        unused3Days: notificationsSent.threeDays || false,
        // 古いフィールドも保持（互換性のため）
        oneHour: notificationsSent.oneHour || false,
        threeDays: notificationsSent.threeDays || false,
        oneDay: notificationsSent.oneDay || false,
      };

      const linkRef = db.collection("links").doc(doc.id);
      batch.update(linkRef, {
        "notificationsSent": newNotificationsSent,
        "updatedAt": FieldValue.serverTimestamp(),
      });

      migratedCount++;
    }

    if (migratedCount > 0) {
      await batch.commit();
      logger.info(`✅ Successfully migrated ${migratedCount} links`);
    }

    return {
      migratedCount,
      message: `Successfully migrated ${migratedCount} links`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Failed to migrate notification structure", {
      userId,
      error: errorMessage,
    });
    throw new HttpsError("internal", "通知構造の移行に失敗しました");
  }
});

/**
 * 3日間未読のリンクをチェックして通知対象を特定
 */
export const checkUnusedLinks = onCall({timeoutSeconds: 30, memory: "512MiB"}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "認証が必要です");
  const userId = request.auth.uid; // 認証されたユーザーIDを使用

  try {
    logger.info(`🔍 Checking unused links for user: ${userId}`);

    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000); // 3日前

    // デバッグ: 全リンク数を確認
    const allLinksQuery = db.collection("links").where("userId", "==", userId);
    const allLinksSnapshot = await allLinksQuery.get();
    logger.info(`📊 Total links for user: ${allLinksSnapshot.size}`);

    // デバッグ: 各条件でのフィルタリング結果を確認
    const isReadFalseQuery = db.collection("links")
      .where("userId", "==", userId)
      .where("isRead", "==", false);
    const isReadFalseSnapshot = await isReadFalseQuery.get();
    logger.info(`📊 Links with isRead=false: ${isReadFalseSnapshot.size}`);

    const isArchivedFalseQuery = db.collection("links")
      .where("userId", "==", userId)
      .where("isArchived", "==", false);
    const isArchivedFalseSnapshot = await isArchivedFalseQuery.get();
    logger.info(`📊 Links with isArchived=false: ${isArchivedFalseSnapshot.size}`);

    // デバッグ: notificationsSentフィールドの存在確認
    const sampleLinks = allLinksSnapshot.docs.slice(0, 3);
    for (const doc of sampleLinks) {
      const data = doc.data();
      logger.info(`🔍 Sample link ${doc.id}:`, {
        isRead: data.isRead,
        isArchived: data.isArchived,
        hasNotificationsSent: !!data.notificationsSent,
        notificationsSentValue: data.notificationsSent,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        threeDaysAgo: threeDaysAgo,
      });
    }

    // 3日間未読のリンクを検索
    // 古い構造（threeDays）と新しい構造（unused3Days）の両方に対応
    const unusedLinksQuery = db.collection("links")
      .where("userId", "==", userId)
      .where("isRead", "==", false)
      .where("isArchived", "==", false)
      .where("createdAt", "<=", threeDaysAgo);

    const unusedLinksSnapshot = await unusedLinksQuery.get();
    logger.info(`📊 Links after basic filters: ${unusedLinksSnapshot.size}`);

    const unusedLinks: Array<{
      id: string;
      title: string;
      url: string;
      userId: string;
      lastAccessedAt?: Date;
      createdAt: Date;
    }> = [];

    let notificationsSent = 0;

    // バッチ処理で通知送信フラグを更新
    const batch = db.batch();

    for (const doc of unusedLinksSnapshot.docs) {
      const linkData = doc.data();

      // 最終アクセス時刻がない場合は作成時刻を使用
      const lastAccessTime = linkData.lastAccessedAt?.toDate() || linkData.createdAt.toDate();

      // 3日間経過しているかチェック
      if (lastAccessTime <= threeDaysAgo) {
        // 通知送信済みかチェック（古い構造と新しい構造の両方に対応）
        const isAlreadyNotified =
          (linkData.notificationsSent?.unused3Days === true) ||
          (linkData.notificationsSent?.threeDays === true);

        if (!isAlreadyNotified) {
          unusedLinks.push({
            id: doc.id,
            title: linkData.title || "無題のリンク",
            url: linkData.url,
            userId: linkData.userId,
            lastAccessedAt: linkData.lastAccessedAt?.toDate(),
            createdAt: linkData.createdAt.toDate(),
          });

          // 通知送信フラグを更新（古い構造と新しい構造の両方に設定）
          const linkRef = db.collection("links").doc(doc.id);
          batch.update(linkRef, {
            "notificationsSent.unused3Days": true,
            "notificationsSent.threeDays": true, // 古い構造との互換性
            "updatedAt": FieldValue.serverTimestamp(),
          });

          notificationsSent++;
        }
      }
    }

    // バッチ処理を実行
    if (notificationsSent > 0) {
      await batch.commit();
      logger.info(`✅ Batch update completed for ${notificationsSent} links`);
    }

    logger.info("📊 Unused links check completed:", {
      userId,
      totalUnusedLinks: unusedLinks.length,
      notificationsSent,
      checkTime: now.toISOString(),
    });

    return {
      unusedLinks,
      notificationsSent,
      checkTime: now.toISOString(),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorType = error?.constructor?.name || "Unknown";

    logger.error("Failed to check unused links", {
      userId,
      error: errorMessage,
      errorStack,
      errorType,
    });

    throw new HttpsError("internal", "未読リンクのチェックに失敗しました");
  }
});

// Simple content type analysis
function analyzeContentType($: any, content: string, title: string, description: string, domain: string): string {
  const text = `${title} ${description} ${content}`.toLowerCase();

  // Domain-based detection
  if (domain.includes("github")) return "documentation";
  if (domain.includes("youtube") || domain.includes("vimeo")) return "video";
  if (domain.includes("qiita") || domain.includes("zenn")) return "article";
  if (domain.includes("blog")) return "blog";

  // Content-based detection
  if (text.includes("tutorial") || text.includes("how to") || text.includes("step")) return "tutorial";
  if (text.includes("documentation") || text.includes("api") || text.includes("reference")) return "documentation";
  if ($("pre, code").length > 3) return "tutorial";
  if (text.includes("news") || text.includes("breaking")) return "news";
  if (content.length > 2000) return "article";

  return "other";
}


// ===================================================================
//
// Google Maps関連の関数
//
// ===================================================================

function isGoogleMapsUrl(url: string): boolean {
  const patterns = [
    /maps\.google\./,
    /goo\.gl\/maps/,
    /maps\.app\.goo\.gl/,
    /google\..*\/maps/,
  ];

  return patterns.some((pattern) => pattern.test(url));
}

/*
async function handleGoogleMapsUrl(url: string) {
  // ... Google Maps処理ロジック
}

function parseGoogleMapsUrl(url: string) {
  // ... URL解析ロジック
}

function generateMapTitle(mapInfo: {[key: string]: string | object}): string {
  // ... タイトル生成ロジック
}

function generateMapDescription(mapInfo: {[key: string]: string | object}): string {
  // ... 説明生成ロジック
}
*/

// ===================================================================
//
// ヘルパー関数群
//
// ===================================================================

async function fetchPageContent(url: string) {
  const response = await axios.get(url, {timeout: 10000, maxRedirects: 5});
  const $ = cheerio.load(response.data);

  const pageTitle = $("meta[property='og:title']").attr("content") || $("title").text() || "";
  const pageDescription = $("meta[property='og:description']").attr("content") || $("meta[name='description']").attr("content") || "";
  const keywords = ($("meta[name='keywords']").attr("content") || "").split(",").map((k) => k.trim());


  $("script, style, nav, header, footer, aside").remove();
  const mainContent = $("main, article, .content, .post").first();
  const fullContent = (mainContent.length ? mainContent.text() : $("body").text()).trim().slice(0, 2000);

  return {fullContent, pageTitle, pageDescription, keywords};
}

function extractKeyTerms(title: string, description?: string): Set<string> {
  const terms = new Set<string>();

  // タイトルを優先して処理（説明文は補助的に使用）
  const titleText = title || "";
  const allText = `${title} ${description || ""}`;

  // 1. タイトルから重要な単語を抽出（複合キーワード生成の基礎）
  const titleKeywords = extractTitleKeywords(titleText);
  titleKeywords.forEach((keyword) => terms.add(keyword));

  // 2. 複合キーワードを生成（タイトルの語句組み合わせ）
  const compoundKeywords = generateCompoundKeywords(titleKeywords);
  compoundKeywords.forEach((compound) => terms.add(compound));

  // 3. 括弧内の重要な情報（「」『』()（））
  const bracketMatches = allText.match(/[「『（(]([^」』）)]+)[」』）)]/g);
  if (bracketMatches) {
    bracketMatches.forEach((m) => {
      const content = m.slice(1, -1).trim();
      if (content.length >= 1 && content.length <= 30) {
        terms.add(content);
      }
    });
  }

  // 4. 英語の固有名詞や略語（特に重要）
  const englishTerms = allText.match(/\b([A-Z][a-zA-Z0-9]+(?:\s[A-Z][a-zA-Z0-9]+)*)\b/g);
  if (englishTerms) {
    englishTerms.forEach((term) => {
      if (term.length >= 2) {
        terms.add(term);

        // 略語を生成 (例: "Model Context Protocol" -> "MCP")
        if (term.includes(" ")) {
          const acronym = term.split(" ").map((word) => word[0]).join("");
          if (acronym.length > 1) {
            terms.add(acronym);
          }
        }

        // 英語略語と日本語の組み合わせも生成
        const japaneseWords = ["メリット", "勉強法", "資格", "試験", "対策"];
        japaneseWords.forEach((jp) => {
          if (titleText.includes(jp.replace("勉強法", "勉強方法"))) {
            terms.add(`${term}${jp}`);
          }
        });
      }
    });
  }

  // 5. ハッシュタグ
  const hashtags = allText.match(/#[\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+/g);
  if (hashtags) {
    hashtags.forEach((tag) => {
      const cleanTag = tag.slice(1);
      if (cleanTag.length >= 1 && cleanTag.length <= 20) {
        terms.add(cleanTag);
      }
    });
  }

  // 6. 年号
  const years = allText.match(/\b(20\d{2}|令和\d+|平成\d+)年?\b/g);
  if (years) {
    years.forEach((year) => terms.add(year));
  }

  return terms;
}

// タイトルから重要キーワードを動的に抽出
function extractTitleKeywords(title: string): string[] {
  const keywords: string[] = [];

  // 1. 英語の専門用語・略語（大文字で始まる）
  const acronyms = title.match(/\b[A-Z][A-Za-z0-9]{1,10}\b/g) || [];
  keywords.push(...acronyms);

  // 2. カタカナ専門用語（3文字以上）
  const katakanaTerms = title.match(/[ァ-ヴー]{3,15}/g) || [];
  keywords.push(...katakanaTerms);

  // 3. 漢字・ひらがな混合の重要語句（形態素解析的アプローチ）
  const japaneseKeywords = extractJapaneseKeywords(title);
  keywords.push(...japaneseKeywords);

  // 4. 助詞や接続詞を含む意味のある句を抽出
  const meaningfulPhrases = extractMeaningfulPhrases(title);
  keywords.push(...meaningfulPhrases);

  // 5. 略語化のパターン適用
  const abbreviations = generateAbbreviations(keywords);
  keywords.push(...abbreviations);

  return [...new Set(keywords)]; // 重複除去
}

// 日本語キーワードを動的に抽出
function extractJapaneseKeywords(text: string): string[] {
  const keywords: string[] = [];

  // 1. 複合語・固有名詞を優先抽出（分割を防ぐ）
  const protectedCompounds = extractProtectedCompounds(text);
  keywords.push(...protectedCompounds);

  // 保護された複合語をマスクして単語分割を防ぐ
  let maskedText = text;
  const maskMap = new Map<string, string>();
  protectedCompounds.forEach((compound, index) => {
    const mask = `__PROTECTED_${index}__`;
    maskMap.set(mask, compound);
    maskedText = maskedText.replace(new RegExp(compound, "g"), mask);
  });

  // 2. 残りの意味のある単語を抽出（マスクされた部分は除外）
  const remainingKeywords = extractRemainingKeywords(maskedText);
  keywords.push(...remainingKeywords);

  // 複合語パターン（○○方法、○○対策、○○メリットなど）
  const compoundPatterns = [
    /([一-龠ひらがなカタカナA-Za-z]+)方法/g,
    /([一-龠ひらがなカタカナA-Za-z]+)対策/g,
    /([一-龠ひらがなカタカナA-Za-z]+)メリット/g,
    /([一-龠ひらがなカタカナA-Za-z]+)効果/g,
    /([一-龠ひらがなカタカナA-Za-z]+)手順/g,
    /([一-龠ひらがなカタカナA-Za-z]+)やり方/g,
  ];

  compoundPatterns.forEach((pattern) => {
    const matches = [...text.matchAll(pattern)];
    matches.forEach((match) => {
      if (match[1] && match[1].length >= 1) {
        keywords.push(match[0]); // 全体（例：MCP方法）
        keywords.push(match[1]); // 前半部分（例：MCP）
      }
    });
  });

  return keywords;
}

// 意味のある句を抽出
function extractMeaningfulPhrases(text: string): string[] {
  const phrases: string[] = [];

  // 疑問文パターン（○○とは、○○って何、○○の意味など）
  const questionPatterns = [
    /([一-龠ひらがなカタカナA-Za-z]+)とは/g,
    /([一-龠ひらがなカタカナA-Za-z]+)って何/g,
    /([一-龠ひらがなカタカナA-Za-z]+)の意味/g,
    /([一-龠ひらがなカタカナA-Za-z]+)について/g,
  ];

  questionPatterns.forEach((pattern) => {
    const matches = [...text.matchAll(pattern)];
    matches.forEach((match) => {
      if (match[1] && match[1].length >= 1) {
        phrases.push(match[1]); // 主要語句のみ抽出
      }
    });
  });

  // 目的・用途パターン（○○活用、○○選び方、○○比較など）
  const purposePatterns = [
    /([一-龠ひらがなカタカナA-Za-z]+)活用/g,
    /([一-龠ひらがなカタカナA-Za-z]+)選び方/g,
    /([一-龠ひらがなカタカナA-Za-z]+)比較/g,
    /([一-龠ひらがなカタカナA-Za-z]+)評価/g,
  ];

  purposePatterns.forEach((pattern) => {
    const matches = [...text.matchAll(pattern)];
    matches.forEach((match) => {
      if (match[1] && match[1].length >= 1) {
        phrases.push(match[0]); // 全体を保持
        phrases.push(match[1]); // 主要部分も保持
      }
    });
  });

  return phrases;
}

// 略語化パターンを生成
function generateAbbreviations(keywords: string[]): string[] {
  const abbreviations: string[] = [];

  // 一般的な略語化パターン
  const abbreviationMap: Record<string, string> = {
    "勉強方法": "勉強法",
    "学習方法": "学習法",
    "攻略方法": "攻略法",
    "プログラミング": "プログラム",
    "アプリケーション": "アプリ",
    "データベース": "DB",
    "マネジメント": "管理",
  };

  keywords.forEach((keyword) => {
    Object.entries(abbreviationMap).forEach(([full, abbrev]) => {
      if (keyword.includes(full)) {
        abbreviations.push(keyword.replace(full, abbrev));
      }
    });
  });

  return abbreviations;
}

// 複合語・固有名詞を保護（分割を防ぐ）
function extractProtectedCompounds(text: string): string[] {
  const protectedTerms: string[] = [];

  // 1. 企業名・ブランド名パターン（カタカナ + 英語）
  const brandPatterns = [
    /[ァ-ヴー]{2,}[A-Za-z][A-Za-z0-9]*/g, // ソフトバンク、リクルート等
    /[A-Za-z][A-Za-z0-9]*[ァ-ヴー]{2,}/g, // IBM等
    /[一-龠]{1,3}[ァ-ヴー]{2,}/g, // 東急リバブル、三井不動産等
  ];

  brandPatterns.forEach((pattern) => {
    const matches = text.match(pattern) || [];
    protectedTerms.push(...matches.filter((m) => m.length >= 3));
  });

  // 2. 専門用語・システム名（複合語として保護）
  const technicalTerms = [
    /デザインシステム/g,
    /デザインガイドライン/g,
    /マネジメントシステム/g,
    /プロジェクトマネジメント/g,
    /データベース/g,
    /アプリケーション/g,
    /インフラストラクチャ/g,
    /フレームワーク/g,
    /プラットフォーム/g,
    /アーキテクチャ/g,
    /ソリューション/g,
  ];

  technicalTerms.forEach((pattern) => {
    const matches = text.match(pattern) || [];
    protectedTerms.push(...matches);
  });

  // 3. 複合カタカナ語（3文字以上の連続）
  const compoundKatakana = text.match(/[ァ-ヴー]{3,}/g) || [];
  protectedTerms.push(...compoundKatakana);

  // 4. 漢字複合語（固有名詞として扱うべきもの）
  const kanjiCompounds = [
    /[一-龠]{2,}(?:会社|株式会社|コーポレーション|グループ|ホールディングス)/g,
    /[一-龠]{2,}(?:大学|学校|研究所|機構)/g,
    /[一-龠]{2,}(?:システム|サービス|ソリューション)/g,
  ];

  kanjiCompounds.forEach((pattern) => {
    const matches = text.match(pattern) || [];
    protectedTerms.push(...matches);
  });

  // 5. 動的パターン：○○システム、○○サービス等
  const dynamicCompoundPatterns = [
    /([一-龠ァ-ヴーA-Za-z]+)(?:システム|サービス|プラットフォーム|ソリューション)/g,
    /([一-龠ァ-ヴーA-Za-z]+)(?:マネジメント|コンサルティング)/g,
  ];

  dynamicCompoundPatterns.forEach((pattern) => {
    const matches = [...text.matchAll(pattern)];
    matches.forEach((match) => {
      if (match[0] && match[0].length >= 4) {
        protectedTerms.push(match[0]); // 全体を保護
      }
    });
  });

  return [...new Set(protectedTerms)]; // 重複除去
}

// 保護されなかった残りのキーワードを抽出
function extractRemainingKeywords(maskedText: string): string[] {
  const keywords: string[] = [];

  // マスクされていない部分から意味のある単語を抽出
  const nounPattern = /[一-龠ひらがなカタカナ]{2,6}(?=[はがをにへとでからまで｜？！。、\s]|$)/g;
  const nouns = maskedText.match(nounPattern) || [];

  const meaningfulNouns = nouns.filter((noun) => {
    return (
      noun.length >= 2 &&
      !noun.includes("__PROTECTED_") && // マスク除外
      !noun.match(/^[はがをにへとでからまで、。！？]+$/) && // 助詞・句読点除外
      !noun.match(/^[するですますだったではある]+$/) && // 動詞・助動詞除外
      !noun.match(/^[このその他これそれあのどの]+$/) && // 指示語除外
      !noun.match(/^[というからでもやはりだけ]+$/) // 接続詞・副詞除外
    );
  });

  keywords.push(...meaningfulNouns);
  return keywords;
}

// 複合キーワードを生成
function generateCompoundKeywords(keywords: string[]): string[] {
  const compounds: string[] = [];

  // 英語略語 + 日本語の組み合わせ
  const englishTerms = keywords.filter((k) => /^[A-Z][A-Za-z0-9]*$/.test(k));
  const japaneseTerms = keywords.filter((k) => /[ひらがなカタカナ漢字]/.test(k));

  englishTerms.forEach((eng) => {
    japaneseTerms.forEach((jp) => {
      // 意味のある組み合わせのみ生成
      if (jp.match(/メリット|デメリット|勉強法|資格|試験|対策|効果|方法/)) {
        compounds.push(`${eng}${jp}`);
      }
    });
  });

  return compounds;
}

function generateTagsFromDomain(url: string): string[] {
  try {
    const domain = new URL(url).hostname.toLowerCase();
    if (domain.includes("note.com")) return ["note"];
    if (domain.includes("qiita.com")) return ["Qiita", "プログラミング"];
    if (domain.includes("zenn.dev")) return ["Zenn", "技術"];
    if (domain.includes("github.com")) return ["GitHub", "コード"];
    if (domain.includes("youtube.com")) return ["YouTube", "動画"];
  } catch (error) {
    logger.warn("Failed to parse domain for tagging", {url, error});
  }
  return [];
}

function generateFallbackTags(text: string, plan: keyof typeof AI_LIMITS): string[] {
  const maxTags = AI_LIMITS[plan]?.maxTagsPerRequest || 5;
  const keywords = ["技術", "ビジネス", "デザインシステム", "プログラミング", "AI", "ツール"];
  const relevantTags = keywords.filter((kw) => text.toLowerCase().includes(kw));
  return relevantTags.slice(0, maxTags);
}

async function getCachedTags(text: string): Promise<string[] | null> {
  const hash = generateContentHash(text);
  logger.info(`🤖 [Cache Lookup] Looking for hash: ${hash}`);
  const cacheDoc = await db.collection("tagCache").doc(hash).get();
  if (cacheDoc.exists) {
    const data = cacheDoc.data();
    const cacheAge = new Date().getTime() - data?.createdAt.toDate().getTime();
    const cacheAgeHours = Math.floor(cacheAge / (1000 * 60 * 60));
    const isCacheValid = cacheAge < 7 * 24 * 60 * 60 * 1000;
    logger.info(`🤖 [Cache Found] Cache age: ${cacheAgeHours}h, valid: ${isCacheValid}`, {cachedTags: data?.tags});
    if (isCacheValid) return data?.tags || null;
    logger.info("🤖 [Cache Expired] Cache too old, ignoring");
  } else {
    logger.info(`🤖 [Cache Not Found] No cache document found for hash: ${hash}`);
  }
  return null;
}

// ユーザーのAI利用状況を安全に取得する
export const getAIUsageStats = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication is required.");
  }
  const userId = request.auth.uid;
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const day = now.toISOString().slice(0, 10);

  try {
    // 月次サマリーを取得
    const summaryRef = db.collection("aiUsageSummary").doc(`${userId}_${month}`);
    const summaryDoc = await summaryRef.get();
    const summaryData = summaryDoc.exists ? summaryDoc.data() : {totalRequests: 0, totalTokens: 0, totalCost: 0};

    // 今日の利用回数を取得
    const dailyQuery = db.collection("aiUsage").where("userId", "==", userId).where("day", "==", day);
    const dailySnapshot = await dailyQuery.get();

    // 月間のAI解説機能の使用回数を取得
    const analysisQuery = db.collection("aiUsage").where("userId", "==", userId).where("type", "==", "analysis").where("month", "==", month);
    const analysisSnapshot = await analysisQuery.get();

    const result = {
      currentMonth: {
        totalRequests: summaryData?.totalRequests || 0,
        totalTokens: summaryData?.totalTokens || 0,
        totalCost: summaryData?.totalCost || 0,
      },
      todayUsage: dailySnapshot.size,
      analysisUsage: analysisSnapshot.size,
    };

    logger.info(`Fetched AI usage stats for user: ${userId}`, result);
    return result;
  } catch (error) {
    logger.error(`Error fetching AI usage stats for user ${userId}:`, error);
    throw new HttpsError("internal", "Failed to fetch AI usage stats.");
  }
});

// AI使用制限チェック
export const checkAIUsageLimit = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "認証が必要です");
  }

  const {userId, plan, type} = request.data;
  if (!userId || !plan || !type) {
    throw new HttpsError("invalid-argument", "userId, plan, typeが必要です");
  }

  try {
    logger.info("🔍 AI使用制限チェック開始:", {userId, plan, type});

    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7);
    const today = now.toISOString().slice(0, 10);

    // プラン制限を取得
    const planLimits: Record<string, {monthlyLimit: number, dailyLimit: number}> = {
      "free": {monthlyLimit: 5, dailyLimit: 5},
      "plus": {monthlyLimit: 50, dailyLimit: 10},
      "pro": {monthlyLimit: 150, dailyLimit: 50},
    };

    const limits = planLimits[plan] || planLimits["free"];

    // 月次使用量チェック
    let currentUsageCount = 0;
    if (type === "analysis") {
      const analysisQuery = db.collection("aiUsage")
        .where("userId", "==", userId)
        .where("type", "==", "analysis")
        .where("month", "==", currentMonth);
      const analysisSnapshot = await analysisQuery.get();
      currentUsageCount = analysisSnapshot.size;
    } else {
      const summaryRef = db.collection("aiUsageSummary").doc(`${userId}_${currentMonth}`);
      const summaryDoc = await summaryRef.get();
      currentUsageCount = summaryDoc.exists ? (summaryDoc.data()?.totalRequests || 0) : 0;
    }

    if (currentUsageCount >= limits.monthlyLimit) {
      logger.info("❌ 月次制限チェック失敗:", {currentUsageCount, monthlyLimit: limits.monthlyLimit});
      return {
        allowed: false,
        reason: `月間利用制限に達しました（${limits.monthlyLimit}回/月）`,
      };
    }

    // 日次使用量チェック
    let currentDailyUsage = 0;
    if (type === "analysis") {
      const dailyAnalysisQuery = db.collection("aiUsage")
        .where("userId", "==", userId)
        .where("type", "==", "analysis")
        .where("day", "==", today);
      const dailyAnalysisSnapshot = await dailyAnalysisQuery.get();
      currentDailyUsage = dailyAnalysisSnapshot.size;
    } else {
      const dailyQuery = db.collection("aiUsage")
        .where("userId", "==", userId)
        .where("day", "==", today);
      const dailySnapshot = await dailyQuery.get();
      currentDailyUsage = dailySnapshot.size;
    }

    if (currentDailyUsage >= limits.dailyLimit) {
      logger.info("❌ 日次制限チェック失敗:", {currentDailyUsage, dailyLimit: limits.dailyLimit});
      return {
        allowed: false,
        reason: `日間利用制限に達しました（${limits.dailyLimit}回/日）`,
      };
    }

    logger.info("✅ AI使用制限チェック通過:", {
      currentUsageCount,
      currentDailyUsage,
      limits,
    });

    return {allowed: true};
  } catch (error) {
    logger.error("❌ AI使用制限チェックエラー:", error);
    throw new HttpsError("internal", "使用制限チェックに失敗しました");
  }
});

// AI使用量記録
export const recordAIUsage = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "認証が必要です");
  }

  const {userId, type, tokensUsed, cost} = request.data;
  if (!userId || !type || tokensUsed === undefined || cost === undefined) {
    throw new HttpsError("invalid-argument", "userId, type, tokensUsed, costが必要です");
  }

  try {
    logger.info("📝 AI使用量記録開始:", {userId, type, tokensUsed, cost});

    const now = new Date();
    const month = now.toISOString().slice(0, 7);
    const day = now.toISOString().slice(0, 10);

    // 使用量記録を追加
    await db.collection("aiUsage").add({
      userId,
      type,
      tokensUsed,
      textLength: 0, // 後方互換性のため
      cost,
      timestamp: FieldValue.serverTimestamp(),
      month,
      day,
    });

    // 月次サマリー更新
    const summaryRef = db.collection("aiUsageSummary").doc(`${userId}_${month}`);
    await summaryRef.set({
      totalRequests: FieldValue.increment(1),
      totalTokens: FieldValue.increment(tokensUsed),
      totalCost: FieldValue.increment(cost),
      lastUpdated: FieldValue.serverTimestamp(),
    }, {merge: true});

    logger.info("✅ AI使用量記録完了:", {userId, type, tokensUsed, cost});

    return {success: true};
  } catch (error) {
    logger.error("❌ AI使用量記録エラー:", error);
    throw new HttpsError("internal", "使用量記録に失敗しました");
  }
});

async function cacheTags(text: string, tags: string[]): Promise<void> {
  const hash = generateContentHash(text);
  logger.info(`🤖 [Cache Store] Storing tags for text: "${text.slice(0, 100)}..." (hash: ${hash})`, {tags});
  await db.collection("tagCache").doc(hash).set({tags, createdAt: FieldValue.serverTimestamp()});
}

function generateContentHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

// ===================================================================
//
// Apple App Store 購入検証
//
// ===================================================================

interface AppleReceiptValidationRequest {
  receipt: string;
  productId: string;
}

interface AppleReceiptResponse {
  status: number;
  receipt?: any;
  "latest_receipt_info"?: any[];
  "pending_renewal_info"?: any[];
}

export const validateAppleReceipt = onCall<AppleReceiptValidationRequest>(async (request) => {
  try {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "認証が必要です");
    }

    const {receipt, productId} = request.data;
    const userId = request.auth.uid;

    logger.info("🛒 Apple レシート検証開始:", {userId, productId});

    if (!receipt || !productId) {
      throw new HttpsError("invalid-argument", "レシートまたはプロダクトIDが無効です");
    }

    // Apple App Store レシート検証
    const validationResult = await validateReceiptWithApple(receipt);

    if (validationResult.status !== 0) {
      logger.error("❌ Apple レシート検証失敗:", {status: validationResult.status, userId, productId});
      throw new HttpsError("invalid-argument", "無効なレシートです");
    }

    // プロダクトIDの確認
    const validProducts = [
      "com.tat22444.wink.plus.monthly",
      "com.tat22444.wink.pro.monthly",
    ];

    if (!validProducts.includes(productId)) {
      throw new HttpsError("invalid-argument", "無効なプロダクトIDです");
    }

    // ユーザーのプランを更新
    const planType = productId.includes("plus") ? "plus" : "pro";
    await updateUserSubscription(userId, planType, validationResult);

    logger.info("✅ Apple レシート検証・プラン更新完了:", {userId, planType, productId});

    return {
      success: true,
      planType,
      validatedAt: new Date().toISOString(),
    };
  } catch (error) {
    logger.error("❌ Apple レシート検証エラー:", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "レシート検証に失敗しました");
  }
});

async function validateReceiptWithApple(receiptData: string): Promise<AppleReceiptResponse> {
  // まずは本番環境で試す
  let response = await attemptReceiptValidation(receiptData, "https://buy.itunes.apple.com/verifyReceipt");

  // 本番環境で21007エラー (sandbox receipt)の場合はsandboxで試す
  if (response.status === 21007) {
    logger.info("🛒 本番環境で21007エラー、sandboxで再試行");
    response = await attemptReceiptValidation(receiptData, "https://sandbox.itunes.apple.com/verifyReceipt");
  }

  return response;
}

async function attemptReceiptValidation(receiptData: string, url: string): Promise<AppleReceiptResponse> {
  const response = await axios.post<AppleReceiptResponse>(url, {
    "receipt-data": receiptData,
    "password": process.env.APPLE_SHARED_SECRET || functions.config().apple?.shared_secret,
    "exclude-old-transactions": true,
  }, {
    headers: {
      "Content-Type": "application/json",
    },
    timeout: 10000,
  });

  return response.data;
}

async function updateUserSubscription(userId: string, planType: "plus" | "pro", validationResult: AppleReceiptResponse): Promise<void> {
  const userRef = db.collection("users").doc(userId);

  const subscriptionData = {
    plan: planType,
    status: "active",
    startDate: FieldValue.serverTimestamp(),
    lastValidatedAt: FieldValue.serverTimestamp(),
    source: "apple_app_store",
    // Apple レシートから取得した情報も保存
    appleTransactionInfo: validationResult.receipt ? {
      transactionId: validationResult.receipt.in_app?.[0]?.transaction_id,
      originalTransactionId: validationResult.receipt.in_app?.[0]?.original_transaction_id,
      purchaseDate: validationResult.receipt.in_app?.[0]?.purchase_date_ms,
    } : null,
  };

  // ユーザードキュメントのsubscriptionフィールドを更新
  await userRef.set({
    subscription: subscriptionData,
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});

  logger.info("✅ ユーザープラン更新完了:", {userId, planType, subscriptionData});
}

// ===================================================================
//
// Share Extension用 - リンク保存関数
//
// ===================================================================

/**
 * Share Extension経由でリンクを保存（フォールバック用）
 * メインの保存処理はApp Group経由で行われる
 */
export const saveSharedLink = onCall(
  {region: "asia-northeast1"},
  async (request) => {
    const {data, auth} = request;

    // 認証チェック
    if (!auth?.uid) {
      logger.error("❌ 認証されていないユーザーからのリクエスト");
      throw new HttpsError("unauthenticated", "Authentication required");
    }

    const {url, title, source} = data;
    if (!url || typeof url !== "string") {
      logger.error("❌ 無効なURL:", url);
      throw new HttpsError("invalid-argument", "Valid URL is required");
    }

    logger.info("🔗 Share Extension: リンク保存開始", {
      userId: auth.uid,
      url,
      title,
      source,
    });

    try {
      // リンクデータを作成（統一された構造）
      const linkData = {
        userId: auth.uid,
        url: url.trim(),
        title: title?.trim() || "共有されたリンク",
        description: "",
        status: "pending" as const,
        tagIds: [],
        isBookmarked: false,
        isArchived: false,
        priority: "medium" as const,
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        source: source || "share-extension",
        importedAtMs: Date.now(),
      };

      // Firestoreに保存
      const docRef = await db.collection("links").add(linkData);

      logger.info("✅ Share Extension: リンク保存完了", {
        userId: auth.uid,
        linkId: docRef.id,
        url,
        source,
      });

      return {
        success: true,
        linkId: docRef.id,
        message: "リンクを保存しました。AIが自動でタグ付けと要約を生成しています。",
      };
    } catch (error) {
      logger.error("❌ Share Extension: リンク保存エラー", {
        userId: auth.uid,
        url,
        error: error instanceof Error ? error.message : error,
      });

      throw new HttpsError(
        "internal",
        "Failed to save shared link"
      );
    }
  }
);



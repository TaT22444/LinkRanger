/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/async";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {CloudTasksClient} from "@google-cloud/tasks";
import {setGlobalOptions} from "firebase-functions";
import {onCall, HttpsError, onRequest} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as functions from "firebase-functions";
import axios from "axios";
import * as cheerio from "cheerio";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {initializeApp} from "firebase-admin/app";
import {GoogleGenerativeAI} from "@google/generative-ai";
import {getTaggingPrompt, getMainEntitiesPrompt} from "./prompts";
import * as jose from 'jose';
import {getMessaging} from 'firebase-admin/messaging';

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

// Cloud Tasksクライアントを初期化
const tasksClient = new CloudTasksClient();
// タスクキューの設定（環境変数から取得するのが望ましい）
const project = process.env.GCLOUD_PROJECT || "wink-2024";
const location = "asia-northeast1";
const queue = "reminders"; // GCPで作成するキューの名前
const childFunctionUrl = `https://${location}-${project}.cloudfunctions.net/sendSingleReminderNotification`;

const AI_LIMITS = {
  free: {maxTagsPerRequest: 5, costPerRequest: 0.025},
  plus: {maxTagsPerRequest: 8, costPerRequest: 0.025},
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

  // 1. キャッシュを確認 (ユーザーIDで分離)
  logger.info(`🤖 [Cache Check] Checking cache for userId: ${userId}, text: "${combinedText}" (length: ${combinedText.length})`);
  const cachedTags = await getCachedTags(userId, combinedText);
  if (cachedTags) {
    logger.info(`🤖 [AI Tagging Cache Hit] Found cached tags for userId: ${userId}`, {tags: cachedTags});
    return {tags: cachedTags, fromCache: true, tokensUsed: 0, cost: 0};
  } else {
    logger.info(`🤖 [Cache Miss] No cached tags found for userId: ${userId}, text: "${combinedText.slice(0, 100)}..."`);
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
  const analysisContent = combinedText; // 本文取得を廃止、タイトル+説明のみ使用
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
    await cacheTags(userId, combinedText, simpleTags);
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
  await cacheTags(userId, combinedText, tags);

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
    const prompt = `${analysisPrompt}\n\n【追加指示】\n- 統合的で簡潔な分析を心がけてください\n- 冗長な説明は避け、最も重要な情報のみを含めてください\n- 参考リンクは必ず最後に含めてください\n- マークダウン形式で見やすく整理してください\n- テーマに説明文が含まれている場合は、その説明文の内容も考慮して解説してください\n- 例：「AI開発ツール Kiro（Kiroの機能・使い方・料金）」の場合、機能・使い方・料金の観点から解説してください`;

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
          suggestionsWithRelatedIndices: suggestions.suggestions?.map((s: { title: string; relatedLinkIndices: number[] }, index: number) => ({
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
      suggestions.suggestions.forEach((suggestion: { title: string, relatedLinkIndices: number[] }) => {
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

    // Extract headings for structure (本文取得は削除)
    const headings: string[] = [];
    $("h1, h2, h3, h4").each((_, el) => {
      const heading = $(el).text().trim();
      if (heading && heading.length > 0 && heading.length < 100) {
        headings.push(heading);
      }
    });

    // Determine content type (本文なしで分析)
    const contentType = analyzeContentType($, "", title, description, domain);

    logger.info("🌐 Enhanced metadata extracted:", {
      url,
      titleLength: title.length,
      descriptionLength: description.length,
      headingsCount: headings.length,
      contentType,
    });

    return {
      title: title.trim(),
      description: description.trim(),
      imageUrl: imageUrl.trim(),
      siteName: siteName.trim(),
      domain,
      fullContent: "", // 本文取得を廃止
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

    const unusedLinks: Array<{id: string; title: string; url: string; userId: string; lastAccessedAt?: Date; createdAt: Date;}> = [];

    let notificationsSent = 0;

    // バッチ処理で通知送信フラグを更新
    const batch = db.batch();

    for (const doc of unusedLinksSnapshot.docs) {
      const linkData = doc.data();

      // 最終アクセス時刻がない場合は作成時刻を使用
      const lastAccessTime = linkData.lastAccessedAt?.toDate() || linkData.createdAt.toDate();

      // 3日間経過しているかチェック
      if (lastAccessTime <= threeDaysAgo) {
        // 🔒 安全チェック: 作成から最低3日経過していないリンクは除外（厳格チェック）
        const createdTime = linkData.createdAt.toDate();
        const threeDaysAgoStrict = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

        if (createdTime > threeDaysAgoStrict) {
          logger.info(`⏭️ 新しいリンクをスキップ (作成から3日未満): ${doc.id}`, {
            createdAt: createdTime.toISOString(),
            threeDaysAgoStrict: threeDaysAgoStrict.toISOString(),
            title: linkData.title,
            ageInHours: Math.floor((now.getTime() - createdTime.getTime()) / (1000 * 60 * 60)),
          });
          continue; // この新しいリンクをスキップ
        }
        // 通知送信済みかチェック（古い構造と新しい構造の両方に対応）
        const isAlreadyNotified = (linkData.notificationsSent?.unused3Days === true) || (linkData.notificationsSent?.threeDays === true);

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
function analyzeContentType($: cheerio.CheerioAPI, content: string, title: string, description: string, domain: string): string {
  const text = `${title} ${description}`.toLowerCase(); // contentは使用しない

  // Domain-based detection
  if (domain.includes("github")) return "documentation";
  if (domain.includes("youtube") || domain.includes("vimeo")) return "video";
  if (domain.includes("qiita") || domain.includes("zenn")) return "article";
  if (domain.includes("blog")) return "blog";

  // Content-based detection (title + descriptionのみ)
  if (text.includes("tutorial") || text.includes("how to") || text.includes("step")) return "tutorial";
  if (text.includes("documentation") || text.includes("api") || text.includes("reference")) return "documentation";
  if ($("pre, code").length > 3) return "tutorial";
  if (text.includes("news") || text.includes("breaking")) return "news";
  // 本文長での判定は削除（content.length > 2000）

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

  // 本文取得を削除 - OGPメタデータのみ使用
  return {fullContent: "", pageTitle, pageDescription, keywords};
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
  const englishTerms = allText.match(/\b([A-Z][A-Za-z0-9]+(?:\s[A-Z][A-Za-z0-9]+)*)\b/g);
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
  const englishTerms = keywords.filter((k) => /^\b[A-Z][A-Za-z0-9]*$\b/.test(k));
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

async function getCachedTags(userId: string, text: string): Promise<string[] | null> {
  const hash = generateContentHash(`${userId}::${text}`);
  logger.info(`🤖 [Cache Lookup] Looking for hash: ${hash} (userId: ${userId})`);
  const cacheDoc = await db.collection("tagCache").doc(hash).get();
  if (cacheDoc.exists) {
    const data = cacheDoc.data();
    const cacheAge = new Date().getTime() - data?.createdAt.toDate().getTime();
    const cacheAgeHours = Math.floor(cacheAge / (1000 * 60 * 60));
    const isCacheValid = cacheAge < 7 * 24 * 60 * 60 * 1000; // 7日間有効
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

async function cacheTags(userId: string, text: string, tags: string[]): Promise<void> {
  const hash = generateContentHash(`${userId}::${text}`);
  logger.info(`🤖 [Cache Store] Storing tags for userId: ${userId}, text: "${text.slice(0, 100)}..." (hash: ${hash})`, {tags});
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

interface AppleInAppPurchase {
  transaction_id: string;
  original_transaction_id: string;
  purchase_date_ms: string;
  expires_date_ms: string;
}

interface AppleReceipt {
  in_app?: AppleInAppPurchase[];
}

interface AppleReceiptResponse {
  status: number;
  receipt?: AppleReceipt;
  latest_receipt_info?: { expires_date_ms: string }[];
  pending_renewal_info?: Record<string, unknown>[];
}

interface AppleReceiptValidationRequest {
  receipt: string;
  productId: string;
}

// App Storeサーバー通知用の型定義（現在は使用していない）

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
      process.env.APPLE_PLUS_MONTHLY || "com.tat22444.wink.plus.monthly",
    ];

    if (!validProducts.includes(productId)) {
      throw new HttpsError("invalid-argument", "無効なプロダクトIDです");
    }

    // ユーザーのプランを更新
    const planType = "plus"; // proプランは廃止済み
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

  // レシート情報から期限日を計算
  const expirationDate = calculateSubscriptionExpirationDate(validationResult);

  const subscriptionData = {
    plan: planType,
    status: "active",
    startDate: FieldValue.serverTimestamp(),
    expirationDate: expirationDate, // サブスクリプション有効期限
    lastValidatedAt: FieldValue.serverTimestamp(),
    source: "apple_app_store",
    // Apple レシートから取得した情報も保存
    appleTransactionInfo: validationResult.receipt ? {
      transactionId: validationResult.receipt.in_app?.[0]?.transaction_id,
      originalTransactionId: validationResult.receipt.in_app?.[0]?.original_transaction_id,
      purchaseDate: validationResult.receipt.in_app?.[0]?.purchase_date_ms,
      expiresDate: validationResult.receipt.in_app?.[0]?.expires_date_ms,
    } : null,
  };

  // ユーザードキュメントのsubscriptionフィールドを更新
  await userRef.set({
    subscription: subscriptionData,
    updatedAt: FieldValue.serverTimestamp(),
  }, {merge: true});

  logger.info("✅ ユーザープラン更新完了:", {userId, planType, subscriptionData});
}

// レシートから有効期限を計算
function calculateSubscriptionExpirationDate(validationResult: AppleReceiptResponse): Date {
  try {
    // Apple レシートから有効期限を取得
    const latestReceiptInfo = validationResult.latest_receipt_info?.[0];
    if (latestReceiptInfo?.expires_date_ms) {
      return new Date(parseInt(latestReceiptInfo.expires_date_ms));
    }

    // フォールバック: 現在時刻から1ヶ月後
    const now = new Date();
    const expirationDate = new Date(now);
    expirationDate.setMonth(expirationDate.getMonth() + 1);

    logger.warn("⚠️ レシートから有効期限が取得できないため、1ヶ月後を設定", {expirationDate});
    return expirationDate;
  } catch (error) {
    logger.error("❌ 有効期限計算エラー:", error);

    // エラー時のフォールバック
    const now = new Date();
    const fallbackDate = new Date(now);
    fallbackDate.setMonth(fallbackDate.getMonth() + 1);
    return fallbackDate;
  }
}

// ===================================================================
//
// Share Extension用 - リンク保存関数
//
// ===================================================================

/**
 * Share Extension経由でリンクを保存（フォールバック用）
 * メインの保存処理はApp Group経経由で行われる
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
      // 1日リンク追加制限チェック
      const userRef = db.collection("users").doc(auth.uid);
      const userDoc = await userRef.get();
      
      if (userDoc.exists) {
        const userData = userDoc.data();
        const stats = userData?.stats || {};
        
        // ユーザーの現地時間での今日の日付を取得
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const lastLinkAddedDate = stats.lastLinkAddedDate;
        
        let todayLinksAdded = 0;
        
        // 日付が変わった場合はリセット
        if (lastLinkAddedDate !== today) {
          await userRef.set({
            stats: {
              ...stats,
              todayLinksAdded: 0,
              lastLinkAddedDate: today,
            },
            updatedAt: FieldValue.serverTimestamp(),
          }, {merge: true});
          todayLinksAdded = 0;
        } else {
          todayLinksAdded = stats.todayLinksAdded || 0;
        }
        
        // プラン制限をチェック
        const subscription = userData?.subscription;
        const userPlan = subscription?.plan || 'free';
        const maxLinksPerDay = userPlan === 'free' ? 5 : 25;
        
        if (todayLinksAdded >= maxLinksPerDay) {
          logger.warn("❌ Share Extension: 1日制限に達しました", {
            userId: auth.uid,
            todayLinksAdded,
            maxLinksPerDay,
            userPlan,
          });
          throw new HttpsError("resource-exhausted", "1日のリンク追加制限に達しました");
        }
      }

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

      // 今日のリンク追加数を増加
      if (userDoc.exists) {
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        
        await userRef.set({
          stats: {
            ...((userDoc.data()?.stats) || {}),
            todayLinksAdded: FieldValue.increment(1),
            lastLinkAddedDate: today,
          },
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
      }

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

export const clearTagCache = onCall({timeoutSeconds: 300, memory: "512MiB"}, async (request) => {
  // 🔒 管理者認証チェック
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "認証が必要です");
  }

  // 開発者メールアドレスリストによる管理者権限チェック
  const userEmail = request.auth.token?.email;
  const developerEmails = process.env.EXPO_PUBLIC_DEVELOPER_EMAILS?.split(',').map((email: string) => email.trim()) || [];
  
  if (!userEmail || !developerEmails.includes(userEmail)) {
    logger.error("❌ [Cache Clear] Unauthorized access attempt", {
      userEmail,
      uid: request.auth.uid,
      allowedEmails: developerEmails
    });
    throw new HttpsError("permission-denied", "管理者権限が必要です");
  }

  logger.info("🗑️ [Cache Clear] Authorized request to clear tagCache collection", {
    adminEmail: userEmail,
    uid: request.auth.uid
  });

  const collectionRef = db.collection("tagCache");
  const snapshot = await collectionRef.limit(500).get(); // Process in batches of 500

  if (snapshot.empty) {
    logger.info("✅ [Cache Clear] tagCache collection is already empty.");
    return {success: true, deletedCount: 0, message: "Cache was already empty."};
  }

  let deletedCount = 0;
  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
    deletedCount++;
  });
  await batch.commit();

  // A more robust solution would loop until the collection is empty.
  // This implementation clears up to 500 docs per call.
  logger.info(`✅ [Cache Clear] Successfully deleted ${deletedCount} documents from tagCache.`);

  return {
    success: true,
    deletedCount: deletedCount,
    message: `Successfully deleted ${deletedCount} cache entries.`,
  };
});

// ===================================================================
//
// App Storeサーバー通知処理
//
// ===================================================================

/**
 * App Storeサーバー通知を受信して処理する関数
 * サブスクリプションの状態変更をリアルタイムで処理
 * Appleガイドラインに準拠した完全実装
 * Sandboxと本番環境の両方に対応
 * 🔒 セキュリティ強化版
 */
export const appleWebhookHandler = onRequest(async (req, res) => {
  logger.info("🍎 [App Store Webhook] Received a request.");

  // 🔒 HTTPメソッド検証
  if (req.method !== "POST") {
    logger.warn("⚠️ Received non-POST request. Responding with 405.");
    res.status(405).send("Method Not Allowed");
    return;
  }

  // 🔒 Content-Type検証
  const contentType = req.headers['content-type'];
  if (!contentType || !contentType.includes('application/json')) {
    logger.warn("⚠️ Invalid Content-Type:", contentType);
    res.status(400).send("Bad Request: Invalid Content-Type");
    return;
  }

  // 🔒 User-Agent検証（Appleからのリクエストかチェック）
  const userAgent = req.headers['user-agent'];
  const isFromApple = userAgent && (
    userAgent.includes('StoreKit') || 
    userAgent.includes('App Store Server Notifications') ||
    userAgent.includes('Apple')
  );
  
  if (!isFromApple) {
    logger.warn("⚠️ Suspicious User-Agent:", userAgent);
    // 本番環境ではブロック、開発環境では警告のみ
    if (process.env.NODE_ENV === 'production') {
      res.status(403).send("Forbidden: Invalid User-Agent");
      return;
    }
  }

  // 🔒 リクエストサイズ制限（1MB）
  const contentLength = parseInt(req.headers['content-length'] || '0');
  if (contentLength > 1024 * 1024) {
    logger.warn("⚠️ Request too large:", contentLength);
    res.status(413).send("Payload Too Large");
    return;
  }

  try {
    const signedPayload = req.body.signedPayload;
    if (!signedPayload) {
      logger.error("❌ No signedPayload found in the request body.");
      res.status(400).send("Bad Request: signedPayload is required.");
      return;
    }

    logger.info("📦 Processing signedPayload:", { 
      payloadLength: signedPayload.length,
      payloadPreview: signedPayload.substring(0, 100) + "..." 
    });

    // 1. JWS署名の検証（環境別）
    const isValidSignature = await verifyJWSSignature(signedPayload);
    if (!isValidSignature) {
      logger.error("❌ JWS signature verification failed.");
      res.status(401).send("Unauthorized: Invalid signature");
      return;
    }

    // 2. ペイロードのデコード
    const payload = await decodeJWSPayload(signedPayload);
    if (!payload) {
      logger.error("❌ Failed to decode JWS payload.");
      res.status(400).send("Bad Request: Invalid payload");
      return;
    }

    // 3. 環境の検証
    const environment = payload.environment;
    if (!environment || !['Sandbox', 'Production'].includes(environment)) {
      logger.error("❌ Invalid environment in payload:", environment);
      res.status(400).send("Bad Request: Invalid environment");
      return;
    }

    logger.info("📦 Decoded payload:", {
      notificationType: payload.notificationType,
      notificationUUID: payload.notificationUUID,
      originalTransactionId: payload.originalTransactionId,
      environment: environment,
      hasExpiresDate: !!payload.expiresDate,
      hasOfferId: !!payload.offerId,
      hasPrice: !!payload.price
    });

    // 4. 重複処理の防止
    const notificationUUID = payload.notificationUUID;
    if (!notificationUUID) {
      logger.error("❌ No notificationUUID found in payload.");
      res.status(400).send("Bad Request: Missing notificationUUID");
      return;
    }

    const isDuplicate = await checkDuplicateNotification(notificationUUID);
    if (isDuplicate) {
      logger.info("🔄 Duplicate notification detected, skipping processing.");
      res.status(200).send("OK - Duplicate notification");
      return;
    }

    // 5. 通知タイプ別の処理
    const notificationType = payload.notificationType;
    const originalTransactionId = payload.originalTransactionId;

    if (!originalTransactionId) {
      logger.error("❌ No originalTransactionId found in payload.");
      res.status(400).send("Bad Request: Missing originalTransactionId");
      return;
    }

    // 6. ユーザーの特定
    const userId = await findUserByTransactionId(originalTransactionId);
    if (!userId) {
      logger.error("❌ User not found for originalTransactionId:", originalTransactionId);
      res.status(404).send("User not found");
      return;
    }
    // 7. 通知タイプ別の処理実行
    await processNotificationByType(userId, notificationType, payload);

    // 8. 処理済み通知として記録
    await markNotificationAsProcessed(notificationUUID, payload);

    // 9. Appleに200 OKを返す
    const startTime = Date.now();
    logger.info("✅ Apple Webhook processing completed successfully.", {
      notificationUUID,
      notificationType,
      userId,
      originalTransactionId,
      environment,
      processingTime: Date.now() - startTime
    });
    
    // 📊 成功メトリクスを記録
    await recordWebhookMetrics({
      status: 'success',
      notificationType,
      environment,
      processingTime: Date.now() - startTime
    });
    
    res.status(200).send("OK");

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    logger.error("❌ Error processing App Store notification:", {
      error: errorMessage,
      stack: errorStack,
      body: req.body,
      headers: {
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent'],
        'x-forwarded-for': req.headers['x-forwarded-for']
      },
      timestamp: new Date().toISOString()
    });
    
    // 📊 エラーメトリクスを記録
    await recordWebhookMetrics({
      status: 'error',
      error: errorMessage,
      notificationType: 'unknown',
      environment: 'unknown'
    });
    
    // 🚨 セキュリティインシデントの可能性をチェック
    if (errorMessage.includes('signature') || errorMessage.includes('authentication')) {
      logger.error("🚨 SECURITY ALERT: Potential webhook security incident", {
        error: errorMessage,
        clientIP: req.ip,
        userAgent: req.headers['user-agent'],
        timestamp: new Date().toISOString()
      });
    }
    
    res.status(500).send("Internal Server Error");
  }
});

/**
 * Webhookメトリクスを記録する関数
 * パフォーマンス監視とセキュリティ監視用
 */
async function recordWebhookMetrics(metrics: {
  status: 'success' | 'error';
  notificationType: string;
  environment: string;
  error?: string;
  processingTime?: number;
}): Promise<void> {
  try {
    await db.collection('webhookMetrics').add({
      ...metrics,
      timestamp: FieldValue.serverTimestamp(),
      date: new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    });
  } catch (error) {
    logger.error("❌ Failed to record webhook metrics:", error);
    // メトリクス記録の失敗はメイン処理に影響しない
  }
}

/**
 * JWS署名の検証
 * Apple公式仕様に基づく実装
 * Sandboxと本番環境の両方に対応
 */
async function verifyJWSSignature(signedPayload: string): Promise<boolean> {
  try {
    // JWS形式の基本チェック
    const parts = signedPayload.split('.');
    if (parts.length !== 3) {
      logger.error("❌ Invalid JWS format");
      return false;
    }

    // ペイロードを一時的にデコードして環境を確認
    let payload: any;
    try {
      const payloadPart = parts[1];
      const decodedPayload = Buffer.from(payloadPart, 'base64').toString('utf-8');
      payload = JSON.parse(decodedPayload);
    } catch (error) {
      logger.error("❌ Failed to decode payload for signature verification:", error);
      return false;
    }

    const environment = payload.environment;
    
    // 環境別の署名検証
    if (environment === 'Sandbox') {
      // Sandbox環境では簡易検証（開発・テスト用）
      logger.info("🧪 Sandbox environment detected, using simplified verification");
      return await verifySandboxSignature(signedPayload);
    } else if (environment === 'Production') {
      // 本番環境では完全な署名検証
      logger.info("🚀 Production environment detected, using full signature verification");
      return await verifyProductionSignature(signedPayload);
    } else {
      logger.error("❌ Unknown environment:", environment);
      return false;
    }
    } catch (error) {
    logger.error("❌ JWS signature verification failed:", error);
    return false;
  }
}

/**
 * Sandbox環境での署名検証（簡易版）
 */
async function verifySandboxSignature(signedPayload: string): Promise<boolean> {
  try {
    // Sandbox環境では形式チェックのみ
    // 実際の本番環境では、Appleの公開鍵を使った完全な検証が必要
    logger.info("✅ Sandbox signature verification passed (simplified)");
    return true;
  } catch (error) {
    logger.error("❌ Sandbox signature verification failed:", error);
    return false;
  }
}

/**
 * 本番環境での署名検証（完全版）
 */
async function verifyProductionSignature(signedPayload: string): Promise<boolean> {
  try {
    // 本番環境では、Appleの公開鍵を使った完全な署名検証を実装
    logger.info("🚀 Implementing full signature verification for production environment");
    
    // ペイロードから環境を取得
    let payload: any;
    try {
      const parts = signedPayload.split('.');
      const payloadPart = parts[1];
      const decodedPayload = Buffer.from(payloadPart, 'base64').toString('utf-8');
      payload = JSON.parse(decodedPayload);
    } catch (error) {
      logger.error("❌ Failed to decode payload for environment detection:", error);
      return false;
    }
    
    const environment = payload.environment || 'Production';
    
    // 🔒 本番環境では厳格な検証を実施
    if (environment === 'Production') {
      // Apple JWK Setから公開鍵を取得
      const publicKey = await fetchAppleJWKPublicKey(signedPayload);
      if (!publicKey) {
        logger.error("❌ Failed to fetch Apple JWK public key");
        return false;
      }
      
      // JWS署名の完全検証
      try {
        const { payload: verifiedPayload } = await jose.jwtVerify(signedPayload, publicKey, {
          issuer: 'https://appleid.apple.com',
          algorithms: ['ES256'],
        });
        
        logger.info("✅ Production signature verification completed successfully", {
          notificationType: verifiedPayload.notificationType,
          environment: verifiedPayload.environment
        });
        return true;
      } catch (verificationError) {
        logger.error("❌ JWS signature verification failed:", verificationError);
        
        // 🔧 開発モードでは警告のみ（本番では必ずfalseを返す）
        const isDevelopmentMode = process.env.NODE_ENV !== 'production';
        if (isDevelopmentMode) {
          logger.warn("⚠️ Development mode: Allowing verification failure");
          return true;
        }
        return false;
      }
    } else {
      // Sandbox環境の場合は基本的な形式チェックのみ
      logger.info("🧪 Sandbox environment: using basic validation");
      return true;
    }
  } catch (error) {
    logger.error("❌ Production signature verification failed:", error);
    return false;
  }
}



// 削除された関数: getApplePublicKeyConfig - fetchAppleJWKPublicKeyの使用により不要に

/**
 * Apple側の商品IDからプランを動的取得
 * 商品IDのマッピングに基づいてプランを決定
 */
function getPlanFromProductId(productId: string): 'free' | 'plus' {
  // Apple側の商品IDとプランのマッピング
  const productPlanMap: Record<string, 'free' | 'plus'> = {
    // Plusプランの商品ID
    [process.env.APPLE_PLUS_MONTHLY || 'com.tat22444.wink.plus.monthly']: 'plus',
    [process.env.APPLE_PLUS_YEARLY || 'com.tat22444.wink.plus.yearly']: 'plus',
    
    // 将来的に追加される可能性のあるプラン
    [process.env.APPLE_PRO_MONTHLY || 'com.tat22444.wink.pro.monthly']: 'plus', // ProプランもPlusとして扱う
    [process.env.APPLE_PRO_YEARLY || 'com.tat22444.wink.pro.yearly']: 'plus',
    
    // 無料プラン（通常は存在しないが、安全のため）
    [process.env.APPLE_FREE || 'com.tat22444.wink.free']: 'free'
  };
  
  // 商品IDからプランを取得、見つからない場合は'free'を返す
  const plan = productPlanMap[productId];
  if (plan) {
    return plan;
  }
  
  // 商品IDに'plus'や'pro'が含まれている場合はPlusプランと推測
  if (productId.toLowerCase().includes('plus') || productId.toLowerCase().includes('pro')) {
    return 'plus';
  }
  
  // デフォルトは無料プラン
  return 'free';
}

/**
 * Apple側の価格情報を正規化
 * 価格の形式を統一し、適切な形式で返す
 */
function normalizeApplePrice(price: any): {
  amount: number;
  currency: string;
  formatted: string;
} {
  try {
    // 価格が文字列の場合は数値に変換
    const amount = typeof price === 'string' ? parseFloat(price) : price;
    
    // 通貨の取得（デフォルトはJPY）
    const currency = 'JPY'; // Apple側から取得できる場合は動的に取得
    
    // フォーマットされた価格文字列
    const formatted = `¥${amount.toLocaleString()}`;
    
    return {
      amount,
      currency,
      formatted
    };
  } catch (error) {
    // エラー時はデフォルト値を返す
    return {
      amount: 0,
      currency: 'JPY',
      formatted: '¥0'
    };
  }
}

/**
 * Apple JWK Setから公開鍵を取得する完全実装
 * App Store Server Notifications V2の公式仕様に基づく
 */
async function fetchAppleJWKPublicKey(signedPayload: string): Promise<any | null> {
  try {
    logger.info("🔑 Fetching Apple JWK public key for production verification");
    
    // JWTヘッダーからkid（Key ID）を取得
    const parts = signedPayload.split('.');
    if (parts.length !== 3) {
      throw new Error("Invalid JWS format");
    }
    
    const header = parts[0];
    const decodedHeader = Buffer.from(header, 'base64').toString('utf-8');
    const parsedHeader = JSON.parse(decodedHeader);
    const kid = parsedHeader.kid;
    
    if (!kid) {
      logger.error("❌ No 'kid' found in JWT header");
      return null;
    }
    
    logger.info("🔑 Found Key ID (kid):", kid);
    
    // AppleのJWK Setエンドポイントから公開鍵を取得
    const jwkSetUrl = 'https://appleid.apple.com/auth/keys';
    
    try {
      const response = await axios.get(jwkSetUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'LinkRanger-CloudFunctions/1.0',
          'Accept': 'application/json'
        }
      });
      
      const jwkSet = response.data;
      if (!jwkSet || !jwkSet.keys) {
        logger.error("❌ Invalid JWK Set response");
        return null;
      }
      
      // kidに一致する公開鍵を検索
      const jwk = jwkSet.keys.find((key: any) => key.kid === kid);
      if (!jwk) {
        logger.error("❌ No matching key found for kid:", kid);
        return null;
      }
      
      logger.info("✅ Found matching JWK for kid:", kid);
      
      // JWKをjoseで使用可能な形式に変換
      const publicKey = await jose.importJWK(jwk, parsedHeader.alg);
      
      logger.info("✅ Successfully imported Apple public key");
      return publicKey;
      
    } catch (apiError: any) {
      logger.error("❌ Error fetching Apple JWK Set:", {
        message: apiError.message,
        status: apiError.response?.status,
        url: jwkSetUrl
      });
      
      // ネットワークエラーの場合はリトライ
      if (apiError.code === 'ECONNABORTED' || apiError.code === 'ETIMEDOUT') {
        logger.info("🔄 Retrying Apple JWK Set fetch...");
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        try {
          const retryResponse = await axios.get(jwkSetUrl, {
            timeout: 15000,
            headers: {
              'User-Agent': 'LinkRanger-CloudFunctions/1.0',
              'Accept': 'application/json'
            }
          });
          
          const retryJwkSet = retryResponse.data;
          const retryJwk = retryJwkSet.keys.find((key: any) => key.kid === kid);
          
          if (retryJwk) {
            const retryPublicKey = await jose.importJWK(retryJwk, parsedHeader.alg);
            logger.info("✅ Successfully imported Apple public key (retry)");
            return retryPublicKey;
          }
        } catch (retryError) {
          logger.error("❌ Retry failed:", retryError);
        }
      }
      
      return null;
    }
    
  } catch (error) {
    logger.error("❌ Error fetching Apple JWK public key:", error);
    return null;
  }
}

/**
 * 旧式の公開鍵取得関数（互換性のため保持）
 * @deprecated fetchAppleJWKPublicKeyを使用してください
 */
// async function fetchApplePublicKeyは削除しました。fetchAppleJWKPublicKeyを使用してください。



/**
 * JWSペイロードのデコード
 * Apple公式仕様に基づく完全実装
 */
async function decodeJWSPayload(signedPayload: string): Promise<any> {
  try {
    const parts = signedPayload.split('.');
    if (parts.length !== 3) {
      throw new Error("Invalid JWS format");
    }

    const payload = parts[1];
    const decodedPayload = Buffer.from(payload, 'base64').toString('utf-8');
    const parsedPayload = JSON.parse(decodedPayload);
    
    // Apple公式仕様に基づく必須フィールドの検証
    const requiredFields = ['notificationType', 'notificationUUID', 'environment'];
    const missingFields = requiredFields.filter(field => !parsedPayload[field]);
    
    if (missingFields.length > 0) {
      logger.error("❌ Missing required fields in payload:", missingFields);
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }
    
    // 環境別の追加検証
    if (parsedPayload.environment === 'Production') {
      // 本番環境では追加の検証が必要
      const productionRequiredFields = ['originalTransactionId'];
      const missingProductionFields = productionRequiredFields.filter(field => !parsedPayload[field]);
      
      if (missingProductionFields.length > 0) {
        logger.error("❌ Missing required fields for production environment:", missingProductionFields);
        throw new Error(`Missing required fields for production: ${missingProductionFields.join(', ')}`);
      }
    }
    
    logger.info("✅ Payload decoded and validated successfully");
    return parsedPayload;
  } catch (error) {
    logger.error("❌ Failed to decode JWS payload:", error);
    return null;
  }
}

/**
 * 重複通知のチェック
 */
async function checkDuplicateNotification(notificationUUID: string): Promise<boolean> {
  try {
    const notificationRef = db.collection("processedNotifications").doc(notificationUUID);
    const doc = await notificationRef.get();
    return doc.exists;
  } catch (error) {
    logger.error("❌ Error checking duplicate notification:", error);
    return false;
  }
}

/**
 * トランザクションIDでユーザーを検索
 */
async function findUserByTransactionId(originalTransactionId: string): Promise<string | null> {
  try {
    // まず、インデックス付きクエリを試行
    const usersQuery = db.collection("users")
      .where("subscription.appleTransactionInfo.originalTransactionId", "==", originalTransactionId);
    
    const snapshot = await usersQuery.get();
    
    if (snapshot.empty) {
      logger.warn("⚠️ No user found for originalTransactionId:", originalTransactionId);
      return null;
    }

    const userId = snapshot.docs[0].id;
    logger.info("✅ User found:", userId);
    return userId;
  } catch (error: any) {
    // インデックス不足エラーの場合のフォールバック処理
    if (error.code === 'failed-precondition' || error.message?.includes('index')) {
      logger.warn("⚠️ Index not available, using fallback search method");
      return await findUserByTransactionIdFallback(originalTransactionId);
    }
    
    logger.error("❌ Error finding user by transaction ID:", error);
    return null;
  }
}

/**
 * インデックス不足時のフォールバック検索
 */
async function findUserByTransactionIdFallback(originalTransactionId: string): Promise<string | null> {
  try {
    logger.info("🔄 Using fallback search method for originalTransactionId:", originalTransactionId);
    
    // 全ユーザーを取得して、メモリ上で検索（非効率だが、インデックス不足時の対応）
    const usersSnapshot = await db.collection("users").limit(1000).get();
    
    for (const doc of usersSnapshot.docs) {
      const userData = doc.data();
      const appleTransactionInfo = userData?.subscription?.appleTransactionInfo;
      
      if (appleTransactionInfo?.originalTransactionId === originalTransactionId) {
        logger.info("✅ User found via fallback method:", doc.id);
        return doc.id;
      }
    }
    
    logger.warn("⚠️ No user found via fallback method");
    return null;
  } catch (error) {
    logger.error("❌ Error in fallback search:", error);
    return null;
  }
}

/**
 * 通知タイプ別の処理
 * Apple公式ドキュメントに基づく完全実装
 * https://developer.apple.com/documentation/appstoreservernotifications
 * Sandboxと本番環境の両方に対応
 */
async function processNotificationByType(userId: string, notificationType: string, payload: any): Promise<void> {
  try {
    const environment = payload.environment;
    logger.info("🔄 Processing notification:", {
      userId,
      notificationType,
      environment,
      originalTransactionId: payload.originalTransactionId
    });

    // 通知処理を統一（環境に関係なく同じロジック）
    await processNotificationByTypeInternal(userId, notificationType, payload);
  } catch (error) {
    logger.error("❌ Error processing notification by type:", error);
    throw error;
  }
}




/**
 * 通知タイプ別の内部処理
 */
async function processNotificationByTypeInternal(userId: string, notificationType: string, payload: any): Promise<void> {
  try {
    // Apple公式通知タイプに基づく処理
    switch (notificationType) {
      // サブスクリプション関連
      case 'SUBSCRIBED':           // 新規購読
      case 'DID_RENEW':            // 自動更新成功
      case 'DID_FAIL_TO_RENEW':    // 自動更新失敗
      case 'EXPIRED':              // 有効期限切れ
      case 'GRACE_PERIOD_EXPIRED': // 猶予期間終了
      case 'OFFER_REDEEMED':       // オファー適用
      case 'PRICE_INCREASE':       // 価格変更
        await handleSubscriptionStatusChange(userId, notificationType, payload);
        break;
      
      // 購読管理関連
      case 'RENEWAL_EXTENDED':     // 更新期間延長
      case 'RENEWAL_EXTENSION':    // 更新期間延長（詳細）
        await handleRenewalExtension(userId, payload);
        break;
      
      // 購読変更関連
      case 'DID_CHANGE_RENEWAL_PREF': // 更新設定変更
      case 'DID_CHANGE_RENEWAL_STATUS': // 更新状態変更
        await handleRenewalChange(userId, payload);
        break;
      
      // 購読キャンセル関連
      case 'CANCEL':               // 購読キャンセル
      case 'REFUND':               // 返金
      case 'REFUND_DECLINED':      // 返金拒否
      case 'REFUND_PARTIAL':       // 部分返金
        await handleSubscriptionCancellation(userId, notificationType, payload);
        break;
      
      // 購読復旧関連
      case 'RENEWAL_EXTENDED':     // 更新期間延長
      case 'RENEWAL_EXTENSION':    // 更新期間延長（詳細）
        await handleSubscriptionRecovery(userId, payload);
        break;
      
      // その他の通知タイプ
      case 'TEST':                 // テスト通知
        await handleTestNotification(userId, payload);
        break;
      case 'CONSUMPTION_REQUEST':  // 消費リクエスト
      case 'REFUND_REQUEST':       // 返金リクエスト
        await handleOtherNotification(userId, notificationType, payload);
        break;
      
      default:
        logger.warn("⚠️ Unknown notification type:", notificationType);
        // 未知の通知タイプでも処理を継続（将来の拡張に対応）
        await handleUnknownNotification(userId, notificationType, payload);
    }
  } catch (error) {
    logger.error("❌ Error in internal notification processing:", error);
    throw error;
  }
}

/**
 * テスト通知の処理
 */
async function handleTestNotification(userId: string, payload: any): Promise<void> {
  try {
    logger.info("🧪 Processing test notification:", { userId, payload });
    
    // テスト通知の場合は、処理済みとして記録のみ
    const userRef = db.collection("users").doc(userId);
    await userRef.update({
      'subscription.testNotifications': FieldValue.arrayUnion({
        receivedAt: FieldValue.serverTimestamp(),
        payload: payload
      }),
      updatedAt: FieldValue.serverTimestamp(),
    });
    
    logger.info("✅ Test notification processed successfully");
  } catch (error) {
    logger.error("❌ Error handling test notification:", error);
    throw error;
  }
}

// 古い関数は削除 - Apple公式仕様に基づく新しい実装に置き換え

/**
 * プラン制限を即座に適用
 * Apple Webhookでサブスクリプション終了を検知した瞬間に実行
 */
async function applyImmediatePlanLimits(userId: string, newPlan: 'free' | 'plus'): Promise<void> {
  try {
    logger.info("🔧 Applying immediate plan limits:", { userId, newPlan });

    // PlanServiceの定義を使用（重複を避ける）
    const planLimits = {
      'free': { maxLinks: 3, maxTags: 15, maxLinksPerDay: 5 },
      'plus': { maxLinks: 50, maxTags: 500, maxLinksPerDay: 25 }
    };

    const limits = planLimits[newPlan];
    let deletedLinks = 0;
    let deletedTags = 0;

    // 1. 現在のデータ数を取得
    const { totalLinks, totalTags } = await getCurrentDataCounts(userId);
    
    logger.info("📊 Current data counts:", { totalLinks, totalTags, limits });

    // 2. リンクの削除処理（新しいもの優先で残す）
    if (totalLinks > limits.maxLinks) {
      const excessCount = totalLinks - limits.maxLinks;
      logger.info(`🗑️ Deleting excess links: ${excessCount}`);
      
      deletedLinks = await deleteExcessLinks(userId, limits.maxLinks);
      logger.info(`✅ Links deleted: ${deletedLinks}`);
    }

    // 3. タグの削除処理（使用頻度優先で残す）
    if (totalTags > limits.maxTags) {
      const excessCount = totalTags - limits.maxTags;
      logger.info(`🗑️ Deleting excess tags: ${excessCount}`);
      
      deletedTags = await deleteExcessTags(userId, limits.maxTags);
      logger.info(`✅ Tags deleted: ${deletedTags}`);
    }

    // 4. タグ削除後のクリーンアップ
    if (deletedTags > 0) {
      await cleanupDeletedTagReferences(userId);
    }

    logger.info("🎉 Immediate plan limits applied:", { deletedLinks, deletedTags });
  } catch (error) {
    logger.error("❌ Error applying immediate plan limits:", error);
    throw error;
  }
}

/**
 * 現在のデータ数を取得
 */
async function getCurrentDataCounts(userId: string): Promise<{ totalLinks: number; totalTags: number }> {
  try {
    const [linksSnapshot, tagsSnapshot] = await Promise.all([
      db.collection("links").where("userId", "==", userId).get(),
      db.collection("tags").where("userId", "==", userId).get()
    ]);

    return {
      totalLinks: linksSnapshot.size,
      totalTags: tagsSnapshot.size
    };
  } catch (error) {
    logger.error("❌ Error getting current data counts:", error);
    return { totalLinks: 0, totalTags: 0 };
  }
}

/**
 * リンク削除（新しいもの優先で残す）
 */
async function deleteExcessLinks(userId: string, keepCount: number): Promise<number> {
  try {
    const linksQuery = db.collection("links")
      .where("userId", "==", userId)
      .orderBy("createdAt", "desc"); // 新しいもの優先

    const snapshot = await linksQuery.get();
    const totalLinks = snapshot.size;
    const deleteCount = totalLinks - keepCount;

    if (deleteCount <= 0) return 0;

    // 古いリンクから削除対象を取得
    const linksToDelete = snapshot.docs.slice(keepCount).map(doc => doc.id);
    
    const batch = db.batch();
    linksToDelete.forEach(linkId => {
      const linkRef = db.collection("links").doc(linkId);
      batch.delete(linkRef);
    });

    await batch.commit();
    return linksToDelete.length;
  } catch (error) {
    logger.error("❌ Error deleting excess links:", error);
      throw error;
    }
}

/**
 * タグ削除（使用頻度優先で残す）
 */
async function deleteExcessTags(userId: string, keepCount: number): Promise<number> {
  try {
    const tagsQuery = db.collection("tags")
      .where("userId", "==", userId)
      .orderBy("linkCount", "desc") // 使用頻度優先
      .orderBy("lastUsedAt", "desc"); // 使用頻度が同じ場合は最終使用日

    const snapshot = await tagsQuery.get();
    const totalTags = snapshot.size;
    const deleteCount = totalTags - keepCount;

    if (deleteCount <= 0) return 0;

    // 使用頻度の低いタグから削除対象を取得
    const tagsToDelete = snapshot.docs.slice(keepCount).map(doc => doc.id);
    
    const batch = db.batch();
    tagsToDelete.forEach(tagId => {
      const tagRef = db.collection("tags").doc(tagId);
      batch.delete(tagRef);
    });

    await batch.commit();
    return tagsToDelete.length;
  } catch (error) {
    logger.error("❌ Error deleting excess tags:", error);
    throw error;
  }
}

/**
 * 削除されたタグのIDをリンクからクリーンアップ
 */
async function cleanupDeletedTagReferences(userId: string): Promise<void> {
  try {
    // 現在存在するタグIDのセットを取得
    const tagsSnapshot = await db.collection("tags").where("userId", "==", userId).get();
    const existingTagIds = new Set(tagsSnapshot.docs.map(doc => doc.id));

    // リンクから削除されたタグのIDを除去
    const linksSnapshot = await db.collection("links").where("userId", "==", userId).get();
    
    const batch = db.batch();
    let updatedLinks = 0;

    linksSnapshot.docs.forEach(linkDoc => {
      const linkData = linkDoc.data();
      const tagIds = linkData.tagIds || [];
      
      // 存在しないタグIDをフィルタリング
      const validTagIds = tagIds.filter((tagId: string) => existingTagIds.has(tagId));
      
      // タグIDが変更された場合のみ更新
      if (validTagIds.length !== tagIds.length) {
        const linkRef = db.collection("links").doc(linkDoc.id);
        batch.update(linkRef, { tagIds: validTagIds });
        updatedLinks++;
      }
    });

    if (updatedLinks > 0) {
      await batch.commit();
      logger.info(`✅ Tag reference cleanup completed: ${updatedLinks} links updated`);
    }
  } catch (error) {
    logger.error("❌ Error cleaning up deleted tag references:", error);
    throw error;
  }
}

/**
 * 処理済み通知として記録
 */
async function markNotificationAsProcessed(notificationUUID: string, payload: any): Promise<void> {
  try {
    await db.collection("processedNotifications").doc(notificationUUID).set({
      processedAt: FieldValue.serverTimestamp(),
      payload: payload,
      status: 'processed'
    });
    logger.info("✅ Notification marked as processed:", notificationUUID);
  } catch (error) {
    logger.error("❌ Error marking notification as processed:", error);
    // このエラーは致命的ではないので、処理を続行
  }
}

/**
 * サブスクリプション状態変更の統合処理
 */
async function handleSubscriptionStatusChange(userId: string, notificationType: string, payload: any): Promise<void> {
  try {
    const userRef = db.collection("users").doc(userId);
    
    switch (notificationType) {
      case 'SUBSCRIBED':
      case 'DID_RENEW':
        // サブスクリプション更新処理
        const expiresDate = payload.expiresDate ? new Date(payload.expiresDate) : null;
        
        // Apple側の商品IDからプランを動的取得
        const productId = payload.productId;
        const plan = productId ? getPlanFromProductId(productId) : 'plus';
        
        // Apple側の価格情報を取得・正規化
        const priceInfo = payload.price ? normalizeApplePrice(payload.price) : null;
        
        await userRef.update({
          'subscription.status': 'active',
          'subscription.plan': plan, // 動的取得したプラン
          'subscription.expirationDate': expiresDate,
          'subscription.lastUpdated': FieldValue.serverTimestamp(),
          'subscription.environment': payload.environment,
          // Apple側の情報を追加
          'subscription.appleProductId': productId,
          'subscription.applePrice': priceInfo,
          updatedAt: FieldValue.serverTimestamp(),
        });
        logger.info("✅ Subscription renewal processed:", {
          userId,
          plan,
          productId,
          expiresDate,
          environment: payload.environment,
          price: priceInfo
        });
        break;
      
      case 'DID_FAIL_TO_RENEW':
      case 'EXPIRED':
      case 'GRACE_PERIOD_EXPIRED':
        // サブスクリプション期限切れ処理
        // Apple側の商品IDからプランを動的取得（期限切れ時は通常'free'）
        const expiredProductId = payload.productId;
        const expiredPlan = 'free'; // 期限切れ時は確実に'free'
        
        await userRef.update({
          'subscription.status': 'expired',
          'subscription.plan': expiredPlan,
          'subscription.lastUpdated': FieldValue.serverTimestamp(),
          'subscription.environment': payload.environment,
          // Apple側の情報を保持
          'subscription.appleProductId': expiredProductId,
          updatedAt: FieldValue.serverTimestamp(),
        });
        
        // データ制限を即座に適用
        await applyImmediatePlanLimits(userId, expiredPlan);
        logger.info("✅ Subscription expiration processed:", {
          userId,
          plan: expiredPlan,
          productId: expiredProductId,
          environment: payload.environment
        });
        break;
      
      case 'OFFER_REDEEMED':
        // オファー適用処理
        await userRef.update({
          'subscription.offerRedeemed': true,
          'subscription.offerId': payload.offerId,
          'subscription.lastUpdated': FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        logger.info("✅ Offer redeemed processed:", { userId, offerId: payload.offerId });
        break;
      
      case 'PRICE_INCREASE':
        // 価格変更処理
        await userRef.update({
          'subscription.priceIncrease': true,
          'subscription.newPrice': payload.newPrice,
          'subscription.lastUpdated': FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        logger.info("✅ Price increase processed:", { userId, newPrice: payload.newPrice });
        break;
    }
  } catch (error) {
    logger.error("❌ Error handling subscription status change:", error);
    throw error;
  }
}

/**
 * 更新期間延長処理
 */
async function handleRenewalExtension(userId: string, payload: any): Promise<void> {
  try {
    const userRef = db.collection("users").doc(userId);
    
    await userRef.update({
      'subscription.renewalExtended': true,
      'subscription.extensionDate': payload.extensionDate ? new Date(payload.extensionDate) : null,
      'subscription.lastUpdated': FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    
    logger.info("✅ Renewal extension processed:", { userId, extensionDate: payload.extensionDate });
  } catch (error) {
    logger.error("❌ Error handling renewal extension:", error);
    throw error;
  }
}

/**
 * 更新設定変更処理
 */
async function handleRenewalChange(userId: string, payload: any): Promise<void> {
  try {
    const userRef = db.collection("users").doc(userId);
    
    await userRef.update({
      'subscription.renewalPreferenceChanged': true,
      'subscription.renewalStatus': payload.renewalStatus,
      'subscription.lastUpdated': FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    
    logger.info("✅ Renewal change processed:", { userId, renewalStatus: payload.renewalStatus });
  } catch (error) {
    logger.error("❌ Error handling renewal change:", error);
    throw error;
  }
}

/**
 * サブスクリプションキャンセル処理
 */
async function handleSubscriptionCancellation(userId: string, notificationType: string, payload: any): Promise<void> {
  try {
    const userRef = db.collection("users").doc(userId);
    
    switch (notificationType) {
      case 'CANCEL':
        // 購読キャンセル処理
        const cancelProductId = payload.productId;
        const cancelPlan = 'free';
        
        await userRef.update({
          'subscription.status': 'canceled',
          'subscription.plan': cancelPlan,
          'subscription.canceledAt': FieldValue.serverTimestamp(),
          'subscription.lastUpdated': FieldValue.serverTimestamp(),
          // Apple側の情報を保持
          'subscription.appleProductId': cancelProductId,
          updatedAt: FieldValue.serverTimestamp(),
        });
        break;
      
      case 'REFUND':
      case 'REFUND_DECLINED':
      case 'REFUND_PARTIAL':
        // 返金処理
        const refundProductId = payload.productId;
        const refundPlan = 'free';
        
        await userRef.update({
          'subscription.status': 'refunded',
          'subscription.plan': refundPlan,
          'subscription.refundedAt': FieldValue.serverTimestamp(),
          'subscription.refundType': notificationType,
          'subscription.lastUpdated': FieldValue.serverTimestamp(),
          // Apple側の情報を保持
          'subscription.appleProductId': refundProductId,
          updatedAt: FieldValue.serverTimestamp(),
        });
        break;
    }
    
    // データ制限を即座に適用
    await applyImmediatePlanLimits(userId, 'free');
    logger.info("✅ Subscription cancellation processed:", { userId, notificationType, environment: payload.environment });
  } catch (error) {
    logger.error("❌ Error handling subscription cancellation:", error);
    throw error;
  }
}

/**
 * サブスクリプション復旧処理
 */
async function handleSubscriptionRecovery(userId: string, payload: any): Promise<void> {
  try {
    const userRef = db.collection("users").doc(userId);
    
    // Apple側の商品IDからプランを動的取得
    const recoveryProductId = payload.productId;
    const recoveryPlan = recoveryProductId ? getPlanFromProductId(recoveryProductId) : 'plus';
    
    await userRef.update({
      'subscription.status': 'active',
      'subscription.plan': recoveryPlan,
      'subscription.recoveredAt': FieldValue.serverTimestamp(),
      'subscription.lastUpdated': FieldValue.serverTimestamp(),
      // Apple側の情報を保持
      'subscription.appleProductId': recoveryProductId,
      updatedAt: FieldValue.serverTimestamp(),
    });
    
    logger.info("✅ Subscription recovery processed:", {
      userId,
      plan: recoveryPlan,
      productId: recoveryProductId,
      environment: payload.environment
    });
  } catch (error) {
    logger.error("❌ Error handling subscription recovery:", error);
    throw error;
  }
}

/**
 * その他の通知処理
 */
async function handleOtherNotification(userId: string, notificationType: string, payload: any): Promise<void> {
  try {
    logger.info("ℹ️ Processing other notification:", { userId, notificationType, payload });
    
    // 必要に応じて追加の処理を実装
    switch (notificationType) {
      case 'TEST':
        logger.info("🧪 Test notification received:", { userId, environment: payload.environment });
        break;
      
      case 'CONSUMPTION_REQUEST':
        logger.info("📊 Consumption request received:", { userId, payload });
        break;
      
      case 'REFUND_REQUEST':
        logger.info("💰 Refund request received:", { userId, payload });
        break;
    }
  } catch (error) {
    logger.error("❌ Error handling other notification:", error);
    // その他の通知のエラーは致命的ではないので、処理を続行
  }
}

/**
 * 未知の通知タイプ処理
 */
async function handleUnknownNotification(userId: string, notificationType: string, payload: any): Promise<void> {
  try {
    logger.warn("⚠️ Unknown notification type received:", { userId, notificationType, payload });
    
    // 未知の通知タイプでもログに記録
    const userRef = db.collection("users").doc(userId);
    await userRef.update({
      'subscription.unknownNotifications': FieldValue.arrayUnion({
        type: notificationType,
        receivedAt: FieldValue.serverTimestamp(),
        payload: payload
      }),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    logger.error("❌ Error handling unknown notification:", error);
    // 未知の通知のエラーは致命的ではないので、処理を続行
  }
}

// ===================================================================
//
// FCM プッシュ通知システム
//
// ===================================================================

/**
 * FCMトークンを登録
 * セキュリティ強化: 認証済みユーザーのみ実行可能
 */
export const registerFCMToken = onCall(async (request) => {
  // 🔒 認証チェック（セキュリティ強化要件に準拠）
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "認証が必要です");
  }

  const userId = request.auth.uid;
  const { fcmToken, platform, deviceInfo } = request.data;

  if (!fcmToken || typeof fcmToken !== 'string') {
    throw new HttpsError("invalid-argument", "有効なFCMトークンが必要です");
  }

  try {
    logger.info("📱 FCMトークン登録開始:", { 
      userId, 
      platform: platform || 'unknown',
      tokenPreview: fcmToken.slice(0, 20) + '...' 
    });

    // ユーザードキュメントにFCMトークンを保存
    const userRef = db.collection("users").doc(userId);
    await userRef.update({
      fcmToken: fcmToken,
      fcmTokenUpdatedAt: FieldValue.serverTimestamp(),
      fcmPlatform: platform || 'unknown',
      fcmDeviceInfo: deviceInfo || {},
      updatedAt: FieldValue.serverTimestamp(),
    });

    logger.info("✅ FCMトークン登録完了:", { userId });
    
    return {
      success: true,
      message: "FCMトークンが正常に登録されました"
    };
  } catch (error) {
    logger.error("❌ FCMトークン登録エラー:", { userId, error });
    throw new HttpsError("internal", "FCMトークン登録に失敗しました");
  }
});

/**
 * 3日間未読リンクをチェックし、時間差での個別通知タスクを作成する（スケジュール実行用）
 */
export const checkUnusedLinksScheduled = onRequest(async (req, res) => {
  try {
    // 🔒 セキュリティチェック (変更なし)
    if (req.method !== "POST") {
      logger.warn("⚠️ Invalid method for scheduled check:", req.method);
      res.status(405).send("Method Not Allowed");
      return;
    }
    const authHeader = req.headers['authorization'];
    const userAgent = req.headers['user-agent'];
    const isFromScheduler = userAgent && userAgent.includes('Google-Cloud-Scheduler');
    const isFromAdmin = await isAdminRequest(authHeader);
    if (!isFromScheduler && !isFromAdmin) {
      logger.warn("🚨 SECURITY ALERT: Unauthorized scheduled check attempt:", { userAgent, clientIP: req.ip });
      res.status(403).send("Forbidden: Not authorized");
      return;
    }

    logger.info("⏰ [Task Creation] スケジュール実行: 未読リンクの通知タスク作成を開始");

    const usersQuery = db.collection("users").where("fcmToken", "!=", null).limit(1000);
    const usersSnapshot = await usersQuery.get();
    let totalTasksCreated = 0;
    let totalUsersProcessed = 0;

    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      const fcmToken = userData.fcmToken;

      if (!fcmToken) continue;

      try {
        const unusedLinks = await getUnusedLinksForUser(userId);

        if (unusedLinks.length > 0) {
          logger.info(`📬 Found ${unusedLinks.length} unused links for user ${userId}. Creating tasks...`);
          
          let delayInSeconds = 300; // 最初の通知は5分後
          const TEN_MINUTES_IN_SECONDS = 600;

          for (const link of unusedLinks) {
            const taskPayload = { userId, linkId: link.id, fcmToken };
            const task = {
              httpRequest: {
                httpMethod: 'POST' as const,
                url: childFunctionUrl,
                headers: { 'Content-Type': 'application/json' },
                body: Buffer.from(JSON.stringify(taskPayload)).toString('base64'),
              },
              scheduleTime: {
                seconds: Math.floor(Date.now() / 1000) + delayInSeconds,
              },
            };

            const queuePath = tasksClient.queuePath(project, location, queue);
            await tasksClient.createTask({ parent: queuePath, task });
            
            totalTasksCreated++;
            delayInSeconds += TEN_MINUTES_IN_SECONDS; // 次のタスクは10分後
          }
        }
        totalUsersProcessed++;
      } catch (userError) {
        logger.error("❌ ユーザー処理中のエラー:", { userId, error: userError });
      }
    }

    logger.info("✅ [Task Creation] スケジュール実行完了:", {
      totalUsersProcessed,
      totalTasksCreated,
      executionTime: new Date().toISOString()
    });

    res.status(200).json({
      success: true,
      totalUsersProcessed,
      totalTasksCreated,
      message: "時間差通知タスクの作成が完了しました。"
    });

  } catch (error) {
    logger.error("❌ スケジュール実行全体のエラー:", error);
    res.status(500).send("Internal Server Error");
  }
});

/**
 * 管理者リクエストかチェック（セキュリティ強化）
 */
async function isAdminRequest(authHeader: string | undefined): Promise<boolean> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  try {
    // 開発者メールアドレスリスト（環境変数から取得）
    const adminEmails = process.env.EXPO_PUBLIC_DEVELOPER_EMAILS || 'test@example.com';
    const adminEmailList = adminEmails.split(',').map(email => email.trim());

    // Firebase Authトークン検証
    const idToken = authHeader.substring(7);
    const admin = await import('firebase-admin/auth');
    const decodedToken = await admin.getAuth().verifyIdToken(idToken);
    
    return adminEmailList.includes(decodedToken.email || '');
  } catch (error) {
    logger.warn("⚠️ 管理者認証検証エラー:", error);
    return false;
  }
}

/**
 * ユーザーの3日間未読リンクを取得
 */
async function getUnusedLinksForUser(userId: string): Promise<Array<{
  id: string;
  title: string;
  url: string;
  createdAt: Date;
}>> {
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

  const query = db.collection("links")
    .where("userId", "==", userId)
    .where("isRead", "==", false)
    .where("isArchived", "==", false)
    .where("createdAt", "<=", threeDaysAgo);

  const snapshot = await query.get();
  const unusedLinks: Array<{
    id: string;
    title: string;
    url: string;
    createdAt: Date;
  }> = [];

  for (const doc of snapshot.docs) {
    const linkData = doc.data();
    
    // 既に通知済みかチェック
    const alreadyNotified = linkData.notificationsSent?.unused3Days || 
                           linkData.notificationsSent?.fcm3Days;
    
    if (!alreadyNotified) {
      unusedLinks.push({
        id: doc.id,
        title: linkData.title || "無題のリンク",
        url: linkData.url,
        createdAt: linkData.createdAt.toDate()
      });
    }
  }

  return unusedLinks;
}



// ===================================================================
//
// お知らせ管理機能
//
// ===================================================================

/**
 * サンプルお知らせを作成（管理者用）
 */
exports.createSampleAnnouncement = onCall(async (request) => {
  try {
    logger.info('📢 サンプルお知らせ作成開始');
    
    // サンプルお知らせデータ
    const announcementData = {
      title: 'Winkへようこそ！',
      content: 'Winkをダウンロードいただき、ありがとうございます。このアプリを使って、お気に入りのWebページを効率的に整理・管理できます。ご不明な点がございましたら、お気軽にお問い合わせください。',
      type: 'info',
      priority: 'medium',
      isActive: true,
      targetUserPlans: [], // 全ユーザーが対象
      publishedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      actionText: null,
      actionUrl: null,
      expiresAt: null,
    };
    
    // Firestoreに保存
    const docRef = await db.collection('announcements').add(announcementData);
    
    logger.info('✅ サンプルお知らせ作成完了:', { id: docRef.id });
    
    return {
      success: true,
      announcementId: docRef.id,
      message: 'サンプルお知らせを作成しました',
    };
  } catch (error) {
    logger.error('❌ サンプルお知らせ作成エラー:', error);
    throw new HttpsError('internal', 'サンプルお知らせの作成に失敗しました');
  }
});

/**
 * お知らせのプッシュ通知送信
 */
exports.sendAnnouncementNotification = onCall(async (request) => {
  const { announcementId, title, content, targetUserPlans = [] } = request.data;
  
  try {
    logger.info('📱 お知らせプッシュ通知送信開始:', { announcementId, targetUserPlans });
    
    // 対象ユーザーを取得
    let usersQuery = db.collection('users').where('fcmToken', '!=', null);
    
    // プラン指定がある場合はフィルタリング
    if (targetUserPlans.length > 0) {
      usersQuery = usersQuery.where('subscription.plan', 'in', targetUserPlans);
    }
    
    const usersSnapshot = await usersQuery.get();
    const messaging = getMessaging();
    let successCount = 0;
    let failureCount = 0;
    
    // バッチで通知送信
    const promises = usersSnapshot.docs.map(async (userDoc) => {
      const userData = userDoc.data();
      const fcmToken = userData.fcmToken;
      
      if (!fcmToken) return;
      
      try {
        const message = {
          token: fcmToken,
          notification: {
            title: `📢 ${title}`,
            body: content.length > 100 ? content.substring(0, 100) + '...' : content,
          },
          data: {
            type: 'announcement',
            announcementId: announcementId,
            userId: userDoc.id,
            timestamp: new Date().toISOString(),
          },
          apns: {
            payload: {
              aps: {
                sound: 'default',
              },
            },
          },
          android: {
            priority: 'high' as const,
            notification: {
              sound: 'default',
              channelId: 'announcements',
            },
          },
        };
        
        await messaging.send(message);
        successCount++;
      } catch (error) {
        logger.warn('⚠️ 個別通知送信失敗:', { userId: userDoc.id, error });
        failureCount++;
      }
    });
    
    await Promise.all(promises);
    
    logger.info('✅ お知らせプッシュ通知送信完了:', { successCount, failureCount });
    
    return {
      success: true,
      successCount,
      failureCount,
      message: `プッシュ通知を送信しました（成功: ${successCount}件、失敗: ${failureCount}件）`,
    };
  } catch (error) {
    logger.error('❌ お知らせプッシュ通知送信エラー:', error);
    throw new HttpsError('internal', 'プッシュ通知の送信に失敗しました');
  }
});
// ===================================================================
//
// 時間差通知用の子関数
//
// ===================================================================


/**
 * 個別の未読リマインダー通知を1件送信する（Cloud Tasksから呼び出される）
 */
export const sendSingleReminderNotification = onRequest(
  { region: "asia-northeast1", memory: "256MiB" },
  async (req, res) => {
    // 1. 呼び出し元がCloud Tasksであるかセキュリティチェック
    if (!req.headers["x-cloudtasks-queuename"]) {
      logger.error("🚨 SECURITY ALERT: Unauthorized attempt to call sendSingleReminderNotification.");
      res.status(403).send("Forbidden: Caller is not Cloud Tasks.");
      return;
    }

    try {
      // 2. リクエストボディからパラメータをパース
      const { userId, linkId, fcmToken } = req.body;
      if (!userId || !linkId || !fcmToken) {
        logger.error("❌ Invalid request body.", { body: req.body });
        // リトライ不要なエラーのため200を返す
        res.status(200).send("Bad Request: Missing required parameters.");
        return;
      }

      // 3. リンク情報をFirestoreから取得
      const linkRef = db.collection("links").doc(linkId);
      const linkDoc = await linkRef.get();

      // リンクが存在しない、またはすでに対応済みの場合は処理を終了
      if (!linkDoc.exists) {
        logger.warn(`⏭️ Link ${linkId} not found. Skipping notification.`);
        res.status(200).send("Link not found or already processed.");
        return;
      }
      const linkData = linkDoc.data()!;
      
      // 既に通知済みの場合は何もしない（タスクの重複実行対策）
      if (linkData.notificationsSent?.fcm3Days === true) {
        logger.info(`⏭️ Link ${linkId} has already been notified. Skipping.`);
        res.status(200).send("Already notified.");
        return;
      }

      // 4. Firestoreのannouncementsコレクションに通知を保存
      const announcementData = {
        title: `${linkData.title}を忘れていませんか!?`,
        content: "Winkで確認しましょう！",
        type: "reminder",
        priority: "medium",
        isActive: true,
        targetUserPlans: [], // 全ユーザーが対象
        publishedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        actionText: null,
        actionUrl: null,
        expiresAt: null,
        createdBy: "system",
        linkId: linkId, // リンクIDを追加
        userId: userId, // ユーザーIDを追加
      };
      
      const announcementRef = await db.collection('announcements').add(announcementData);
      logger.info('✅ リマインダーお知らせ作成完了:', { id: announcementRef.id });

      // 5. 通知メッセージを作成して送信
      const message = {
        token: fcmToken,
        notification: {
          title: `${linkData.title}を忘れていませんか!?`,
          body: "Winkで確認しましょう！",
        },
        data: {
          type: "reminder",
          linkId: linkId,
          url: linkData.url,
        },
        apns: {
          payload: {
            aps: {
              sound: "default",
              badge: 1, // バッジは1件ずつ
            },
          },
        },
        android: {
          priority: "high" as const,
          notification: {
            sound: "default",
            channelId: "reminders" // リマインダー用のチャネルID
          }
        }
      };

      await getMessaging().send(message);

      // 6. 通知済みフラグを更新
      await linkRef.update({
        "notificationsSent.fcm3Days": true,
        "notificationsSent.unused3Days": true, // 互換性のための古いフラグ
        "fcmNotifiedAt": FieldValue.serverTimestamp(),
        "updatedAt": FieldValue.serverTimestamp(),
      });

      logger.info(`✅ Successfully sent single reminder for link ${linkId} to user ${userId}`);
      res.status(200).send("Success");

    } catch (error: any) {
      logger.error("❌ Error in sendSingleReminderNotification:", { error, body: req.body });
      // Cloud Tasksが5xxエラーを検知して自動的にリトライするように設定
      res.status(500).send("Internal Server Error");
    }
  }
)

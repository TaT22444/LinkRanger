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
import { getTaggingPrompt } from "./prompts";
import { getMainEntitiesPrompt } from "./prompts";

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
setGlobalOptions({ region: "asia-northeast1" });

const db = getFirestore();

const AI_LIMITS = {
  free: { maxTagsPerRequest: 5, costPerRequest: 0.025 },
  pro: { maxTagsPerRequest: 8, costPerRequest: 0.025 },
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
  const cachedTags = await getCachedTags(combinedText);
  if (cachedTags) {
    logger.info(`🤖 [AI Tagging Cache Hit] Found cached tags for userId: ${userId}`, { tags: cachedTags });
    return { tags: cachedTags, fromCache: true, tokensUsed: 0, cost: 0 };
  }

  // 2. ドメインベースの簡易タグをまず生成
  const domainTags = generateTagsFromDomain(url);
  if (domainTags.length > 0 && combinedText.length < 100) {
    logger.info(`🤖 [AI Tagging Domain Based] Using domain-based tags for userId: ${userId}`, { domainTags });
    await cacheTags(combinedText, domainTags);
    return { tags: domainTags, fromCache: false, tokensUsed: 0, cost: 0 };
  }

  // 3. Webページからコンテンツを抽出
  let pageContent = { fullContent: "", pageTitle: "", pageDescription: "", keywords: [] as string[] };
  try {
    pageContent = await fetchPageContent(url);
  } catch (error) {
    logger.warn(`🤖 [AI Tagging Page Fetch Failed] Using fallback for userId: ${userId}`, { url, error });
    const fallbackTags = generateFallbackTags(combinedText, userPlan);
    return { tags: fallbackTags, fromCache: false, tokensUsed: 0, cost: 0 };
  }

  // 4. AIへの入力情報を整理
  const analysisTitle = pageContent.pageTitle || title;
  const analysisDescription = pageContent.pageDescription || description || "";
  const analysisContent = pageContent.fullContent || combinedText;
  const maxTags = AI_LIMITS[userPlan]?.maxTagsPerRequest || 5;

  // 5. タイトルとメタデータから重要キーワードを抽出
  const keyTerms = extractKeyTerms(analysisTitle, analysisDescription);
  if (pageContent.keywords) {
    pageContent.keywords.forEach(term => {
      if (term) keyTerms.add(term);
    });
  }
  if (url.includes("note.com")) keyTerms.add("note");

  // 6. Gemini APIでタグを生成
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });
  const prompt = getTaggingPrompt(analysisTitle, analysisDescription, analysisContent, maxTags, Array.from(keyTerms));
  let aiTags: string[] = [];
  try {
    logger.info(`🤖 [AI Tagging API Call] Calling Gemini API for userId: ${userId}`);
    const result = await model.generateContent(prompt);
    const response = await result.response;
    aiTags = (response.text() || "")
      .split(",")
      .map(tag => tag.trim())
      .filter(tag => tag && tag.length <= 20);
    logger.info(`🤖 [AI Tagging API Success] Received tags from Gemini for userId: ${userId}`, { aiTags });
  } catch (error) {
    logger.error(`🤖🔥 [AI Tagging API Failed] Gemini API call failed for userId: ${userId}`, { error });
    aiTags = generateFallbackTags(combinedText, userPlan);
  }

  // --- 主題固有名詞抽出AI呼び出し ---
  let mainEntities: string[] = [];
  try {
    const mainEntitiesPrompt = getMainEntitiesPrompt(analysisTitle, analysisDescription, analysisContent);
    const mainEntitiesModel = genAI.getGenerativeModel({ model: "gemini-pro" });
    const mainEntitiesResult = await mainEntitiesModel.generateContent(mainEntitiesPrompt);
    const mainEntitiesResponse = await mainEntitiesResult.response;
    mainEntities = (mainEntitiesResponse.text() || "")
      .split(",")
      .map(e => e.trim())
      .filter(e => e);
    logger.info(`[MainEntities] AI抽出:`, mainEntities);
  } catch (error) {
    logger.warn(`[MainEntities] AI抽出失敗`, error);
  }

  // --- タイトル・説明文から英単語・カタカナ語・サービス名らしき語を抽出 ---
  function extractCandidateEntities(...texts: string[]): string[] {
    const pattern = /\b([A-Za-z][A-Za-z0-9]+|[ァ-ヴー]{2,}|[一-龠々]{2,})\b/g;
    const set = new Set<string>();
    for (const text of texts) {
      const matches = text.match(pattern);
      if (matches) matches.forEach(word => set.add(word));
    }
    return Array.from(set);
  }
  const candidateEntities = extractCandidateEntities(analysisTitle, analysisDescription);

  // --- AIタグ・主題固有名詞・候補語を優先度順にマージし、maxTagsまで埋める ---
  const tagSet = new Set<string>();
  // 1. まずAIタグを追加
  for (const tag of aiTags) {
    if (tagSet.size < maxTags && tag && !tagSet.has(tag)) tagSet.add(tag);
  }
  // 2. 主題固有名詞を優先的に追加
  for (const entity of mainEntities) {
    if (tagSet.size < maxTags && entity && !tagSet.has(entity)) tagSet.add(entity);
  }
  // 3. 候補語をさらに追加
  for (const cand of candidateEntities) {
    if (tagSet.size < maxTags && cand && !tagSet.has(cand)) tagSet.add(cand);
  }
  const tags = Array.from(tagSet);

  // 7. 結果を検証・補強
  // const finalTags = new Set([...keyTerms, ...aiTags, ...domainTags]); // This line is no longer needed
  // const tags = Array.from(finalTags).slice(0, maxTags); // This line is no longer needed

  // 8. コスト計算と記録
  const tokensUsed = Math.ceil(prompt.length / 4); // 概算
  const cost = AI_LIMITS[userPlan]?.costPerRequest || 0;
  await recordAIUsage(userId, "tags", tokensUsed, combinedText.length, cost);
  await cacheTags(combinedText, tags);

  logger.info(`🤖 [AI Tagging Success] Generated tags for userId: ${userId}`, { tagsCount: tags.length, fromCache: false });

  return { tags, fromCache: false, tokensUsed, cost };
}


// ===================================================================
// 
// Callable Functions (UIから呼び出されるエンドポイント)
// 
// ===================================================================

export const generateAITags = onCall({ timeoutSeconds: 60, memory: "512MiB" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "認証が必要です");
  const { title, description, url, userId, userPlan = "free" } = request.data;
  if (!title || !url || !userId) throw new HttpsError("invalid-argument", "タイトル、URL、ユーザーIDは必須です");

  return await generateTagsLogic(userId, userPlan, url, title, description);
});

export const generateEnhancedAITags = onCall({ timeoutSeconds: 60, memory: "1GiB" }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "認証が必要です");
  const { metadata, userId, userPlan = "free" } = request.data;
  if (!metadata || !userId) throw new HttpsError("invalid-argument", "メタデータとユーザーIDが必要です");

  return await generateTagsLogic(userId, userPlan, metadata.url, metadata.title, metadata.description);
});


// ===================================================================
// 
// ヘルパー関数群
// 
// ===================================================================

async function fetchPageContent(url: string) {
  const response = await axios.get(url, { timeout: 10000, maxRedirects: 5 });
  const $ = cheerio.load(response.data);

  const pageTitle = $("meta[property='og:title']").attr("content") || $("title").text() || "";
  const pageDescription = $("meta[property='og:description']").attr("content") || $("meta[name='description']").attr("content") || "";
  const keywords = ($("meta[name='keywords']").attr("content") || "").split(",").map(k => k.trim());


  $("script, style, nav, header, footer, aside").remove();
  const mainContent = $("main, article, .content, .post").first();
  const fullContent = (mainContent.length ? mainContent.text() : $("body").text()).trim().slice(0, 2000);

  return { fullContent, pageTitle, pageDescription, keywords };
}

function extractKeyTerms(title: string, description?: string): Set<string> {
  const terms = new Set<string>();
  const knownEntities = [
    "Obsidian", "Cursor", "AI", "ChatGPT", "Gemini", "GitHub", "JavaScript", "TypeScript", "Python", "React", "Vue", "Node.js", "AWS", "Firebase", "Docker", "Figma", "Notion"
  ];
  knownEntities.forEach(entity => {
    if (new RegExp(`\\b${entity}\\b`, "i").test(title)) terms.add(entity);
  });
  // かぎ括弧内の語句
  const bracketMatches = title.match(/[「『]([^」』]+)[」』]/g);
  if (bracketMatches) bracketMatches.forEach(m => terms.add(m.slice(1, -1)));
  // 複合語・固有名詞（英数字+スペースを含む語句）
  const phraseMatches = title.match(/([A-Za-z0-9\u3040-\u30FF\u4E00-\u9FFF]+ [A-Za-z0-9\u3040-\u30FF\u4E00-\u9FFF]+)/g);
  if (phraseMatches) phraseMatches.forEach(m => terms.add(m.trim()));
  // 説明文にも同様の抽出を適用
  if (description) {
    const descPhraseMatches = description.match(/([A-Za-z0-9\u3040-\u30FF\u4E00-\u9FFF]+ [A-Za-z0-9\u3040-\u30FF\u4E00-\u9FFF]+)/g);
    if (descPhraseMatches) descPhraseMatches.forEach(m => terms.add(m.trim()));
  }
  return terms;
}

function generateTagsFromDomain(url: string): string[] {
  try {
    const domain = new URL(url).hostname.toLowerCase();
    if (domain.includes("note.com")) return ["note"];
    if (domain.includes("qiita.com")) return ["Qiita", "プログラミング"];
    if (domain.includes("zenn.dev")) return ["Zenn", "技術"];
    if (domain.includes("github.com")) return ["GitHub", "コード"];
    if (domain.includes("youtube.com")) return ["YouTube", "動画"];
  } catch {}
  return [];
}

function generateFallbackTags(text: string, plan: keyof typeof AI_LIMITS): string[] {
  const maxTags = AI_LIMITS[plan]?.maxTagsPerRequest || 5;
  const keywords = ["技術", "ビジネス", "デザイン", "プログラミング", "AI", "ツール"];
  const relevantTags = keywords.filter(kw => text.toLowerCase().includes(kw));
  return relevantTags.slice(0, maxTags);
}

async function getCachedTags(text: string): Promise<string[] | null> {
  const hash = generateContentHash(text);
  const cacheDoc = await db.collection("tagCache").doc(hash).get();
  if (cacheDoc.exists) {
    const data = cacheDoc.data();
    const isCacheValid = (new Date().getTime() - data?.createdAt.toDate().getTime()) < 7 * 24 * 60 * 60 * 1000;
    if (isCacheValid) return data?.tags || null;
  }
  return null;
}

async function cacheTags(text: string, tags: string[]): Promise<void> {
  const hash = generateContentHash(text);
  await db.collection("tagCache").doc(hash).set({ tags, createdAt: FieldValue.serverTimestamp() });
}

function generateContentHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

async function recordAIUsage(userId: string, type: string, tokensUsed: number, textLength: number, cost: number): Promise<void> {
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const day = now.toISOString().slice(0, 10);
  await db.collection("aiUsage").add({ userId, type, tokensUsed, textLength, cost, timestamp: FieldValue.serverTimestamp(), month, day });
  const summaryRef = db.collection("aiUsageSummary").doc(`${userId}_${month}`);
  await summaryRef.set({ totalRequests: FieldValue.increment(1), totalTokens: FieldValue.increment(tokensUsed), totalCost: FieldValue.increment(cost), lastUpdated: FieldValue.serverTimestamp() }, { merge: true });
}
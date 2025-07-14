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
// import validator from "validator"; // 一時的にコメントアウト
import parseUrl from "url-parse";
import DOMPurify from "isomorphic-dompurify";
import {getFirestore, FieldValue} from "firebase-admin/firestore";
import {initializeApp} from "firebase-admin/app";
import {GoogleGenerativeAI} from "@google/generative-ai";

// Firebase Admin初期化
initializeApp();

// Gemini AI初期化
const getGeminiApiKey = () => {
  try {
    // Firebase Functions v2では環境変数を優先し、v1のconfig()をフォールバックとして使用
    const envApiKey = process.env.GEMINI_API_KEY;
    let configApiKey = "";

    try {
      const config = functions.config();
      configApiKey = config.gemini?.api_key || "";
    } catch (configError) {
      logger.warn("Failed to get config", {configError});
    }

    const apiKey = envApiKey || configApiKey || "";

    logger.info("API Key check", {
      hasEnvGemini: !!envApiKey,
      hasConfigGemini: !!configApiKey,
      keyLength: apiKey ? apiKey.length : 0,
      keyPrefix: apiKey ? apiKey.substring(0, 8) + "..." : "none",
      source: envApiKey ? "env" : configApiKey ? "config" : "none",
    });

    return apiKey;
  } catch (error) {
    logger.error("Error getting API key", {error});
    return "";
  }
};

let genAI: GoogleGenerativeAI | null = null;

// Gemini AIクライアントを遅延初期化
const getGeminiClient = () => {
  if (!genAI) {
    const apiKey = getGeminiApiKey();
    if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY_HERE") {
      logger.error("Gemini API key not configured properly");
      throw new Error("Gemini API key not configured");
    }
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
};

// セキュリティ設定
setGlobalOptions({
  maxInstances: 10,
  region: "asia-northeast1", // 東京リージョン
});

const db = getFirestore();

// AI使用量制限設定
const AI_LIMITS = {
  guest: {
    aiTagGeneration: false,
    maxLinks: 10,
    message: "AIタグ生成機能を使用するには、アカウント登録が必要です",
  },
  free: {
    aiTagGeneration: true,
    monthlyAIRequests: 20,
    dailyAIRequests: 3,
    maxTextLength: 2000,
    maxTagsPerRequest: 3,
    maxMonthlyCost: 0.50,
    costPerRequest: 0.025,
    cooldownMinutes: 30,
  },
  pro: {
    aiTagGeneration: true,
    monthlyAIRequests: 200,
    dailyAIRequests: 15,
    maxTextLength: 8000,
    maxTagsPerRequest: 5,
    maxMonthlyCost: 5.00,
    costPerRequest: 0.025,
    cooldownMinutes: 5,
    contextAwareTagging: true,
    categoryTagging: true,
  },
} as const;

/**
 * AI使用量制限をチェックする関数
 * @param {string} userId ユーザーID
 * @param {string} plan ユーザープラン
 * @param {number} textLength テキスト長
 * @return {Promise<object>} チェック結果
 */
async function checkAIUsageLimit(
  userId: string,
  plan: keyof typeof AI_LIMITS,
  textLength: number
): Promise<{allowed: boolean; reason?: string}> {
  const limits = AI_LIMITS[plan];

  // プラン別機能チェック
  if (!limits.aiTagGeneration) {
    return {
      allowed: false,
      reason: limits.message || "AIタグ生成機能は利用できません",
    };
  }

  // テキスト長制限
  if (textLength > limits.maxTextLength) {
    return {
      allowed: false,
      reason: `テキストが長すぎます（最大${limits.maxTextLength}文字）`,
    };
  }

  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);
  // const today = now.toISOString().slice(0, 10); // 一時的に無効化

  // 月次制限チェック
  const monthlyDoc = await db
    .collection("aiUsageSummary")
    .doc(`${userId}_${currentMonth}`)
    .get();

  const monthlyUsage = monthlyDoc.exists ? monthlyDoc.data() : null;
  const currentMonthlyRequests = monthlyUsage?.totalRequests || 0;

  if (currentMonthlyRequests >= limits.monthlyAIRequests) {
    return {
      allowed: false,
      reason: `月間利用制限に達しました（${limits.monthlyAIRequests}回/月）`,
    };
  }

  // 日次制限チェック（一時的に無効化）
  // const dailyQuery = await db
  //   .collection("aiUsage")
  //   .where("userId", "==", userId)
  //   .where("day", "==", today)
  //   .get();

  // if (dailyQuery.size >= limits.dailyAIRequests) {
  //   return {
  //     allowed: false,
  //     reason: `日間利用制限に達しました（${limits.dailyAIRequests}回/日）`,
  //   };
  // }

  // クールダウンチェック（インデックスエラーを回避するため、シンプルなクエリに変更）
  // const lastUsageQuery = await db
  //   .collection("aiUsage")
  //   .where("userId", "==", userId)
  //   .limit(1)
  //   .get();

  // クールダウンチェックを一時的に無効化（インデックス問題回避）
  // if (!lastUsageQuery.empty) {
  //   const lastUsage = lastUsageQuery.docs[0].data();
  //   const lastUsageTime = lastUsage.timestamp?.toDate();
  //   if (lastUsageTime) {
  //     const timeDiff = now.getTime() - lastUsageTime.getTime();
  //     const cooldownMs = limits.cooldownMinutes * 60 * 1000;
  //     if (timeDiff < cooldownMs) {
  //       const remainingMinutes = Math.ceil((cooldownMs - timeDiff) / 60000);
  //       return {
  //         allowed: false,
  //         reason: `次回利用まで${remainingMinutes}分お待ちください`,
  //       };
  //     }
  //   }
  // }

  return {allowed: true};
}

/**
 * AI使用量を記録する関数
 * @param {string} userId ユーザーID
 * @param {"tags" | "summary" | "analysis"} type AI使用タイプ
 * @param {number} tokensUsed 使用トークン数
 * @param {number} textLength テキスト長
 * @param {number} cost コスト
 * @return {Promise<void>} 記録完了
 */
async function recordAIUsage(
  userId: string,
  type: "tags" | "summary" | "analysis",
  tokensUsed: number,
  textLength: number,
  cost: number
): Promise<void> {
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const day = now.toISOString().slice(0, 10);

  // 個別使用記録
  await db.collection("aiUsage").add({
    userId,
    type,
    tokensUsed,
    textLength,
    cost,
    timestamp: FieldValue.serverTimestamp(),
    month,
    day,
  });

  // 月次サマリー更新
  const summaryRef = db.collection("aiUsageSummary").doc(`${userId}_${month}`);
  await summaryRef.set(
    {
      userId,
      month,
      totalRequests: FieldValue.increment(1),
      totalTokens: FieldValue.increment(tokensUsed),
      totalCost: FieldValue.increment(cost),
      lastUpdated: FieldValue.serverTimestamp(),
    },
    {merge: true}
  );
}

// AIタグ生成
export const generateAITags = onCall(
  {
    timeoutSeconds: 30,
    memory: "512MiB",
    maxInstances: 3,
    region: "asia-northeast1",
  },
  async (request) => {
    const {title, description, url, userId, userPlan = "free"} = request.data;

    if (!request.auth) {
      throw new HttpsError("unauthenticated", "認証が必要です");
    }

    if (!title || !userId) {
      throw new HttpsError("invalid-argument", "タイトルとユーザーIDが必要です");
    }

    const combinedText = `${title} ${description || ""}`.trim();

    // 使用量制限チェック
    const usageCheck = await checkAIUsageLimit(
      userId,
      userPlan as keyof typeof AI_LIMITS,
      combinedText.length
    );

    if (!usageCheck.allowed) {
      throw new HttpsError(
        "resource-exhausted",
        usageCheck.reason || "利用制限に達しました"
      );
    }

    try {
      logger.info("Generating AI tags", {
        userId,
        textLength: combinedText.length,
        plan: userPlan,
      });

      // まずキャッシュをチェック
      const cachedTags = await getCachedTags(combinedText);
      if (cachedTags) {
        logger.info("Using cached tags", {userId, cachedTags});
        return {
          tags: cachedTags,
          fromCache: true,
          tokensUsed: 0,
          cost: 0,
        };
      }

      // ドメインベースの簡易タグ生成を試行
      const domainTags = generateTagsFromDomain(url);
      if (domainTags.length > 0 && combinedText.length < 100) {
        logger.info("Using domain-based tags", {userId, domainTags});
        await cacheTags(combinedText, domainTags);
        return {
          tags: domainTags,
          fromCache: false,
          tokensUsed: 0,
          cost: 0,
        };
      }

      // 実際のAI処理（現在はダミー）
      const aiTags = await generateTagsWithAI(combinedText, userPlan);
      const tokensUsed = Math.ceil(combinedText.length / 4);
      const limits = AI_LIMITS[userPlan as keyof typeof AI_LIMITS];
      const cost = "costPerRequest" in limits ? limits.costPerRequest : 0;

      // 使用量記録
      await recordAIUsage(
        userId,
        "tags",
        tokensUsed,
        combinedText.length,
        cost
      );

      // キャッシュに保存
      await cacheTags(combinedText, aiTags);

      logger.info("AI tags generated successfully", {
        userId,
        tagsCount: aiTags.length,
        tokensUsed,
        cost,
      });

      return {
        tags: aiTags,
        fromCache: false,
        tokensUsed,
        cost,
      };
    } catch (error) {
      logger.error("AI tags generation failed", {userId, error});
      throw new HttpsError("internal", "AIタグ生成に失敗しました");
    }
  }
);

/**
 * ドメインベースのタグ生成
 * @param {string} url URL
 * @return {string[]} タグ配列
 */
function generateTagsFromDomain(url: string): string[] {
  if (!url) return [];

  const DOMAIN_TAGS: {[key: string]: string[]} = {
    "github.com": ["プログラミング", "ツール", "コード"],
    "youtube.com": ["動画", "エンターテイメント"],
    "youtu.be": ["動画", "エンターテイメント"],
    "qiita.com": ["プログラミング", "技術", "記事"],
    "note.com": ["記事", "ブログ"],
    "medium.com": ["記事", "ブログ"],
    "dev.to": ["プログラミング", "技術"],
    "stackoverflow.com": ["プログラミング", "Q&A"],
    "reddit.com": ["コミュニティ", "ディスカッション"],
    "twitter.com": ["SNS", "ニュース"],
    "x.com": ["SNS", "ニュース"],
    "instagram.com": ["SNS", "写真"],
    "linkedin.com": ["ビジネス", "キャリア"],
    "amazon.co.jp": ["ショッピング", "商品"],
    "amazon.com": ["ショッピング", "商品"],
    "netflix.com": ["動画", "映画", "ドラマ"],
    "spotify.com": ["音楽", "ポッドキャスト"],
    "wikipedia.org": ["百科事典", "知識"],
  };

  try {
    const domain = new URL(url).hostname.toLowerCase();
    return DOMAIN_TAGS[domain] || [];
  } catch {
    return [];
  }
}

/**
 * AI処理でタグを生成（Google Gemini使用）
 * @param {string} text 入力テキスト
 * @param {string} plan ユーザープラン
 * @return {Promise<string[]>} 生成されたタグ
 */
async function generateTagsWithAI(
  text: string,
  plan: string
): Promise<string[]> {
  try {
    // APIキーの確認
    const apiKey = getGeminiApiKey();
    if (!apiKey || apiKey === "YOUR_GEMINI_API_KEY_HERE") {
      logger.error("Gemini API key not configured properly");
      throw new Error("Gemini API key not configured");
    }

    // プランに応じた制限を取得
    const limits = AI_LIMITS[plan as keyof typeof AI_LIMITS];
    const maxTags = "maxTagsPerRequest" in limits ?
      limits.maxTagsPerRequest : 3;

    // 入力テキストの検証
    if (!text || text.trim().length === 0) {
      logger.warn("Empty text provided for AI tag generation");
      return ["その他"];
    }

    // Gemini Proモデルを取得
    const geminiClient = getGeminiClient();
    const model = geminiClient.getGenerativeModel({model: "gemini-pro"});

    // テキストを適切に分割してタイトルと内容を抽出
    const lines = text.split("\n").filter((line) => line.trim().length > 0);
    const title = lines[0] || text.slice(0, 100);
    const content = lines.slice(1).join("\n") || text;

    // プロンプトを作成
    const prompt = `あなたは日本語でWebリンクの内容を分析し、適切なタグを生成するAIアシスタントです。
以下のルールに従ってタグを生成してください：

【重要】「その他」は絶対に使用しないでください。必ず具体的で有用なタグを生成してください。

1. 最大${maxTags}個のタグを生成
2. 各タグは日本語で、簡潔で分かりやすいもの（2-8文字程度）
3. 技術系、ビジネス系、エンターテイメント系など、内容に応じて適切なカテゴリのタグを選択
4. 一般的で再利用可能なタグを優先（例：「プログラミング」「デザイン」「ビジネス」）
5. 固有名詞よりも汎用的なカテゴリを優先
6. タグはカンマ区切りで出力し、他の説明は不要
7. 「その他」「一般」「情報」などの曖昧なタグは使わない

例：
- GitHub関連コンテンツ → プログラミング, ツール, オープンソース
- YouTube動画 → 動画, エンターテイメント, 教育
- ビジネス記事 → ビジネス, 経営, マーケティング
- AI・機械学習 → AI, 技術, データサイエンス
- Webデザイン → デザイン, ウェブ, UI/UX
- プロトコル・技術仕様 → 技術, 仕様, プロトコル

以下のWebページの内容を分析して、適切なタグを生成してください：

タイトル: ${title.slice(0, 200)}
内容: ${content.slice(0, 800)}`;

    logger.info("Sending request to Gemini API", {
      textLength: text.length,
      plan,
      maxTags,
    });

    // Gemini APIを呼び出し
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text();

    if (!responseText) {
      logger.error("Empty response from Gemini API");
      throw new Error("Gemini API response is empty");
    }

    logger.info("Received response from Gemini API", {
      responseLength: responseText.length,
      response: responseText.substring(0, 200),
    });

    // レスポンスをパースしてタグを抽出
    const tags = responseText
      .split(",")
      .map((tag: string) => tag.trim())
      .filter((tag: string) => tag.length > 0 && tag.length <= 20)
      .slice(0, maxTags); // 制限数まで

    logger.info("Gemini tags generated successfully", {
      inputLength: text.length,
      plan,
      generatedTags: tags,
      responseLength: responseText.length,
    });

    return tags.length > 0 ? tags : ["その他"];
  } catch (error) {
    logger.error("Gemini API error details", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      plan,
      textLength: text?.length || 0,
    });

    // Gemini APIエラーの場合、フォールバック処理
    return generateFallbackTags(text, plan);
  }
}

/**
 * フォールバック用のタグ生成
 * @param {string} text 入力テキスト
 * @param {string} plan ユーザープラン
 * @return {string[]} 生成されたタグ
 */
function generateFallbackTags(text: string, plan: string): string[] {
  const limits = AI_LIMITS[plan as keyof typeof AI_LIMITS];
  const maxTags = "maxTagsPerRequest" in limits ? limits.maxTagsPerRequest : 3;

  const SUGGESTED_TAGS = [
    "プログラミング", "技術", "ビジネス", "デザイン", "マーケティング",
    "AI", "機械学習", "ウェブ開発", "モバイル", "データ分析",
    "ニュース", "教育", "エンターテイメント", "ライフスタイル", "健康",
    "旅行", "料理", "音楽", "映画", "本", "ゲーム", "スポーツ",
    "ファッション", "写真", "アート", "DIY", "ガジェット", "レビュー",
    "仕様", "プロトコル", "ツール", "オープンソース", "フレームワーク",
    "ライブラリ", "API", "データベース", "セキュリティ", "クラウド",
  ];

  // テキストの内容に基づいて関連タグを選択（改善版）
  const lowerText = text.toLowerCase();
  const relevantTags: string[] = [];

  // 直接マッチング
  SUGGESTED_TAGS.forEach((tag) => {
    if (lowerText.includes(tag.toLowerCase()) ||
        lowerText.includes(tag.toLowerCase().replace(/ー/g, ""))) {
      relevantTags.push(tag);
    }
  });

  // キーワードベースマッチング
  if (relevantTags.length < maxTags) {
    const keywords = lowerText.split(/[\s\p{P}]+/u);
    const keywordTags = SUGGESTED_TAGS.filter((tag) =>
      keywords.some((keyword) =>
        keyword.length > 2 && (
          tag.toLowerCase().includes(keyword) ||
          keyword.includes(tag.toLowerCase())
        )
      )
    );

    keywordTags.forEach((tag) => {
      if (!relevantTags.includes(tag)) {
        relevantTags.push(tag);
      }
    });
  }

  // ドメインベースの推測
  if (relevantTags.length < maxTags) {
    if (lowerText.includes("github") || lowerText.includes("git")) {
      if (!relevantTags.includes("プログラミング")) relevantTags.push("プログラミング");
      if (!relevantTags.includes("ツール")) relevantTags.push("ツール");
    }
    if (lowerText.includes("youtube") || lowerText.includes("video")) {
      if (!relevantTags.includes("動画")) relevantTags.push("動画");
    }
    if (lowerText.includes("ai") || lowerText.includes("人工知能")) {
      if (!relevantTags.includes("AI")) relevantTags.push("AI");
      if (!relevantTags.includes("技術")) relevantTags.push("技術");
    }
    if (lowerText.includes("protocol") || lowerText.includes("プロトコル")) {
      if (!relevantTags.includes("技術")) relevantTags.push("技術");
      if (!relevantTags.includes("仕様")) relevantTags.push("仕様");
    }
  }

  const selectedTags = relevantTags.slice(0, maxTags);

  // 最低1個のタグを保証（「その他」は避ける）
  if (selectedTags.length === 0) {
    // URLやドメインから推測
    if (lowerText.includes(".com") || lowerText.includes("http")) {
      selectedTags.push("ウェブ");
    } else if (lowerText.includes("技術") || lowerText.includes("tech")) {
      selectedTags.push("技術");
    } else {
      selectedTags.push("情報"); // 最後の手段
    }
  }

  return selectedTags;
}

/**
 * タグキャッシュから取得
 * @param {string} text 入力テキスト
 * @return {Promise<string[] | null>} キャッシュされたタグ
 */
async function getCachedTags(text: string): Promise<string[] | null> {
  const hash = generateContentHash(text);
  const cacheDoc = await db.collection("tagCache").doc(hash).get();

  if (cacheDoc.exists) {
    const data = cacheDoc.data();
    const createdAt = data?.createdAt?.toDate();
    const now = new Date();
    const daysDiff = (now.getTime() - createdAt.getTime()) /
      (1000 * 60 * 60 * 24);

    // 7日以内のキャッシュのみ有効
    if (daysDiff <= 7) {
      // 使用回数を増やす
      await cacheDoc.ref.update({
        usageCount: FieldValue.increment(1),
        lastUsedAt: FieldValue.serverTimestamp(),
      });
      return data?.tags || null;
    }
  }

  return null;
}

/**
 * タグをキャッシュに保存
 * @param {string} text 入力テキスト
 * @param {string[]} tags タグ配列
 * @return {Promise<void>} 保存完了
 */
async function cacheTags(text: string, tags: string[]): Promise<void> {
  const hash = generateContentHash(text);
  const cacheRef = db.collection("tagCache").doc(hash);

  await cacheRef.set({
    contentHash: hash,
    tags,
    createdAt: FieldValue.serverTimestamp(),
    lastUsedAt: FieldValue.serverTimestamp(),
    usageCount: 1,
  });
}

/**
 * テキストのハッシュを生成
 * @param {string} text 入力テキスト
 * @return {string} ハッシュ値
 */
function generateContentHash(text: string): string {
  // 簡易ハッシュ生成（実際の実装では crypto を使用）
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // 32bit整数に変換
  }
  return Math.abs(hash).toString(36);
}

// 許可されたドメインのホワイトリスト（例）
const ALLOWED_DOMAINS = [
  "github.com",
  "stackoverflow.com",
  "medium.com",
  "dev.to",
  "qiita.com",
  "zenn.dev",
  "note.com",
  "youtube.com",
  "youtu.be",
  "twitter.com",
  "x.com",
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "reddit.com",
  "wikipedia.org",
  "google.com",
  "microsoft.com",
  "apple.com",
  "amazon.com",
  "netflix.com",
  "spotify.com",
  "adobe.com",
  "figma.com",
  "notion.so",
  "slack.com",
  "discord.com",
  "zoom.us",
  "dropbox.com",
  "atlassian.com",
  "trello.com",
  "asana.com",
  "canva.com",
  "unsplash.com",
  "pexels.com",
  // 日本のメジャーサイト
  "yahoo.co.jp",
  "nikkei.com",
  "asahi.com",
  "mainichi.jp",
  "yomiuri.co.jp",
  "nhk.or.jp",
  "cookpad.com",
  "rakuten.co.jp",
  "amazon.co.jp",
  "mercari.com",
  "hatena.ne.jp",
  "fc2.com",
  "livedoor.com",
  "goo.ne.jp",
  "excite.co.jp",
  "biglobe.ne.jp",
  "so-net.ne.jp",
  "nifty.com",
  "yahoo.com",
  "google.co.jp",
  "microsoft.co.jp",
  "apple.co.jp",
  "sony.co.jp",
  "nintendo.co.jp",
  "toyota.co.jp",
  "honda.co.jp",
  "softbank.jp",
  "docomo.ne.jp",
  "au.com",
  "jal.co.jp",
  "ana.co.jp",
  "jreast.co.jp",
  "jrwest.co.jp",
  "jr-central.co.jp",
  "jr-kyushu.co.jp",
  "jr-shikoku.co.jp",
  "jr-hokkaido.co.jp",
];

// ブラックリストドメイン（悪意のあるサイトや危険なサイト）
const BLACKLISTED_DOMAINS = [
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "10.0.0.0",
  "172.16.0.0",
  "192.168.0.0",
  // 追加のブラックリスト
  "malware.com",
  "phishing.com",
  "spam.com",
];

// プライベートIPアドレスの範囲
const PRIVATE_IP_RANGES = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^0\./,
  /^169\.254\./,
  /^224\./,
  /^255\./,
];

interface LinkMetadata {
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
  domain?: string;
  author?: string;
  publishedDate?: string;
  keywords?: string[];
  language?: string;
  type?: string;
  favicon?: string;
}


/**
 * URLの安全性を検証する関数
 * @param {string} url 検証するURL
 * @return {object} 検証結果
 */
function validateUrl(url: string): { isValid: boolean; error?: string } {
  try {
    // 基本的なURL形式チェック
    const urlObj = new URL(url);
    if (!["http:", "https:"].includes(urlObj.protocol)) {
      return {isValid: false, error: "Invalid URL format"};
    }

    const parsedUrl = parseUrl(url);

    // プロトコルチェック
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      return {
        isValid: false,
        error: "Only HTTP and HTTPS protocols are allowed",
      };
    }

    // ホスト名チェック
    if (!parsedUrl.hostname) {
      return {isValid: false, error: "Invalid hostname"};
    }

    // IPアドレスチェック（プライベートIPを禁止）
    const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
    if (ipRegex.test(parsedUrl.hostname)) {
      const isPrivate = PRIVATE_IP_RANGES.some((range) =>
        range.test(parsedUrl.hostname)
      );
      if (isPrivate) {
        return {
          isValid: false,
          error: "Private IP addresses are not allowed",
        };
      }
    }

    // ブラックリストチェック
    const domain = parsedUrl.hostname.toLowerCase();
    if (BLACKLISTED_DOMAINS.some((blacklisted) =>
      domain.includes(blacklisted)
    )) {
      return {isValid: false, error: "Domain is blacklisted"};
    }

    // ホワイトリストチェック（開発段階では警告のみ）
    const isWhitelisted = ALLOWED_DOMAINS.some((allowed) =>
      domain === allowed || domain.endsWith("." + allowed)
    );

    if (!isWhitelisted) {
      logger.warn(`Domain not in whitelist: ${domain}`);
      // 本番環境では return { isValid: false, error: 'Domain not whitelisted' };
    }

    return {isValid: true};
  } catch (error) {
    return {isValid: false, error: "URL validation failed"};
  }
}

/**
 * HTMLから安全にメタデータを抽出する関数
 * @param {string} html HTMLコンテンツ
 * @param {string} originalUrl 元のURL
 * @return {LinkMetadata} 抽出されたメタデータ
 */
function extractMetadata(html: string, originalUrl: string): LinkMetadata {
  const $ = cheerio.load(html);
  const metadata: LinkMetadata = {};

  try {
    const parsedUrl = parseUrl(originalUrl);
    metadata.domain = parsedUrl.hostname;

    // タイトル取得（優先順位: og:title > twitter:title > title タグ）
    const ogTitle = $("meta[property=\"og:title\"]").attr("content");
    const twitterTitle = $("meta[name=\"twitter:title\"]").attr("content");
    const titleTag = $("title").text();

    if (ogTitle) {
      metadata.title = DOMPurify.sanitize(ogTitle.trim());
    } else if (twitterTitle) {
      metadata.title = DOMPurify.sanitize(twitterTitle.trim());
    } else if (titleTag) {
      metadata.title = DOMPurify.sanitize(titleTag.trim());
    }

    // 説明取得
    const ogDescription =
      $("meta[property=\"og:description\"]").attr("content");
    const twitterDescription =
      $("meta[name=\"twitter:description\"]").attr("content");
    const metaDescription = $("meta[name=\"description\"]").attr("content");

    if (ogDescription) {
      metadata.description = DOMPurify.sanitize(ogDescription.trim());
    } else if (twitterDescription) {
      metadata.description = DOMPurify.sanitize(twitterDescription.trim());
    } else if (metaDescription) {
      metadata.description = DOMPurify.sanitize(metaDescription.trim());
    }

    // 画像URL取得
    const ogImage = $("meta[property=\"og:image\"]").attr("content");
    const twitterImage = $("meta[name=\"twitter:image\"]").attr("content");

    if (ogImage) {
      metadata.imageUrl = ogImage.trim();
    } else if (twitterImage) {
      metadata.imageUrl = twitterImage.trim();
    }

    // サイト名取得
    const ogSiteName = $("meta[property=\"og:site_name\"]").attr("content");
    if (ogSiteName) {
      metadata.siteName = DOMPurify.sanitize(ogSiteName.trim());
    }

    // 著者取得
    const author = $("meta[name=\"author\"]").attr("content") ||
      $("meta[property=\"article:author\"]").attr("content");
    if (author) {
      metadata.author = DOMPurify.sanitize(author.trim());
    }

    // 公開日取得
    const publishedDate =
      $("meta[property=\"article:published_time\"]").attr("content") ||
      $("meta[name=\"date\"]").attr("content") ||
      $("meta[property=\"og:updated_time\"]").attr("content");
    if (publishedDate) {
      metadata.publishedDate = publishedDate.trim();
    }

    // キーワード取得
    const keywords = $("meta[name=\"keywords\"]").attr("content");
    if (keywords) {
      metadata.keywords = keywords.split(",").map((k) =>
        DOMPurify.sanitize(k.trim())
      );
    }

    // 言語取得
    const language = $("html").attr("lang") ||
      $("meta[http-equiv=\"content-language\"]").attr("content");
    if (language) {
      metadata.language = language.trim();
    }

    // コンテンツタイプ取得
    const ogType = $("meta[property=\"og:type\"]").attr("content");
    if (ogType) {
      metadata.type = ogType.trim();
    }

    // ファビコン取得
    const favicon = $("link[rel=\"icon\"]").attr("href") ||
      $("link[rel=\"shortcut icon\"]").attr("href") ||
      $("link[rel=\"apple-touch-icon\"]").attr("href");
    if (favicon) {
      metadata.favicon = favicon.trim();
    }

    return metadata;
  } catch (error) {
    logger.error("Error extracting metadata:", error);
    return metadata;
  }
}

// メタデータ取得のメイン関数
export const fetchMetadata = onCall(
  {
    timeoutSeconds: 30,
    memory: "256MiB",
    maxInstances: 5,
    region: "asia-northeast1",
  },
  async (request): Promise<LinkMetadata> => {
    const {url, userId} = request.data as { url: string; userId?: string };

    // ログ記録
    logger.info("Fetching metadata", {url, userId});

    try {
      // URL検証
      const validation = validateUrl(url);
      if (!validation.isValid) {
        logger.warn("URL validation failed", {
          url,
          error: validation.error,
        });
        throw new HttpsError(
          "invalid-argument",
          validation.error || "Invalid URL"
        );
      }

      // HTTPリクエストの設定
      const config = {
        timeout: 10000, // 10秒タイムアウト
        maxRedirects: 5,
        headers: {
          "User-Agent": "LinkRanger/1.0 (Metadata Fetcher)",
          "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ja,en-US;q=0.7,en;q=0.3",
          "Accept-Encoding": "gzip, deflate",
          "DNT": "1",
          "Connection": "keep-alive",
          "Upgrade-Insecure-Requests": "1",
        },
        maxContentLength: 5 * 1024 * 1024, // 5MB制限
        validateStatus: (status: number) => status >= 200 && status < 400,
      };

      // HTTPリクエスト実行
      const response = await axios.get(url, config);

      // Content-Typeチェック
      const contentType = response.headers["content-type"] || "";
      if (!contentType.includes("text/html") &&
          !contentType.includes("application/xhtml")) {
        logger.warn("Non-HTML content type", {url, contentType});
        throw new HttpsError(
          "failed-precondition",
          "URL does not return HTML content"
        );
      }

      // メタデータ抽出
      const metadata = extractMetadata(response.data, url);

      // フォールバック処理
      if (!metadata.title) {
        const parsedUrl = parseUrl(url);
        metadata.title = parsedUrl.hostname.replace("www.", "");
      }

      logger.info("Metadata fetched successfully", {
        url,
        title: metadata.title,
      });

      return metadata;
    } catch (error) {
      logger.error("Error fetching metadata", {url, error});

      // Axiosエラーの詳細処理
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const message = error.response?.statusText || error.message;

        if (status === 404) {
          throw new HttpsError("not-found", "URL not found");
        } else if (status === 403) {
          throw new HttpsError("permission-denied", "Access denied");
        } else if (status && status >= 500) {
          throw new HttpsError(
            "unavailable",
            "Server error: " + message
          );
        } else if (error.code === "ECONNABORTED") {
          throw new HttpsError("deadline-exceeded", "Request timeout");
        } else {
          throw new HttpsError(
            "unavailable",
            "Network error: " + message
          );
        }
      }

      // その他のエラー
      throw new HttpsError("internal", "Failed to fetch metadata");
    }
  }
);

/**
 * ヘルスチェック用のエンドポイント
 * @return {Promise<object>} ヘルスチェック結果
 */
export const healthCheck = onCall(
  {
    timeoutSeconds: 10,
    memory: "256MiB",
    maxInstances: 1,
    region: "asia-northeast1",
  },
  async () => {
    try {
      return {
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: "1.0.0",
        region: "asia-northeast1",
      };
    } catch (error) {
      logger.error("Health check failed", {error});
      throw new HttpsError("internal", "Health check failed");
    }
  }
);

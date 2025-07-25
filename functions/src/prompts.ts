export const getTaggingPrompt = (
  title: string,
  description: string,
  content: string,
  maxTags: number, // This parameter is still used in index.ts for slicing, but not directly in the prompt template anymore.
  keyTerms: string[]
): string => {
  const keyTermsString = keyTerms.join(", ");

  return `
あなたはプロのコンテンツキュレーターです。以下の情報に基づいて、この記事に最も的確で役立つタグを付けてください。

### 指示
- 日本語で、5〜7個のタグを生成してください。
- 非常に具体的な技術やトピック（例: React, Next.js, SwiftUI）と、より広範なカテゴリ（例: フロントエンド, モバイル開発, UIデザイン）をバランス良く含めてください。
- 最も重要なキーワードは必ずタグに含めてください。
- タグはカンマ区切りで出力してください。例: `React,フロントエンド,状態管理,Recoil,Web開発`

### 入力情報
- **タイトル:** ${title}
- **説明文:** ${description}
- **抽出された重要キーワード:** ${keyTermsString}
- **記事の冒頭（8000文字）:** ${content}

### あなたの仕事
上記の情報を総合的に分析し、この記事の内容を最もよく表すタグを生成してください。
`.trim();
};

export const getTaggingPrompt = (
  title: string,
  description: string,
  content: string,
  maxTags: number,
  keyTerms: string[]
): string => {
  const keyTermsString = keyTerms.join(", ");

  return `
あなたはWebページの内容を分析し、最適なタグを生成するAIアシスタントです。
以下のルールと情報を参考にして、最も的確なタグを生成してください。

### ルール
- タグは日本語で、最大${maxTags}個までとします。
- タイトル・説明・本文に現れるサービス名・商品名・ブランド名・地名などの固有名詞や複合語（例：「Google One」「デザインシステム」「草津温泉」など）は、必ずタグに含めてください。
- 抽象的すぎる単語（例：「情報」「記事」）は避け、より具体的なタグを優先してください。
- 出力はカンマ区切りの文字列のみとし、他の余計なテキストは含めないでください。
  例: タグ1,タグ2,タグ3

### 入力情報
【タイトル】: ${title}
【説明】: ${description}
【本文（抜粋）】: ${content.slice(0, 1500)}

### 出力
`.trim();
};

export const getMainEntitiesPrompt = (
  title: string,
  description: string,
  content: string
): string => {
  return `
あなたはWebページの内容を分析し、最も重要な固有名詞（サービス名・商品名・ブランド名・地名など）を1つまたは複数抽出してください。タグの一つに「テスト」というタグを絶対に含めて
- タイトル・説明・本文を参考にしてください。
- その記事やページで“主に扱われている”固有名詞のみを抽出してください。
- 抽出した固有名詞はカンマ区切りで出力してください。
- 余計な説明やテキストは不要です。

【タイトル】: ${title}
【説明】: ${description}
【本文（抜粋）】: ${content.slice(0, 1500)}
`.trim();
};
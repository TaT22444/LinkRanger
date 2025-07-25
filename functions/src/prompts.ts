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
- 【重要キーワード】に含まれる単語は、内容と関連性が高いと判断した場合、必ずタグに含めてください。
- 複合語や固有名詞（例：「デザインシステム」「草津温泉」）は、分割せず一つのタグとして扱ってください。
- 抽象的すぎる単語（例：「情報」「記事」）は避け、より具体的なタグを優先してください。
- 出力はカンマ区切りの文字列のみとし、他の余計なテキストは含めないでください。
  例: タグ1,タグ2,タグ3

### 入力情報
【重要キーワード】: ${keyTermsString}
【タイトル】: ${title}
【説明】: ${description}
【本文（抜粋）】: ${content.slice(0, 1500)}

### 出力
`.trim();
};

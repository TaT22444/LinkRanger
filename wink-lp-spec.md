# Wink LP制作仕様書 - Astro版

## 🎯 プロジェクト概要

**プロダクト名:** Wink  
**タグライン:** Link Management for Modern Life  
**コンセプト:** AIを活用したスマートなリンク管理アプリのLP

---

## 🎨 デザインコンセプト

### テイスト
- 海外の洗練されたAI SaaSライクな高級感
- Midjourney、Vercel、Linear、OpenAI等を参考
- ミニマリスティックで機能美重視

### カラーパレット
```
Primary: #8A2BE2 (Blue Violet) - メインアクセント色
Background: #121212 (Dark Background)
Cards: #2A2A2A (Card Background)  
Text Primary: #FFFFFF (White)
Text Secondary: #CCCCCC (Light Gray)
Text Muted: #888888 (Muted Gray)
Text Subtle: #666666 (Dark Gray)
Error: #FF6B6B (Red)
Success: #4CAF50 (Green)
```

### タイポグラフィ戦略
- **基本方針:** 色はあまり使わず色に頼らず、タイポグラフィで表現。
- **英語:** Inter, -apple-system, BlinkMacSystemFont, Segoe UI
- **日本語:** Hiragino Sans, Yu Gothic Medium, sans-serif
- **サイズ:** 大胆なサイズ差でメリハリを演出
- **余白:** 潤沢な余白で洗練された印象

---

## 📱 コンテンツ構成

### 1. Hero Section
**メインキャッチ:** "Link Management for Modern Life"  
**サブキャッチ:** "AIが自動でタグ付け・要約・整理。散らかったブックマークにサヨナラ。"

**CTAボタン:** 
- Primary: "App Storeからダウンロード" (App Store badge)
- Secondary: "機能を詳しく見る"

**Hero Visual:**
- アプリのメイン画面のモックアップ
- または抽象的なリンク管理のイメージ
- ダークテーマで統一感

### 2. Problem Section
**見出し:** "こんな悩みありませんか？"

**問題提起:**
- ブックマークが散らかって見つからない
- 後で読もうと思ったリンクを忘れる  
- 同じような記事を何度も保存してしまう
- チーム・家族とのリンク共有が煩雑

### 3. Solution Section  
**見出し:** "Winkが解決します"

**主要機能:**
1. **AI自動タグ付け** - URLを保存するだけで適切なタグを自動生成
2. **スマート要約** - 長い記事も一目で内容を把握
3. **重複検知** - 同じ記事の重複保存を防止
4. **外部アプリ連携** - SNSや他アプリからワンタップで保存

### 4. Features Section
**見出し:** "パワフルな機能"

**機能詳細:**
- **Universal Links対応** - あらゆるアプリからWinkに保存
- **優先度管理** - 重要度で自動ソート
- **オフライン対応** - ネットが無くても内容確認可能  
- **多デバイス同期** - iPhone、iPad、Mac全てで同期

### 5. Pricing Section
**見出し:** "プラン・価格"

**プラン構成:**
- **Free:** 月20リンクまで、基本機能
- **Plus:** 月額[価格]円、月100リンクまで
- **Pro:** 月額[価格]円、無制限、全機能

### 6. CTA Section
**見出し:** "今すぐ始めよう"
**サブテキスト:** "無料で今日からスマートなリンク管理を"

---

## 🛠 技術仕様 (Astro)

### 推奨構成
```
src/
├── components/
│   ├── Hero.astro
│   ├── Problem.astro  
│   ├── Solution.astro
│   ├── Features.astro
│   ├── Pricing.astro
│   ├── CTA.astro
│   └── Layout.astro
├── styles/
│   └── global.css
└── pages/
    └── index.astro
```

### CSS設計方針
- **CSS Variables** でカラーパレット管理
- **CSS Grid & Flexbox** でレスポンシブ対応
- **CSS Custom Properties** でダークテーマ実装
- **Intersection Observer** で scroll reveal アニメーション

### レスポンシブ対応
```css
/* Breakpoints */
--mobile: 320px - 767px
--tablet: 768px - 1023px  
--desktop: 1024px+
```

### アニメーション
- **Subtle animations** - 過度ではない上品なアニメーション
- **Scroll-triggered reveals** - 要素が画面に入ったタイミング
- **Micro-interactions** - ホバー、フォーカス状態
- **Loading states** - スムーズな読み込み表現

---

## 📝 コピーライティング方針

### トーン
- **Professional yet approachable** - 親しみやすさと信頼性の両立
- **Benefit-focused** - 技術より利用者メリット重視
- **Concise & clear** - 簡潔で分かりやすい表現

### 使用禁止表現
- 過度な感情表現（"革命的"、"驚愕"等）
- 技術専門用語の多用
- 競合他社の直接比較

---

## 🚀 実装優先度

### Phase 1 (MVP)
- Hero Section
- Problem → Solution flow
- 基本的なレスポンシブ対応

### Phase 2
- Features詳細
- Pricing Section
- アニメーション実装

### Phase 3  
- パフォーマンス最適化
- SEO対応
- A/Bテスト準備

---

## 📊 成功指標

- **美的評価:** "洗練されている"と感じるか
- **理解度:** 30秒で機能・価値を理解できるか
- **行動誘発:** App Storeダウンロード意向向上
- **ブランド認知:** "高品質なアプリ"の印象形成

---

**この仕様書を元に、Winkの魅力を最大限に伝える洗練されたLPを制作してください。**
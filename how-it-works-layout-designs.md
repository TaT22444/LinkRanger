# How It Works セクション - レイアウト・デザイン案

## 🎨 デザインコンセプト
**参考:** Linear, Vercel, OpenAI, Midjourney, Notion
**テイスト:** ミニマル、洗練、機能美重視

---

## 📐 レイアウト案1: タイムラインフロー（推奨）

### 構成
```
Hero Message
    ↓
[Step 1] ←→ [Step 2] ←→ [Step 3] ←→ [Step 4] ←→ [Step 5]
    ↓
Before/After Comparison
```

### 詳細設計

#### Hero Section
```html
<section class="how-it-works-hero">
  <h2>たった3秒で、リンクが知識に変わる</h2>
  <p>複雑な操作は一切なし。保存した瞬間からAIが働き始めます</p>
  <div class="flow-preview-animation">
    <!-- 3秒カウントダウン + 変換アニメーション -->
  </div>
</section>
```

#### Timeline Steps
```html
<section class="steps-timeline">
  <!-- 中央に番号付きタイムライン -->
  <div class="timeline-container">
    <div class="timeline-line"></div>
    
    <!-- Step 1 -->
    <article class="step-item" data-step="1">
      <div class="step-visual">
        <!-- アプリモックアップ・アイコン -->
      </div>
      <div class="step-content">
        <span class="step-number">01</span>
        <h3>どこからでも、ワンタップ保存</h3>
        <ul class="step-features">
          <li>あらゆるアプリから直接共有</li>
          <li>Universal Links対応</li>
          <li>保存完了まで3秒</li>
        </ul>
      </div>
    </article>
    
    <!-- Step 2-5 同様の構成 -->
  </div>
</section>
```

### CSS設計例
```css
.steps-timeline {
  max-width: 1200px;
  margin: 0 auto;
  padding: 120px 24px;
}

.timeline-container {
  position: relative;
}

.timeline-line {
  position: absolute;
  left: 50%;
  top: 0;
  bottom: 0;
  width: 2px;
  background: linear-gradient(180deg, #8A2BE2 0%, rgba(138, 43, 226, 0.1) 100%);
  transform: translateX(-50%);
}

.step-item {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 80px;
  margin-bottom: 160px;
  align-items: center;
}

.step-item:nth-child(even) {
  direction: rtl; /* 右左交互配置 */
}

.step-number {
  font-size: 14px;
  font-weight: 600;
  color: #8A2BE2;
  letter-spacing: 0.1em;
}

.step-content h3 {
  font-size: 32px;
  font-weight: 700;
  color: #FFFFFF;
  line-height: 1.2;
  margin: 16px 0 24px;
}

.step-features li {
  font-size: 18px;
  color: #CCCCCC;
  margin-bottom: 12px;
  position: relative;
  padding-left: 24px;
}

.step-features li::before {
  content: '✓';
  position: absolute;
  left: 0;
  color: #8A2BE2;
  font-weight: bold;
}
```

---

## 📐 レイアウト案2: カードグリッド式

### 構成
```
Hero Message
    ↓
[Card 1] [Card 2] [Card 3]
[Card 4] [Card 5]
    ↓
Summary CTA
```

### 詳細設計
```html
<section class="steps-grid">
  <h2>5つのステップで完結</h2>
  
  <div class="steps-container">
    <div class="step-card" data-step="1">
      <div class="card-header">
        <span class="step-badge">01</span>
        <div class="step-icon">📱</div>
      </div>
      <h3>瞬間保存</h3>
      <p>どこからでも、ワンタップ保存</p>
      <ul class="card-features">
        <li>あらゆるアプリから直接共有</li>
        <li>Universal Links対応</li>
        <li>保存完了まで3秒</li>
      </ul>
    </div>
    <!-- 他のカード同様 -->
  </div>
</section>
```

### CSS設計例
```css
.steps-grid {
  max-width: 1400px;
  margin: 0 auto;
  padding: 120px 24px;
}

.steps-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 32px;
  margin-top: 80px;
}

.step-card {
  background: #2A2A2A;
  border-radius: 24px;
  padding: 48px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.3s ease;
}

.step-card:hover {
  border-color: #8A2BE2;
  transform: translateY(-8px);
  box-shadow: 0 20px 40px rgba(138, 43, 226, 0.1);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.step-badge {
  background: #8A2BE2;
  color: white;
  padding: 8px 16px;
  border-radius: 100px;
  font-size: 14px;
  font-weight: 600;
}

.step-icon {
  font-size: 32px;
}
```

---

## 📐 レイアウト案3: インタラクティブフロー

### 構成
```
Hero Message
    ↓
Interactive Step Navigator
[Previous] [Current Step Detail] [Next]
    ↓
Progress Indicator (1/5)
```

### 特徴
- ユーザーが能動的にステップを操作
- 詳細な説明とアニメーション
- モバイルフレンドリー

---

## 🎯 推奨レイアウト: タイムラインフロー

### なぜこのレイアウトが最適か

1. **ストーリー性** - 時系列的な体験フローが直感的
2. **視覚的インパクト** - 中央のタイムラインが印象的
3. **情報の整理** - 各ステップが独立して理解しやすい
4. **スクロール体験** - 自然な縦スクロールでエンゲージメント向上

### Before/After セクション
```html
<section class="before-after-comparison">
  <div class="comparison-container">
    <div class="before-state">
      <h3>Before</h3>
      <div class="state-visual">
        <!-- 散らかったブックマークの図 -->
      </div>
      <p>散らかったブックマーク</p>
    </div>
    
    <div class="transformation-arrow">
      <span>Wink</span>
      <div class="arrow">→</div>
    </div>
    
    <div class="after-state">
      <h3>After</h3>
      <div class="state-visual">
        <!-- 整理された知識ライブラリの図 -->
      </div>
      <p>AIパートナーと構築する知識ライブラリ</p>
    </div>
  </div>
</section>
```

---

## 📱 レスポンシブ対応

### デスクトップ (1024px+)
- タイムライン左右交互配置
- 大きなビジュアル要素
- ホバーエフェクト充実

### タブレット (768px-1023px)
- 中央寄せレイアウト
- ビジュアルサイズ調整
- タッチ操作対応

### モバイル (〜767px)
- シンプルな縦一列配置
- コンパクトなカードデザイン
- スワイプナビゲーション

---

## ⚡ アニメーション仕様

### スクロールトリガー
- 各ステップが画面に入ったタイミングで fade-in
- タイムラインの線が上から下へ描画
- 数字カウントアップ効果

### インタラクション
- ホバー時の subtle lift 効果
- カード境界線のグロー
- アイコンの micro-animation

### パフォーマンス
- CSS transforms 使用（GPU加速）
- will-change プロパティ活用
- Intersection Observer で最適化

---

## 🛠 実装優先度

### Phase 1: 基本レイアウト
- HTML構造構築
- 基本CSS（レスポンシブ含む）
- タイポグラフィ調整

### Phase 2: ビジュアル強化
- アイコン・画像素材追加
- Before/After比較セクション
- 色彩・余白の微調整

### Phase 3: インタラクション
- スクロールアニメーション
- ホバー効果
- パフォーマンス最適化

この設計で、機能説明を超えた「体験価値」を伝える魅力的なセクションが完成します！
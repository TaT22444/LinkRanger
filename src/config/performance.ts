// パフォーマンス設定
export const PERFORMANCE_CONFIG = {
  // キャッシュ設定
  CACHE: {
    ANNOUNCEMENTS_DURATION: 5 * 60 * 1000, // 5分
    LINKS_DURATION: 10 * 60 * 1000, // 10分
    TAGS_DURATION: 10 * 60 * 1000, // 10分
    USER_DURATION: 10 * 60 * 1000, // 10分
    MAX_SIZE: 30, // 最大キャッシュ数
  },
  
  // リアルタイム更新設定
  REALTIME: {
    MAX_ACTIVE_SUBSCRIPTIONS: 2, // 最大アクティブサブスクリプション数
    THROTTLE_DELAY: 100, // スロットリング遅延（ms）
  },
  
  // レンダリング最適化
  RENDER: {
    BATCH_SIZE: 10, // バッチサイズ
    DEBOUNCE_DELAY: 300, // デバウンス遅延（ms）
    MEMO_DEPENDENCIES_LIMIT: 5, // メモ化依存関係の制限
  },
  
  // データ処理
  DATA: {
    MAX_LINKS_PER_BATCH: 50, // バッチあたりの最大リンク数
    MAX_TAGS_PER_BATCH: 20, // バッチあたりの最大タグ数
    SEARCH_DEBOUNCE: 500, // 検索デバウンス（ms）
  }
};

// パフォーマンス監視
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, number[]> = new Map();
  
  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }
  
  startTimer(operation: string): () => void {
    const startTime = performance.now();
    return () => {
      const duration = performance.now() - startTime;
      this.recordMetric(operation, duration);
    };
  }
  
  private recordMetric(operation: string, duration: number): void {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }
    this.metrics.get(operation)!.push(duration);
    
    // メトリクスが多すぎる場合は古いものを削除
    const metrics = this.metrics.get(operation)!;
    if (metrics.length > 100) {
      this.metrics.set(operation, metrics.slice(-50));
    }
  }
  
  getAverageTime(operation: string): number {
    const metrics = this.metrics.get(operation);
    if (!metrics || metrics.length === 0) return 0;
    
    const sum = metrics.reduce((acc, val) => acc + val, 0);
    return sum / metrics.length;
  }
  
  getMetrics(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [operation, metrics] of this.metrics.entries()) {
      result[operation] = this.getAverageTime(operation);
    }
    return result;
  }
  
  clearMetrics(): void {
    this.metrics.clear();
  }
}

// パフォーマンス最適化ユーティリティ
export const PerformanceUtils = {
  // デバウンス関数
  debounce<T extends (...args: any[]) => any>(
    func: T,
    delay: number
  ): (...args: Parameters<T>) => void {
    let timeoutId: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delay);
    };
  },
  
  // スロットリング関数
  throttle<T extends (...args: any[]) => any>(
    func: T,
    delay: number
  ): (...args: Parameters<T>) => void {
    let lastCall = 0;
    return (...args: Parameters<T>) => {
      const now = Date.now();
      if (now - lastCall >= delay) {
        lastCall = now;
        func(...args);
      }
    };
  },
  
  // メモ化の依存関係を最適化
  optimizeDependencies(deps: any[]): any[] {
    return deps.map(dep => {
      if (typeof dep === 'object' && dep !== null) {
        // オブジェクトの場合はJSON.stringifyで比較
        return JSON.stringify(dep);
      }
      return dep;
    });
  },
  
  // パフォーマンス警告
  warnSlowOperation(operation: string, duration: number, threshold: number = 100): void {
    if (duration > threshold) {
      console.warn(`⚠️ パフォーマンス警告: ${operation}が${duration.toFixed(2)}msかかりました（閾値: ${threshold}ms）`);
    }
  }
};

export default PERFORMANCE_CONFIG;

import { Platform } from 'react-native';
import {
  initConnection,
  endConnection,
  getProducts,
  getSubscriptions,
  requestPurchase,
  requestSubscription,
  finishTransaction,
  getAvailablePurchases,
  purchaseUpdatedListener,
  purchaseErrorListener,
  Product,
  Subscription,
  PurchaseError,
  SubscriptionPurchase,
} from 'react-native-iap';
import { UserPlan } from '../types';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
import Constants from 'expo-constants';

// バックエンドの検証関数を呼び出す準備
const validateAppleReceiptFunction = httpsCallable(functions, 'validateAppleReceipt');
// TODO: Google Play用の検証関数も将来的に追加
// const validateGooglePlayReceiptFunction = httpsCallable(functions, 'validateGooglePlayReceipt');

// App Store/Google Playで設定したプロダクトID
// NOTE: App Store Connectで設定したProduct IDと正確に一致させる必要がある
const productSkus = Platform.select({
  ios: [
    process.env.EXPO_PUBLIC_APPLE_PLUS_MONTHLY || 'com.tat22444.wink.plus.monthly',     // Apple Store Connectで設定した正しいID
  ],
  android: [
    // TODO: Google Play Consoleで設定したIDを追加
    process.env.EXPO_PUBLIC_GOOGLE_PLUS_MONTHLY || 'com.tat22444.wink.plus.monthly',
  ],
}) || [];

let purchaseUpdateSubscription: any = null;
let purchaseErrorSubscription: any = null;

export class IapService {
  private static instance: IapService;
  private initialized = false;
  private products: (Product | Subscription)[] = [];

  static getInstance(): IapService {
    if (!IapService.instance) {
      IapService.instance = new IapService();
    }
    return IapService.instance;
  }

  /**
   * IAPサービスの初期化
   * アプリ起動時に一度だけ呼び出す
   */
  async initialize(): Promise<void> {
    const timestamp = new Date().toISOString();
    
    if (this.initialized) {
      console.log('[SUB-MONITOR] [' + timestamp + '] IAP Service: Already initialized', {
        environment: __DEV__ ? 'development' : 'production',
        platform: Platform.OS
      });
      return;
    }
    
    console.log('[SUB-MONITOR] [' + timestamp + '] IAP Service: Initializing...', {
      platform: Platform.OS,
      productSkus,
      skuCount: productSkus.length,
      environment: __DEV__ ? 'development' : 'production'
    });

    // Development環境でのモック処理
    if (__DEV__) {
      console.log('[SUB-MONITOR] [' + timestamp + '] Development mode - using mock IAP functionality');
      this.setupDevelopmentMockListeners(); // 開発環境用のモックリスナーを設定
      this.initialized = true;
      return;
    }
    
    try {
      // IAP接続を初期化
      const connectionResult = await initConnection();
      console.log('🛒 IAP Connection result:', connectionResult);
      
      this.initialized = true;

      // 過去の未完了トランザクションを処理（アプリ起動時の安全策）
      if (Platform.OS === 'ios') {
        try {
          const availablePurchases = await getAvailablePurchases();
          console.log('🛒 Found available purchases:', availablePurchases.length);
          for (const purchase of availablePurchases) {
            try {
              // バックエンドにレシートを送信して検証
              console.log(`[SUB-MONITOR] Initializing: Validating available purchase...`, { productId: purchase.productId });
              await this.validateReceipt(purchase);

              // 検証が成功した場合のみトランザクションを完了
              await finishTransaction({ purchase, isConsumable: false });
              console.log(`[SUB-MONITOR] Initializing: Finished available purchase transaction.`, { productId: purchase.productId });
            } catch (error) {
              console.error(`[SUB-MONITOR] Initializing: Failed to validate/finish available purchase. Will retry on next launch.`, { error });
              // エラーが発生した場合はトランザクションを完了させず、次回のアプリ起動時に再試行されるようにする
            }
          }
        } catch (purchaseError) {
          console.warn('⚠️ Failed to clear previous transactions:', purchaseError);
        }
      }

      // 購入処理のリスナーをセットアップ
      this.setupListeners();
      console.log('✅ IAP Service: Initialized successfully');
    } catch (error: any) {
      console.error('❌ IAP Service: Initialization failed', error);
      
      // 詳細なエラー情報をログ出力
      if (error?.code) {
        console.error('❌ IAP Error Code:', error.code);
        console.error('❌ IAP Error Message:', error.message);
        console.error('❌ IAP Error Details:', error.debugMessage || error.userInfo);
      
        // TestFlight/本番環境での初期化失敗の詳細ログ
        if (error.code === 'E_IAP_NOT_AVAILABLE') {
          console.error('❌ IAP not available. Check App Store Connect configuration:');
          console.error('   1. Product IDs match exactly');
          console.error('   2. Products are approved and available for sale');
          console.error('   3. Contracts, tax, and banking information complete');
          console.error('   4. Bundle ID matches App Store Connect');
        }
      }
      
      this.initialized = false;
      throw error;
    }
  }

  /**
   * IAPサービスの終了処理
   * アプリ終了時に呼び出す
   */
  async terminate(): Promise<void> {
    if (purchaseUpdateSubscription) {
      purchaseUpdateSubscription.remove();
      purchaseUpdateSubscription = null;
    }
    if (purchaseErrorSubscription) {
      purchaseErrorSubscription.remove();
      purchaseErrorSubscription = null;
    }
    await endConnection();
    this.initialized = false;
    console.log('🛒 IAP Service: Terminated');
  }

  /**
   * 開発環境用のモックリスナーを設定
   */
  private setupDevelopmentMockListeners(): void {
    const timestamp = new Date().toISOString();
    console.log('[SUB-MONITOR] [' + timestamp + '] Setting up development mock listeners');
    
    // 開発環境でのサブスクリプションシミュレーション用ログ
    console.log('[SUB-MONITOR] [' + timestamp + '] Mock subscription monitoring active', {
      environment: 'development',
      availableProducts: productSkus,
      mockPurchaseEnabled: true,
      realIAPDisabled: true
    });
  }

  /**
   * 購入イベントのリスナーをセットアップ
   */
  private setupListeners(): void {
    purchaseUpdateSubscription = purchaseUpdatedListener(async (purchase: SubscriptionPurchase) => {
      const timestamp = new Date().toISOString();
      
      // サブスクリプション監視用の専用ログ（絡り込み用）
      console.log(`[SUB-MONITOR] [${timestamp}] Purchase updated:`, {
        productId: purchase.productId,
        transactionId: purchase.transactionId,
        originalTransactionId: purchase.originalTransactionIdentifierIOS,
        transactionDate: purchase.transactionDate,
        expirationDate: purchase.originalTransactionDateIOS,
        autoRenewing: purchase.autoRenewingAndroid,
        environment: __DEV__ ? 'development' : 'production'
      });
      
      const receipt = purchase.transactionReceipt;
      if (receipt) {
        try {
          // バックエンドにレシートを送信して検証
          console.log(`[SUB-MONITOR] [${timestamp}] Validating receipt...`);
          await this.validateReceipt(purchase);

          // トランザクションを完了
          await finishTransaction({ purchase, isConsumable: false });
          console.log(`[SUB-MONITOR] [${timestamp}] Transaction finished - Product: ${purchase.productId}`);
        } catch (error) {
          console.error(`[SUB-MONITOR] [${timestamp}] Receipt validation failed:`, error);
          // ユーザーに状況を通知し、次のアクションを促す
          Alert.alert(
            "購入処理の確認に失敗しました",
            "ネットワーク接続が不安定な可能性があります。購入は記録されていますので、ネットワークの良い環境でアプリを再起動するとプランが反映されます。",
            [{ text: "OK" }]
          );
        }
      }
    });

    purchaseErrorSubscription = purchaseErrorListener((error: PurchaseError) => {
      const timestamp = new Date().toISOString();
      console.error(`[SUB-MONITOR] [${timestamp}] Purchase error:`, {
        code: error.code,
        message: error.message,
        debugMessage: error.debugMessage
      });
    });
  }

  /**
   * バックエンドでレシートを検証する
   * @param purchase 購入情報
   */
  private async validateReceipt(purchase: SubscriptionPurchase): Promise<void> {
    console.log(`Validating receipt for platform: ${Platform.OS}`);
    if (Platform.OS === 'ios') {
      const { transactionReceipt, productId } = purchase;
      if (transactionReceipt) {
        await validateAppleReceiptFunction({ 
          receipt: transactionReceipt, 
          productId 
        });
        console.log('✅ Apple receipt validation successful');
      }
    } else if (Platform.OS === 'android') {
      // TODO: Implement Google Play validation
      
    }
  }

  /**
   * ストアから販売可能な商品情報を取得する
   */
  async getProducts(): Promise<(Product | Subscription)[]> {
    const timestamp = new Date().toISOString();
    
    if (!this.initialized) {
      console.error('[SUB-MONITOR] [' + timestamp + '] IAP Service not initialized');
      throw new Error('IAP service is not initialized. Call initialize() first.');
    }
    
    console.log('[SUB-MONITOR] [' + timestamp + '] Fetching products...', {
      environment: __DEV__ ? 'development' : 'production',
      platform: Platform.OS,
      requestedSKUs: productSkus
    });
    
    // Development環境では模擬的なプロダクトを返す
    if (__DEV__) {
      console.log('[SUB-MONITOR] [' + timestamp + '] Development mode - returning mock products');
      const mockProducts = [
        {
          productId: 'com.tat22444.wink.plus.monthly',
          price: '500',
          localizedPrice: '¥500',
          currency: 'JPY',
          title: 'LinkRanger Plus Monthly',
          description: 'Plus プラン - 月額',
        },
        {
          productId: 'com.tat22444.wink.pro.monthly', 
          price: '1280',
          localizedPrice: '¥1,280',
          currency: 'JPY',
          title: 'LinkRanger Pro Monthly',
          description: 'Plus プラン - 月額',
        }
      ] as (Product | Subscription)[];
      
      this.products = mockProducts;
      
      console.log('[SUB-MONITOR] [' + timestamp + '] Mock products loaded', {
        count: mockProducts.length,
        environment: 'development',
        products: mockProducts.map(p => ({
          productId: p.productId,
          localizedPrice: (p as any).localizedPrice,
          price: (p as any).price
        }))
      });
      
      return mockProducts;
    }
    
    if (!productSkus || productSkus.length === 0) {
      console.error('❌ No product SKUs configured');
      throw new Error('No product SKUs configured for current platform');
    }
    
    console.log('🛒 Fetching products from store...', { 
      platform: Platform.OS,
      skus: productSkus,
      skuCount: productSkus.length 
    });
    
    try {
      let fetchedProducts: (Product | Subscription)[] = [];
      
      if (Platform.OS === 'ios') {
        // iOSの場合はSubscriptionとして取得
        fetchedProducts = await getSubscriptions({ skus: productSkus });
        console.log('🛒 iOS subscriptions fetched:', {
          count: fetchedProducts.length,
          products: fetchedProducts.map(p => ({
            productId: p.productId,
            price: (p as any).price,
            localizedPrice: (p as any).localizedPrice
          }))
        });
      } else {
        // Androidの場合はProductとして取得
        fetchedProducts = await getProducts({ skus: productSkus });
        console.log('🛒 Android products fetched:', {
          count: fetchedProducts.length,
          products: fetchedProducts.map(p => ({
            productId: p.productId,
            price: (p as any).price,
            localizedPrice: (p as any).localizedPrice
          }))
        });
      }

      if (fetchedProducts.length === 0) {

      }

      this.products = fetchedProducts;
      return fetchedProducts;
    } catch (error: any) {
      console.error('❌ Failed to fetch products', error);
      
      // 詳細なエラー情報をログ出力
      if (error?.code) {
        console.error('❌ Product fetch error code:', error.code);
        console.error('❌ Product fetch error message:', error.message);
        
        if (error.code === 'E_IAP_NOT_AVAILABLE') {
          console.error('❌ Products not available. Check App Store Connect:');
          console.error('   1. Products exist and approved for sale');
          console.error('   2. Product IDs match exactly');
          console.error('   3. Contracts, tax, and banking complete');
          console.error('   4. Using real device (not simulator)');
          console.error('   5. Bundle ID matches configuration');
        }
      }
      
      throw error;
    }
  }

  /**
   * 指定されたプランの購入をリクエストする
   * @param plan 購入したいプラン
   */
  async purchasePlan(plan: UserPlan): Promise<void> {
    const timestamp = new Date().toISOString();
    const sku = this.getSkuForPlan(plan);
    
    if (!sku) {
      console.error('[SUB-MONITOR] [' + timestamp + '] No SKU found for plan:', { plan });
      throw new Error(`No SKU found for plan: ${plan}`);
    }
    
    console.log('[SUB-MONITOR] [' + timestamp + '] Purchase request initiated', {
      plan,
      sku,
      environment: __DEV__ ? 'development' : 'production',
      platform: Platform.OS
    });
    
    // TestFlight環境の判定: standaloneアプリで、開発モードではないが、TestFlightビルドである場合
    const isTestFlight = !__DEV__ && Constants.executionEnvironment === 'standalone' &&
                         process.env.EXPO_PUBLIC_ENABLE_TEST_ACCOUNTS === 'true';
    
    // Development環境のみ模擬的な購入成功（TestFlight環境は除く）
    if (__DEV__ && !isTestFlight) {
      console.log('[SUB-MONITOR] [' + timestamp + '] Development mode - simulating purchase flow', {
        plan,
        sku,
        mockDuration: '2 seconds',
        willSucceed: true
      });
      
      return new Promise((resolve) => {
        setTimeout(() => {
          const completionTimestamp = new Date().toISOString();
          console.log('[SUB-MONITOR] [' + completionTimestamp + '] Mock purchase completed successfully', {
            plan,
            sku,
            transactionId: 'mock_' + Date.now(),
            environment: 'development',
            status: 'completed'
          });
          resolve();
        }, 2000); // 2秒待機でリアルな購入をシミュレート
      });
    }
    
    try {
      if (Platform.OS === 'ios') {
        await requestSubscription({ sku });
      } else {
        // Androidのサブスクリプション購入処理
        // const offers = this.products.find(p => p.productId === sku)?.subscriptionOfferDetails;
        // if (offers && offers.length > 0) {
        //   await requestPurchase({ sku, purchaseToken: offers[0].offerToken });
        // } else {
        //   throw new Error('No subscription offer found for Android');
        // }

      }
    } catch (error) {
      console.error(`❌ Purchase request failed for SKU: ${sku}`, error);
      throw error;
    }
  }

  /**
   * 過去の購入情報を復元する
   */
  async restorePurchases(): Promise<void> {
    const timestamp = new Date().toISOString();
    
    if (!this.initialized) {
      console.error('[SUB-MONITOR] [' + timestamp + '] IAP not initialized for restore');
      throw new Error('IAP not initialized');
    }
    
    console.log('[SUB-MONITOR] [' + timestamp + '] Restore purchases initiated', {
      environment: __DEV__ ? 'development' : 'production',
      platform: Platform.OS
    });
    
    // TestFlight環境の判定: standaloneアプリで、開発モードではないが、TestFlightビルドである場合
    const isTestFlight = !__DEV__ && Constants.executionEnvironment === 'standalone' &&
                         process.env.EXPO_PUBLIC_ENABLE_TEST_ACCOUNTS === 'true';
    
    // Development環境のみ模擬的なリストア処理（TestFlight環境は除く）
    if (__DEV__ && !isTestFlight) {
      console.log('[SUB-MONITOR] [' + timestamp + '] Development mode - simulating restore purchases', {
        foundPurchases: 0,
        message: 'No previous purchases found in development mode'
      });
      return Promise.resolve();
    }
    
    try {
      const availablePurchases = await getAvailablePurchases();
      console.log('✅ Available purchases:', availablePurchases);
      for (const purchase of availablePurchases) {
        await this.validateReceipt(purchase);
      }
      // iOSではリストア完了のポップアップが自動で表示される
      
      // TestFlight環境では特別なメッセージを表示
      if (isTestFlight) {
        console.log('[SUB-MONITOR] [' + timestamp + '] TestFlight mode - restore purchases completed (no actual charge)');
      }
    } catch (error) {
      console.error('❌ Failed to restore purchases', error);
      throw error;
    }
  }

  /**
   * UserPlanから対応するSKUを取得する
   * @param plan UserPlan
   */
  private getSkuForPlan(plan: UserPlan): string | null {
    const planMap = {
      plus: process.env.EXPO_PUBLIC_APPLE_PLUS_MONTHLY || 'com.tat22444.wink.plus.monthly',   // Apple Store Connectで設定した正しいID
    };
    
    const sku = planMap[plan as keyof typeof planMap] || null;
    console.log('🛒 SKU mapping:', { plan, sku });
    return sku;
  }
}
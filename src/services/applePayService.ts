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

// バックエンドの検証関数を呼び出す準備
const validateAppleReceiptFunction = httpsCallable(functions, 'validateAppleReceipt');
// TODO: Google Play用の検証関数も将来的に追加
// const validateGooglePlayReceiptFunction = httpsCallable(functions, 'validateGooglePlayReceipt');

// App Store/Google Playで設定したプロダクトID
// NOTE: App Store Connectで設定したProduct IDと正確に一致させる必要がある
const productSkus = Platform.select({
  ios: [
    'com.tat22444.wink.plus.monthly',     // Apple Store Connectで設定した正しいID
  ],
  android: [
    // TODO: Google Play Consoleで設定したIDを追加
    'com.tat22444.wink.plus.monthly',
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
    if (this.initialized) {
      console.log('🛒 IAP Service: Already initialized');
      return;
    }
    
    console.log('🛒 IAP Service: Initializing...', {
      platform: Platform.OS,
      productSkus,
      skuCount: productSkus.length,
      isDevelopment: __DEV__
    });

    // Development環境でのみモック処理を使用
    if (__DEV__) {
      console.log('🛒 Development mode detected - using mock IAP functionality');
      this.initialized = true;
      return;
    }
    
    try {
      // IAP接続を初期化
      const connectionResult = await initConnection();
      console.log('🛒 IAP Connection result:', connectionResult);
      
      this.initialized = true;

      // 過去の未完了トランザクションをクリア（アプリ起動時の安全策）
      if (Platform.OS === 'ios') {
        try {
          const availablePurchases = await getAvailablePurchases();
          console.log('🛒 Found available purchases:', availablePurchases.length);
          for (const purchase of availablePurchases) {
            await finishTransaction({ purchase, isConsumable: false });
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
   * 購入イベントのリスナーをセットアップ
   */
  private setupListeners(): void {
    purchaseUpdateSubscription = purchaseUpdatedListener(async (purchase: SubscriptionPurchase) => {
      console.log('🛒 Purchase updated:', purchase);
      const receipt = purchase.transactionReceipt;
      if (receipt) {
        try {
          // バックエンドにレシートを送信して検証
          console.log('🔒 Validating receipt with backend...');
          await this.validateReceipt(purchase);

          // トランザクションを完了
          await finishTransaction({ purchase, isConsumable: false });
          console.log('✅ Transaction finished');
        } catch (error) {
          console.error('❌ Receipt validation or transaction finish failed', error);
        }
      }
    });

    purchaseErrorSubscription = purchaseErrorListener((error: PurchaseError) => {
      console.error('❌ Purchase error:', error);
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
    if (!this.initialized) {
      console.error('❌ IAP Service not initialized');
      throw new Error('IAP service is not initialized. Call initialize() first.');
    }
    
    // Development環境では模擬的なプロダクトを返す
    if (__DEV__) {
      console.log('🛒 Development mode - returning mock products');
      const mockProducts = [
        {
          productId: 'com.tat22444.wink.plus.monthly',
          price: '480',
          localizedPrice: '¥480',
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
    const sku = this.getSkuForPlan(plan);
    if (!sku) {
      throw new Error(`No SKU found for plan: ${plan}`);
    }
    
    console.log(`🛒 Requesting purchase for SKU: ${sku}`, {
      plan,
      sku,
      isDevelopment: __DEV__
    });
    
    // Development環境では模擬的な購入成功
    if (__DEV__) {
      console.log('🛒 Development mode - simulating successful purchase');
      return new Promise((resolve) => {
        setTimeout(() => {
          console.log('🛒 ✅ Mock purchase completed successfully');
          resolve();
        }, 1000);
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
    if (!this.initialized) {
      throw new Error('IAP not initialized');
    }
    
    console.log('🛒 Restoring purchases...', {
      isDevelopment: __DEV__
    });
    
    // Development環境では模擬的なリストア処理
    if (__DEV__) {
      console.log('🛒 Development mode - simulating restore purchases (no purchases found)');
      return Promise.resolve();
    }
    
    try {
      const availablePurchases = await getAvailablePurchases();
      console.log('✅ Available purchases:', availablePurchases);
      for (const purchase of availablePurchases) {
        await this.validateReceipt(purchase);
      }
      // iOSではリストア完了のポップアップが自動で表示される
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
      plus: 'com.tat22444.wink.plus.monthly',   // Apple Store Connectで設定した正しいID
    };
    
    const sku = planMap[plan as keyof typeof planMap] || null;
    console.log('🛒 SKU mapping:', { plan, sku });
    return sku;
  }
}
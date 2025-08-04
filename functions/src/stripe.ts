import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

// Stripe初期化
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-07-30.basil',
});

// サブスクリプション作成
export const createSubscription = onRequest({
  cors: true,
}, async (req, res) => {
  try {
    const { priceId, userId } = req.body;

    if (!priceId || !userId) {
      res.status(400).json({ error: 'Missing priceId or userId' });
      return;
    }

    console.log('🔄 サブスクリプション作成開始:', { priceId, userId });

    // Firestoreからユーザー情報取得
    const userRef = admin.firestore().collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const userData = userDoc.data();
    let customerId = userData?.stripeCustomerId;

    // Stripe顧客作成または取得
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userData?.email,
        name: userData?.username || userData?.email,
        metadata: {
          firebaseUserId: userId,
        },
      });

      customerId = customer.id;

      // FirestoreにStripe顧客IDを保存
      await userRef.update({
        stripeCustomerId: customerId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log('✅ Stripe顧客作成:', { customerId, userId });
    }

    // サブスクリプション作成
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [
        {
          price: priceId,
        },
      ],
      payment_behavior: 'default_incomplete',
      payment_settings: { 
        save_default_payment_method: 'on_subscription' 
      },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        firebaseUserId: userId,
      },
    });

    console.log('✅ サブスクリプション作成完了:', { 
      subscriptionId: subscription.id,
      status: subscription.status 
    });

    // Firestoreにサブスクリプション情報を保存
    await admin.firestore().collection('subscriptions').doc(subscription.id).set({
      userId,
      customerId,
      subscriptionId: subscription.id,
      priceId,
      status: subscription.status,
      currentPeriodStart: new Date((subscription as any).current_period_start * 1000),
      currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const invoice = subscription.latest_invoice as Stripe.Invoice;
    const paymentIntent = (invoice as any).payment_intent as Stripe.PaymentIntent;

    res.json({
      subscriptionId: subscription.id,
      clientSecret: paymentIntent.client_secret,
      status: subscription.status,
    });

  } catch (error) {
    console.error('❌ サブスクリプション作成エラー:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// サブスクリプションキャンセル
export const cancelSubscription = onRequest({
  cors: true,
}, async (req, res) => {
  try {
    const { subscriptionId } = req.body;

    if (!subscriptionId) {
      res.status(400).json({ error: 'Missing subscriptionId' });
      return;
    }

    console.log('🔄 サブスクリプションキャンセル開始:', { subscriptionId });

    // Stripeでキャンセル
    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    // Firestoreのサブスクリプション情報更新
    await admin.firestore().collection('subscriptions').doc(subscriptionId).update({
      cancelAtPeriodEnd: true,
      canceledAt: admin.firestore.FieldValue.serverTimestamp(),
      status: subscription.status,
    });

    console.log('✅ サブスクリプションキャンセル完了:', { 
      subscriptionId,
      cancelAtPeriodEnd: subscription.cancel_at_period_end 
    });

    res.json({
      success: true,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    });

  } catch (error) {
    console.error('❌ サブスクリプションキャンセルエラー:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 顧客ポータルセッション作成
export const createCustomerPortal = onRequest({
  cors: true,
}, async (req, res) => {
  try {
    const { customerId } = req.body;

    if (!customerId) {
      res.status(400).json({ error: 'Missing customerId' });
      return;
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: 'linkranger://account',
    });

    res.json({
      url: session.url,
    });

  } catch (error) {
    console.error('❌ 顧客ポータルセッション作成エラー:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Stripeウェブフック処理
export const stripeWebhook = onRequest({
  cors: true,
}, async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !endpointSecret) {
    res.status(400).send('Webhook signature verification failed');
    return;
  }

  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);

    console.log('🔔 Stripeウェブフックイベント:', event.type);

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCancellation(subscription);
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentSuccess(invoice);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailure(invoice);
        break;
      }

      default:
        console.log(`未処理のイベントタイプ: ${event.type}`);
    }

    res.json({ received: true });

  } catch (error) {
    console.error('❌ ウェブフック処理エラー:', error);
    res.status(400).send(`Webhook Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// サブスクリプション更新処理
async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  try {
    const userId = subscription.metadata.firebaseUserId;
    if (!userId) return;

    console.log('🔄 サブスクリプション更新処理:', {
      subscriptionId: subscription.id,
      status: subscription.status,
      userId
    });

    // プラン判定
    const priceId = subscription.items.data[0]?.price.id;
    let plan: string = 'free';
    
    if (priceId?.includes('standard')) {
      plan = 'standard';
    } else if (priceId?.includes('pro')) {
      plan = 'pro';
    }

    // Firestoreのユーザー情報更新
    await admin.firestore().collection('users').doc(userId).update({
      subscription: {
        plan,
        status: subscription.status,
        subscriptionId: subscription.id,
        customerId: subscription.customer,
        currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // サブスクリプション情報更新
    await admin.firestore().collection('subscriptions').doc(subscription.id).update({
      status: subscription.status,
      currentPeriodStart: new Date((subscription as any).current_period_start * 1000),
      currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('✅ サブスクリプション更新完了:', { userId, plan, status: subscription.status });

  } catch (error) {
    console.error('❌ サブスクリプション更新エラー:', error);
  }
}

// サブスクリプションキャンセル処理
async function handleSubscriptionCancellation(subscription: Stripe.Subscription) {
  try {
    const userId = subscription.metadata.firebaseUserId;
    if (!userId) return;

    console.log('🔄 サブスクリプションキャンセル処理:', {
      subscriptionId: subscription.id,
      userId
    });

    // ユーザーをFreeプランに戻す
    await admin.firestore().collection('users').doc(userId).update({
      subscription: {
        plan: 'free',
        status: 'canceled',
        subscriptionId: null,
        customerId: subscription.customer,
        canceledAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('✅ サブスクリプションキャンセル処理完了:', { userId });

  } catch (error) {
    console.error('❌ サブスクリプションキャンセル処理エラー:', error);
  }
}

// 支払い成功処理
async function handlePaymentSuccess(invoice: Stripe.Invoice) {
  try {
    const subscriptionId = (invoice as any).subscription as string;
    if (!subscriptionId) return;

    console.log('🔄 支払い成功処理:', {
      invoiceId: invoice.id,
      subscriptionId,
      amount: invoice.amount_paid
    });

    // 支払い履歴を記録
    await admin.firestore().collection('payments').add({
      invoiceId: invoice.id,
      subscriptionId,
      customerId: invoice.customer,
      amount: invoice.amount_paid,
      currency: invoice.currency,
      status: 'succeeded',
      paidAt: new Date((invoice.status_transitions as any).paid_at! * 1000),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('✅ 支払い成功処理完了');

  } catch (error) {
    console.error('❌ 支払い成功処理エラー:', error);
  }
}

// 支払い失敗処理
async function handlePaymentFailure(invoice: Stripe.Invoice) {
  try {
    const subscriptionId = (invoice as any).subscription as string;
    if (!subscriptionId) return;

    console.log('🔄 支払い失敗処理:', {
      invoiceId: invoice.id,
      subscriptionId
    });

    // 支払い失敗の記録
    await admin.firestore().collection('payments').add({
      invoiceId: invoice.id,
      subscriptionId,
      customerId: invoice.customer,
      amount: invoice.amount_due,
      currency: invoice.currency,
      status: 'failed',
      failedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log('✅ 支払い失敗処理完了');

  } catch (error) {
    console.error('❌ 支払い失敗処理エラー:', error);
  }
} 
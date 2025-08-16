// src/native/sharedInbox.ts
import { NativeModules } from 'react-native';

const APP_GROUP_ID = 'group.com.tat22444.wink';
const NATIVE = (NativeModules as any)?.SharedInbox;

function ensureNative() {
  if (!NATIVE) throw new Error('[SharedInbox] native module not available. Run prebuild and check SharedInbox.m is added to App & Extension.');
}

// App Group受け取り箱用の型定義
export interface InboxItem {
  url: string;
  title?: string;
  text?: string;
  source: 'share-extension';
  timestamp: number;
  note?: string;
  ts?: number;
}

export type AuthToken = { token?: string; exp?: number } | null;

export async function saveToInbox(item: InboxItem): Promise<boolean> {
  ensureNative();
  
  // タイムスタンプを確実に設定
  const itemWithTimestamp: InboxItem = {
    ...item,
    ts: item.timestamp || Date.now(),
    timestamp: item.timestamp || Date.now()
  };
  
  try {
    const result = await NATIVE.save(APP_GROUP_ID, itemWithTimestamp);
    console.log('[SharedInbox] save result:', result);
    return result === true;
  } catch (error) {
    console.error('[SharedInbox] save error:', error);
    return false;
  }
}

export async function readAndClearInbox(): Promise<InboxItem[]> {
  ensureNative();
  try {
    const items = await NATIVE.readAndClear(APP_GROUP_ID);
    console.log('[SharedInbox] readAndClear result:', items);
    return Array.isArray(items) ? items : [];
  } catch (error) {
    console.error('[SharedInbox] readAndClear error:', error);
    return [];
  }
}

/** IDトークン保存（exp: ms epoch） */
export async function setAuthToken(token: string, expMs: number): Promise<boolean> {
  ensureNative();
  return await NATIVE.setAuthToken(APP_GROUP_ID, token, expMs);
}

/** IDトークン取得 */
export async function getAuthToken(): Promise<AuthToken> {
  ensureNative();
  const res = await NATIVE.getAuthToken(APP_GROUP_ID);
  if (!res || !res.token) return null;
  return { token: String(res.token), exp: typeof res.exp === 'number' ? res.exp : undefined };
}

export async function clearAuthToken(): Promise<boolean> {
  ensureNative();
  try {
    return await NATIVE.clearAuthToken(APP_GROUP_ID);
  } catch (error) {
    console.error('[SharedInbox] clearAuthToken error:', error);
    return false;
  }
}

// 受け取り箱のアイテム数取得
export async function getInboxItemCount(): Promise<number> {
  ensureNative();
  try {
    const count = await NATIVE.getItemCount(APP_GROUP_ID);
    return typeof count === 'number' ? count : 0;
  } catch (error) {
    console.error('[SharedInbox] getItemCount error:', error);
    return 0;
  }
}
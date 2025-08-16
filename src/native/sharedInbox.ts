// src/native/sharedInbox.ts
import { NativeModules } from 'react-native';

const APP_GROUP_ID = 'group.com.tat22444.wink';
const NATIVE = (NativeModules as any)?.SharedInbox;

function ensureNative() {
  if (!NATIVE) throw new Error('[SharedInbox] native module not available. Run prebuild and check SharedInbox.m is added to App & Extension.');
}

export type InboxItem = { url: string; note?: string; title?: string; ts?: number };
export type AuthToken = { token?: string; exp?: number } | null;

export async function saveToInbox(item: InboxItem): Promise<boolean> {
  ensureNative();
  return await NATIVE.save(APP_GROUP_ID, item);
}

export async function readAndClearInbox(): Promise<InboxItem[]> {
  ensureNative();
  return await NATIVE.readAndClear(APP_GROUP_ID);
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
  return await NATIVE.clearAuthToken(APP_GROUP_ID);
}
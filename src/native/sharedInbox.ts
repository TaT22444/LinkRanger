import { NativeModules } from 'react-native';

export const APP_GROUP_ID = 'group.com.tat22444.wink'; // ← あなたの値

type InboxItem = { url: string; note?: string; title?: string; ts?: number };
const M: any = NativeModules?.SharedInbox;

function ensureNative() {
  if (!M || typeof M.save !== 'function' || typeof M.readAndClear !== 'function') {
    throw new Error(
      '[SharedInbox] native module not available in this target. ' +
      'Check plugins order and that SharedInbox.m is added to BOTH app & ShareExtension targets.'
    );
  }
}

export async function saveToInbox(item: InboxItem) {
  ensureNative();
  console.log('[SharedInbox] save start', { group: APP_GROUP_ID, item });
  return M.save(APP_GROUP_ID, item);
}

export async function readAndClearInbox(): Promise<InboxItem[]> {
  ensureNative();
  console.log('[SharedInbox] readAndClear', { group: APP_GROUP_ID });
  return M.readAndClear(APP_GROUP_ID);
}
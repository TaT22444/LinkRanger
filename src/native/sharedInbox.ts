import { NativeModules } from 'react-native';
export const APP_GROUP_ID = 'group.com.tat22444.wink'; // ←あなたのApp Group

type InboxItem = { url: string; note?: string; title?: string; ts?: number };

const M = NativeModules.SharedInbox as {
  save: (groupId: string, item: InboxItem) => Promise<boolean>;
  readAndClear: (groupId: string) => Promise<InboxItem[]>;
};

export function saveToInbox(item: InboxItem) {
  return M.save(APP_GROUP_ID, item);
}

export function readAndClearInbox() {
  return M.readAndClear(APP_GROUP_ID);
}
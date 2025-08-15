// index.ts (root)
import { AppRegistry } from 'react-native';
import { registerRootComponent } from 'expo';

import App from './App';
import ShareExtension from './src/ShareExtension';

// Metro デバッグで拡張から起動された場合だけ true
const isShareExtension =
  typeof globalThis !== 'undefined' &&
  typeof (globalThis as any).location !== 'undefined' &&
  (globalThis as any).location?.search?.includes('shareExtension=true');

if (isShareExtension) {
  // ShareExtension の RN ルートを登録（Swift 側の withModuleName と一致）
  AppRegistry.registerComponent('shareExtension', () => ShareExtension);
} else {
  // 通常の本体アプリ
  registerRootComponent(App);
}
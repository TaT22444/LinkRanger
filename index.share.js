import { AppRegistry } from 'react-native';
import { close } from 'expo-share-extension';

// URL抽出関数
function pickUrl(text) {
  if (!text) return undefined;
  const urlPatterns = [
    /https?:\/\/[^\s)]+/gi,
    /https?:\/\/[^\s\n\r)]+/gi,
    /https?:\/\/[^\s\n\r\t)]+/gi
  ];
  for (const pattern of urlPatterns) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      return matches[0];
    }
  }
  return undefined;
}

// 共有データを処理してアプリ本体に遷移するShareExtension
const ShareExtension = (props) => {
  console.log('[index.share.js] ShareExtension起動, props:', props);
  
  // URL抽出
  const fromPre = props.preprocessingResults?.url;
  const directUrl = props.url;
  const extractedUrl = pickUrl(props.text);
  const sharedUrl = fromPre || directUrl || extractedUrl;
  
  console.log('[index.share.js] URL抽出結果:', { fromPre, directUrl, extractedUrl, sharedUrl });
  
  if (sharedUrl) {
    // 即座にアプリ本体にDeep Linkで遷移
    const deepLink = `wink://share?url=${encodeURIComponent(sharedUrl)}`;
    console.log('[index.share.js] アプリ本体に遷移:', deepLink);
    
    // ShareExtensionを閉じて、アプリ本体でDeep Linkを処理
    close();
  } else {
    console.warn('[index.share.js] URLが見つかりません');
    // URLが見つからない場合は即座に閉じる
    close();
  }
  
  // このコンポーネントは表示されない（即座にclose()される）
  return null;
};

console.log('[index.share.js] ShareExtension登録開始...');

try {
  AppRegistry.registerComponent('shareExtension', () => ShareExtension);
  console.log('[index.share.js] ShareExtension登録成功');
} catch (error) {
  console.error('[index.share.js] ShareExtension登録失敗:', error);
} 

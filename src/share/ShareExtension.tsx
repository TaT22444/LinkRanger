// src/share/ShareExtension.tsx
import React, { useEffect } from 'react';
import type { InitialProps } from 'expo-share-extension';
import { openHostApp, close } from 'expo-share-extension';

function extractUrlFromText(text?: string) {
  if (!text) return undefined;
  const m = text.match(/https?:\/\/[^\s"'<>`]+/i);
  return m?.[0];
}

export default function ShareExtension(props: InitialProps) {
  useEffect(() => {
    (async () => {
      try {
        const sharedUrl =
          props.url ??
          extractUrlFromText(props.text) ??
          // preprocessingResults は型に無いことがあるので any 経由で読む
          (props as any)?.preprocessingResults?.url;

        if (sharedUrl) {
          // ここは “パスだけ”。wink:// は自動付与されます
          await openHostApp(`share?url=${encodeURIComponent(sharedUrl)}`);
        }
      } catch (e) {
        console.error('[ShareExtension] openHostApp error', e);
      } finally {
        // 即 close は弾かれることがあるので少し待つ
        setTimeout(() => close(), 150);
      }
    })();
  }, []);

  return null;
}
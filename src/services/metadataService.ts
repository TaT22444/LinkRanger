export interface LinkMetadata {
  title?: string;
  description?: string;
  imageUrl?: string;
  siteName?: string;
}

export const metadataService = {
  async fetchMetadata(url: string): Promise<LinkMetadata> {
    try {
      console.log('Fetching metadata for:', url);
      
      // CORSの問題を回避するため、プロキシサービスを使用
      // 本来はCloud Functionsで実装すべきですが、開発段階では簡易的な方法を使用
      const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
      
      // 8秒のタイムアウトを設定（AddLinkModalの15秒より短く）
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      const response = await fetch(proxyUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        },
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.contents) {
        throw new Error('Failed to fetch page content');
      }
      
      const html = data.contents;
      const metadata: LinkMetadata = {};
      
      // タイトル取得（優先順位: og:title > title タグ）
      const ogTitle = html.match(/<meta[^>]*property=["\']og:title["\'][^>]*content=["\']([^"\']*)["\'][^>]*>/i);
      const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      
      if (ogTitle && ogTitle[1]) {
        metadata.title = ogTitle[1].trim();
      } else if (titleTag && titleTag[1]) {
        metadata.title = titleTag[1].trim();
      }
      
      // 説明取得（優先順位: og:description > meta description）
      const ogDescription = html.match(/<meta[^>]*property=["\']og:description["\'][^>]*content=["\']([^"\']*)["\'][^>]*>/i);
      const metaDescription = html.match(/<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']*)["\'][^>]*>/i);
      
      if (ogDescription && ogDescription[1]) {
        metadata.description = ogDescription[1].trim();
      } else if (metaDescription && metaDescription[1]) {
        metadata.description = metaDescription[1].trim();
      }
      
      // OGP画像取得
      const ogImage = html.match(/<meta[^>]*property=["\']og:image["\'][^>]*content=["\']([^"\']*)["\'][^>]*>/i);
      if (ogImage && ogImage[1]) {
        metadata.imageUrl = ogImage[1].trim();
      }
      
      // サイト名取得
      const ogSiteName = html.match(/<meta[^>]*property=["\']og:site_name["\'][^>]*content=["\']([^"\']*)["\'][^>]*>/i);
      if (ogSiteName && ogSiteName[1]) {
        metadata.siteName = ogSiteName[1].trim();
      }
      
      console.log('Fetched metadata:', metadata);
      return metadata;
      
    } catch (error) {
      console.error('Error fetching metadata:', error);
      
      // エラーの詳細をログ出力
      if (error instanceof Error) {
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
      }
      
      // フォールバック：URLからドメイン名を抽出してタイトルとする
      try {
        const urlObj = new URL(url);
        const fallbackTitle = urlObj.hostname.replace('www.', '');
        console.log('Using fallback title:', fallbackTitle);
        return {
          title: fallbackTitle,
          description: '',
        };
      } catch {
        console.log('Using URL as fallback title:', url);
        return {
          title: url,
          description: '',
        };
      }
    }
  }
}; 
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { close, InitialProps } from 'expo-share-extension';
import { saveToInbox } from './native/sharedInbox';
import { ShareExtensionData } from './types';

function pickUrl(text?: string): string | undefined {
  if (!text) return undefined;
  
  // より柔軟なURL抽出
  const urlPatterns = [
    /https?:\/\/[^\s)]+/gi,           // 基本的なURL
    /https?:\/\/[^\s\n\r)]+/gi,       // 改行を含む
    /https?:\/\/[^\s\n\r\t)]+/gi      // タブを含む
  ];
  
  for (const pattern of urlPatterns) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      return matches[0];
    }
  }
  
  return undefined;
}

export default function ShareExtension(props: InitialProps) {
  const ran = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // URL抽出の改善
  const sharedUrl = useMemo(() => {
    // 優先順位: preprocessingResults > url > textからの抽出
    const fromPre = (props.preprocessingResults as any)?.url as string | undefined;
    const directUrl = props.url;
    const extractedUrl = pickUrl(props.text);
    
    const finalUrl = fromPre || directUrl || extractedUrl;
    
    if (finalUrl) {
      console.log('[ShareExtension] URL extracted:', { fromPre, directUrl, extractedUrl, finalUrl });
    }
    
    return finalUrl;
  }, [props.url, props.text, props.preprocessingResults]);

  // 保存処理の統一化
  const onSave = async () => {
    console.log('[ShareExtension] onSave called'); // デバッグログ追加
    
    if (ran.current || saved) {
      console.log('[ShareExtension] Already ran or saved, returning'); // デバッグログ追加
      return;
    }
    
    if (!sharedUrl) {
      console.log('[ShareExtension] No shared URL found'); // デバッグログ追加
      Alert.alert('URLが見つかりません', '共有データからURLを抽出できませんでした。');
      return;
    }
    
    console.log('[ShareExtension] Starting save process...'); // デバッグログ追加
    ran.current = true;
    setSaving(true);

    try {
      // 統一された保存処理: 常にApp Group経由
      const shareData: ShareExtensionData = {
        url: sharedUrl,
        title: (props as any).title || '共有されたリンク',
        text: props.text,
        source: 'share-extension',
        timestamp: Date.now(),
        preprocessingResults: props.preprocessingResults
      };

      console.log('[ShareExtension] About to save to inbox:', shareData); // デバッグログ追加
      
      const success = await saveToInbox(shareData);
      console.log('[ShareExtension] saveToInbox result:', success); // デバッグログ追加

      if (success) {
        setSaved(true);
        console.log('[ShareExtension] Save successful');
        
        // 成功通知を表示
        Alert.alert(
          '保存完了',
          'リンクを保存しました。\n\nアプリを開くと自動でリンクリストに追加され、AIがタグ付けと要約を生成します。',
          [
            {
              text: 'OK',
              onPress: () => {
                setTimeout(() => close(), 100);
              }
            }
          ]
        );
      } else {
        throw new Error('App Groupへの保存に失敗しました');
      }
    } catch (error) {
      console.error('[ShareExtension] Save failed:', error);
      
      Alert.alert(
        '保存エラー',
        'リンクの保存に失敗しました。\n\nアプリを開いて手動で保存してください。',
        [
          {
            text: 'OK',
            onPress: () => {
              setTimeout(() => close(), 100);
            }
          }
        ]
      );
    } finally {
      setSaving(false);
    }
  };

  const onCancel = () => {
    close();
  };

  // 自動保存（オプション）
  useEffect(() => {
    if (sharedUrl && !ran.current) {
      // 自動保存を有効にする場合はコメントアウトを解除
      // onSave();
    }
  }, [sharedUrl]);

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text allowFontScaling={false} style={s.headerTitle}>Winkに保存</Text>
      </View>
      
      <View style={s.content}>
        <Text allowFontScaling={false} style={s.title}>リンクを追加</Text>
        
        {sharedUrl ? (
          <>
            <Text allowFontScaling={false} style={s.url} numberOfLines={3}>
              {sharedUrl}
            </Text>
            <Text allowFontScaling={false} style={s.subtitle}>
              このリンクをWinkに保存します
            </Text>
          </>
        ) : (
          <Text allowFontScaling={false} style={s.warn}>
            共有データからURLを取得できませんでした
          </Text>
        )}
      </View>
      
      <View style={s.row}>
        <Pressable 
          onPress={onCancel} 
          style={[s.btn, s.ghost]} 
          disabled={saving || saved}
        >
          <Text allowFontScaling={false} style={s.btnGhostText}>
            {saved ? '完了' : 'キャンセル'}
          </Text>
        </Pressable>
        
        <Pressable 
          onPress={onSave} 
          style={[s.btn, s.primary]} 
          disabled={saving || saved || !sharedUrl}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : saved ? (
            <Text allowFontScaling={false} style={s.btnPrimaryText}>保存済み</Text>
          ) : (
            <Text allowFontScaling={false} style={s.btnPrimaryText}>保存</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#fff' 
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#f8f9fa'
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center'
  },
  content: {
    flex: 1,
    padding: 16,
    justifyContent: 'center'
  },
  title: { 
    fontSize: 18, 
    fontWeight: '600', 
    marginBottom: 8, 
    color: '#111' 
  },
  url: { 
    fontSize: 14, 
    color: '#333', 
    marginBottom: 8,
    lineHeight: 20
  },
  subtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16
  },
  warn: { 
    fontSize: 13, 
    color: '#b00', 
    marginBottom: 16,
    textAlign: 'center'
  },
  row: { 
    flexDirection: 'row', 
    gap: 12, 
    justifyContent: 'flex-end',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0'
  },
  btn: { 
    paddingVertical: 12, 
    paddingHorizontal: 20, 
    borderRadius: 10, 
    borderWidth: 1, 
    borderColor: '#ddd',
    minWidth: 80,
    alignItems: 'center'
  },
  ghost: { 
    backgroundColor: '#fff' 
  },
  primary: { 
    backgroundColor: '#111', 
    borderColor: '#111' 
  },
  btnGhostText: { 
    fontSize: 14, 
    color: '#111' 
  },
  btnPrimaryText: { 
    fontSize: 14, 
    color: '#fff' 
  },
});
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { close, InitialProps } from 'expo-share-extension';
import { saveToInbox } from './native/sharedInbox';

function pickUrl(text?: string) {
  if (!text) return;
  const m = text.match(/https?:\/\/[^\s)]+/i);
  return m ? m[0] : undefined;
}

export default function ShareExtension(props: InitialProps) {
  const ran = useRef(false);
  const [saving, setSaving] = useState(false);

  const sharedUrl = useMemo(() => {
    const fromPre = (props.preprocessingResults as any)?.url as string | undefined;
    return props.url ?? fromPre ?? pickUrl(props.text);
  }, [props.url, props.text, props.preprocessingResults]);

  const onSave = async () => {
    if (ran.current) return;
    if (!sharedUrl) {
      Alert.alert('URLが見つかりません', '共有データからURLを抽出できませんでした。');
      return;
    }
    ran.current = true;
    setSaving(true);
    try {
      console.log('[ShareExtension] onSave', sharedUrl);
      await saveToInbox({ url: sharedUrl });
      console.log('[ShareExtension] saved OK');
      await close(); // 本体には遷移しない
    } catch (e) {
      console.log('[ShareExtension] save failed', e);
      ran.current = false;
      setSaving(false);
      Alert.alert('保存に失敗しました', String(e));
    }
  };

  return (
    <View style={s.container}>
      <Text allowFontScaling={false} style={s.title}>リンクを追加</Text>
      {sharedUrl
        ? <Text allowFontScaling={false} style={s.url} numberOfLines={3}>{sharedUrl}</Text>
        : <Text allowFontScaling={false} style={s.warn}>共有データからURLを取得できませんでした</Text>
      }
      <View style={s.row}>
        <Pressable onPress={() => close()} style={[s.btn, s.ghost]} disabled={saving}>
          <Text allowFontScaling={false} style={s.btnGhostText}>キャンセル</Text>
        </Pressable>
        <Pressable onPress={onSave} style={[s.btn, s.primary]} disabled={saving || !sharedUrl}>
          {saving ? <ActivityIndicator /> : <Text allowFontScaling={false} style={s.btnPrimaryText}>保存</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16, justifyContent: 'flex-end' },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 8, color: '#111' },
  url: { fontSize: 14, color: '#333', marginBottom: 16 },
  warn: { fontSize: 13, color: '#b00', marginBottom: 16 },
  row: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  btn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: '#ddd' },
  ghost: { backgroundColor: '#fff' },
  primary: { backgroundColor: '#111', borderColor: '#111' },
  btnGhostText: { fontSize: 14, color: '#111' },
  btnPrimaryText: { fontSize: 14, color: '#fff' },
});
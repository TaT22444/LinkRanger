import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { close, InitialProps } from 'expo-share-extension';
import { saveToInbox, getAuthToken } from './native/sharedInbox';

// あなたの Functions(onCall) 名に合わせる
const FUNCTIONS_ENDPOINT =
  'https://asia-northeast1-linkranger-b096e.cloudfunctions.net/saveSharedLink';

function pickUrl(text?: string) {
  if (!text) return;
  const m = text.match(/https?:\/\/[^\s)]+/i);
  return m ? m[0] : undefined;
}

// onCall へ POST（body は { data: {...} }）
async function postToFunctions(url: string): Promise<boolean> {
  const auth = await getAuthToken();
  const now = Date.now();
  if (!auth?.token || (auth.exp && auth.exp <= now + 10_000)) {
    return false; // トークン無し/期限切れはフォールバックへ
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(FUNCTIONS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${auth.token}`,
      },
      body: JSON.stringify({ data: { url } }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    return r.ok;
  } catch {
    clearTimeout(t);
    return false;
  }
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
      // ① Functions(onCall) 直POST
      let ok = await postToFunctions(sharedUrl);
      // ② 失敗/オフライン/トークン無し → 受け取り箱にフォールバック
      if (!ok) await saveToInbox({ url: sharedUrl });
    } catch (e) {
      // どちらも失敗することは稀だが、念のため
      console.log('[ShareExtension] save failed', e);
    } finally {
      // 成否に関わらず確実に閉じる
      try { await close(); } catch { setTimeout(() => { try { close(); } catch {} }, 150); }
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
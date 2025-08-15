// src/ShareExtension.tsx
import React, { useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, Alert } from 'react-native';
import { close, InitialProps } from 'expo-share-extension';
// App Group“受け取り箱”ラッパ（NativeModules 版）
import { saveToInbox } from './native/sharedInbox';

function pickUrl(text?: string) {
  if (!text) return undefined;
  const m = text.match(/https?:\/\/[^\s)]+/i);
  return m ? m[0] : undefined;
}

export default function ShareExtension(props: InitialProps) {
  const ran = useRef(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // 共有から得られたURLを決定（url → preprocessingResults.url → text から抽出 の優先順）
  const sharedUrl = useMemo(() => {
    const fromPre = (props.preprocessingResults as any)?.url as string | undefined;
    return props.url ?? fromPre ?? pickUrl(props.text);
  }, [props.url, props.text, props.preprocessingResults]);

  const onSave = async () => {
    if (ran.current) return;
    if (!sharedUrl) {
      Alert.alert('URLが見つかりませんでした');
      return;
    }
    ran.current = true;
    setSaving(true);
    try {
      await saveToInbox({ url: sharedUrl, note });
      await close(); // 本体へは遷移しない
    } catch (e) {
      setSaving(false);
      ran.current = false;
      Alert.alert('保存に失敗しました', String(e));
    }
  };

  const onCancel = () => close();

  return (
    <View style={styles.container}>
      <Text allowFontScaling={false} style={styles.label}>リンクを追加</Text>

      {sharedUrl ? (
        <>
          <Text allowFontScaling={false} style={styles.url} numberOfLines={2}>
            {sharedUrl}
          </Text>

          <TextInput
            allowFontScaling={false}
            style={styles.input}
            placeholder="メモ（任意）"
            value={note}
            onChangeText={setNote}
            autoCorrect={false}
          />

          <View style={styles.row}>
            <Pressable style={[styles.btn, styles.ghost]} onPress={onCancel} disabled={saving}>
              <Text allowFontScaling={false} style={styles.btnGhostText}>キャンセル</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.primary]} onPress={onSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator />
              ) : (
                <Text allowFontScaling={false} style={styles.btnPrimaryText}>保存</Text>
              )}
            </Pressable>
          </View>
        </>
      ) : (
        <Text allowFontScaling={false} style={styles.caption}>
          共有データからURLを取得できませんでした
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'stretch', justifyContent: 'center', backgroundColor: '#fff', padding: 16 },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 10, color: '#222', textAlign: 'left' },
  url: { fontSize: 13, color: '#333', marginBottom: 12 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14,
  },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  btn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, borderColor: '#ddd' },
  ghost: { backgroundColor: '#fff' },
  primary: { backgroundColor: '#111', borderColor: '#111' },
  btnGhostText: { fontSize: 14, color: '#111' },
  btnPrimaryText: { fontSize: 14, color: '#fff' },
  caption: { fontSize: 12, color: '#666' },
});
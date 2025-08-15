import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { close, InitialProps, openHostApp } from 'expo-share-extension';

function pickUrl(text?: string) {
  if (!text) return undefined;
  const m = text.match(/https?:\/\/\S+/);
  return m ? m[0] : undefined;
}

export default function ShareExtension(props: InitialProps) {
  useEffect(() => {
    const sharedUrl = props.url ?? pickUrl(props.text);
    if (sharedUrl) {
      const path = `share?url=${encodeURIComponent(sharedUrl)}`;
      openHostApp(path);
    }
    const t = setTimeout(() => close(), 350);
    return () => clearTimeout(t);
  }, [props.url, props.text]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Wink に送信中…</Text>
      <Text style={styles.caption}>すぐにアプリへ切り替わります</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 16 },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 6, color: '#222' },
  caption: { fontSize: 12, color: '#666' },
});
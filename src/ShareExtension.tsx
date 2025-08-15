// src/ShareExtension.tsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { close, InitialProps } from 'expo-share-extension';

export default function ShareExtension(props: InitialProps) {
  const shared = props?.url || props?.text || '(共有データなし)';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Wink Share Extension</Text>
      <Text style={styles.caption}>ここまで表示されれば配線OK</Text>

      <Text style={styles.label}>受け取ったデータ</Text>
      <Text style={styles.payload}>{shared}</Text>

      <TouchableOpacity style={styles.btn} onPress={() => close()}>
        <Text style={styles.btnText}>閉じる</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 16 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  caption: { fontSize: 12, color: '#666', marginBottom: 20 },
  label: { fontSize: 12, color: '#777', marginTop: 8 },
  payload: { fontSize: 14, color: '#222', marginTop: 6, textAlign: 'center' },
  btn: { marginTop: 24, backgroundColor: '#8A2BE2', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  btnText: { color: '#fff', fontWeight: '600' },
});
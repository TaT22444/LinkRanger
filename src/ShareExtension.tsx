// ./src/ShareExtension.tsx  ←最小
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function ShareExtension() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Wink Share Extension</Text>
      <Text>ここまで表示されれば、ネイティブ配線はOKです。</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 16 },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 8 }
});
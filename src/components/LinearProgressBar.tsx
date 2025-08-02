import React from 'react';
import { View, StyleSheet } from 'react-native';

interface LinearProgressBarProps {
  progress: number; // 0 to 1
}

export const LinearProgressBar: React.FC<LinearProgressBarProps> = ({ progress }) => {
  // Ensure progress is between 0 and 1
  const clampedProgress = Math.max(0, Math.min(1, progress));

  return (
    <View style={styles.container}>
      <View style={[styles.bar, { width: `${clampedProgress * 100}%` }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 5,
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    borderRadius: 2.5,
    flex: 1,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    backgroundColor: '#A78BFA',
    borderRadius: 2.5,
  },
});
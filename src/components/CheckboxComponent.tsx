import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

interface CheckboxProps {
  isSelected: boolean;
  size?: number;
}

export const CheckboxComponent: React.FC<CheckboxProps> = ({
  isSelected,
  size = 20,
}) => {
  return (
    <View style={[
      styles.checkbox,
      { width: size, height: size, borderRadius: size * 0.2 },
      isSelected && styles.checkboxSelected
    ]}>
      {isSelected && (
        <Feather name="check" size={size * 0.6} color="#FFF" />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  checkbox: {
    borderWidth: 1,
    borderColor: '#545454',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#8A2BE2',
    borderColor: '#8A2BE2',
  },
});
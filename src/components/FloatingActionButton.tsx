import React, { useRef } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface FloatingActionButtonProps {
  onPress: () => void;
  disabled?: boolean;
}

export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
  onPress,
  disabled = false,
}) => {
  const scaleValue = useRef(new Animated.Value(1)).current;
  


  const handlePressIn = () => {

    Animated.spring(scaleValue, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {

    Animated.spring(scaleValue, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
  };

  const handlePress = () => {

    if (!disabled) {
      onPress();
    }
  };

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          {
            transform: [{ scale: scaleValue }],
          },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.button,
            disabled && styles.buttonDisabled,
          ]}
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          disabled={disabled}
          activeOpacity={0.8}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View style={styles.content}>
            <MaterialCommunityIcons 
              name="link-variant-plus" 
              size={24} 
              color={disabled ? '#AAA' : '#FFF'} 
            />
          </View>
          
          {/* グロー効果 */}
          <View style={[styles.glow, disabled && styles.glowDisabled]} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    zIndex: 1000,
    elevation: 10, // Androidでの重なり順序を確保
  },
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#8A2BE2',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#8A2BE2',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    // タッチ領域を確保
    minWidth: 56,
    minHeight: 56,
  },
  buttonDisabled: {
    backgroundColor: '#666',
    shadowColor: '#000',
    shadowOpacity: 0.2,
  },
  content: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: {
    fontSize: 24,
    fontWeight: '300',
    color: '#FFF',
    lineHeight: 24,
  },
  iconDisabled: {
    color: '#AAA',
  },
  glow: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#8A2BE2',
    opacity: 0.3,
    transform: [{ scale: 1.2 }],
    zIndex: -1,
  },
  glowDisabled: {
    backgroundColor: '#666',
    opacity: 0.1,
  },
}); 
import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native-web';

export const AnimatedComponentSwitch = ({ 
  children, 
  animationType = 'fade', // 'fade', 'slide', 'scale'
  duration = 300 
}) => {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Reset animations when component changes
    fadeAnim.setValue(0);
    slideAnim.setValue(animationType === 'slide' ? 50 : 0);
    scaleAnim.setValue(animationType === 'scale' ? 0.8 : 1);

    const animations = [];

    if (animationType === 'fade') {
      animations.push(
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration,
          useNativeDriver: true,
        })
      );
    }

    if (animationType === 'slide') {
      animations.push(
        Animated.timing(slideAnim, {
          toValue: 0,
          duration,
          useNativeDriver: true,
        })
      );
    }

    if (animationType === 'scale') {
      animations.push(
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration,
          useNativeDriver: true,
        })
      );
    }

    Animated.parallel(animations).start();
  }, [children, animationType, duration, fadeAnim, slideAnim, scaleAnim]);

  const getTransform = () => {
    const transforms = [];
    
    if (animationType === 'slide') {
      transforms.push({ translateX: slideAnim });
    }
    
    if (animationType === 'scale') {
      transforms.push({ scale: scaleAnim });
    }
    
    return transforms;
  };

  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: animationType === 'fade' ? fadeAnim : 1,
        transform: getTransform(),
      }}
    >
      {children}
    </Animated.View>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native-web';

export const AdvancedAnimatedSwitch = ({ 
  children, 
  animationType = 'crossfade',
  duration = 300 
}) => {
  const [currentChildren, setCurrentChildren] = useState(children);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (children !== currentChildren) {
      setIsTransitioning(true);
      
      // Animate out current component
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: duration / 2,
        useNativeDriver: true,
      }).start(() => {
        // Switch to new component
        setCurrentChildren(children);
        
        // Reset and animate in new component
        fadeAnim.setValue(0);
        slideAnim.setValue(animationType === 'slide' ? 30 : 0);
        
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: duration / 2,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: duration / 2,
            useNativeDriver: true,
          })
        ]).start(() => {
          setIsTransitioning(false);
        });
      });
    }
  }, [children, currentChildren, animationType, duration, fadeAnim, slideAnim]);

  const getTransform = () => {
    if (animationType === 'slide') {
      return [{ translateX: slideAnim }];
    }
    return [];
  };

  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: fadeAnim,
        transform: getTransform(),
      }}
    >
      {currentChildren}
    </Animated.View>
  );
};

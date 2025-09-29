import React, { useEffect, useState } from 'react';
import { View } from 'react-native-web';

export const CSSAnimatedSwitch = ({ 
  children, 
  animationType = 'fade',
  duration = 300 
}) => {
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    setIsAnimating(true);
    const timer = setTimeout(() => setIsAnimating(false), duration);
    return () => clearTimeout(timer);
  }, [children, duration]);

  const getStyles = () => {
    const baseStyles = {
      flex: 1,
      transition: `all ${duration}ms ease-in-out`,
    };

    switch (animationType) {
      case 'fade':
        return {
          ...baseStyles,
          opacity: isAnimating ? 0 : 1,
        };
      case 'slide':
        return {
          ...baseStyles,
          transform: isAnimating ? 'translateX(20px)' : 'translateX(0)',
          opacity: isAnimating ? 0 : 1,
        };
      case 'scale':
        return {
          ...baseStyles,
          transform: isAnimating ? 'scale(0.95)' : 'scale(1)',
          opacity: isAnimating ? 0 : 1,
        };
      default:
        return baseStyles;
    }
  };

  return (
    <View style={getStyles()}>
      {children}
    </View>
  );
};

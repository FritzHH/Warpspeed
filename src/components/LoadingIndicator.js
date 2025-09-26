import React from 'react';
import { View, ActivityIndicator, Text } from 'react-native-web';

/**
 * Resizable loading indicator component for React Native Web
 * @param {Object} props - Component props
 * @param {string} props.size - Size of the indicator ('small', 'medium', 'large', or custom number)
 * @param {string} props.color - Color of the indicator
 * @param {string} props.text - Optional text to display below the indicator
 * @param {Object} props.textStyle - Style for the text
 * @param {Object} props.containerStyle - Style for the container
 * @param {boolean} props.centered - Whether to center the indicator
 * @param {string} props.message - Loading message to display
 */
export const LoadingIndicator = ({
  size = 'medium',
  color = '#007bff',
  text = '',
  textStyle = {},
  containerStyle = {},
  centered = true,
  message = 'Loading...',
  ...props
}) => {
  // Convert size to appropriate value
  const getSizeValue = () => {
    switch (size) {
      case 'small':
        return 20;
      case 'medium':
        return 40;
      case 'large':
        return 60;
      default:
        return typeof size === 'number' ? size : 40;
    }
  };

  const sizeValue = getSizeValue();

  const defaultContainerStyle = {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    ...(centered && {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(255, 255, 255, 0.8)',
      zIndex: 1000,
    }),
    ...containerStyle,
  };

  const defaultTextStyle = {
    marginTop: 10,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    ...textStyle,
  };

  return (
    <View style={defaultContainerStyle} {...props}>
      <ActivityIndicator size={sizeValue} color={color} />
      {(text || message) && (
        <Text style={defaultTextStyle}>
          {text || message}
        </Text>
      )}
    </View>
  );
};

/**
 * Inline loading indicator (doesn't cover the screen)
 * @param {Object} props - Component props
 */
export const InlineLoadingIndicator = (props) => (
  <LoadingIndicator centered={false} {...props} />
);

/**
 * Full screen loading overlay
 * @param {Object} props - Component props
 */
export const FullScreenLoadingIndicator = (props) => (
  <LoadingIndicator centered={true} {...props} />
);

/**
 * Small loading indicator for buttons or small spaces
 * @param {Object} props - Component props
 */
export const SmallLoadingIndicator = (props) => (
  <LoadingIndicator size="small" centered={false} {...props} />
);

/**
 * Large loading indicator for main content areas
 * @param {Object} props - Component props
 */
export const LargeLoadingIndicator = (props) => (
  <LoadingIndicator size="large" {...props} />
);

export default LoadingIndicator;

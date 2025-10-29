// Detect if the device is mobile
export const isMobile = () => {
  if (typeof window === 'undefined') return false;
  
  const userAgent = window.navigator.userAgent.toLowerCase();
  const isMobileDevice = /iphone|ipad|ipod|android|blackberry|windows phone|opera mini|iemobile/i.test(userAgent);
  const isSmallScreen = window.innerWidth <= 768;
  
  return isMobileDevice || isSmallScreen;
};

// Detect if the device is a tablet
export const isTablet = () => {
  if (typeof window === 'undefined') return false;
  
  const userAgent = window.navigator.userAgent.toLowerCase();
  const isTabletDevice = /ipad|android(?!.*mobile)|tablet/i.test(userAgent);
  const isMediumScreen = window.innerWidth > 768 && window.innerWidth <= 1024;
  
  return isTabletDevice || isMediumScreen;
};

// Get device type
export const getDeviceType = () => {
  if (isMobile()) return 'mobile';
  if (isTablet()) return 'tablet';
  return 'desktop';
};


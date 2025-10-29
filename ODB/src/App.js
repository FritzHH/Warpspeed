import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { observeAuthState } from './firebase/authService';
import { getDeviceType } from './utils/deviceDetection';
import LoginScreen from './screens/LoginScreen';
import DesktopLanding from './screens/DesktopLanding';
import MobileLanding from './screens/MobileLanding';

const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deviceType, setDeviceType] = useState('desktop');

  useEffect(() => {
    // Detect device type
    const type = getDeviceType();
    setDeviceType(type);

    // Listen for window resize to update device type
    const handleResize = () => {
      setDeviceType(getDeviceType());
    };
    
    window.addEventListener('resize', handleResize);

    // Observe auth state
    const unsubscribe = observeAuthState((currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => {
      unsubscribe();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  if (loading) {
    return null; // Or a loading spinner
  }

  return (
    <Router>
      <Routes>
        <Route 
          path="/login" 
          element={user ? <Navigate to="/" replace /> : <LoginScreen />} 
        />
        <Route 
          path="/" 
          element={
            user ? (
              deviceType === 'mobile' ? (
                <MobileLanding user={user} />
              ) : (
                <DesktopLanding user={user} />
              )
            ) : (
              <Navigate to="/login" replace />
            )
          } 
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
};

export default App;


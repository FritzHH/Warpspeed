import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigate } from 'react-router-dom';
import { signOutUser } from '../firebase/authService';

const DesktopLanding = ({ user }) => {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOutUser();
    navigate('/login');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>ODB</Text>
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>Welcome to ODB Desktop</Text>
        <Text style={styles.subtitle}>Your powerful desktop experience</Text>
        
        {user && (
          <View style={styles.userInfo}>
            <Text style={styles.userLabel}>Logged in as:</Text>
            <Text style={styles.userEmail}>{user.email}</Text>
          </View>
        )}

        <View style={styles.features}>
          <View style={styles.featureCard}>
            <Text style={styles.featureIcon}>🖥️</Text>
            <Text style={styles.featureTitle}>Desktop Optimized</Text>
            <Text style={styles.featureDescription}>
              Full-featured interface designed for larger screens
            </Text>
          </View>

          <View style={styles.featureCard}>
            <Text style={styles.featureIcon}>🔥</Text>
            <Text style={styles.featureTitle}>Firebase Integration</Text>
            <Text style={styles.featureDescription}>
              Complete authentication and database functionality
            </Text>
          </View>

          <View style={styles.featureCard}>
            <Text style={styles.featureIcon}>⚡</Text>
            <Text style={styles.featureTitle}>React Native Web</Text>
            <Text style={styles.featureDescription}>
              Built with React Native for seamless cross-platform experience
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  logo: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  signOutButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#ff3b30',
    borderRadius: 8,
  },
  signOutText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    padding: 48,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 40,
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 24,
    color: '#666',
    marginBottom: 40,
  },
  userInfo: {
    backgroundColor: '#f5f5f5',
    padding: 20,
    borderRadius: 12,
    marginBottom: 48,
    minWidth: 300,
    alignItems: 'center',
  },
  userLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  userEmail: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  features: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 24,
    maxWidth: 1200,
  },
  featureCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 16,
    padding: 32,
    width: 280,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  featureIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  featureTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  featureDescription: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
});

export default DesktopLanding;


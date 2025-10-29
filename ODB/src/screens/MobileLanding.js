import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useNavigate } from 'react-router-dom';
import { signOutUser } from '../firebase/authService';

const MobileLanding = ({ user }) => {
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

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Welcome to ODB Mobile</Text>
        <Text style={styles.subtitle}>Your mobile experience</Text>
        
        {user && (
          <View style={styles.userInfo}>
            <Text style={styles.userLabel}>Logged in as:</Text>
            <Text style={styles.userEmail}>{user.email}</Text>
          </View>
        )}

        <View style={styles.features}>
          <View style={styles.featureCard}>
            <Text style={styles.featureIcon}>📱</Text>
            <Text style={styles.featureTitle}>Mobile Optimized</Text>
            <Text style={styles.featureDescription}>
              Responsive design tailored for mobile devices
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

          <View style={styles.featureCard}>
            <Text style={styles.featureIcon}>🎯</Text>
            <Text style={styles.featureTitle}>Touch Friendly</Text>
            <Text style={styles.featureDescription}>
              Optimized for touch interactions and gestures
            </Text>
          </View>
        </View>
      </ScrollView>
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
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  logo: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  signOutButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#ff3b30',
    borderRadius: 8,
  },
  signOutText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 24,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 32,
    textAlign: 'center',
  },
  userInfo: {
    backgroundColor: '#f5f5f5',
    padding: 16,
    borderRadius: 12,
    marginBottom: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  userLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
  },
  userEmail: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  features: {
    width: '100%',
    maxWidth: 400,
  },
  featureCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  featureIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  featureDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default MobileLanding;


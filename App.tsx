import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, SafeAreaView, StatusBar, StyleSheet,
} from 'react-native';
import { LoginScreen } from './src/screens/LoginScreen';
import { JobsScreen } from './src/screens/JobsScreen';
import { EarningsScreen } from './src/screens/EarningsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { registerDevicePushToken } from './src/lib/pushNotifications';

const colors = {
  bg: { primary: '#090a0f', card: '#12141c' },
  brand: { orange: '#f97316' },
  text: { primary: '#f1f5f9', secondary: '#94a3b8', muted: '#64748b' },
  border: { primary: 'rgba(255,255,255,0.08)' },
  status: { success: '#10b981' },
};

type TabId = 'jobs' | 'earnings' | 'settings';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'jobs', label: 'Jobs', icon: '📋' },
  { id: 'earnings', label: 'Earnings', icon: '💰' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('jobs');

  const handleLogin = () => {
    setIsAuthenticated(true);
    void registerDevicePushToken('tech');
  };

  // Show login screen when not authenticated
  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg.primary} />

      {/* App Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerLogo}>
            <Text style={styles.headerLogoText}>🔧</Text>
          </View>
          <View>
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerTitle}>ADAPTIVITY TECH</Text>
              <View style={styles.onlineBadge}>
                <Text style={styles.onlineText}>ONLINE</Text>
              </View>
            </View>
            <Text style={styles.headerSubtitle}>Alex Vance • Rig #4 (Justin Hub)</Text>
          </View>
        </View>
      </View>

      {/* Active Screen Content */}
      <View style={styles.screenContainer}>
        {activeTab === 'jobs' && <JobsScreen />}
        {activeTab === 'earnings' && <EarningsScreen />}
        {activeTab === 'settings' && <SettingsScreen onLogout={() => setIsAuthenticated(false)} />}
      </View>

      {/* Bottom Tab Bar */}
      <View style={styles.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tabItem, activeTab === tab.id && styles.tabItemActive]}
            onPress={() => setActiveTab(tab.id)}
            activeOpacity={0.7}
          >
            <Text style={styles.tabIcon}>{tab.icon}</Text>
            <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>
              {tab.label}
            </Text>
            {activeTab === tab.id && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  header: {
    backgroundColor: colors.bg.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerLogo: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.bg.primary,
    borderWidth: 2,
    borderColor: colors.brand.orange,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerLogoText: { fontSize: 16 },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: 0.5,
  },
  onlineBadge: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  onlineText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.status.success,
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 11,
    color: colors.text.muted,
    marginTop: 2,
  },
  screenContainer: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.bg.card,
    borderTopWidth: 1,
    borderTopColor: colors.border.primary,
    paddingBottom: 20, // Safe area for iPhone home indicator
    paddingTop: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    position: 'relative',
  },
  tabItemActive: {},
  tabIcon: { fontSize: 20, marginBottom: 4 },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.muted,
  },
  tabLabelActive: {
    color: colors.brand.orange,
  },
  tabIndicator: {
    position: 'absolute',
    top: -8,
    width: 24,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.brand.orange,
  },
});

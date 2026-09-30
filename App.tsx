import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoginScreen } from './src/screens/LoginScreen';
import { JobsScreen } from './src/screens/JobsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { RequiredDocumentGates } from './src/components/RequiredDocumentGates';
import { registerDevicePushToken } from './src/lib/pushNotifications';
import { fetchMyDisplayName, supabase } from './src/lib/supabase';
import { colors } from './src/theme/colors';

type TabId = 'jobs' | 'settings';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'jobs', label: 'Jobs', icon: '📋' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Root />
    </SafeAreaProvider>
  );
}

function Root() {
  const [authReady, setAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setIsAuthenticated(Boolean(data.session?.user));
      setAuthReady(true);
      if (data.session?.user) void registerDevicePushToken('tech');
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session?.user));
      setAuthReady(true);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!authReady) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={colors.brand.orange} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <LoginScreen
        onLogin={() => {
          setIsAuthenticated(true);
          void registerDevicePushToken('tech');
        }}
      />
    );
  }

  return (
    <TechShell
      onSignOut={async () => {
        await supabase.auth.signOut();
        setIsAuthenticated(false);
      }}
    />
  );
}

function TechShell({ onSignOut }: { onSignOut: () => Promise<void> }) {
  // Android draws edge-to-edge, so the header and tab bar pad themselves by
  // the real status-bar / gesture-bar insets instead of relying on iOS-only
  // SafeAreaView. This is what fixes the header sitting under the clock.
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabId>('jobs');
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [documentsVersion, setDocumentsVersion] = useState(0);

  useEffect(() => {
    void fetchMyDisplayName().then(setDisplayName).catch(() => setDisplayName(null));
  }, []);

  const bumpDocuments = () => setDocumentsVersion((n) => n + 1);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10, paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }]}>
        <Image source={require('./assets/logo.png')} style={styles.headerLogo} />
        <View style={styles.headerText}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              ADAPTIVITY TECH
            </Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>TECHNICIAN</Text>
            </View>
          </View>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {displayName ? `${displayName} · live dispatch` : 'Live dispatch'}
          </Text>
        </View>
      </View>

      <RequiredDocumentGates refreshKey={documentsVersion} onChanged={bumpDocuments} />

      <View style={styles.screenContainer}>
        {activeTab === 'jobs' && <JobsScreen />}
        {activeTab === 'settings' && (
          <SettingsScreen
            onLogout={() => void onSignOut()}
            refreshKey={documentsVersion}
            onDocumentsChanged={bumpDocuments}
          />
        )}
      </View>

      <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 8), paddingLeft: insets.left, paddingRight: insets.right }]}>
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={styles.tabItem}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              {active && <View style={styles.tabIndicator} />}
              <Text style={styles.tabIcon}>{tab.icon}</Text>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.primary },
  centered: { justifyContent: 'center', alignItems: 'center' },
  header: {
    backgroundColor: colors.bg.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.primary,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerLogo: { width: 36, height: 36, borderRadius: 10, resizeMode: 'contain' },
  headerText: { flex: 1, minWidth: 0 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 15, fontWeight: '800', color: colors.text.primary, letterSpacing: 0.5, flexShrink: 1 },
  badge: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  badgeText: { fontSize: 9, fontWeight: '700', color: colors.status.success, letterSpacing: 0.5 },
  headerSubtitle: { fontSize: 11, color: colors.text.muted, marginTop: 2 },
  screenContainer: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.bg.card,
    borderTopWidth: 1,
    borderTopColor: colors.border.primary,
    paddingTop: 8,
  },
  tabItem: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  tabIcon: { fontSize: 20, marginBottom: 4 },
  tabLabel: { fontSize: 11, fontWeight: '600', color: colors.text.muted },
  tabLabelActive: { color: colors.brand.orange },
  tabIndicator: {
    position: 'absolute',
    top: -8,
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.brand.orange,
  },
});

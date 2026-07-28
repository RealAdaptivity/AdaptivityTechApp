import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, SafeAreaView,
  StatusBar, KeyboardAvoidingView, Platform, StyleSheet, Alert,
} from 'react-native';
import { colors, spacing, borderRadius } from '../theme/colors';
import { signInTech, ensureTechProfile } from '../lib/supabase';

interface LoginScreenProps {
  onLogin: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing Credentials', 'Please enter your approved technician email and password.');
      return;
    }
    setLoading(true);
    const { error } = await signInTech(email.trim(), password);
    if (error) {
      setLoading(false);
      Alert.alert('Login Failed', error.message);
      return;
    }
    try {
      await ensureTechProfile();
    } catch (profileErr: unknown) {
      setLoading(false);
      Alert.alert(
        'Technician profile',
        profileErr instanceof Error ? profileErr.message : 'Could not register technician profile.'
      );
      return;
    }
    setLoading(false);
    onLogin();
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg.primary} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        {/* Logo Header */}
        <View style={styles.logoContainer}>
          <View style={styles.logoIcon}>
            <Text style={styles.logoEmoji}>🔧</Text>
          </View>
          <Text style={styles.logoTitle}>
            ADAPTIVITY <Text style={styles.logoAccent}>TECH</Text>
          </Text>
          <Text style={styles.logoSubtitle}>TECHNICIAN MOBILE DISPATCH</Text>
        </View>

        {/* Login Card */}
        <View style={styles.card}>
          <View style={styles.lockIcon}>
            <Text style={styles.lockEmoji}>🔒</Text>
          </View>
          <Text style={styles.cardTitle}>Technician Portal Login</Text>
          <Text style={styles.cardSubtitle}>
            Enter your approved tech credentials to access automotive dispatch jobs & Stripe payouts.
          </Text>

          {/* Email Input */}
          <Text style={styles.inputLabel}>Approved Tech Email</Text>
          <TextInput
            style={styles.input}
            placeholder="alex.vance@adaptivityperformance.com"
            placeholderTextColor={colors.text.muted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {/* Password Input */}
          <Text style={styles.inputLabel}>Password / PIN</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••••••"
            placeholderTextColor={colors.text.muted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          {/* Sign In Button */}
          <TouchableOpacity
            style={[styles.signInButton, loading && styles.signInButtonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.signInText}>
              {loading ? '⏳ Authenticating...' : '🔧 Sign In to Mobile Dispatch'}
            </Text>
          </TouchableOpacity>

          {/* ASE Badge */}
          <View style={styles.aseBadge}>
            <View style={styles.aseBadgeRow}>
              <Text style={styles.aseBadgeLabel}>Account Requirements:</Text>
              <Text style={styles.aseVerified}>Trade Verified</Text>
            </View>
            <Text style={styles.aseDescription}>
              Mobile dispatch accounts require completed background checks, tool verification, and linked Stripe Express payout setup.
            </Text>
          </View>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          🔒 Encrypted 256-Bit SSL • Adaptivity Performance Technician Dispatch Platform v2.4
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing['3xl'],
  },
  logoIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    backgroundColor: colors.bg.card,
    borderWidth: 2,
    borderColor: colors.brand.orange,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  logoEmoji: {
    fontSize: 22,
  },
  logoTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: 1,
  },
  logoAccent: {
    color: colors.brand.orange,
  },
  logoSubtitle: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text.muted,
    letterSpacing: 3,
    marginTop: 4,
  },
  card: {
    backgroundColor: colors.bg.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border.primary,
    padding: spacing['2xl'],
    alignItems: 'center',
  },
  lockIcon: {
    width: 52,
    height: 52,
    borderRadius: borderRadius.lg,
    backgroundColor: 'rgba(249,115,22,0.12)',
    borderWidth: 1,
    borderColor: colors.border.orange,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  lockEmoji: {
    fontSize: 24,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  cardSubtitle: {
    fontSize: 13,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: spacing.xl,
  },
  inputLabel: {
    alignSelf: 'flex-start',
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: spacing.xs,
    marginTop: spacing.md,
  },
  input: {
    width: '100%',
    backgroundColor: colors.bg.input,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    color: colors.text.primary,
    fontSize: 15,
  },
  signInButton: {
    width: '100%',
    backgroundColor: colors.brand.orange,
    borderRadius: borderRadius.md,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing['2xl'],
    shadowColor: colors.brand.orange,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  signInButtonDisabled: {
    opacity: 0.6,
  },
  signInText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  aseBadge: {
    width: '100%',
    backgroundColor: colors.bg.input,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border.primary,
    padding: spacing.lg,
    marginTop: spacing.xl,
  },
  aseBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  aseBadgeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.primary,
  },
  aseVerified: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.status.success,
  },
  aseDescription: {
    fontSize: 11,
    color: colors.text.muted,
    lineHeight: 16,
  },
  footer: {
    textAlign: 'center',
    fontSize: 10,
    color: colors.text.muted,
    marginTop: spacing['3xl'],
  },
});

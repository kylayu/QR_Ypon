import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import AppButton from '@/components/AppButton';
import Header from '@/components/Header';
import { COLORS } from '@/constants/colors';
import { resetPassword, signIn } from '@/lib/auth';

export default function LoginScreen() {
  const passwordInputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const handleLogin = async () => {
    if (loading || resetLoading) return;

    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      setSuccessMessage(null);
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      const { error: authError } = await signIn(
        email.trim(),
        password,
      );

      if (authError) {
        setError(authError.message);
      } else {
        router.replace('/(tabs)');
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unexpected error. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (loading || resetLoading) return;

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError('Please enter your email address first.');
      setSuccessMessage(null);
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      setSuccessMessage(null);
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setResetLoading(true);

    try {
      const { error: resetError } = await resetPassword(trimmedEmail);

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setSuccessMessage(
        'Check your Gmail! If an account exists for this email, we sent you a password reset link. Open the email and click "Reset Password" to create your new password. If you do not see it, check your Spam folder.',
      );
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to send the password reset email. Please try again.',
      );
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top },
      ]}
    >
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerContainer}>
            <Header title="AttendScan" />
          </View>

          <Text style={styles.title}>Welcome Back</Text>

          <Text style={styles.subtitle}>
            Sign in to record your attendance
          </Text>

          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>

            <TextInput
              style={styles.input}
              value={email}
              onChangeText={(value) => {
                setEmail(value);
                setError(null);
                setSuccessMessage(null);
              }}
              placeholder="your.email@school.edu"
              placeholderTextColor={COLORS.textSecondary}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => passwordInputRef.current?.focus()}
              editable={!loading && !resetLoading}
              accessibilityLabel="Email address"
            />

            <Text style={styles.label}>Password</Text>

            <View style={styles.passwordContainer}>
              <TextInput
                ref={passwordInputRef}
                style={styles.passwordInput}
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  setError(null);
                  setSuccessMessage(null);
                }}
                placeholder="Enter your password"
                placeholderTextColor={COLORS.textSecondary}
                secureTextEntry={!showPassword}
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={handleLogin}
                editable={!loading && !resetLoading}
                accessibilityLabel="Password"
              />

              <Pressable
                onPress={() => setShowPassword((previous) => !previous)}
                disabled={loading || resetLoading}
                style={({ pressed }) => [
                  styles.eyeButton,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  showPassword ? 'Hide password' : 'Show password'
                }
                accessibilityHint="Toggles password visibility"
                hitSlop={10}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={22}
                  color={COLORS.textSecondary}
                />
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Forgot password"
              onPress={handleForgotPassword}
              disabled={loading || resetLoading}
              style={({ pressed }) => [
                styles.forgotPassword,
                pressed && styles.pressed,
              ]}
            >
              {resetLoading ? (
                <View style={styles.resetLoading}>
                  <ActivityIndicator
                    size="small"
                    color={COLORS.primary}
                  />
                  <Text style={styles.forgotPasswordText}>
                    Sending reset email...
                  </Text>
                </View>
              ) : (
                <Text style={styles.forgotPasswordText}>
                  Forgot Password?
                </Text>
              )}
            </Pressable>

            {error ? (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            ) : null}

            {successMessage ? (
              <View
                accessibilityRole="alert"
                style={styles.successBox}
              >
                <Text style={styles.successTitle}>
                  Check Your Gmail
                </Text>
                <Text style={styles.successText}>
                  {successMessage}
                </Text>
              </View>
            ) : null}

            {loading ? (
              <ActivityIndicator
                size="large"
                color={COLORS.primary}
                style={styles.loader}
              />
            ) : (
              <AppButton
                theme="primary"
                title="Sign In"
                icon="log-in-outline"
                onPress={handleLogin}
              />
            )}
          </View>

<Pressable
  style={styles.signupLink}
  onPress={() => router.replace('/register')}
  accessibilityRole="link"
>
  <Text style={styles.signupText}>
    Don't have an account?{' '}
    <Text style={styles.signupTextBold}>Sign Up</Text>
  </Text>
</Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  keyboardView: {
    flex: 1,
  },
scrollContent: {
  flexGrow: 1,
  paddingHorizontal: 24,
  paddingTop: 100,
  paddingBottom: 40,
},
  headerContainer: {
    alignItems: 'center',
    marginTop: -40,
    marginBottom: 50,
  },
  title: {
    fontSize: 35,
    fontWeight: '900',
    color: COLORS.textPrimary,
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
    marginBottom: 30,
    lineHeight: 21,
    textAlign: 'center',
  },
  form: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.textPrimary,
    marginBottom: 16,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 16,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  eyeButton: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginTop: -8,
    marginBottom: 18,
    paddingVertical: 6,
  },
  forgotPasswordText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '700',
  },
  resetLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pressed: {
    opacity: 0.7,
  },
  error: {
    fontSize: 14,
    color: COLORS.danger,
    textAlign: 'left',
    marginTop: 4,
    marginBottom: 12,
  },
  successBox: {
    backgroundColor: '#E8F7EE',
    borderColor: '#A7DDB9',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  successTitle: {
    color: '#176B39',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  successText: {
    color: '#205C38',
    fontSize: 14,
    lineHeight: 21,
  },
  loader: {
    marginVertical: 16,
  },
signupLink: {
  width: '100%',
  alignItems: 'center',
  justifyContent: 'center',
  marginTop: -20,
  paddingVertical: 10,
},

signupText: {
  fontSize: 14,
  color: COLORS.textSecondary,
  fontWeight: '700',
  textAlign: 'center',
},

signupTextBold: {
  color: COLORS.primary,
  fontWeight: '700',
},
});
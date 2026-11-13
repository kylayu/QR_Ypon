import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { COLORS } from '@/constants/colors';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordScreen() {
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingLink, setCheckingLink] = useState(true);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [message, setMessage] = useState('');

  const showMessage = (text: string) => {
    setMessage(text);

    if (Platform.OS !== 'web') {
      Alert.alert('Reset Password', text);
    }
  };

  useEffect(() => {
    let mounted = true;
    let recoveryEventReceived = false;

    const processRecoveryUrl = async (url: string): Promise<boolean> => {
      try {
        const parsedUrl = new URL(url);

        const hashParams = new URLSearchParams(
          parsedUrl.hash.replace(/^#/, ''),
        );

        const queryParams = parsedUrl.searchParams;

        const errorCode =
          hashParams.get('error_code') ??
          queryParams.get('error_code');

        const errorDescription =
          hashParams.get('error_description') ??
          queryParams.get('error_description');

        const errorType =
          hashParams.get('error') ??
          queryParams.get('error');

        if (errorCode || errorType) {
          const description = errorDescription
            ? errorDescription.replace(/\+/g, ' ')
            : '';

          throw new Error(
            errorCode === 'otp_expired'
              ? 'This reset link has expired or has already been used. Please request a new password reset email.'
              : description || 'The reset link is invalid. Please request a new one.',
          );
        }

        const accessToken =
          hashParams.get('access_token') ??
          queryParams.get('access_token');

        const refreshToken =
          hashParams.get('refresh_token') ??
          queryParams.get('refresh_token');

        const tokenHash =
          hashParams.get('token_hash') ??
          queryParams.get('token_hash');

        const type =
          hashParams.get('type') ??
          queryParams.get('type');

        if (type !== 'recovery') {
          return false;
        }

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            throw error;
          }

          return true;
        }

        if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'recovery',
          });

          if (error) {
            throw error;
          }

          return true;
        }

        return false;
      } catch (error) {
        console.error('Recovery link error:', error);

        if (mounted) {
          setMessage(
            error instanceof Error
              ? error.message
              : 'Unable to verify your reset link. Please request a new one.',
          );
        }

        return false;
      }
    };

    const initializeRecovery = async () => {
      try {
        let validRecovery = false;

        if (Platform.OS === 'web') {
          validRecovery = await processRecoveryUrl(
            window.location.href,
          );
        } else {
          const initialUrl = await Linking.getInitialURL();

          if (initialUrl) {
            validRecovery = await processRecoveryUrl(initialUrl);
          }
        }

        if (!mounted) {
          return;
        }

        if (validRecovery) {
          setRecoveryReady(true);
          setMessage('');

          // Remove tokens from the browser address bar after processing.
          if (Platform.OS === 'web') {
            window.history.replaceState(
              {},
              document.title,
              window.location.pathname + window.location.search,
            );
          }

          return;
        }

        // Allow a recovery event received through Supabase's auth listener.
        if (recoveryEventReceived) {
          setRecoveryReady(true);
          setMessage('');
          return;
        }

        // An ordinary signed-in session alone is not proof of recovery.
        setRecoveryReady(false);

        setMessage((currentMessage) =>
          currentMessage ||
          'This reset link could not be verified. Request a new password reset email.',
        );
      } catch (error) {
        console.error('Unable to initialize password recovery:', error);

        if (mounted) {
          setRecoveryReady(false);
          setMessage(
            'Unable to verify your reset link. Please request a new one.',
          );
        }
      } finally {
        if (mounted) {
          setCheckingLink(false);
        }
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && mounted) {
        recoveryEventReceived = true;
        setRecoveryReady(true);
        setMessage('');
        setCheckingLink(false);
      }
    });

    void initializeRecovery();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleUpdatePassword = async () => {
    if (!recoveryReady) {
      showMessage(
        'Your password reset session is not valid. Please request a new reset email.',
      );
      return;
    }

    if (!password || !confirmPassword) {
      showMessage('Please fill in both password fields.');
      return;
    }

    if (password.length < 6) {
      showMessage('Your password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      showMessage('The passwords do not match.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const { data, error } = await supabase.auth.updateUser({
        password,
      });

      if (error) {
        showMessage(`Password update failed: ${error.message}`);
        return;
      }

      if (!data.user) {
        showMessage(
          'Your password could not be updated. Please request a new reset email.',
        );
        return;
      }

      await supabase.auth.signOut();

      setRecoveryReady(false);
      setPassword('');
      setConfirmPassword('');

      showMessage('Your password has been updated successfully.');

      if (Platform.OS === 'web') {
        window.setTimeout(() => {
          router.replace('/login');
        }, 1500);
      } else {
        router.replace('/login');
      }
    } catch (error) {
      console.error('Password update error:', error);

      showMessage(
        error instanceof Error
          ? error.message
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  if (checkingLink) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.subtitle}>
          Verifying your password reset link...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Reset Password</Text>

      <Text style={styles.subtitle}>
        {recoveryReady
          ? 'Enter and confirm your new password below.'
          : 'Your password reset link could not be verified.'}
      </Text>

      {recoveryReady ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="New password"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            value={password}
            onChangeText={setPassword}
            editable={!loading}
          />

          <TextInput
            style={styles.input}
            placeholder="Confirm new password"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            editable={!loading}
          />

          {!!message && (
            <Text style={styles.message}>{message}</Text>
          )}

          <TouchableOpacity
            style={[
              styles.button,
              loading && styles.disabledButton,
            ]}
            onPress={handleUpdatePassword}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>
                Update Password
              </Text>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <>
          {!!message && (
            <Text style={styles.message}>{message}</Text>
          )}

          <TouchableOpacity
            style={styles.button}
            onPress={() => router.replace('/forgot-password')}
          >
            <Text style={styles.buttonText}>
              Request New Reset Link
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.replace('/login')}
          >
            <Text style={styles.secondaryButtonText}>
              Back to Login
            </Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
    color: COLORS.primary,
  },
  subtitle: {
    fontSize: 15,
    color: '#666666',
    marginTop: 12,
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    fontSize: 16,
    color: '#111827',
  },
  button: {
    backgroundColor: COLORS.primary,
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
  secondaryButton: {
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  secondaryButtonText: {
    color: COLORS.primary,
    fontWeight: '600',
    fontSize: 15,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  message: {
    marginBottom: 16,
    color: '#B91C1C',
  },
});

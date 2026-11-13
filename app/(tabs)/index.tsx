import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppButton from '@/components/AppButton';
import Header from '@/components/Header';
import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { getProfile, type Role } from '@/lib/profiles';
import { supabase } from '@/lib/supabase';

export default function Index() {
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const [loadingName, setLoadingName] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

  // Check the current login session and redirect logged-out users.
  useEffect(() => {
    let active = true;

    const checkSession = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (!active) return;

        if (error || !data.session) {
          router.replace('/login');
          return;
        }

        setAuthChecked(true);
      } catch (error) {
        console.error('Error checking authentication:', error);

        if (active) {
          router.replace('/login');
        }
      }
    };

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;

      if (!session) {
        setAuthChecked(false);
        router.replace('/login');
      } else {
        setAuthChecked(true);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // Load the logged-in user's name and role.
  useEffect(() => {
    let active = true;

    async function loadUserName() {
      if (!user) {
        if (active) {
          setName('');
          setRole(null);
          setLoadingName(false);
        }
        return;
      }

      try {
        const profile = await getProfile(user.id);

        if (active) {
          setName(
            profile?.full_name?.trim() ||
              user.email?.split('@')[0] ||
              'User'
          );

          setRole(profile?.role ?? null);
        }
      } catch (error) {
        console.error('Error loading profile:', error);

        if (active) {
          setName(user.email?.split('@')[0] || 'User');
          setRole(null);
        }
      } finally {
        if (active) {
          setLoadingName(false);
        }
      }
    }

    setLoadingName(true);
    void loadUserName();

    return () => {
      active = false;
    };
  }, [user]);

  // Do not show the Home screen before authentication is confirmed.
  if (!authChecked || !user) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerContainer}>
        <Header title="AttendScan" />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Welcome section */}
        <View style={styles.welcomeCard}>
          <Text style={styles.mainTitle}>
            {loadingName
              ? 'Welcome!'
              : `Welcome back, ${name || 'User'}!`}
          </Text>

          <Text style={styles.subtitle}>
            Manage your school event attendance in one place.
          </Text>
        </View>

        {/* Quick Actions */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <Text style={styles.sectionSubtitle}>
            Choose an action to get started.
          </Text>
        </View>

        <View style={styles.actionsContainer}>
          {role === 'admin' ? (
            <>
              <AppButton
                theme="primary"
                title="Users"
                icon="people-outline"
                onPress={() => router.push('/users')}
              />

              <AppButton
                title="Events"
                icon="calendar-outline"
                onPress={() => router.push('/events')}
              />
<AppButton
  title="Attendance"
  icon="checkbox-outline"
  onPress={() => router.push('/(tabs)/attendance')}
/>
              <AppButton
                title="Reports"
                icon="bar-chart-outline"
                onPress={() => router.push('/reports')}
              />

              <AppButton
                title="Profile"
                icon="person-outline"
                onPress={() => router.push('/profile')}
              />
            </>
          ) : role === 'student' ? (
            <>
              <AppButton
                theme="primary"
                title="Events"
                icon="calendar-outline"
                onPress={() => router.push('/events')}
              />

              <AppButton
                title="Scan"
                icon="qr-code-outline"
                onPress={() => router.push('/scan')}
              />

              <AppButton
                title="History"
                icon="time-outline"
                onPress={() => router.push('/history')}
              />

              <AppButton
                title="Profile"
                icon="person-outline"
                onPress={() => router.push('/profile')}
              />
            </>
          ) : role === 'teacher' ? (
            <>
              <AppButton
                theme="primary"
                title="Events"
                icon="calendar-outline"
                onPress={() => router.push('/events')}
              />

<AppButton
  title="Attendance"
  icon="checkbox-outline"
  onPress={() => router.push('/(tabs)/attendance')}
/>

              <AppButton
                title="Manage"
                icon="clipboard-outline"
                onPress={() => router.push('/manage')}
              />

              <AppButton
                title="Profile"
                icon="person-outline"
                onPress={() => router.push('/profile')}
              />
            </>
          ) : (
            <ActivityIndicator
              size="small"
              color={COLORS.primary}
            />
          )}
        </View>

        {/* Role-specific How it works */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>How it works</Text>

          {role === 'teacher' ? (
            <>
              <Text style={styles.infoText}>
                1. Open Manage to create events, update event details,
                and manage event status.
              </Text>

              <Text style={styles.infoText}>
                2. Generate QR codes for your events so students can
                scan them to record attendance.
              </Text>

              <Text style={styles.infoText}>
                3. Open Dashboard to monitor attendance records and
                check which students attended.
              </Text>

              <Text style={styles.infoText}>
                4. Open Profile to view your account information.
              </Text>
            </>
          ) : role === 'admin' ? (
            <>
              <Text style={styles.infoText}>
                1. Open Users to manage registered accounts and user roles.
              </Text>

              <Text style={styles.infoText}>
                2. Open Events to review and manage school events.
              </Text>

              <Text style={styles.infoText}>
                3. Open Attendance to review and correct attendance records.
              </Text>

              <Text style={styles.infoText}>
                4. Open Reports to review attendance summaries and scan records.
              </Text>
            </>
          ) : role === 'student' ? (
            <>
              <Text style={styles.infoText}>
                1. Open Events to view school activities.
              </Text>

              <Text style={styles.infoText}>
                2. Scan an event QR code to record your attendance.
              </Text>

              <Text style={styles.infoText}>
                3. Open History to review your attendance records.
              </Text>
            </>
          ) : null}
        </View>
      </ScrollView>

      <Text style={styles.footerText}>AttendScan System</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },

  headerContainer: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
  },

  scrollView: {
    flex: 1,
  },

  scrollContent: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 28,
  },

  welcomeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 22,
    marginBottom: 28,
  },

  mainTitle: {
    fontSize: 25,
    fontWeight: '700',
    color: COLORS.textPrimary,
    lineHeight: 33,
    marginBottom: 10,
  },

  subtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
    lineHeight: 23,
  },

  sectionHeader: {
    marginBottom: 14,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 5,
  },

  sectionSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },

  actionsContainer: {
    gap: 10,
  },

  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 18,
    marginTop: 24,
  },

  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 10,
  },

  infoText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 22,
    marginBottom: 5,
  },

  footerText: {
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.textSecondary,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
});
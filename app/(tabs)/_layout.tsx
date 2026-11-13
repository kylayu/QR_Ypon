import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';

import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { getProfile } from '@/lib/profiles';

export default function TabLayout() {
  const { user } = useAuth();

  const [role, setRole] = useState<string | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadRole() {
      setRole(null);
      setRoleLoaded(false);

      if (!user?.id) {
        setRoleLoaded(true);
        return;
      }

      try {
        const profile = await getProfile(user.id);

        if (active) {
          setRole(profile?.role?.toLowerCase() ?? null);
        }
      } catch (error) {
        console.error('Failed to load role:', error);
      } finally {
        if (active) {
          setRoleLoaded(true);
        }
      }
    }

    void loadRole();

    return () => {
      active = false;
    };
  }, [user?.id]);

  const isStudent = role === 'student';
  const isTeacher = role === 'teacher';
  const isAdmin = role === 'admin';
  const ready = roleLoaded;
  

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textSecondary,
        headerStyle: {
          backgroundColor: COLORS.background,
        },
        headerShadowVisible: false,
        headerTintColor: COLORS.textPrimary,
        tabBarStyle: {
          backgroundColor: COLORS.card,
          borderTopColor: COLORS.border,
        },
      }}
    >
{/* HOME: ALL ROLES */}
<Tabs.Screen
  name="index"
  options={{
    title: 'Home',
    href:
      ready && (isStudent || isTeacher || isAdmin)
        ? '/(tabs)'
        : null,
    tabBarIcon: ({ color, size }) => (
      <Ionicons name="home-outline" size={size} color={color} />
    ),
  }}
/>

      {/* HIDE THE OLD ADMIN ROUTE FROM THE TAB BAR */}
      <Tabs.Screen
        name="admin"
        options={{
          href: null,
        }}
      />

      {/* USERS: ADMIN ONLY */}
      <Tabs.Screen
        name="users"
        options={{
          title: 'Users',
          href: ready && isAdmin ? '/(tabs)/users' : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />

      {/* EVENTS: ALL ROLES */}
      <Tabs.Screen
        name="events"
        options={{
          title: 'Events',
          href:
            ready && (isStudent || isTeacher || isAdmin)
              ? '/(tabs)/events'
              : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />

      {/* SCAN: STUDENTS ONLY */}
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          href: ready && isStudent ? '/(tabs)/scan' : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="qr-code-outline" size={size} color={color} />
          ),
        }}
      />

      {/* HISTORY: STUDENTS ONLY */}
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          href: ready && isStudent ? '/(tabs)/history' : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time-outline" size={size} color={color} />
          ),
        }}
      />


      {/* ATTENDANCE: TEACHERS AND ADMIN ONLY */}
      <Tabs.Screen
        name="attendance"
        options={{
          title: 'Attendance',
          href: ready && (isTeacher || isAdmin)
            ? '/(tabs)/attendance'
            : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name="checkbox-outline"
              size={size}
              color={color}
            />
          ),
        }}
      />

{/* MANAGE: TEACHERS ONLY */}
<Tabs.Screen
  name="manage"
  options={{
    title: 'Manage',
    href: ready && isTeacher ? '/(tabs)/manage' : null,
    tabBarIcon: ({ color, size }) => (
      <Ionicons name="clipboard-outline" size={size} color={color} />
    ),
  }}
/>

      {/* ADMIN REPORTS */}
<Tabs.Screen
  name="reports"
  options={{
    title: 'Reports',
    href: ready && isAdmin ? '/(tabs)/reports' : null,
    tabBarIcon: ({ color, size }) => (
      <Ionicons
        name="bar-chart-outline"
        size={size}
        color={color}
      />
    ),
  }}
/>

      {/* PROFILE: STUDENTS, TEACHERS, AND ADMIN */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          href:
            ready && (isStudent || isTeacher || isAdmin)
              ? '/(tabs)/profile'
              : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
      {/* RESET PASSWORD: HIDDEN FROM ALL ROLE NAVIGATION */}
<Tabs.Screen
  name="reset-password"
  options={{
    href: null,
  }}
/>
    </Tabs>
  );
}
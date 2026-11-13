import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View
} from 'react-native';

import { COLORS } from '@/constants/colors';
import {
    getAdminUsers,
    updateUserRole,
    type AdminUser,
} from '@/lib/admin';
import { useAuth } from '@/lib/auth';
import { getProfile, type Role } from '@/lib/profiles';

type RoleFilter = 'all' | Role;

const ROLE_OPTIONS: Role[] = ['student', 'teacher', 'admin'];

const ROLE_LABELS: Record<Role, string> = {
  student: 'Student',
  teacher: 'Teacher',
  admin: 'Admin',
};

export default function UsersScreen() {
  const { user } = useAuth();

  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<RoleFilter>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadData = useCallback(async () => {
    if (!user?.id) {
      setAuthorized(false);
      setChecking(false);
      setUsers([]);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const profile = await getProfile(user.id);

      if (profile?.role?.toLowerCase() !== 'admin') {
        setAuthorized(false);
        setUsers([]);
        return;
      }

      setAuthorized(true);

      const result = await getAdminUsers();
      setUsers(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load users. Please try again.',
      );
    } finally {
      setLoading(false);
      setChecking(false);
    }
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const counts = useMemo(
    () => ({
      all: users.length,
      student: users.filter((item) => item.role === 'student').length,
      teacher: users.filter((item) => item.role === 'teacher').length,
      admin: users.filter((item) => item.role === 'admin').length,
    }),
    [users],
  );

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return users.filter((item) => {
      const matchesRole = filter === 'all' || item.role === filter;

      const matchesSearch =
        !query ||
        (item.full_name ?? '').toLowerCase().includes(query) ||
        (item.email ?? '').toLowerCase().includes(query);

      return matchesRole && matchesSearch;
    });
  }, [users, search, filter]);

const saveRole = async (item: AdminUser, role: Role) => {
  if (updatingId !== null || item.role === role) return;

  if (item.id === user?.id) {
    setError('You cannot change your own role.');
    setNotice('');
    return;
  }

  if (item.role === 'admin') {
    setError('Existing Admin accounts cannot be changed here.');
    setNotice('');
    return;
  }

  setUpdatingId(item.id);
  setError('');
  setNotice('');

  try {
    await updateUserRole(item.id, role);

    // Update the screen immediately.
    setUsers((current) =>
      current.map((existing) =>
        existing.id === item.id
          ? { ...existing, role }
          : existing,
      ),
    );

    setNotice(
      `${item.full_name || item.email || 'User'} is now a ${
        ROLE_LABELS[role]
      }.`,
    );
  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : 'Unable to update this user role.',
    );
  } finally {
    setUpdatingId(null);
  }
};

const changeRole = (item: AdminUser, role: Role) => {
  if (!ROLE_OPTIONS.includes(role)) return;

  if (updatingId !== null) {
    setError('Please wait for the current role update to finish.');
    return;
  }

  if (item.id === user?.id) {
    setError('You cannot change your own role.');
    return;
  }

  if (item.role === 'admin') {
    setError('Existing Admin accounts cannot be changed here.');
    return;
  }

  if (item.role === role) return;

  void saveRole(item, role);
};

  if (checking) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.muted}>
          Checking administrator access...
        </Text>
      </View>
    );
  }

  if (!authorized) {
    return (
      <View style={styles.center}>
        <Ionicons
          name="shield-checkmark-outline"
          size={46}
          color={COLORS.primary}
        />
        <Text style={styles.heading}>Access denied</Text>
        <Text style={styles.muted}>
          Only administrator accounts can manage users.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => void loadData()}
          colors={[COLORS.primary]}
        />
      }
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>ADMINISTRATION</Text>
          <Text style={styles.heading}>Manage Users</Text>
          <Text style={styles.muted}>
            Search users and manage their account roles.
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh users"
          onPress={() => void loadData()}
          disabled={loading}
          style={({ pressed }) => [
            styles.refreshButton,
            pressed && styles.pressed,
          ]}
        >
          {loading ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <Ionicons
              name="refresh-outline"
              size={21}
              color={COLORS.primary}
            />
          )}
        </Pressable>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Ionicons
            name="alert-circle-outline"
            size={20}
            color="#B91C1C"
          />
          <View style={styles.errorContent}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => void loadData()}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {notice ? (
  <View style={styles.successBox}>
    <Ionicons
      name="checkmark-circle-outline"
      size={20}
      color="#166534"
    />
    <Text style={styles.successText}>{notice}</Text>
  </View>
) : null}

      <View style={styles.statsGrid}>
        <StatCard
          label="All Users"
          value={counts.all}
          icon="people-outline"
        />
        <StatCard
          label="Students"
          value={counts.student}
          icon="school-outline"
        />
        <StatCard
          label="Teachers"
          value={counts.teacher}
          icon="person-outline"
        />
        <StatCard
          label="Admins"
          value={counts.admin}
          icon="shield-checkmark-outline"
        />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>User Directory</Text>
        <Text style={styles.resultCount}>
          {filteredUsers.length}{' '}
          {filteredUsers.length === 1 ? 'user' : 'users'}
        </Text>
      </View>

      <View style={styles.searchBox}>
        <Ionicons
          name="search-outline"
          size={20}
          color="#64748B"
        />

        <TextInput
          style={styles.searchInput}
          placeholder="Search name or email..."
          placeholderTextColor="#94A3B8"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          accessibilityLabel="Search users by name or email"
        />

        {search.length > 0 ? (
          <Pressable
            onPress={() => setSearch('')}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Ionicons
              name="close-circle"
              size={19}
              color="#94A3B8"
            />
          </Pressable>
        ) : null}
      </View>

<ScrollView
  horizontal
  showsHorizontalScrollIndicator={false}
  contentContainerStyle={styles.filterRow}
>
  <FilterButton
    label="All"
    selected={filter === 'all'}
    onPress={() => setFilter('all')}
  />
  <FilterButton
    label="Students"
    selected={filter === 'student'}
    onPress={() => setFilter('student')}
  />
  <FilterButton
    label="Teachers"
    selected={filter === 'teacher'}
    onPress={() => setFilter('teacher')}
  />
  <FilterButton
    label="Admins"
    selected={filter === 'admin'}
    onPress={() => setFilter('admin')}
  />
</ScrollView>

      {loading && users.length === 0 ? (
        <View style={styles.emptyState}>
          <ActivityIndicator
            size="large"
            color={COLORS.primary}
          />
          <Text style={styles.muted}>Loading users...</Text>
        </View>
      ) : filteredUsers.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons
            name="people-outline"
            size={42}
            color="#94A3B8"
          />
          <Text style={styles.emptyTitle}>No users found</Text>
          <Text style={styles.muted}>
            {search.trim() || filter !== 'all'
              ? 'Try a different search or role filter.'
              : 'Registered users will appear here.'}
          </Text>

          {search.trim() || filter !== 'all' ? (
            <Pressable
              style={styles.clearFiltersButton}
              onPress={() => {
                setSearch('');
                setFilter('all');
              }}
            >
              <Text style={styles.clearFiltersText}>
                Clear filters
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.userList}>
          {filteredUsers.map((item) => (
            <UserCard
              key={item.id}
              item={item}
              isCurrentUser={item.id === user?.id}
              isUpdating={updatingId === item.id}
              anyUpdating={updatingId !== null}
              onChangeRole={(role) => changeRole(item, role)}
            />
          ))}
        </View>
      )}

      <Text style={styles.footer}>
        Showing {filteredUsers.length} of {users.length}{' '}
        registered users
      </Text>
    </ScrollView>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statTop}>
        <Ionicons
          name={icon}
          size={19}
          color={COLORS.primary}
        />
        <Text style={styles.statValue}>{value}</Text>
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function FilterButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterButton,
        selected && styles.filterButtonSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.filterText,
          selected && styles.filterTextSelected,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function UserCard({
  item,
  isCurrentUser,
  isUpdating,
  anyUpdating,
  onChangeRole,
}: {
  item: AdminUser;
  isCurrentUser: boolean;
  isUpdating: boolean;
  anyUpdating: boolean;
  onChangeRole: (role: Role) => void;
}) {
  const displayName = item.full_name?.trim() || 'Unnamed User';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <View style={styles.userCard}>
      <View style={styles.userTop}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>

        <View style={styles.userInfo}>
          <Text style={styles.userName} numberOfLines={1}>
            {displayName}
          </Text>

          <Text style={styles.userEmail} numberOfLines={2}>
            {item.email || 'No email address'}
          </Text>

          {isCurrentUser ? (
            <View style={styles.youBadge}>
              <Text style={styles.youBadgeText}>
                Your account
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.roleBadge}>
          <Text style={styles.roleBadgeText}>
            {ROLE_LABELS[item.role]}
          </Text>
        </View>
      </View>

      {/* Admin accounts do not display role management. */}
      {item.role !== 'admin' ? (
        <>
          <View style={styles.cardDivider} />

          <Text style={styles.manageLabel}>Manage Role</Text>

          <View style={styles.roleOptions}>
            {ROLE_OPTIONS.map((role) => {
              const selected = item.role === role;
              const disabled =
                isCurrentUser || anyUpdating || selected;

              return (
                <Pressable
                  key={role}
                  accessibilityRole="button"
                  accessibilityState={{
                    selected,
                    disabled,
                  }}
                  disabled={disabled}
                  onPress={() => onChangeRole(role)}
                  style={({ pressed }) => [
                    styles.roleButton,
                    selected && styles.roleButtonSelected,
                    disabled &&
                      !selected &&
                      styles.roleButtonDisabled,
                    pressed && !disabled && styles.pressed,
                  ]}
                >
                  {isUpdating && selected ? (
                    <ActivityIndicator
                      size="small"
                      color="#FFFFFF"
                    />
                  ) : (
                    <Text
                      style={[
                        styles.roleButtonText,
                        selected && styles.roleButtonTextSelected,
                      ]}
                    >
                      {ROLE_LABELS[role]}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>

          {isCurrentUser ? (
            <Text style={styles.helperText}>
              Your own role cannot be changed here.
            </Text>
          ) : isUpdating ? (
            <Text style={styles.helperText}>
              Saving role change...
            </Text>
          ) : (
            <Text style={styles.helperText}>
              Select Student, Teacher, or Admin to change this user's role.
            </Text>
          )}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 36,
    width: '100%',
    maxWidth: 1000,
    alignSelf: 'center',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 20,
  },
  headerText: {
    flex: 1,
    gap: 5,
  },
  eyebrow: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  heading: {
    color: '#0F172A',
    fontSize: 27,
    fontWeight: '800',
  },
  muted: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 19,
  },
  refreshButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 11,
  },
  pressed: {
    opacity: 0.7,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 26,
  },
  statCard: {
    flexGrow: 1,
    flexBasis: 130,
    minWidth: 0,
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  statTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  statValue: {
    color: '#0F172A',
    fontSize: 23,
    fontWeight: '800',
  },
  statLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 19,
    fontWeight: '800',
  },
  resultCount: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  searchBox: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 13,
    backgroundColor: '#FFFFFF',
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 11,
    color: '#0F172A',
    fontSize: 14,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 16,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  filterButtonSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
  },
  filterTextSelected: {
    color: '#FFFFFF',
  },
  filterCount: {
    minWidth: 21,
    height: 21,
    paddingHorizontal: 5,
    borderRadius: 11,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCountSelected: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  filterCountText: {
    color: '#475569',
    fontSize: 11,
    fontWeight: '800',
  },
  filterCountTextSelected: {
    color: '#FFFFFF',
  },
  userList: {
    gap: 12,
  },
  userCard: {
    padding: 15,
    backgroundColor: '#FFFFFF',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  userTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
  },
  avatar: {
    width: 43,
    height: 43,
    flexShrink: 0,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: '800',
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  userName: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
  },
  userEmail: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 17,
    flexShrink: 1,
  },
  youBadge: {
    alignSelf: 'flex-start',
    marginTop: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    backgroundColor: '#EFF6FF',
  },
  youBadgeText: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '800',
  },
  roleBadge: {
    alignSelf: 'flex-start',
    flexShrink: 0,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  roleBadgeText: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '600',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  manageLabel: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
  },
  roleOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleButton: {
    minWidth: 83,
    minHeight: 36,
    flexGrow: 1,
    flexBasis: 80,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  roleButtonSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  roleButtonDisabled: {
    opacity: 0.55,
  },
  roleButtonText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
  },
  roleButtonTextSelected: {
    color: '#FFFFFF',
  },
  helperText: {
    color: '#94A3B8',
    fontSize: 11,
    lineHeight: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 38,
    backgroundColor: '#FFFFFF',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '800',
  },
  clearFiltersButton: {
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
  },
  clearFiltersText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 13,
    marginBottom: 16,
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorContent: {
    flex: 1,
    gap: 5,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 12,
    lineHeight: 18,
  },
  retryText: {
    color: '#991B1B',
    fontSize: 12,
    fontWeight: '800',
  },
  footer: {
    marginTop: 20,
    textAlign: 'center',
    color: '#94A3B8',
    fontSize: 11,
  },
  successBox: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
  padding: 13,
  marginBottom: 16,
  backgroundColor: '#F0FDF4',
  borderRadius: 10,
  borderWidth: 1,
  borderColor: '#BBF7D0',
},
successText: {
  flex: 1,
  color: '#166534',
  fontSize: 12,
  lineHeight: 18,
  fontWeight: '600',
},
});
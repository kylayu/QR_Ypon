import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { COLORS } from '@/constants/colors';
import { signOut, useAuth } from '@/lib/auth';
import {
  getProfile,
  updateProfile,
  type Profile,
} from '@/lib/profiles';
import { supabase } from '@/lib/supabase';


function hideBrowserPasswordReveal() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return () => {};
  }

  const style = document.createElement('style');
  style.textContent = `
    input::-ms-reveal,
    input::-ms-clear {
      display: none !important;
    }

    input::-webkit-credentials-auto-fill-button {
      visibility: hidden !important;
      display: none !important;
      pointer-events: none !important;
    }
  `;

  document.head.appendChild(style);

  return () => {
    style.remove();
  };
}

export default function ProfileScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [draftName, setDraftName] = useState('');
  const [email, setEmail] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Account Settings modal states
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);
  const [aboutModalVisible, setAboutModalVisible] = useState(false);

  // Change Password form states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setDraftName('');
      setEmail('');
      setProfileError('Please sign in to view your profile.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setProfileError(null);
    setEmail(user.email?.trim() ?? '');

    try {
      const result = await getProfile(user.id);

      if (!result) {
        setProfile(null);
        setProfileError(
          'Your profile could not be loaded. Please try again.',
        );
        return;
      }

      setProfile(result);
      setDraftName(result.full_name ?? '');
    } catch (error) {
      console.error('Failed to load profile:', error);
      setProfileError('Unable to load your profile. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
  return hideBrowserPasswordReveal();
}, []);

  const role = profile?.role;

  const roleLabel =
    role === 'admin'
      ? 'Administrator'
      : role === 'teacher'
        ? 'Teacher'
        : role === 'student'
          ? 'Student'
          : 'Role unavailable';

  const displayName =
    profile?.full_name?.trim() || 'Complete Your Profile';

  const initials = (profile?.full_name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  const handleSaveName = async () => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in again.');
      return;
    }

    const trimmedName = draftName.trim();

    if (!trimmedName) {
      Alert.alert('Name Required', 'Please enter your full name.');
      return;
    }

    setSaving(true);

    try {
      const { error } = await updateProfile(user.id, {
        full_name: trimmedName,
      });

      if (error) {
        Alert.alert('Update Failed', error);
        return;
      }

      setProfile((previous) =>
        previous ? { ...previous, full_name: trimmedName } : previous,
      );
      setDraftName(trimmedName);
      setEditing(false);

      Alert.alert('Success', 'Your profile name has been updated.');
    } catch (error) {
      console.error('Failed to update profile:', error);
      Alert.alert('Error', 'Unable to update your name. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setDraftName(profile?.full_name ?? '');
    setEditing(false);
  };

  const handleCopyUserId = async () => {
    const id = profile?.id ?? user?.id;

    if (!id) {
      Alert.alert('Unavailable', 'Your user ID could not be found.');
      return;
    }

    try {
      if (Platform.OS === 'web') {
        const clipboard = globalThis.navigator?.clipboard;

        if (!clipboard?.writeText) {
          Alert.alert(
            'Copy Unavailable',
            'Your browser does not allow clipboard access here.',
          );
          return;
        }

        await clipboard.writeText(id);
      } else {
        const Clipboard = await import('expo-clipboard');
        await Clipboard.setStringAsync(id);
      }

      Alert.alert('Copied', 'Your User ID has been copied.');
    } catch (error) {
      console.error('Failed to copy User ID:', error);
      Alert.alert('Copy Failed', 'Unable to copy your User ID.');
    }
  };

  // Change password using Supabase Auth
  const handleChangePassword = async () => {
    if (!user?.id || !user.email) {
      Alert.alert(
        'Account Unavailable',
        'Please sign in again before changing your password.',
      );
      return;
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert(
        'Required Fields',
        'Please complete all password fields.',
      );
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert(
        'Password Too Short',
        'Your new password must contain at least 6 characters.',
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert(
        'Passwords Do Not Match',
        'Please confirm your new password.',
      );
      return;
    }

    if (currentPassword === newPassword) {
      Alert.alert(
        'Choose a New Password',
        'Your new password must be different from your current password.',
      );
      return;
    }

    setSavingPassword(true);

    try {
      // Verify the current password.
      const { data, error: verifyError } =
        await supabase.auth.signInWithPassword({
          email: user.email,
          password: currentPassword,
        });

      if (verifyError) {
        Alert.alert(
          'Verification Failed',
          'Your current password is incorrect. Please try again.',
        );
        return;
      }

      // Make sure the verified account is the same account.
      if (data.user?.id !== user.id) {
        Alert.alert(
          'Account Verification Failed',
          'The verified account does not match your signed-in account.',
        );
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        Alert.alert('Update Failed', updateError.message);
        return;
      }

      setPasswordModalVisible(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);

      Alert.alert(
        'Password Updated',
        'Your account password has been changed successfully.',
      );
    } catch (error) {
      console.error('Password update failed:', error);

      Alert.alert(
        'Error',
        error instanceof Error
          ? error.message
          : 'Unable to change your password. Please try again.',
      );
    } finally {
      setSavingPassword(false);
    }
  };

  const closePasswordModal = () => {
    if (savingPassword) return;

    setPasswordModalVisible(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
  };

  const performSignOut = async () => {
    setLoading(true);

    try {
      const { error } = await signOut();

      if (error) {
        Alert.alert('Sign Out Failed', error.message);
        return;
      }

      router.replace('/login');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Please try again.';

      Alert.alert('Error', `Unable to sign out. ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    if (loading || saving) return;

    if (Platform.OS === 'web') {
      const confirmed = globalThis.confirm
        ? globalThis.confirm('Are you sure you want to sign out?')
        : true;

      if (confirmed) {
        void performSignOut();
      }

      return;
    }

    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of your account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: () => void performSignOut(),
        },
      ],
    );
  };

  const renderInfoRow = (
    icon: React.ComponentProps<typeof Ionicons>['name'],
    label: string,
    value: string,
    options?: {
      actionLabel?: string;
      onAction?: () => void;
      selectable?: boolean;
    },
  ) => (
    <View style={styles.infoRow} key={label}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={19} color={COLORS.primary} />
      </View>

      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text
          selectable={options?.selectable ?? false}
          style={styles.infoValue}
        >
          {value}
        </Text>
      </View>

      {options?.actionLabel && options.onAction && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={options.actionLabel}
          onPress={options.onAction}
          style={styles.rowAction}
        >
          <Ionicons
            name="copy-outline"
            size={18}
            color={COLORS.primary}
          />
        </Pressable>
      )}
    </View>
  );

  const renderSettingRow = (
    icon: React.ComponentProps<typeof Ionicons>['name'],
    title: string,
    subtitle: string,
    onPress: () => void,
  ) => (
    <Pressable
      key={title}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.settingRow,
        pressed && styles.pressedRow,
      ]}
    >
      <View style={styles.settingIcon}>
        <Ionicons name={icon} size={21} color={COLORS.primary} />
      </View>

      <View style={styles.settingContent}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingSubtitle}>{subtitle}</Text>
      </View>

      <Ionicons
        name="chevron-forward"
        size={19}
        color={COLORS.textSecondary}
      />
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.pageHeader}>
          <View style={styles.headingContainer}>
            <Text style={styles.heading}>My Profile</Text>
            <Text style={styles.subtitle}>
              Manage your personal information and account settings.
            </Text>
          </View>
        </View>

        {profileError && (
          <View style={styles.errorCard}>
            <Ionicons
              name="alert-circle-outline"
              size={21}
              color="#991B1B"
            />
            <View style={styles.errorContent}>
              <Text style={styles.errorTitle}>Profile Notice</Text>
              <Text style={styles.errorText}>{profileError}</Text>
              <Pressable onPress={() => void loadProfile()}>
                <Text style={styles.retryText}>Check profile</Text>
              </Pressable>
            </View>
          </View>
        )}

        {loading && !profile ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading your profile...</Text>
          </View>
        ) : (
          <>
            <View style={styles.identityCard}>
              <View style={styles.identityTop}>
                <View style={styles.avatar}>
                  {initials ? (
                    <Text style={styles.avatarText}>{initials}</Text>
                  ) : (
                    <Ionicons
                      name="person"
                      size={34}
                      color={COLORS.primary}
                    />
                  )}
                </View>

                <View style={styles.identityDetails}>
                  <Text style={styles.identityName}>{displayName}</Text>

                  <View
                    style={[
                      styles.roleBadge,
                      role === 'student' && styles.studentBadge,
                      role === 'admin' && styles.adminBadge,
                      !role && styles.unavailableBadge,
                    ]}
                  >
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={14}
                      color={COLORS.primary}
                    />
                    <Text style={styles.roleBadgeText}>{roleLabel}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.identityDivider} />

              <View style={styles.identityFooter}>
                <Ionicons
                  name="checkmark-circle-outline"
                  size={17}
                  color={COLORS.success}
                />
                <Text style={styles.identityFooterText}>
                  Signed-in account
                </Text>
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Personal Information</Text>
              <Text style={styles.sectionSubtitle}>
                Your registered account details
              </Text>
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.infoRow}>
                <View style={styles.infoIcon}>
                  <Ionicons
                    name="person-outline"
                    size={19}
                    color={COLORS.primary}
                  />
                </View>

                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Full Name</Text>

                  {editing ? (
                    <TextInput
                      value={draftName}
                      onChangeText={setDraftName}
                      placeholder="Enter your full name"
                      placeholderTextColor={COLORS.textSecondary}
                      style={styles.nameInput}
                      autoFocus
                      autoCapitalize="words"
                      returnKeyType="done"
                      onSubmitEditing={() => void handleSaveName()}
                      editable={!saving}
                    />
                  ) : (
                    <Text style={styles.infoValue}>
                      {profile?.full_name?.trim() || 'Not provided'}
                    </Text>
                  )}
                </View>

                {!editing && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Edit full name"
                    onPress={() => {
                      setDraftName(profile?.full_name ?? '');
                      setEditing(true);
                    }}
                    style={styles.rowAction}
                  >
                    <Ionicons
                      name="create-outline"
                      size={20}
                      color={COLORS.primary}
                    />
                  </Pressable>
                )}
              </View>

              {editing && (
                <View style={styles.editActions}>
                  <Pressable
                    onPress={handleCancelEdit}
                    disabled={saving}
                    style={styles.cancelButton}
                  >
                    <Text style={styles.cancelText}>Cancel</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => void handleSaveName()}
                    disabled={saving}
                    style={[
                      styles.saveButton,
                      saving && styles.disabledButton,
                    ]}
                  >
                    {saving ? (
                      <ActivityIndicator
                        size="small"
                        color={COLORS.textOnPrimary}
                      />
                    ) : (
                      <Ionicons
                        name="checkmark-outline"
                        size={18}
                        color={COLORS.textOnPrimary}
                      />
                    )}
                    <Text style={styles.saveButtonText}>
                      {saving ? 'Saving...' : 'Save Changes'}
                    </Text>
                  </Pressable>
                </View>
              )}

              <View style={styles.rowDivider} />

              {renderInfoRow(
                'mail-outline',
                'Email Address',
                email || profile?.email || 'Email unavailable',
                { selectable: true },
              )}

              <View style={styles.rowDivider} />

              {renderInfoRow(
                'shield-checkmark-outline',
                'Account Role',
                roleLabel,
              )}

              <View style={styles.rowDivider} />

              {renderInfoRow(
                'finger-print-outline',
                'User ID',
                profile?.id ?? user?.id ?? 'Unavailable',
                {
                  actionLabel: 'Copy User ID',
                  onAction: () => void handleCopyUserId(),
                  selectable: true,
                },
              )}
            </View>

            {/* Account Settings */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Account Settings</Text>
              <Text style={styles.sectionSubtitle}>
                Manage access and application information
              </Text>
            </View>

            <View style={styles.sectionCard}>
              {renderSettingRow(
                'lock-closed-outline',
                'Change Password',
                'Update your account password',
                () => setPasswordModalVisible(true),
              )}

              <View style={styles.rowDivider} />

              {renderSettingRow(
                'shield-checkmark-outline',
                'Privacy and Security',
                'Keep your account information protected',
                () => setPrivacyModalVisible(true),
              )}

              <View style={styles.rowDivider} />

              {renderSettingRow(
                'information-circle-outline',
                'About AttendScan',
                'Application information',
                () => setAboutModalVisible(true),
              )}
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={handleSignOut}
              disabled={loading || saving}
              style={({ pressed }) => [
                styles.signOutButton,
                pressed && styles.pressedRow,
                (loading || saving) && styles.disabledButton,
              ]}
            >
              <Ionicons
                name="log-out-outline"
                size={21}
                color="#DC2626"
              />
              <Text style={styles.signOutButtonText}>Sign Out</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      {/* Change Password Modal */}
      <Modal
        visible={passwordModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closePasswordModal}
      >
        <View style={styles.modalOverlay}>
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={styles.settingIcon}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={23}
                    color={COLORS.primary}
                  />
                </View>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close password dialog"
                  onPress={closePasswordModal}
                  disabled={savingPassword}
                  style={styles.modalClose}
                >
                  <Ionicons
                    name="close"
                    size={23}
                    color={COLORS.textSecondary}
                  />
                </Pressable>
              </View>

              <Text style={styles.modalTitle}>Change Password</Text>
              <Text style={styles.modalDescription}>
                Verify your current password and enter a new one.
              </Text>

              <Text style={styles.modalLabel}>Current Password</Text>
              <View style={styles.passwordInputRow}>
                <TextInput
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="Enter current password"
                  placeholderTextColor={COLORS.textSecondary}
                  secureTextEntry={!showCurrentPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!savingPassword}
                  style={styles.passwordInput}
                />
                <Pressable
                  onPress={() =>
                    setShowCurrentPassword((value) => !value)
                  }
                  accessibilityRole="button"
                  accessibilityLabel={
                    showCurrentPassword
                      ? 'Hide current password'
                      : 'Show current password'
                  }
                >
                  <Ionicons
                    name={
                      showCurrentPassword
                        ? 'eye-off-outline'
                        : 'eye-outline'
                    }
                    size={20}
                    color={COLORS.textSecondary}
                  />
                </Pressable>
              </View>

              <Text style={styles.modalLabel}>New Password</Text>
              <View style={styles.passwordInputRow}>
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="At least 6 characters"
                  placeholderTextColor={COLORS.textSecondary}
                  secureTextEntry={!showNewPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!savingPassword}
                  style={styles.passwordInput}
                />
                <Pressable
                  onPress={() => setShowNewPassword((value) => !value)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    showNewPassword ? 'Hide new password' : 'Show new password'
                  }
                >
                  <Ionicons
                    name={
                      showNewPassword
                        ? 'eye-off-outline'
                        : 'eye-outline'
                    }
                    size={20}
                    color={COLORS.textSecondary}
                  />
                </Pressable>
              </View>

              <Text style={styles.modalLabel}>Confirm New Password</Text>
              <View style={styles.passwordInputRow}>
                <TextInput
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Enter new password again"
                  placeholderTextColor={COLORS.textSecondary}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!savingPassword}
                  style={styles.passwordInput}
                />
                <Pressable
                  onPress={() =>
                    setShowConfirmPassword((value) => !value)
                  }
                  accessibilityRole="button"
                  accessibilityLabel={
                    showConfirmPassword
                      ? 'Hide password confirmation'
                      : 'Show password confirmation'
                  }
                >
                  <Ionicons
                    name={
                      showConfirmPassword
                        ? 'eye-off-outline'
                        : 'eye-outline'
                    }
                    size={20}
                    color={COLORS.textSecondary}
                  />
                </Pressable>
              </View>

              <Text style={styles.passwordHint}>
                Use at least 6 characters and choose a password different
                from your current one.
              </Text>

              <Pressable
                accessibilityRole="button"
                onPress={() => void handleChangePassword()}
                disabled={savingPassword}
                style={[
                  styles.modalPrimaryButton,
                  savingPassword && styles.disabledButton,
                ]}
              >
                {savingPassword ? (
                  <ActivityIndicator color={COLORS.textOnPrimary} />
                ) : (
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={19}
                    color={COLORS.textOnPrimary}
                  />
                )}
                <Text style={styles.modalPrimaryButtonText}>
                  {savingPassword ? 'Updating...' : 'Update Password'}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={closePasswordModal}
                disabled={savingPassword}
                style={styles.modalSecondaryButton}
              >
                <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Privacy and Security Modal */}
      <Modal
        visible={privacyModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPrivacyModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.settingIcon}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={23}
                  color={COLORS.primary}
                />
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close privacy dialog"
                onPress={() => setPrivacyModalVisible(false)}
                style={styles.modalClose}
              >
                <Ionicons
                  name="close"
                  size={23}
                  color={COLORS.textSecondary}
                />
              </Pressable>
            </View>

            <Text style={styles.modalTitle}>Privacy and Security</Text>
            <Text style={styles.modalDescription}>
              Review your account information and security options.
            </Text>

            <View style={styles.securityInfoRow}>
              <Ionicons
                name="mail-outline"
                size={19}
                color={COLORS.primary}
              />
              <View style={styles.securityInfoContent}>
                <Text style={styles.modalLabel}>Registered Email</Text>
                <Text selectable style={styles.securityValue}>
                  {email || profile?.email || 'Email unavailable'}
                </Text>
              </View>
            </View>

            <View style={styles.securityInfoRow}>
              <Ionicons
                name="shield-checkmark-outline"
                size={19}
                color={COLORS.primary}
              />
              <View style={styles.securityInfoContent}>
                <Text style={styles.modalLabel}>Account Role</Text>
                <Text style={styles.securityValue}>{roleLabel}</Text>
              </View>
            </View>

            <View style={styles.securityNotice}>
              <Ionicons
                name="information-circle-outline"
                size={20}
                color={COLORS.primary}
              />
              <Text style={styles.securityNoticeText}>
                Your account role and permissions are managed by the system
                administrator. Never share your password, and sign out when
                using a shared device.
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setPrivacyModalVisible(false);
                setPasswordModalVisible(true);
              }}
              style={styles.modalPrimaryButton}
            >
              <Ionicons
                name="key-outline"
                size={19}
                color={COLORS.textOnPrimary}
              />
              <Text style={styles.modalPrimaryButtonText}>
                Change Password
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={() => setPrivacyModalVisible(false)}
              style={styles.modalSecondaryButton}
            >
              <Text style={styles.modalSecondaryButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={aboutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAboutModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.aboutAppIcon}>
                <Ionicons
                  name="qr-code-outline"
                  size={32}
                  color={COLORS.primary}
                />
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close about dialog"
                onPress={() => setAboutModalVisible(false)}
                style={styles.modalClose}
              >
                <Ionicons
                  name="close"
                  size={23}
                  color={COLORS.textSecondary}
                />
              </Pressable>
            </View>

            <Text style={styles.modalTitle}>AttendScan System</Text>
            <Text style={styles.modalDescription}>
              A QR-based attendance management application for teachers
              and students.
            </Text>

            <View style={styles.aboutVersionRow}>
              <Text style={styles.modalLabel}>Application</Text>
              <Text style={styles.securityValue}>AttendScan</Text>
            </View>

            <View style={styles.aboutVersionRow}>
              <Text style={styles.modalLabel}>Version</Text>
              <Text style={styles.securityValue}>1.0.0</Text>
            </View>

            <View style={styles.aboutVersionRow}>
              <Text style={styles.modalLabel}>Purpose</Text>
              <Text style={styles.securityValue}>
                Attendance management
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={() => setAboutModalVisible(false)}
              style={styles.modalPrimaryButton}
            >
              <Ionicons
                name="checkmark-outline"
                size={19}
                color={COLORS.textOnPrimary}
              />
              <Text style={styles.modalPrimaryButtonText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 36,
  },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 22,
  },
  headingContainer: {
    flex: 1,
  },
  heading: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 5,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textSecondary,
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5F0FF',
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#FEE2E2',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
  },
  errorContent: {
    flex: 1,
  },
  errorTitle: {
    color: '#991B1B',
    fontWeight: '700',
    fontSize: 14,
  },
  errorText: {
    color: '#991B1B',
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
  },
  retryText: {
    color: '#991B1B',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },
  loadingCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  identityCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 18,
    marginBottom: 26,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  identityTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5F0FF',
    borderWidth: 1,
    borderColor: '#D3E4FF',
  },
  avatarText: {
    color: COLORS.primary,
    fontSize: 25,
    fontWeight: '800',
  },
  identityDetails: {
    flex: 1,
    gap: 5,
  },
  identityName: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  identityEmail: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#E5F0FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 5,
  },
  studentBadge: {
    backgroundColor: '#EEEEEE',
  },
  adminBadge: {
    backgroundColor: '#EDE9FE',
  },
  unavailableBadge: {
    backgroundColor: '#EEEEEE',
  },
  roleBadgeText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  identityDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 15,
  },
  identityFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  identityFooterText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
    lineHeight: 19,
  },
  sectionCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    paddingHorizontal: 15,
    paddingVertical: 5,
    marginBottom: 25,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#E5F0FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContent: {
    flex: 1,
    gap: 4,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  rowAction: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5F0FF',
  },
  rowDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginLeft: 52,
  },
  nameInput: {
    width: '100%',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.background,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 14,
  },
  cancelButton: {
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
  },
  saveButtonText: {
    color: COLORS.textOnPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.5,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 15,
  },
  pressedRow: {
    opacity: 0.65,
  },
  settingIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#E5F0FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingContent: {
    flex: 1,
    gap: 4,
  },
  settingTitle: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  settingSubtitle: {
    color: COLORS.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 15,
    paddingHorizontal: 16,
    marginTop: 2,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  signOutButtonText: {
    color: '#DC2626',
    fontSize: 15,
    fontWeight: '700',
  },

  // Account Settings modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  modalScroll: {
    width: '100%',
    flexGrow: 0,
    maxHeight: '100%',
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
  },
  modalCard: {
    width: '100%',
    maxWidth: 460,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 7,
  },
  modalDescription: {
    fontSize: 13,
    lineHeight: 20,
    color: COLORS.textSecondary,
    marginBottom: 18,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 7,
  },
  passwordInputRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.background,
    paddingHorizontal: 12,
    marginBottom: 15,
  },
  passwordInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 11,
    fontSize: 14,
    color: COLORS.textPrimary,
  },
  passwordHint: {
    fontSize: 12,
    lineHeight: 18,
    color: COLORS.textSecondary,
    marginBottom: 18,
  },
  modalPrimaryButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
    marginTop: 8,
  },
  modalPrimaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textOnPrimary,
  },
  modalSecondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 5,
  },
  modalSecondaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  securityInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  securityInfoContent: {
    flex: 1,
  },
  securityValue: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    padding: 12,
    marginTop: 16,
    marginBottom: 10,
    borderRadius: 11,
    backgroundColor: '#E5F0FF',
  },
  securityNoticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 19,
    color: COLORS.textPrimary,
  },
  aboutAppIcon: {
    width: 58,
    height: 58,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5F0FF',
  },
  aboutVersionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
});
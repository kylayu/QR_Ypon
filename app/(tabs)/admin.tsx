import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { COLORS } from '@/constants/colors';
import {
  correctAttendance,
  deleteAdminEvent,
  deleteAttendance,
  getAdminAttendance,
  getAdminEvents,
  getAdminSummary,
  getAdminUsers,
  saveAdminEvent,
  updateUserRole,
  type AdminAttendance,
  type AdminEvent,
  type AdminUser,
} from '@/lib/admin';
import { useAuth } from '@/lib/auth';
import { getProfile } from '@/lib/profiles';

type Section = 'Overview' | 'Users' | 'Events' | 'Attendance' | 'Reports';
type Role = 'admin' | 'teacher' | 'student';

type Summary = {
  users: number;
  events: number;
  attendance: number;
};

const SECTIONS: Section[] = [
  'Overview',
  'Users',
  'Events',
  'Attendance',
  'Reports',
];

const EMPTY_SUMMARY: Summary = {
  users: 0,
  events: 0,
  attendance: 0,
};

export default function AdminScreen() {
  const { user } = useAuth();

  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [section, setSection] = useState<Section>('Overview');

  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [records, setRecords] = useState<AdminAttendance[]>([]);

 const [eventModal, setEventModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | undefined>();
  const [eventCode, setEventCode] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [eventStart, setEventStart] = useState('');
  const [eventEnd, setEventEnd] = useState('');
  const [savingEvent, setSavingEvent] = useState(false);

  const [roleModal, setRoleModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [savingRole, setSavingRole] = useState(false);

  const [attendanceModal, setAttendanceModal] = useState(false);
  const [editingAttendance, setEditingAttendance] =
    useState<AdminAttendance | null>(null);
  const [attendanceStudentId, setAttendanceStudentId] = useState('');
  const [attendanceEventId, setAttendanceEventId] = useState('');
  const [attendanceScannedAt, setAttendanceScannedAt] = useState('');
  const [savingAttendance, setSavingAttendance] = useState(false);

  const loadData = useCallback(async () => {
    if (!user?.id) {
      setAuthorized(false);
      setLoading(false);
      setChecking(false);
      return;
    }

    setLoading(true);

    try {
      const profile = await getProfile(user.id);

      if (profile?.role !== 'admin') {
        setAuthorized(false);
        return;
      }

      setAuthorized(true);

      const [nextSummary, nextUsers, nextEvents, nextRecords] =
        await Promise.all([
          getAdminSummary(),
          getAdminUsers(),
          getAdminEvents(),
          getAdminAttendance(),
        ]);

            setSummary(nextSummary);
      setUsers(nextUsers);
      setEvents(nextEvents);
      setRecords(nextRecords);
    } catch (error) {
      console.error('Admin loading error:', error);
      Alert.alert(
        'Unable to load admin data',
        error instanceof Error ? error.message : 'Please try again.',
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

  const openNewEvent = () => {
    setEditingEventId(undefined);
    setEventCode('');
    setEventTitle('');
    setEventStart('');
    setEventEnd('');
    setEventModal(true);
  };
  
  const openEditEvent = (event: AdminEvent) => {
    setEditingEventId(event.id);
    setEventCode(event.event_code);
    setEventTitle(event.title);
    setEventStart(event.start_time ?? '');
    setEventEnd(event.end_time ?? '');
    setEventModal(true);
  };

  const handleSaveEvent = async () => {
    if (!eventCode.trim() || !eventTitle.trim()) {
      Alert.alert('Missing information', 'Enter an event title and event code.');
      return;
    }

    setSavingEvent(true);

    try {
      await saveAdminEvent({
        id: editingEventId,
        event_code: eventCode.trim(),
        title: eventTitle.trim(),
        start_time: eventStart.trim() || undefined,
        end_time: eventEnd.trim() || undefined,
      });

      setEventModal(false);
      await loadData();
      Alert.alert('Success', 'Event saved successfully.');
    } catch (error) {
      Alert.alert(
        'Unable to save event',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSavingEvent(false);
    }
  };

  const handleDeleteEvent = (event: AdminEvent) => {
    Alert.alert(
      'Delete event?',
      `Delete "${event.title}"? This may fail if attendance records still reference this event.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAdminEvent(event.id);
              await loadData();
              Alert.alert('Deleted', 'Event deleted.');
            } catch (error) {
              Alert.alert(
                'Unable to delete event',
                error instanceof Error ? error.message : 'Please try again.',
              );
            }
          },
        },
      ],
    );
  };
  
  const openRoleEditor = (item: AdminUser) => {
    setSelectedUser(item);
    setRoleModal(true);
  };

  const handleChangeRole = async (role: Role) => {
    if (!selectedUser) return;

    // Prevent the current administrator from accidentally removing their own access.
    if (selectedUser.id === user?.id && role !== 'admin') {
      Alert.alert(
        'Cannot change your own role',
        'Ask another administrator to change your role if needed.',
      );
      return;
    }

    setSavingRole(true);

    try {
      await updateUserRole(selectedUser.id, role);
      setRoleModal(false);
      setSelectedUser(null);
      await loadData();
      Alert.alert('Success', 'User role updated.');
    } catch (error) {
      Alert.alert(
        'Unable to update role',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSavingRole(false);
    }
  };

  const openAttendanceEditor = (record: AdminAttendance) => {
    setEditingAttendance(record);
    setAttendanceStudentId(record.student_id);
    setAttendanceEventId(record.event_id);
    setAttendanceScannedAt(record.scanned_at);
    setAttendanceModal(true);
  };

  const handleSaveAttendance = async () => {
    if (
      !editingAttendance ||
      !attendanceStudentId.trim() ||
      !attendanceEventId.trim() ||
      !attendanceScannedAt.trim()
    ) {
      Alert.alert('Missing information', 'Complete all attendance fields.');
      return;
    }
   
    const parsedDate = new Date(attendanceScannedAt);

    if (Number.isNaN(parsedDate.getTime())) {
      Alert.alert(
        'Invalid date',
        'Enter a valid date and time, such as 2026-10-15T09:30:00+08:00.',
      );
      return;
    }

    setSavingAttendance(true);

    try {
      await correctAttendance(editingAttendance.id, {
        student_id: attendanceStudentId.trim(),
        event_id: attendanceEventId.trim(),
        scanned_at: parsedDate.toISOString(),
      });

      setAttendanceModal(false);
      await loadData();
      Alert.alert('Success', 'Attendance record corrected.');
    } catch (error) {
      Alert.alert(
        'Unable to correct attendance',
        error instanceof Error ? error.message : 'Please try again.',
      );
    } finally {
      setSavingAttendance(false);
    }
  };

  const handleDeleteAttendance = (record: AdminAttendance) => {
    Alert.alert(
      'Delete attendance record?',
      'This permanently removes this attendance record.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAttendance(record.id);
              await loadData();
              Alert.alert('Deleted', 'Attendance record deleted.');
            } catch (error) {
              Alert.alert(
                'Unable to delete record',
                error instanceof Error ? error.message : 'Please try again.',
              );
            }
          },
        },
      ],
    );
  };
 
  const eventName = (eventId: string) =>
    events.find((event) => event.id === eventId)?.title ?? 'Unknown event';

  const renderOverview = () => (
    <View>
      <Text style={styles.sectionTitle}>System overview</Text>

      <View style={styles.summaryGrid}>
        <SummaryCard label="Total users" value={summary.users} icon="people-outline" />
        <SummaryCard label="Total events" value={summary.events} icon="calendar-outline" />
        <SummaryCard label="Attendance records" value={summary.attendance} icon="checkmark-done-outline" />
      </View>

      <Text style={styles.sectionTitle}>Quick actions</Text>
      <ActionButton
        label="Manage users"
        icon="people-outline"
        onPress={() => setSection('Users')}
      />
      <ActionButton
        label="View attendance"
        icon="clipboard-outline"
        onPress={() => setSection('Attendance')}
      />
      <ActionButton
        label="View reports"
        icon="bar-chart-outline"
        onPress={() => setSection('Reports')}
      />
    </View>
  );

  const renderUsers = () => (
    <View>
      <Text style={styles.sectionTitle}>Manage users</Text>
      <Text style={styles.muted}>
        Change account roles. Only grant administrator access to trusted users.
      </Text>

      {users.map((item) => (
        <View key={item.id} style={styles.card}>
          <Text style={styles.itemTitle}>
            {item.full_name || 'Unnamed user'}
          </Text>
          <Text style={styles.muted}>{item.email || 'No email'}</Text>
          <Text style={styles.roleLabel}>Current role: {item.role}</Text>

          {item.id === user?.id ? (
            <Text style={styles.muted}>
              This is your account. Your administrator role cannot be changed here.
            </Text>
          ) : (
            <ActionButton
              label="Change role"
              icon="shield-checkmark-outline"
              onPress={() => openRoleEditor(item)}
            />
          )}
        </View>
      ))}
      
      {users.length === 0 && <Text style={styles.muted}>No users found.</Text>}
    </View>
  );

  const renderEvents = () => (
    <View>
      <Text style={styles.sectionTitle}>Manage events</Text>

      {events.map((event) => (
        <View key={event.id} style={styles.card}>
          <Text style={styles.itemTitle}>{event.title}</Text>
          <Text style={styles.muted}>Event code: {event.event_code}</Text>
          <Text style={styles.muted}>Start: {event.start_time || 'Not set'}</Text>
          <Text style={styles.muted}>End: {event.end_time || 'Not set'}</Text>

          <View style={styles.actionRow}>
            <SmallButton
              label="Edit"
              icon="create-outline"
              onPress={() => openEditEvent(event)}
            />
            <SmallButton
              label="Delete"
              icon="trash-outline"
              danger
              onPress={() => handleDeleteEvent(event)}
            />
          </View>
        </View>
      ))}

      {events.length === 0 && (
        <Text style={styles.muted}>No events created yet.</Text>
      )}
    </View>
  );

  const renderAttendance = () => (
    <View>
      <Text style={styles.sectionTitle}>Attendance records</Text>
      <Text style={styles.muted}>
        Correct records carefully. Student and event IDs must already exist.
      </Text>

      {records.map((record) => (
        <View key={record.id} style={styles.card}>
          <Text style={styles.itemTitle}>{eventName(record.event_id)}</Text>
          <Text style={styles.muted}>Student ID: {record.student_id}</Text>
          <Text style={styles.muted}>Scanned: {record.scanned_at}</Text>
          <Text style={styles.recordId}>Record ID: {record.id}</Text>

          <View style={styles.actionRow}>
            <SmallButton
              label="Correct"
              icon="create-outline"
              onPress={() => openAttendanceEditor(record)}
            />
            <SmallButton
              label="Delete"
              icon="trash-outline"
              danger
              onPress={() => handleDeleteAttendance(record)}
            />
          </View>
        </View>
      ))}

      {records.length === 0 && (
        <Text style={styles.muted}>No attendance records found.</Text>
      )}
    </View>
  )
  
  const renderReports = () => (
    <View>
      <Text style={styles.sectionTitle}>Attendance reports</Text>

      <View style={styles.summaryGrid}>
        <SummaryCard label="Users" value={summary.users} icon="people-outline" />
        <SummaryCard label="Events" value={summary.events} icon="calendar-outline" />
        <SummaryCard label="Attendance" value={summary.attendance} icon="checkmark-done-outline" />
      </View>

      <Text style={styles.sectionTitle}>Attendance by event</Text>

      {events.map((event) => {
        const count = records.filter(
          (record) => record.event_id === event.id,
        ).length;

        return (
          <View key={event.id} style={styles.reportRow}>
            <View style={styles.reportText}>
              <Text style={styles.itemTitle}>{event.title}</Text>
              <Text style={styles.muted}>Code: {event.event_code}</Text>
            </View>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{count}</Text>
              <Text style={styles.countCaption}>records</Text>
            </View>
          </View>
        );
      })}

      <Text style={styles.muted}>
        These totals count stored attendance records. They are not attendance
        percentages unless you also track the number of expected participants.
      </Text>
    </View>
  );

  if (checking) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.muted}>Checking administrator access...</Text>
      </View>
    );
  }
  
  if (!authorized) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={48} color="#DC2626" />
        <Text style={styles.title}>Access denied</Text>
        <Text style={styles.muted}>
          This page is available to administrator accounts only.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadData} />
        }
      >
        <Text style={styles.eyebrow}>ATTENDSCAN SYSTEM</Text>
        <Text style={styles.title}>Administrator</Text>
        <Text style={styles.muted}>
          Administrator-only dashboard for managing users, events, attendance, and reports.
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sectionTabs}
        >
          {SECTIONS.map((item) => (
            <Pressable
              key={item}
              onPress={() => setSection(item)}
              style={[
                styles.sectionTab,
                section === item && styles.sectionTabActive,
              ]}
            >
              <Text
                style={[
                  styles.sectionTabText,
                  section === item && styles.sectionTabTextActive,
                ]}
              >
                {item}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {loading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.muted}>Refreshing admin data...</Text>
          </View>
        )}
        
        {section === 'Overview' && renderOverview()}
        {section === 'Users' && renderUsers()}
        {section === 'Events' && renderEvents()}
        {section === 'Attendance' && renderAttendance()}
        {section === 'Reports' && renderReports()}
      </ScrollView>

      {/* Event create/edit modal */}
      <Modal
        visible={eventModal}
        transparent
        animationType="fade"
        onRequestClose={() => setEventModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <ScrollView
            contentContainerStyle={styles.modalScroll}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                Edit event
              </Text>

              <Text style={styles.fieldLabel}>Event title</Text>
              <TextInput
                value={eventTitle}
                onChangeText={setEventTitle}
                placeholder="e.g. Student Orientation"
                style={styles.input}
              />

              <Text style={styles.fieldLabel}>Event code</Text>
              <TextInput
                value={eventCode}
                onChangeText={setEventCode}
                placeholder="e.g. ORIENT-2026"
                autoCapitalize="characters"
                style={styles.input}
              />

              <Text style={styles.fieldLabel}>Start time (ISO date/time)</Text>
              <TextInput
                value={eventStart}
                onChangeText={setEventStart}
                placeholder="2026-10-15T09:00:00+08:00"
                style={styles.input}
                autoCapitalize="none"
              />

              <Text style={styles.fieldLabel}>End time (ISO date/time)</Text>
              <TextInput
                value={eventEnd}
                onChangeText={setEventEnd}
                placeholder="2026-10-15T17:00:00+08:00"
                style={styles.input}
                autoCapitalize="none"
              />
              
              <View style={styles.actionRow}>
                <SmallButton
                  label="Cancel"
                  onPress={() => setEventModal(false)}
                />
                <SmallButton
                  label={savingEvent ? 'Saving...' : 'Save event'}
                  onPress={handleSaveEvent}
                  disabled={savingEvent}
                />
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Role management modal */}
      <Modal
        visible={roleModal}
        transparent
        animationType="fade"
        onRequestClose={() => setRoleModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Change user role</Text>
            <Text style={styles.muted}>
              {selectedUser?.full_name || selectedUser?.email || 'Selected user'}
            </Text>

            {(['student', 'teacher', 'admin'] as Role[]).map((role) => (
              <Pressable
                key={role}
                disabled={savingRole || selectedUser?.role === role}
                onPress={() => void handleChangeRole(role)}
                style={[
                  styles.roleOption,
                  selectedUser?.role === role && styles.roleOptionSelected,
                ]}
              >
                <Text style={styles.roleOptionText}>
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                  {selectedUser?.role === role ? ' (current)' : ''}
                </Text>
                <Ionicons
                  name={
                    selectedUser?.role === role
                      ? 'radio-button-on'
                      : 'radio-button-off'
                  }
                  size={20}
                  color={COLORS.primary}
                />
              </Pressable>
            ))}

            {savingRole && <ActivityIndicator color={COLORS.primary} />}

            <SmallButton
              label="Cancel"
              onPress={() => setRoleModal(false)}
              disabled={savingRole}
            />
          </View>
        </View>
      </Modal>
      
      {/* Attendance correction modal */}
      <Modal
        visible={attendanceModal}
        transparent
        animationType="fade"
        onRequestClose={() => setAttendanceModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <ScrollView
            contentContainerStyle={styles.modalScroll}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Correct attendance</Text>

              <Text style={styles.fieldLabel}>Student ID</Text>
              <TextInput
                value={attendanceStudentId}
                onChangeText={setAttendanceStudentId}
                style={styles.input}
                autoCapitalize="none"
              />

              <Text style={styles.fieldLabel}>Event ID</Text>
              <TextInput
                value={attendanceEventId}
                onChangeText={setAttendanceEventId}
                style={styles.input}
                autoCapitalize="none"
              />

              <Text style={styles.fieldLabel}>Scanned date/time</Text>
              <TextInput
                value={attendanceScannedAt}
                onChangeText={setAttendanceScannedAt}
                placeholder="2026-10-15T09:30:00+08:00"
                style={styles.input}
                autoCapitalize="none"
              />

              <View style={styles.actionRow}>
                <SmallButton
                  label="Cancel"
                  onPress={() => setAttendanceModal(false)}
                />
                <SmallButton
                  label={savingAttendance ? 'Saving...' : 'Save correction'}
                  onPress={handleSaveAttendance}
                  disabled={savingAttendance}
                />
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}) {
  return (
    <View style={styles.summaryCard}>
      <Ionicons name={icon} size={23} color={COLORS.primary} />
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function ActionButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.actionButton} onPress={onPress}>
      <Ionicons name={icon} size={19} color={COLORS.primary} />
      <Text style={styles.actionButtonText}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={COLORS.primary} />
    </Pressable>
  );
}

function SmallButton({
  label,
  onPress,
  icon,
  danger = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.smallButton,
        danger && styles.dangerButton,
        disabled && styles.disabledButton,
      ]}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={16}
          color={danger ? '#B91C1C' : COLORS.primary}
        />
      )}
      <Text style={[styles.smallButtonText, danger && styles.dangerText]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 20,
    paddingBottom: 48,
    maxWidth: 1000,
    width: '100%',
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
  eyebrow: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 6,
  },
  title: {
    color: '#0F172A',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 6,
  },
  muted: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 20,
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 22,
    marginBottom: 12,
  },
  sectionTabs: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 18,
  },
  sectionTab: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#E2E8F0',
  },
  sectionTabActive: {
    backgroundColor: COLORS.primary,
  },
  sectionTabText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
  },
  sectionTabTextActive: {
    color: '#FFFFFF',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
 summaryCard: {
    flexGrow: 1,
    flexBasis: 150,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  summaryValue: {
    fontSize: 27,
    fontWeight: '800',
    color: '#0F172A',
  },
  summaryLabel: {
    color: '#64748B',
    fontSize: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    gap: 7,
  },
  itemTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
  },
  roleLabel: {
    color: '#475569',
    fontSize: 13,
    marginTop: 4,
    textTransform: 'capitalize',
  },
  recordId: {
    color: '#94A3B8',
    fontSize: 11,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  actionButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionButtonText: {
    color: '#0F172A',
    fontWeight: '700',
    flex: 1,
  },
  smallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
   smallButtonText: {
    color: '#1D4ED8',
    fontSize: 12,
    fontWeight: '700',
  },
  dangerButton: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  dangerText: {
    color: '#B91C1C',
  },
  disabledButton: {
    opacity: 0.5,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 12,
  },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  reportText: {
    flex: 1,
    gap: 4,
  },
  countBadge: {
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  countText: {
    color: '#1D4ED8',
    fontSize: 20,
    fontWeight: '800',
  },
  countCaption: {
    color: '#1D4ED8',
    fontSize: 10,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    padding: 16,
  },
   modalScroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  modalCard: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    gap: 10,
  },
  modalTitle: {
    color: '#0F172A',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 6,
  },
  fieldLabel: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    fontSize: 14,
  },
  roleOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  roleOptionSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: COLORS.primary,
  },
  roleOptionText: {
    color: '#0F172A',
    fontWeight: '700',
    textTransform: 'capitalize',
  },
});
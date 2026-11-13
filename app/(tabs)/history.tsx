import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { COLORS } from '@/constants/colors';
import {
  getAttendanceHistory,
  getTeacherEventAttendance,
  type AttendanceRecord,
  type TeacherEventAttendance,
} from '@/lib/attendance';
import { supabase } from '@/lib/supabase';

function datePart(value: string | null): string {
  if (!value) return 'Not specified';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not specified';

  return date.toLocaleDateString('en-CA');
}

function timePart(value: string | null): string {
  if (!value) return 'Not specified';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not specified';

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function statusColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'present':
    case 'ongoing':
      return COLORS.success;
    case 'late':
      return '#c66a0f'; 
    case 'closed':
      return COLORS.textSecondary;
    default:
      return COLORS.primary;
  }
}

function statusBackground(status: string): string {
  switch (status.toLowerCase()) {
    case 'present':
    case 'ongoing':
      return '#E4F5EC';
    case 'late':
      return '#faeeea'; 
    case 'closed':
      return '#EEEEEE';
    default:
      return '#E5F0FF';
  }
}

export default function HistoryScreen() {
  const [role, setRole] = useState('');
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [teacherEvents, setTeacherEvents] = useState<
    TeacherEventAttendance[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const loadHistory = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      setErrorMessage('');

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        setRecords([]);
        setTeacherEvents([]);
        setRole('');
        setErrorMessage('Please log in to view your attendance history.');
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;

      setRole(profile.role);

      if (profile.role === 'teacher') {
        const events = await getTeacherEventAttendance(user.id);
        setTeacherEvents(events);
        setRecords([]);
      } else if (profile.role === 'student') {
        const attendance = await getAttendanceHistory(user.id);
        setRecords(attendance);
        setTeacherEvents([]);
      } else {
        setRecords([]);
        setTeacherEvents([]);
        setErrorMessage('Your account role is not supported on this screen.');
      }
    } catch (error) {
      console.error('Failed to load attendance history:', error);
      setErrorMessage('Unable to load attendance history. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadHistory();
    }, [loadHistory]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadHistory(false);
  }, [loadHistory]);

  function renderDetail(label: string, value: string) {
    return (
      <View style={styles.detailRow} key={label}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    );
  }

  function renderStatus(status: string) {
    return (
      <View
        style={[
          styles.statusBadge,
          { backgroundColor: statusBackground(status) },
        ]}
      >
        <Text style={[styles.statusText, { color: statusColor(status) }]}>
          {status}
        </Text>
      </View>
    );
  }

  function renderTeacherEvent(event: TeacherEventAttendance) {
    return (
      <View key={event.eventId} style={styles.recordCard}>
        <View style={styles.recordHeader}>
          <View style={styles.titleContainer}>
            <Text style={styles.eventTitle}>{event.title}</Text>
            <Text style={styles.eventCode}>
              Event Code: {event.eventCode}
            </Text>
          </View>
          {renderStatus(event.eventStatus || 'Upcoming')}
        </View>

        <View style={styles.divider} />

        {renderDetail('Event Date:', datePart(event.startTime))}
        {renderDetail(
          'Event Time:',
          `${timePart(event.startTime)} – ${timePart(event.endTime)}`,
        )}
        {renderDetail('Venue:', event.venue || 'Not specified')}

        {!!event.description?.trim() &&
          renderDetail('Description:', event.description.trim())}

        <View style={styles.divider} />

        <View style={styles.listHeader}>
          <Text style={styles.sectionTitle}>Students Who Scanned</Text>
          <Text style={styles.recordCount}>
            {event.attendeeCount}{' '}
            {event.attendeeCount === 1 ? 'student' : 'students'}
          </Text>
        </View>

        {event.attendees.length === 0 ? (
          <View style={styles.noStudents}>
            <Ionicons
              name="people-outline"
              size={25}
              color={COLORS.textSecondary}
            />
            <Text style={styles.emptyText}>
              No students have scanned this event's QR code yet.
            </Text>
          </View>
        ) : (
          event.attendees.map((student, index) => (
            <View
              key={`${event.eventId}-${student.studentId}-${index}`}
              style={styles.studentRow}
            >
              <View style={styles.studentAvatar}>
                <Ionicons
                  name="person-outline"
                  size={20}
                  color={COLORS.primary}
                />
              </View>

              <View style={styles.studentInfo}>
                <Text style={styles.studentName}>
                  {student.fullName || 'Unnamed Student'}
                </Text>
                <Text style={styles.scanValue}>
                  Scanned: {datePart(student.scannedAt)} at{' '}
                  {timePart(student.scannedAt)}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
    );
  }

  function renderStudentRecord(record: AttendanceRecord) {
    return (
      <View key={record.id} style={styles.recordCard}>
        <View style={styles.recordHeader}>
          <View style={styles.titleContainer}>
            <Text style={styles.eventTitle}>{record.eventTitle}</Text>
            <Text style={styles.eventCode}>
              Event ID: {record.eventId || 'Not available'}
            </Text>
          </View>

          {/* FIX: Display the actual saved attendance status. */}
          {renderStatus(record.status || 'Unknown')}
        </View>

        <View style={styles.divider} />

        {renderDetail('Event Date:', datePart(record.startTime))}
        {renderDetail(
          'Event Time:',
          `${timePart(record.startTime)} – ${timePart(record.endTime)}`,
        )}
        {renderDetail('Venue:', record.venue || 'Not specified')}

        {!!record.description?.trim() &&
          renderDetail('Description:', record.description.trim())}

        <View style={styles.divider} />

        <View style={styles.scanInfo}>
          <Ionicons
            name="calendar-outline"
            size={18}
            color={COLORS.primary}
          />
          <View style={styles.scanTextContainer}>
            <Text style={styles.scanLabel}>Attendance Recorded</Text>
            <Text style={styles.scanValue}>
              {datePart(record.scannedAt)} at {timePart(record.scannedAt)}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const totalCount =
    role === 'teacher' ? teacherEvents.length : records.length;

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        <View style={styles.pageHeader}>
          <View style={styles.headingContainer}>
            <Text style={styles.heading}>History</Text>
            <Text style={styles.subtitle}>
              {role === 'teacher'
                ? 'View your events and the students who scanned their QR codes.'
                : 'View your attendance records.'}
            </Text>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryIcon}>
            <Ionicons
              name={
                role === 'teacher'
                  ? 'calendar-outline'
                  : 'checkmark-done-circle-outline'
              }
              size={27}
              color={COLORS.primary}
            />
          </View>

          <View style={styles.summaryInfo}>
            <Text style={styles.summaryLabel}>
              {role === 'teacher'
                ? 'Total Events Created'
                : 'Total Attendance Records'}
            </Text>
            <Text style={styles.summaryValue}>{totalCount}</Text>
          </View>
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.sectionTitle}>
            {role === 'teacher'
              ? 'All Events & Attendance'
              : 'Attendance History'}
          </Text>
          <Text style={styles.recordCount}>
            {role === 'teacher'
              ? `${teacherEvents.length} events`
              : `${records.length} records`}
          </Text>
        </View>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.stateText}>Loading history...</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Ionicons
                name="alert-circle-outline"
                size={30}
                color={COLORS.primary}
              />
            </View>
            <Text style={styles.emptyTitle}>Unable to display history</Text>
            <Text style={styles.emptyText}>{errorMessage}</Text>
          </View>
        ) : role === 'teacher' ? (
          teacherEvents.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconCircle}>
                <Ionicons
                  name="calendar-outline"
                  size={30}
                  color={COLORS.primary}
                />
              </View>
              <Text style={styles.emptyTitle}>No events yet</Text>
              <Text style={styles.emptyText}>
                Events you create will appear here, including upcoming,
                ongoing, and closed events.
              </Text>
            </View>
          ) : (
            teacherEvents.map(renderTeacherEvent)
          )
        ) : records.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Ionicons
                name="time-outline"
                size={30}
                color={COLORS.primary}
              />
            </View>
            <Text style={styles.emptyTitle}>No attendance history yet</Text>
            <Text style={styles.emptyText}>
              Your recorded attendance will appear here after you scan an
              event's QR code.
            </Text>
          </View>
        ) : (
          records.map(renderStudentRecord)
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 18,
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
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    marginBottom: 25,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    gap: 13,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  summaryIcon: {
    width: 52,
    height: 52,
    borderRadius: 15,
    backgroundColor: '#E5F0FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryInfo: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  summaryValue: {
    fontSize: 27,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginTop: 3,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.textPrimary,
    flexShrink: 1,
  },
  recordCount: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  recordCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    marginBottom: 16,
    padding: 17,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 3,
  },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  titleContainer: {
    flex: 1,
    paddingRight: 4,
  },
  eventTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: COLORS.textPrimary,
    lineHeight: 25,
    marginBottom: 6,
  },
  eventCode: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  statusBadge: {
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 15,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  detailLabel: {
    width: 105,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  detailValue: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textSecondary,
  },
  scanInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  scanTextContainer: {
    flex: 1,
  },
  scanLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  scanValue: {
    fontSize: 13,
    lineHeight: 19,
    color: COLORS.textSecondary,
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  studentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5F0FF',
  },
  studentInfo: {
    flex: 1,
    gap: 4,
  },
  studentName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  noStudents: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  stateCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  stateText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  emptyCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 25,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E5F0FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 7,
    textAlign: 'center',
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
});
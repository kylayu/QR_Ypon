import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
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
    getAdminAttendance,
    getAdminEvents,
    getAdminSummary,
    type AdminAttendance,
    type AdminEvent,
} from '@/lib/admin';
import { useAuth } from '@/lib/auth';
import { getProfile } from '@/lib/profiles';
import { supabase } from '@/lib/supabase';

type Summary = {
  users: number;
  events: number;
  attendance: number;
};

const EMPTY_SUMMARY: Summary = {
  users: 0,
  events: 0,
  attendance: 0,
};

const ALL_EVENTS = 'all';

export default function ReportsScreen() {
  const { user } = useAuth();

  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [records, setRecords] = useState<AdminAttendance[]>([]);

  // Maps each student ID to their full name.
  const [studentNames, setStudentNames] = useState<
    Record<string, string>
  >({});

  const [studentListEvent, setStudentListEvent] =
    useState<AdminEvent | null>(null);

  const [search, setSearch] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(ALL_EVENTS);
  const [error, setError] = useState('');

  // Load student names associated with the attendance records.
  useEffect(() => {
    let cancelled = false;

    async function loadStudentNames() {
      const studentIds = [
        ...new Set(
          records
            .map((record) => record.student_id)
            .filter(Boolean),
        ),
      ];

      if (studentIds.length === 0) {
        setStudentNames({});
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', studentIds);

      if (error) {
        console.error(
          'Unable to load student names:',
          error.message,
        );
        return;
      }

      if (cancelled) return;

      const names: Record<string, string> = {};

      for (const profile of data ?? []) {
        if (profile.id && profile.full_name) {
          names[profile.id] = profile.full_name;
        }
      }

      setStudentNames(names);
    }

    void loadStudentNames();

    return () => {
      cancelled = true;
    };
  }, [records]);

  const loadData = useCallback(async () => {
    if (!user?.id) {
      setAuthorized(false);
      setChecking(false);
      setSummary(EMPTY_SUMMARY);
      setEvents([]);
      setRecords([]);
      setStudentNames({});
      return;
    }

    setLoading(true);
    setError('');

    try {
      const profile = await getProfile(user.id);

      if (profile?.role?.toLowerCase() !== 'admin') {
        setAuthorized(false);
        setSummary(EMPTY_SUMMARY);
        setEvents([]);
        setRecords([]);
        setStudentNames({});
        return;
      }

      setAuthorized(true);

      const [nextSummary, nextEvents, nextRecords] =
        await Promise.all([
          getAdminSummary(),
          getAdminEvents(),
          getAdminAttendance(),
        ]);

      setSummary(nextSummary);
      setEvents(nextEvents);
      setRecords(nextRecords);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load reports.',
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

  const eventMap = useMemo(
    () => new Map(events.map((event) => [event.id, event])),
    [events],
  );

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();

    return records.filter((record) => {
      if (
        selectedEvent !== ALL_EVENTS &&
        record.event_id !== selectedEvent
      ) {
        return false;
      }

      if (!query) return true;

      const event = eventMap.get(record.event_id);

      return [
        record.student_id,
        studentNames[record.student_id],
        record.event_id,
        record.scanned_at,
        event?.title,
        event?.event_code,
      ].some((value) =>
        String(value ?? '').toLowerCase().includes(query),
      );
    });
  }, [
    records,
    search,
    selectedEvent,
    eventMap,
    studentNames,
  ]);

  const visibleEvents = useMemo(
    () =>
      selectedEvent === ALL_EVENTS
        ? events
        : events.filter((event) => event.id === selectedEvent),
    [events, selectedEvent],
  );

  // Keep one record per student for the selected event.
  // Sorting first ensures the earliest scan is displayed.
  const uniqueStudentsForSelectedEvent = useMemo(() => {
    if (!studentListEvent) return [];

    const seen = new Set<string>();

    return records
      .filter(
        (record) =>
          record.event_id === studentListEvent.id &&
          Boolean(record.student_id),
      )
      .sort(
        (a, b) =>
          new Date(a.scanned_at).getTime() -
          new Date(b.scanned_at).getTime(),
      )
      .filter((record) => {
        if (seen.has(record.student_id)) return false;

        seen.add(record.student_id);
        return true;
      });
  }, [records, studentListEvent]);

  const exportCsv = useCallback(async () => {
    if (exporting) return;

    if (filteredRecords.length === 0) {
      Alert.alert(
        'No records',
        'There are no attendance records to export with the current filters.',
      );
      return;
    }

    setExporting(true);

    try {
      const headers = [
        'Student Name',
        'Student ID',
        'Event Name',
        'Event Code',
        'Scanned At',
      ];

      const csvCell = (value: unknown) => {
        let text = String(value ?? '');

        // Reduce the risk of spreadsheet formula injection.
        if (/^[=+\-@\t\r]/.test(text)) {
          text = `'${text}`;
        }

        return `"${text.replace(/"/g, '""')}"`;
      };

      const rows = filteredRecords.map((record) => {
        const event = eventMap.get(record.event_id);

        return [
          studentNames[record.student_id] ?? '',
          record.student_id,
          event?.title ?? 'Unknown event',
          event?.event_code ?? '',
          record.scanned_at,
        ];
      });

      const csv = [headers, ...rows]
        .map((row) => row.map(csvCell).join(','))
        .join('\r\n');

      const filename = `attendance-report-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;

      if (Platform.OS === 'web') {
        const blob = new Blob(['\uFEFF', csv], {
          type: 'text/csv;charset=utf-8;',
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        const directory =
          FileSystem.cacheDirectory ??
          FileSystem.documentDirectory;

        if (!directory) {
          throw new Error(
            'No available directory to create the CSV file.',
          );
        }

        const fileUri = `${directory}${filename}`;

        await FileSystem.writeAsStringAsync(fileUri, csv, {
          encoding: FileSystem.EncodingType.UTF8,
        });

        const canShare = await Sharing.isAvailableAsync();

        if (!canShare) {
          throw new Error(
            'File sharing is not available on this device.',
          );
        }

        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Export attendance report',
          UTI: 'public.comma-separated-values-text',
        });
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Unable to export the report.';

      if (Platform.OS === 'web') {
        setError(message);
      } else {
        Alert.alert('Export failed', message);
      }
    } finally {
      setExporting(false);
    }
  }, [
    eventMap,
    exporting,
    filteredRecords,
    studentNames,
  ]);

  if (checking) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color={COLORS.primary}
        />
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
          name="lock-closed-outline"
          size={42}
          color={COLORS.primary}
        />
        <Text style={styles.heading}>Access denied</Text>
        <Text style={styles.muted}>
          This screen is available to administrator accounts only.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => void loadData()}
          tintColor={COLORS.primary}
        />
      }
    >
      {/* Page header */}
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>ADMINISTRATION</Text>
          <Text style={styles.heading}>Reports</Text>
          <Text style={styles.muted}>
            Attendance totals, event summaries, and scan records.
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh reports"
          disabled={loading}
          onPress={() => void loadData()}
          style={({ pressed }) => [
            styles.iconButton,
            pressed && styles.pressed,
            loading && styles.disabled,
          ]}
        >
          <Ionicons
            name="refresh-outline"
            size={21}
            color={COLORS.primary}
          />
        </Pressable>
      </View>

      {/* Error message */}
      {error ? (
        <View style={styles.errorBox}>
          <Ionicons
            name="alert-circle-outline"
            size={20}
            color="#B91C1C"
          />

          <View style={styles.errorTextContainer}>
            <Text style={styles.errorTitle}>
              Something went wrong
            </Text>
            <Text style={styles.error}>{error}</Text>
          </View>

          <Pressable
            onPress={() => void loadData()}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {/* System overview */}
      <Text style={styles.sectionTitle}>System overview</Text>

      <View style={styles.grid}>
        <SummaryCard
          icon="people-outline"
          label="Registered users"
          value={summary.users}
        />

        <SummaryCard
          icon="calendar-outline"
          label="Total events"
          value={summary.events}
        />

        <SummaryCard
          icon="clipboard-outline"
          label="Attendance records"
          value={summary.attendance}
        />
      </View>

      {/* Event summaries heading */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>Event summaries</Text>
          <Text style={styles.muted}>
            Compare recorded attendance for each event.
          </Text>
        </View>
      </View>

      {/* Event filters */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        <FilterChip
          label="All events"
          active={selectedEvent === ALL_EVENTS}
          onPress={() => setSelectedEvent(ALL_EVENTS)}
        />

        {events.map((event) => (
          <FilterChip
            key={event.id}
            label={event.title}
            active={selectedEvent === event.id}
            onPress={() => setSelectedEvent(event.id)}
          />
        ))}
      </ScrollView>

      {/* Students who scanned modal */}
      <Modal
        visible={studentListEvent !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setStudentListEvent(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderText}>
                <Text style={styles.modalTitle}>
                  Students who scanned
                </Text>

                <Text style={styles.muted}>
                  {studentListEvent?.title ?? ''}
                </Text>

                <Text style={styles.muted}>
                  {uniqueStudentsForSelectedEvent.length}{' '}
                  Students
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close student list"
                onPress={() => setStudentListEvent(null)}
                style={styles.modalCloseIcon}
              >
                <Ionicons
                  name="close-circle-outline"
                  size={26}
                  color="#64748B"
                />
              </Pressable>
            </View>

            <ScrollView
              style={styles.modalList}
              showsVerticalScrollIndicator={false}
            >
              {uniqueStudentsForSelectedEvent.length === 0 ? (
                <Text style={styles.muted}>
                  No student scans have been recorded for this event.
                </Text>
              ) : (
                uniqueStudentsForSelectedEvent.map((record) => (
                  <View
                    key={`${studentListEvent?.id}-${record.student_id}`}
                    style={styles.studentListItem}
                  >
                    <Ionicons
                      name="person-circle-outline"
                      size={30}
                      color={COLORS.primary}
                    />

                    <View style={styles.studentListInfo}>
                      <Text style={styles.studentListId}>
                        {studentNames[record.student_id] ||
                          'Student name unavailable'}
                      </Text>

                      <Text style={styles.muted}>
                        Student ID: {record.student_id}
                      </Text>

                      <Text style={styles.muted}>
                        First recorded scan:{' '}
                        {formatDate(record.scanned_at)}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            <Pressable
              accessibilityRole="button"
              onPress={() => setStudentListEvent(null)}
              style={({ pressed }) => [
                styles.modalCloseButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.modalCloseButtonText}>
                Close
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Event summary cards */}
      {visibleEvents.map((event) => {
        const eventRecords = records.filter(
          (record) => record.event_id === event.id,
        );

        const uniqueStudents = new Set(
          eventRecords
            .map((record) => record.student_id)
            .filter(Boolean),
        ).size;

        return (
          <View key={event.id} style={styles.card}>
            <View style={styles.eventHeader}>
              <View style={styles.eventIcon}>
                <Ionicons
                  name="calendar-outline"
                  size={21}
                  color={COLORS.primary}
                />
              </View>

              <View style={styles.eventInfo}>
                <Text style={styles.eventTitle}>
                  {event.title}
                </Text>

                <Text style={styles.muted}>
                  Code: {event.event_code}
                </Text>
              </View>
            </View>

            <View style={styles.eventStats}>
              <View style={styles.eventStat}>
                <Text style={styles.eventStatValue}>
                  {eventRecords.length}
                </Text>

                <Text style={styles.muted}>
                  Attendance records
                </Text>
              </View>

              <View style={styles.statDivider} />

              <View style={styles.eventStat}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    `View ${uniqueStudents} unique students for ${event.title}`
                  }
                  accessibilityHint={
                    'Opens the list of students who scanned this event.'
                  }
                  onPress={() => setStudentListEvent(event)}
                  style={({ pressed }) => [
                    styles.studentCountButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.eventStatValue}>
                    {uniqueStudents}
                  </Text>

                  <Text style={styles.studentCountLabel}>
                    Students · View list
                  </Text>
                </Pressable>
              </View>
            </View>

            {event.start_time ? (
              <Text style={styles.eventDate}>
                <Ionicons
                  name="time-outline"
                  size={14}
                  color="#64748B"
                />{' '}
                Starts: {formatDate(event.start_time)}
              </Text>
            ) : null}
          </View>
        );
      })}

      {!loading && visibleEvents.length === 0 ? (
        <EmptyState message="No events available for reporting." />
      ) : null}

      {/* Attendance records heading */}
      <View style={styles.detailHeader}>
        <View style={styles.sectionHeaderText}>
          <Text style={styles.sectionTitle}>
            Attendance records
          </Text>

          <Text style={styles.muted}>
            Search by student name, student ID, event name, event code,
            or scan time.
          </Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchBox}>
        <Ionicons
          name="search-outline"
          size={20}
          color="#64748B"
        />

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search attendance records..."
          placeholderTextColor="#94A3B8"
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          accessibilityLabel="Search attendance records"
        />

        {search.length > 0 ? (
          <Pressable
            onPress={() => setSearch('')}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <Ionicons
              name="close-circle"
              size={20}
              color="#64748B"
            />
          </Pressable>
        ) : null}
      </View>

      {/* Search results and export */}
      <View style={styles.resultsHeader}>
        <Text style={styles.resultsCount}>
          {filteredRecords.length} record
          {filteredRecords.length === 1 ? '' : 's'}
        </Text>

        <Pressable
          accessibilityRole="button"
          disabled={exporting || loading}
          onPress={() => void exportCsv()}
          style={({ pressed }) => [
            styles.exportButton,
            pressed && styles.pressed,
            (exporting || loading) && styles.disabled,
          ]}
        >
          {exporting ? (
            <ActivityIndicator
              size="small"
              color="#FFFFFF"
            />
          ) : (
            <Ionicons
              name="download-outline"
              size={18}
              color="#FFFFFF"
            />
          )}

          <Text style={styles.exportButtonText}>
            {exporting ? 'Exporting...' : 'Export CSV'}
          </Text>
        </Pressable>
      </View>

      {/* Attendance record cards */}
      {filteredRecords.map((record) => {
        const event = eventMap.get(record.event_id);

        return (
          <View key={record.id} style={styles.recordCard}>
            <View style={styles.recordTop}>
              <View style={styles.recordIcon}>
                <Ionicons
                  name="person-outline"
                  size={20}
                  color={COLORS.primary}
                />
              </View>

              <View style={styles.recordInfo}>
                <Text style={styles.recordTitle}>
                  {event?.title ?? 'Unknown event'}
                </Text>

                <Text style={styles.muted}>
                  {event?.event_code ?? 'No event code'}
                </Text>
              </View>
            </View>

            <View style={styles.recordDetail}>
              <Text style={styles.detailLabel}>Student name</Text>
              <Text style={styles.detailValue}>
                {studentNames[record.student_id] ||
                  'Student name unavailable'}
              </Text>
            </View>

            <View style={styles.recordDetail}>
              <Text style={styles.detailLabel}>Student ID</Text>
              <Text style={styles.detailValue}>
                {record.student_id}
              </Text>
            </View>

            <View style={styles.recordDetail}>
              <Text style={styles.detailLabel}>Scanned at</Text>
              <Text style={styles.detailValue}>
                {formatDate(record.scanned_at)}
              </Text>
            </View>

            <View style={styles.recordDetail}>
              <Text style={styles.detailLabel}>Record ID</Text>
              <Text style={styles.recordId} selectable>
                {record.id}
              </Text>
            </View>
          </View>
        );
      })}

      {!loading && filteredRecords.length === 0 ? (
        <EmptyState
          message={
            records.length === 0
              ? 'No attendance records have been recorded yet.'
              : 'No records match your search or selected event.'
          }
        />
      ) : null}

      {/* Information note */}
      <View style={styles.noteBox}>
        <Ionicons
          name="information-circle-outline"
          size={20}
          color={COLORS.primary}
        />

        <Text style={styles.note}>
          These reports count stored attendance records and unique
          student IDs. Your current attendance type does not include
          a status field, so this page does not calculate Present,
          Late, Absent, Excused, or attendance percentages. Unique
          students means distinct student IDs with records for the
          selected event, not necessarily the event's full enrollment.
        </Text>
      </View>
    </ScrollView>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: number;
}) {
  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryIcon}>
        <Ionicons
          name={icon}
          size={21}
          color={COLORS.primary}
        />
      </View>

      <Text style={styles.summaryValue}>
        {value.toLocaleString()}
      </Text>

      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        active && styles.activeChip,
        pressed && styles.pressed,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.chipText,
          active && styles.activeChipText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.emptyState}>
      <Ionicons
        name="file-tray-outline"
        size={30}
        color="#94A3B8"
      />

      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not available';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
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
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerText: {
    flex: 1,
    gap: 5,
  },
  eyebrow: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  heading: {
    color: '#0F172A',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 2,
  },
  muted: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 20,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
  },
  pressed: {
    opacity: 0.75,
  },
  disabled: {
    opacity: 0.55,
  },
  sectionTitle: {
    color: '#0F172A',
    fontSize: 19,
    fontWeight: '800',
    marginTop: 26,
    marginBottom: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 16,
  },
  summaryCard: {
    flexGrow: 1,
    flexBasis: 180,
    minWidth: 145,
    padding: 17,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 7,
  },
  summaryIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  summaryValue: {
    color: '#0F172A',
    fontSize: 27,
    fontWeight: '800',
  },
  sectionHeader: {
    marginTop: 8,
  },
  sectionHeaderText: {
    flex: 1,
    gap: 2,
  },
  chipRow: {
    gap: 8,
    paddingVertical: 10,
    paddingBottom: 14,
  },
  chip: {
    maxWidth: 220,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  activeChip: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
  },
  activeChipText: {
    color: '#FFFFFF',
  },
  card: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    gap: 14,
  },
  eventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  eventIcon: {
    width: 42,
    height: 42,
    borderRadius: 11,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventInfo: {
    flex: 1,
    gap: 3,
  },
  eventTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '700',
  },
  eventStats: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 14,
    gap: 16,
  },
  eventStat: {
    flex: 1,
    gap: 4,
  },
  eventStatValue: {
    color: COLORS.primary,
    fontSize: 23,
    fontWeight: '800',
  },
  studentCountButton: {
    alignSelf: 'flex-start',
  },
  studentCountLabel: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: '#E2E8F0',
  },
  eventDate: {
    color: '#64748B',
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    padding: 18,
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  modalHeaderText: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  modalCloseIcon: {
    padding: 5,
  },
  modalList: {
    flexGrow: 0,
  },
  studentListItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  studentListInfo: {
    flex: 1,
  },
  studentListId: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 3,
  },
  modalCloseButton: {
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: COLORS.primary,
  },
  modalCloseButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  detailHeader: {
    marginTop: 8,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 13,
    minHeight: 48,
    marginTop: 12,
  },
  searchInput: {
    flex: 1,
    color: '#0F172A',
    fontSize: 14,
    paddingVertical: 11,
    outlineStyle: 'none',
  } as any,
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 16,
    marginBottom: 12,
  },
  resultsCount: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
  },
  exportButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  recordCard: {
    padding: 15,
    backgroundColor: '#FFFFFF',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    gap: 12,
  },
  recordTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  recordIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordInfo: {
    flex: 1,
    gap: 3,
  },
  recordTitle: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },
  recordDetail: {
    gap: 4,
  },
  detailLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  detailValue: {
    color: '#334155',
    fontSize: 13,
  },
  recordId: {
    color: '#64748B',
    fontSize: 11,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 30,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 13,
    gap: 9,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 18,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
  },
  note: {
    flex: 1,
    color: '#475569',
    fontSize: 12,
    lineHeight: 19,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginTop: 16,
    padding: 13,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
  },
  errorTextContainer: {
    flex: 1,
    gap: 3,
  },
  errorTitle: {
    color: '#991B1B',
    fontSize: 13,
    fontWeight: '800',
  },
  error: {
    color: '#B91C1C',
    fontSize: 12,
    lineHeight: 18,
  },
  retryText: {
    color: '#991B1B',
    fontSize: 12,
    fontWeight: '800',
    paddingVertical: 3,
  },
});
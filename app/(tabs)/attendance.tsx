
import { COLORS } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
} from 'react';
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

type Role = 'teacher' | 'admin';

type EventItem = {
  id: string;
  title: string;
  event_code: string;
  created_by: string | null;
};

type AttendanceItem = {
  id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  event_id: string;
  event_title: string;
  event_code: string;
  scanned_at: string;
  status: string;
};

const STATUSES = ['Present', 'Absent', 'Late', 'Excused'];

function csvCell(value: unknown) {
  const text = String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function formatDate(value: string) {
  if (!value) return '—';

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString();
}

function showMessage(title: string, message: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.alert(`${title}\n\n${message}`);
    }
  } else {
    Alert.alert(title, message);
  }
}

export default function AttendanceScreen() {
  const [role, setRole] = useState<Role | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const [records, setRecords] = useState<AttendanceItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [showStartCalendar, setShowStartCalendar] = useState(false);
  const [showEndCalendar, setShowEndCalendar] = useState(false);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState('Present');

  const [editing, setEditing] = useState<AttendanceItem | null>(null);
  const [editStudentId, setEditStudentId] = useState('');
  const [editEventId, setEditEventId] = useState('');
  const [editScannedAt, setEditScannedAt] = useState('');
  const [editStatus, setEditStatus] = useState('Present');



const loadRecords = useCallback(async () => {
  setLoading(true);

  try {
    // Read the current Supabase session.
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) throw sessionError;

    if (!session?.user) {
      console.log('ATTENDANCE: No authenticated session');

      setRole(null);
      setCurrentUserId('');
      setRecords([]);
      setEvents([]);
      setSelectedIds([]);
      return;
    }

    const user = session.user;

    console.log('ATTENDANCE: Authenticated user', user.id);

    // Load the role associated with this user's profile.
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .maybeSingle();

    console.log('ATTENDANCE: Profile result', {
      profile,
      error: profileError?.message,
    });

    if (profileError) throw profileError;

    const normalizedRole = String(profile?.role ?? '')
      .trim()
      .toLowerCase();

    if (normalizedRole !== 'teacher' && normalizedRole !== 'admin') {
      setRole(null);
      setCurrentUserId(user.id);
      setRecords([]);
      setEvents([]);
      setSelectedIds([]);

      console.warn(
        'ATTENDANCE: Access denied; profile role is:',
        normalizedRole || '(missing)',
      );
      return;
    }

    const currentRole = normalizedRole as Role;

    setRole(currentRole);
    setCurrentUserId(user.id);

    // Load events visible to the authenticated account.
    const { data: eventRows, error: eventError } = await supabase
      .from('events')
      .select('id, title, event_code, created_by')
      .order('title', { ascending: true });

    if (eventError) throw eventError;

    const eventList: EventItem[] = (eventRows ?? []).map((event) => ({
      id: String(event.id),
      title: String(event.title ?? 'Untitled event'),
      event_code: String(event.event_code ?? ''),
      created_by: event.created_by
        ? String(event.created_by)
        : null,
    }));

    setEvents(eventList);

    const eventMap = new Map(
      eventList.map((event) => [event.id, event]),
    );

    const eventIds = eventList.map((event) => event.id);

    if (eventIds.length === 0) {
      setRecords([]);
      setSelectedIds([]);
      return;
    }

    // Teachers see attendance for events available to them.
    // Admins see all attendance allowed by their Supabase policies.
    let attendanceQuery = supabase
      .from('attendance')
      .select('id, student_id, event_id, scanned_at, status')
      .order('scanned_at', { ascending: false });

    if (currentRole === 'teacher') {
      attendanceQuery = attendanceQuery.in('event_id', eventIds);
    }

    const {
      data: attendanceRows,
      error: attendanceError,
    } = await attendanceQuery;

    if (attendanceError) throw attendanceError;

    const relevantRows = (attendanceRows ?? []).filter((row) =>
      eventMap.has(String(row.event_id)),
    );

    const studentIds = [
      ...new Set(
        relevantRows
          .map((row) => String(row.student_id ?? ''))
          .filter(Boolean),
      ),
    ];

    const profileMap = new Map<
      string,
      { full_name: string; email: string }
    >();

    if (studentIds.length > 0) {
      const { data: studentProfiles, error: studentsError } =
        await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', studentIds);

      if (studentsError) throw studentsError;

      for (const student of studentProfiles ?? []) {
        profileMap.set(String(student.id), {
          full_name: String(student.full_name ?? '').trim(),
          email: String(student.email ?? ''),
        });
      }
    }

    const mappedRecords: AttendanceItem[] = relevantRows.map((row) => {
      const event = eventMap.get(String(row.event_id));
      const student = profileMap.get(String(row.student_id));

      return {
        id: String(row.id),
        student_id: String(row.student_id ?? ''),
        student_name:
          student?.full_name ||
          student?.email ||
          'Unknown student',
        student_email: student?.email ?? '',
        event_id: String(row.event_id ?? ''),
        event_title: event?.title ?? 'Unknown event',
        event_code: event?.event_code ?? '',
        scanned_at: String(row.scanned_at ?? ''),
        status: String(row.status ?? 'Unknown'),
      };
    });

    setRecords(mappedRecords);
    setSelectedIds([]);
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Please try again.';

    console.error('Attendance load failed:', error);

    showMessage('Could not load attendance records', message);
    setRecords([]);
    setEvents([]);
    setRole(null);
  } finally {
    setLoading(false);
  }
}, []);

  useFocusEffect(
    useCallback(() => {
      void loadRecords();
    }, [loadRecords]),
  );

  // Teacher records must belong to events created by that teacher.
// Show attendance for all events available to this account.
// Admins can manage all visible records; teachers can view
// attendance for events they are permitted to monitor.
const manageableRecords = useMemo(() => {
  return records;
}, [records]);

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();

    return manageableRecords.filter((record) => {
      const matchesSearch =
        !query ||
        record.student_name.toLowerCase().includes(query) ||
        record.student_email.toLowerCase().includes(query) ||
        record.student_id.toLowerCase().includes(query) ||
        record.event_title.toLowerCase().includes(query) ||
        record.event_code.toLowerCase().includes(query);

      const matchesEvent =
        eventFilter === 'all' ||
        record.event_id === eventFilter;

      const matchesStatus =
        statusFilter === 'all' ||
        record.status.toLowerCase() === statusFilter.toLowerCase();

      const recordDate = record.scanned_at
        ? new Date(record.scanned_at)
        : null;

      const validDate =
        recordDate !== null &&
        !Number.isNaN(recordDate.getTime());

      const startTime = startDate
        ? new Date(`${startDate}T00:00:00`).getTime()
        : null;

      const endTime = endDate
        ? new Date(`${endDate}T23:59:59.999`).getTime()
        : null;

      const matchesStart =
        startTime === null ||
        (validDate && recordDate!.getTime() >= startTime);

      const matchesEnd =
        endTime === null ||
        (validDate && recordDate!.getTime() <= endTime);

      return (
        matchesSearch &&
        matchesEvent &&
        matchesStatus &&
        matchesStart &&
        matchesEnd
      );
    });
  }, [
    manageableRecords,
    search,
    eventFilter,
    statusFilter,
    startDate,
    endDate,
  ]);

  const summary = useMemo(() => {
    const normalized = (record: AttendanceItem) =>
      record.status.trim().toLowerCase();

    return {
      total: filteredRecords.length,
      present: filteredRecords.filter(
        (record) => normalized(record) === 'present',
      ).length,
      absent: filteredRecords.filter(
        (record) => normalized(record) === 'absent',
      ).length,
      late: filteredRecords.filter(
        (record) => normalized(record) === 'late',
      ).length,
      students: new Set(
        filteredRecords.map((record) => record.student_id),
      ).size,
    };
  }, [filteredRecords]);

  function toggleSelected(id: string) {
    if (!manageableRecords.some((record) => record.id === id)) {
      return;
    }

    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleSelectFiltered() {
    const visibleIds = filteredRecords.map((record) => record.id);

    const allSelected =
      visibleIds.length > 0 &&
      visibleIds.every((id) => selectedIds.includes(id));

    setSelectedIds((current) =>
      allSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : [...new Set([...current, ...visibleIds])],
    );
  }

  function openEditor(record: AttendanceItem) {
    if (!manageableRecords.some((item) => item.id === record.id)) {
      showMessage('Not permitted', 'You cannot edit this record.');
      return;
    }

    setEditing(record);
    setEditStudentId(record.student_id);
    setEditEventId(record.event_id);
    setEditScannedAt(record.scanned_at);
    setEditStatus(record.status || 'Present');
  }

  async function saveEdit() {
    if (!editing) return;

    if (
      !manageableRecords.some((item) => item.id === editing.id)
    ) {
      showMessage('Not permitted', 'You cannot edit this record.');
      return;
    }

    if (
      !editStudentId.trim() ||
      !editEventId.trim() ||
      !editScannedAt.trim()
    ) {
      showMessage('Missing information', 'Complete all edit fields.');
      return;
    }

    if (!STATUSES.includes(editStatus)) {
      showMessage('Invalid status', 'Choose a valid attendance status.');
      return;
    }

    const parsedDate = new Date(editScannedAt);

    if (Number.isNaN(parsedDate.getTime())) {
      showMessage(
        'Invalid date',
        'Enter a valid date/time, such as 2026-10-15T09:30:00+08:00.',
      );
      return;
    }

    const selectedEvent = events.find(
      (event) => event.id === editEventId.trim(),
    );

    if (!selectedEvent) {
      showMessage(
        'Invalid event',
        'Choose an event available to your account.',
      );
      return;
    }

    if (
      role === 'teacher' &&
      selectedEvent.created_by !== currentUserId
    ) {
      showMessage(
        'Not permitted',
        'Teachers can only assign attendance to their own events.',
      );
      return;
    }

    setWorking(true);

    try {
      const { data: studentProfile, error: studentError } =
        await supabase
          .from('profiles')
          .select('id, role')
          .eq('id', editStudentId.trim())
          .maybeSingle();

      if (studentError) throw studentError;

      if (
        !studentProfile ||
        String(studentProfile.role).toLowerCase() !== 'student'
      ) {
        showMessage(
          'Invalid student',
          'Enter the profile ID of an existing student.',
        );
        return;
      }

      const { error } = await supabase
        .from('attendance')
        .update({
          student_id: editStudentId.trim(),
          event_id: editEventId.trim(),
          scanned_at: parsedDate.toISOString(),
          status: editStatus,
        })
        .eq('id', editing.id);

      if (error) throw error;

      setEditing(null);
      await loadRecords();

      showMessage('Saved', 'The attendance record was corrected.');
    } catch (error: any) {
      showMessage(
        'Could not save changes',
        error?.message ??
          'Check your Supabase permissions and try again.',
      );
    } finally {
      setWorking(false);
    }
  }

  function getSelectedManageableIds() {
    const allowedIds = new Set(
      manageableRecords.map((record) => record.id),
    );

    return [...new Set(selectedIds)].filter((id) =>
      allowedIds.has(id),
    );
  }

  async function changeSelectedStatus() {
    const ids = getSelectedManageableIds();

    if (ids.length === 0) {
      showMessage(
        'No records selected',
        'Select at least one permitted attendance record.',
      );
      return;
    }

    if (!STATUSES.includes(bulkStatus)) {
      showMessage('Invalid status', 'Choose a valid status.');
      return;
    }

    setWorking(true);

    try {
      const { error } = await supabase
        .from('attendance')
        .update({ status: bulkStatus })
        .in('id', ids);

      if (error) throw error;

      setSelectedIds([]);
      await loadRecords();

      showMessage(
        'Bulk update complete',
        `Status changed to ${bulkStatus}.`,
      );
    } catch (error: any) {
      showMessage(
        'Bulk update failed',
        error?.message ?? 'Check your Supabase permissions.',
      );
    } finally {
      setWorking(false);
    }
  }

  async function deleteSelected() {
    const ids = getSelectedManageableIds();

    if (ids.length === 0) {
      showMessage(
        'No records selected',
        'Select at least one permitted attendance record.',
      );
      return;
    }

    const performDelete = async () => {
      setWorking(true);

      try {
        const { error } = await supabase
          .from('attendance')
          .delete()
          .in('id', ids);

        if (error) throw error;

        setSelectedIds([]);
        await loadRecords();

        showMessage(
          'Records deleted',
          `${ids.length} selected record(s) deleted.`,
        );
      } catch (error: any) {
        showMessage(
          'Delete failed',
          error?.message ?? 'Check your Supabase permissions.',
        );
      } finally {
        setWorking(false);
      }
    };

    if (Platform.OS === 'web') {
      if (
        typeof window !== 'undefined' &&
        window.confirm(`Delete ${ids.length} selected record(s)?`)
      ) {
        await performDelete();
      }
    } else {
      Alert.alert(
        'Delete selected records?',
        `This will delete ${ids.length} attendance record(s).`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => void performDelete(),
          },
        ],
      );
    }
  }

  async function deleteOne(record: AttendanceItem) {
    if (!manageableRecords.some((item) => item.id === record.id)) {
      showMessage('Not permitted', 'You cannot delete this record.');
      return;
    }

    const performDelete = async () => {
      setWorking(true);

      try {
        const { error } = await supabase
          .from('attendance')
          .delete()
          .eq('id', record.id);

        if (error) throw error;

        setSelectedIds((current) =>
          current.filter((id) => id !== record.id),
        );

        await loadRecords();

        showMessage('Record deleted', 'The attendance record was removed.');
      } catch (error: any) {
        showMessage(
          'Delete failed',
          error?.message ?? 'Check your Supabase permissions.',
        );
      } finally {
        setWorking(false);
      }
    };

    if (Platform.OS === 'web') {
      if (
        typeof window !== 'undefined' &&
        window.confirm(`Delete attendance for ${record.student_name}?`)
      ) {
        await performDelete();
      }
    } else {
      Alert.alert(
        'Delete attendance?',
        `Student: ${record.student_name}`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => void performDelete(),
          },
        ],
      );
    }
  }

  async function exportCsv() {
    if (filteredRecords.length === 0) {
      showMessage(
        'Nothing to export',
        'No records match the current filters.',
      );
      return;
    }

    const header = [
      'Attendance ID',
      'Student Name',
      'Student Email',
      'Student ID',
      'Event',
      'Event Code',
      'Event ID',
      'Scanned At',
      'Status',
    ];

    const rows = filteredRecords.map((record) => [
      record.id,
      record.student_name,
      record.student_email,
      record.student_id,
      record.event_title,
      record.event_code,
      record.event_id,
      record.scanned_at,
      record.status,
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map(csvCell).join(','))
      .join('\r\n');

    const filename = `attendance-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    try {
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
        document.body.removeChild(link);

        URL.revokeObjectURL(url);
        return;
      }

      const baseDirectory = FileSystem.cacheDirectory;

      if (!baseDirectory) {
        showMessage(
          'Export unavailable',
          'No writable file directory found.',
        );
        return;
      }

      const fileUri = `${baseDirectory}${filename}`;

      await FileSystem.writeAsStringAsync(fileUri, '\uFEFF' + csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Export attendance records',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        showMessage('CSV created', `File saved at: ${fileUri}`);
      }
    } catch (error: any) {
      showMessage(
        'CSV export failed',
        error?.message ?? 'Please try again.',
      );
    }
  }

  function clearFilters() {
    setSearch('');
    setEventFilter('all');
    setStatusFilter('all');
    setStartDate('');
    setEndDate('');
    setSelectedIds([]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.muted}>Loading attendance records...</Text>
      </View>
    );
  }

  if (!role) {
    return (
      <View style={styles.center}>
        <Ionicons
          name="lock-closed-outline"
          size={42}
          color="#64748b"
        />
        <Text style={styles.heading}>Attendance Records</Text>
        <Text style={styles.muted}>
          This screen is available to teacher and administrator accounts.
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
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.eyebrow}>ATTENDANCE MANAGEMENT</Text>
          <Text style={styles.heading}>Attendance Records</Text>
<Text style={styles.muted}>
  {role === 'admin'
    ? 'View, correct, and manage attendance records.'
    : 'View and monitor attendance records for available events.'}
</Text>
        </View>

        <Pressable
          style={styles.iconButton}
          onPress={() => void loadRecords()}
          disabled={working}
          accessibilityRole="button"
          accessibilityLabel="Refresh attendance records"
        >
          <Ionicons
            name="refresh-outline"
            size={20}
            color={COLORS.primary}
          />
        </Pressable>
      </View>

      <View style={styles.summaryGrid}>
        <SummaryCard label="Records" value={summary.total} />
        <SummaryCard label="Present" value={summary.present} />
        <SummaryCard label="Absent" value={summary.absent} />
        <SummaryCard label="Late" value={summary.late} />
        <SummaryCard label="Students" value={summary.students} />
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>Search and filters</Text>

        <TextInput
          style={styles.input}
          placeholder="Search student, email, ID, or event"
          placeholderTextColor="#94a3b8"
          value={search}
          onChangeText={setSearch}
        />

        <Text style={styles.fieldLabel}>Event</Text>

        <View style={styles.chipWrap}>
          <Chip
            label="All events"
            active={eventFilter === 'all'}
            onPress={() => setEventFilter('all')}
          />

          {events.map((event) => (
            <Chip
              key={event.id}
              label={event.title}
              active={eventFilter === event.id}
              onPress={() => setEventFilter(event.id)}
            />
          ))}
        </View>

        <Text style={styles.fieldLabel}>Status</Text>

        <View style={styles.chipWrap}>
          {['all', ...STATUSES].map((status) => (
            <Chip
              key={status}
              label={status === 'all' ? 'All statuses' : status}
              active={statusFilter === status}
              onPress={() => setStatusFilter(status)}
            />
          ))}
        </View>

        <Text style={styles.fieldLabel}>Date range</Text>

        <View style={styles.dateRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.smallLabel}>From</Text>
            <Pressable
              style={styles.datePickerButton}
              onPress={() => setShowStartCalendar(true)}
            >
              <Ionicons
                name="calendar-outline"
                size={20}
                color="#2563eb"
              />
              <Text style={styles.datePickerText}>
                {startDate || 'Select start date'}
              </Text>
            </Pressable>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={styles.smallLabel}>To</Text>
            <Pressable
              style={styles.datePickerButton}
              onPress={() => setShowEndCalendar(true)}
            >
              <Ionicons
                name="calendar-outline"
                size={20}
                color="#2563eb"
              />
              <Text style={styles.datePickerText}>
                {endDate || 'Select end date'}
              </Text>
            </Pressable>
          </View>
        </View>

        {startDate !== '' && (
          <Pressable onPress={() => setStartDate('')}>
            <Text style={styles.linkText}>Clear start date</Text>
          </Pressable>
        )}

        {endDate !== '' && (
          <Pressable onPress={() => setEndDate('')}>
            <Text style={styles.linkText}>Clear end date</Text>
          </Pressable>
        )}

        <CalendarModal
          visible={showStartCalendar}
          selectedDate={startDate}
          title="Select start date"
          onClose={() => setShowStartCalendar(false)}
          onSelect={(date) => {
            setStartDate(date);
            setShowStartCalendar(false);
          }}
        />

        <CalendarModal
          visible={showEndCalendar}
          selectedDate={endDate}
          title="Select end date"
          onClose={() => setShowEndCalendar(false)}
          onSelect={(date) => {
            setEndDate(date);
            setShowEndCalendar(false);
          }}
        />

        <View style={styles.actionRow}>
          <ActionButton
            label="Clear filters"
            icon="close-circle-outline"
            variant="secondary"
            onPress={clearFilters}
          />
          <ActionButton
            label="Export CSV"
            icon="download-outline"
            onPress={() => void exportCsv()}
          />
        </View>
      </View>

      <View style={styles.panel}>
        <View style={styles.listHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Records</Text>
            <Text style={styles.muted}>
              Showing {filteredRecords.length} of {manageableRecords.length}
            </Text>
          </View>

{role === 'admin' && (
          <Pressable
            style={styles.selectAll}
            onPress={toggleSelectFiltered}
          >
            <Ionicons
              name={
                filteredRecords.length > 0 &&
                filteredRecords.every((record) =>
                  selectedIds.includes(record.id),
                )
                  ? 'checkbox'
                  : 'square-outline'
              }
              size={19}
              color="#2563eb"
            />
            <Text style={styles.linkText}>Select filtered</Text>
          </Pressable>
)}
        </View>

        {selectedIds.length > 0 && (
          <View style={styles.bulkPanel}>
            <Text style={styles.fieldLabel}>
              {getSelectedManageableIds().length} selected
            </Text>

            <View style={styles.chipWrap}>
              {STATUSES.map((status) => (
                <Chip
                  key={status}
                  label={status}
                  active={bulkStatus === status}
                  onPress={() => setBulkStatus(status)}
                />
              ))}
            </View>

            <View style={styles.actionRow}>
              <ActionButton
                label="Apply status"
                icon="checkmark-circle-outline"
                onPress={() => void changeSelectedStatus()}
                disabled={working}
              />
              <ActionButton
                label="Delete selected"
                icon="trash-outline"
                variant="danger"
                onPress={() => void deleteSelected()}
                disabled={working}
              />
            </View>
          </View>
        )}

        {filteredRecords.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons
              name="file-tray-outline"
              size={38}
              color="#94a3b8"
            />
            <Text style={styles.emptyTitle}>
              No attendance records found
            </Text>
            <Text style={styles.muted}>
              Try changing the search or filters.
            </Text>
          </View>
        ) : (
          filteredRecords.map((record) => {
            const selected = selectedIds.includes(record.id);

            return (
              <View key={record.id} style={styles.record}>
{role === 'admin' && (
  <Pressable
    style={styles.checkbox}
    onPress={() => toggleSelected(record.id)}
    accessibilityRole="checkbox"
    accessibilityState={{ checked: selected }}
  >
    <Ionicons
      name={selected ? 'checkbox' : 'square-outline'}
      size={23}
      color={selected ? '#2563eb' : '#64748b'}
    />
  </Pressable>
)}

                <View style={{ flex: 1 }}>
                  <View style={styles.recordTop}>
                    <Text style={styles.recordName}>
                      {record.student_name}
                    </Text>
                    <StatusBadge status={record.status} />
                  </View>

                  {record.student_email ? (
                    <Text style={styles.recordDetail}>
                      Email: {record.student_email}
                    </Text>
                  ) : null}

                  <Text style={styles.recordDetail}>
                    Student ID: {record.student_id || '—'}
                  </Text>
                  <Text style={styles.recordDetail}>
                    Event: {record.event_title}
                  </Text>
                  <Text style={styles.recordDetail}>
                    Code: {record.event_code || '—'}
                  </Text>
                  <Text style={styles.recordDetail}>
                    Scanned: {formatDate(record.scanned_at)}
                  </Text>

                  <Text style={styles.recordId}>
                    Record ID: {record.id}
                  </Text>

                  {role === 'admin' && (
                    <View style={styles.actionRow}>
                      <ActionButton
                        label="Edit"
                        icon="create-outline"
                        variant="secondary"
                        onPress={() => openEditor(record)}
                        disabled={working}
                      />
                      <ActionButton
                        label="Delete"
                        icon="trash-outline"
                        variant="danger"
                        onPress={() => void deleteOne(record)}
                        disabled={working}
                      />
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}
      </View>

      {role === 'admin' && (
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Event IDs for editing</Text>
          <Text style={styles.muted}>
            Use the matching event ID when correcting an attendance record.
          </Text>

          {events.length === 0 ? (
            <Text style={styles.muted}>No events available.</Text>
          ) : (
            events.map((event) => (
              <View key={event.id} style={styles.eventRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.recordName}>{event.title}</Text>
                  <Text style={styles.recordDetail}>
                    Event code: {event.event_code}
                  </Text>
                  <Text style={styles.recordId}>{event.id}</Text>
                </View>

                <Pressable
                  style={styles.copyButton}
                  onPress={() => showMessage('Event ID', event.id)}
                >
                  <Ionicons
                    name="information-circle-outline"
                    size={18}
                    color="#1d4ed8"
                  />
                </Pressable>
              </View>
            ))
          )}
        </View>
      )}

      <Modal
        visible={Boolean(editing)}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!working) setEditing(null);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>
                Correct attendance record
              </Text>

              <Text style={styles.muted}>
                Save a correction to update the attendance record.
              </Text>

              <Text style={styles.fieldLabel}>Student ID</Text>
              <TextInput
                style={styles.input}
                value={editStudentId}
                onChangeText={setEditStudentId}
                autoCapitalize="none"
                placeholder="Enter student profile ID"
                placeholderTextColor="#94a3b8"
              />

              <Text style={styles.fieldLabel}>Event ID</Text>
              <TextInput
                style={styles.input}
                value={editEventId}
                onChangeText={setEditEventId}
                autoCapitalize="none"
                placeholder="Enter event ID"
                placeholderTextColor="#94a3b8"
              />

              <Text style={styles.fieldLabel}>
                Scanned at (ISO date/time)
              </Text>
              <TextInput
                style={styles.input}
                value={editScannedAt}
                onChangeText={setEditScannedAt}
                autoCapitalize="none"
                placeholder="2026-10-15T09:30:00+08:00"
                placeholderTextColor="#94a3b8"
              />

              <Text style={styles.fieldLabel}>Status</Text>
              <View style={styles.chipWrap}>
                {STATUSES.map((status) => (
                  <Chip
                    key={status}
                    label={status}
                    active={editStatus === status}
                    onPress={() => setEditStatus(status)}
                  />
                ))}
              </View>

              <View style={styles.actionRow}>
                <ActionButton
                  label="Cancel"
                  icon="close-outline"
                  variant="secondary"
                  onPress={() => setEditing(null)}
                  disabled={working}
                />
                <ActionButton
                  label={working ? 'Saving...' : 'Save correction'}
                  icon="save-outline"
                  onPress={() => void saveEdit()}
                  disabled={working}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {working && (
        <View style={styles.working}>
          <ActivityIndicator color="#ffffff" />
          <Text style={styles.workingText}>Processing...</Text>
        </View>
      )}
    </ScrollView>
  );
}

function CalendarModal({
  visible,
  selectedDate,
  title,
  onClose,
  onSelect,
}: {
  visible: boolean;
  selectedDate: string;
  title: string;
  onClose: () => void;
  onSelect: (date: string) => void;
}) {
  const [displayMonth, setDisplayMonth] = useState(() => {
    const initialDate = selectedDate
      ? new Date(`${selectedDate}T12:00:00`)
      : new Date();

    return new Date(
      initialDate.getFullYear(),
      initialDate.getMonth(),
      1,
    );
  });

  useEffect(() => {
    if (visible) {
      const date = selectedDate
        ? new Date(`${selectedDate}T12:00:00`)
        : new Date();

      setDisplayMonth(
        new Date(date.getFullYear(), date.getMonth(), 1),
      );
    }
  }, [visible, selectedDate]);

  const year = displayMonth.getFullYear();
  const month = displayMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const days: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];

  while (days.length % 7 !== 0) days.push(null);

  function formatCalendarDate(
    yearValue: number,
    monthValue: number,
    day: number,
  ) {
    return `${yearValue}-${String(monthValue + 1).padStart(2, '0')}-${String(
      day,
    ).padStart(2, '0')}`;
  }

  const now = new Date();
  const today = formatCalendarDate(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.calendarBackdrop}>
        <View style={styles.calendarCard}>
          <View style={styles.calendarHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.calendarTitle}>{title}</Text>
              <Text style={styles.muted}>
                Choose a day from the calendar
              </Text>
            </View>

            <Pressable
              onPress={onClose}
              style={styles.calendarClose}
            >
              <Ionicons name="close" size={23} color="#475569" />
            </Pressable>
          </View>

          <View style={styles.monthHeader}>
            <Pressable
              onPress={() =>
                setDisplayMonth(new Date(year, month - 1, 1))
              }
              style={styles.monthButton}
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color="#1d4ed8"
              />
            </Pressable>

            <Text style={styles.monthTitle}>
              {displayMonth.toLocaleDateString(undefined, {
                month: 'long',
                year: 'numeric',
              })}
            </Text>

            <Pressable
              onPress={() =>
                setDisplayMonth(new Date(year, month + 1, 1))
              }
              style={styles.monthButton}
            >
              <Ionicons
                name="chevron-forward"
                size={20}
                color="#1d4ed8"
              />
            </Pressable>
          </View>

          <View style={styles.calendarGrid}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(
              (dayName) => (
                <View key={dayName} style={styles.calendarCell}>
                  <Text style={styles.weekdayText}>{dayName}</Text>
                </View>
              ),
            )}

            {days.map((day, index) => {
              if (day === null) {
                return (
                  <View
                    key={`empty-${index}`}
                    style={styles.calendarCell}
                  />
                );
              }

              const dateString = formatCalendarDate(year, month, day);
              const isSelected = dateString === selectedDate;
              const isToday = dateString === today;

              return (
                <Pressable
                  key={dateString}
                  style={[
                    styles.calendarCell,
                    styles.calendarDay,
                    isSelected && styles.calendarDaySelected,
                    !isSelected && isToday && styles.calendarDayToday,
                  ]}
                  onPress={() => onSelect(dateString)}
                >
                  <Text
                    style={[
                      styles.calendarDayText,
                      isSelected && styles.calendarDayTextSelected,
                      !isSelected && isToday && styles.calendarTodayText,
                    ]}
                  >
                    {day}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.calendarFooter}>
            <Pressable
              style={styles.todayButton}
              onPress={() => onSelect(today)}
            >
              <Text style={styles.todayButtonText}>Today</Text>
            </Pressable>

            <Pressable
              style={styles.cancelCalendarButton}
              onPress={onClose}
            >
              <Text style={styles.cancelCalendarText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function Chip({
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
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ActionButton({
  label,
  icon,
  onPress,
  variant = 'primary',
  disabled = false,
}: {
  label: string;
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  const iconColor =
    variant === 'primary'
      ? '#ffffff'
      : variant === 'danger'
        ? '#b91c1c'
        : '#1d4ed8';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.actionButton,
        variant === 'primary' && styles.primaryButton,
        variant === 'secondary' && styles.secondaryButton,
        variant === 'danger' && styles.dangerButton,
        disabled && styles.disabledButton,
      ]}
    >
      <Ionicons name={icon} size={17} color={iconColor} />
      <Text
        style={[
          styles.actionButtonText,
          variant === 'primary' && styles.primaryButtonText,
          variant === 'danger' && styles.dangerButtonText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();

  const color =
    normalized === 'present'
      ? '#15803d'
      : normalized === 'late'
        ? '#b45309'
        : normalized === 'absent'
          ? '#b91c1c'
          : '#475569';

  return (
    <View
      style={[
        styles.statusBadge,
        { backgroundColor: `${color}18` },
      ]}
    >
      <Text style={[styles.statusText, { color }]}>{status}</Text>
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
    gap: 14,
  },
  center: {
    flex: 1,
    minHeight: 300,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 24,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 6,
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  eyebrow: {
    color: COLORS.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  heading: {
    fontSize: 27,
    fontWeight: '800',
    color: '#0F172A',
  },
  muted: {
    fontSize: 13,
    lineHeight: 19,
    color: '#64748B',
    marginTop: 4,
  },
  iconButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 11,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  summaryCard: {
    flexGrow: 1,
    flexBasis: 130,
    minWidth: 0,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
  },
  summaryValue: {
    fontSize: 23,
    fontWeight: '800',
    color: COLORS.primary,
  },
  summaryLabel: {
    marginTop: 4,
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
  },
  panel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 15,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#0f172a',
    fontSize: 14,
    minWidth: 0,
  },
  fieldLabel: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
  },
  smallLabel: {
    color: '#64748b',
    fontSize: 11,
    marginBottom: 5,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    maxWidth: '100%',
  },
chipActive: {
  backgroundColor: COLORS.primary,
  borderColor: COLORS.primary,
},
  chipText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 10,
  },
datePickerButton: {
  minHeight: 46,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  paddingHorizontal: 10,
  paddingVertical: 10,
  borderWidth: 1,
  borderColor: COLORS.primary,
  borderRadius: 10,
  backgroundColor: '#EFF6FF',
},
  datePickerText: {
    flex: 1,
    flexWrap: 'wrap',
    color: '#1e293b',
    fontSize: 12,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
primaryButton: {
  backgroundColor: COLORS.primary,
},

secondaryButton: {
  backgroundColor: '#EFF6FF',
  borderColor: '#BFDBFE',
},
  dangerButton: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  disabledButton: {
    opacity: 0.5,
  },
actionButtonText: {
  color: COLORS.primary,
  fontSize: 12,
  fontWeight: '700',
},
  primaryButtonText: {
    color: '#ffffff',
  },
  dangerButtonText: {
    color: '#b91c1c',
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  selectAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
linkText: {
  color: COLORS.primary,
  fontSize: 12,
  fontWeight: '700',
},

bulkPanel: {
  backgroundColor: '#EFF6FF',
  borderColor: '#BFDBFE',
  borderWidth: 1,
  borderRadius: 12,
  padding: 12,
  gap: 8,
},
  record: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  checkbox: {
    paddingTop: 2,
  },
  recordTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  recordName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  recordDetail: {
    color: '#475569',
    fontSize: 12,
    marginTop: 4,
  },
  recordId: {
    color: '#94a3b8',
    fontSize: 10,
    marginTop: 4,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  empty: {
    alignItems: 'center',
    padding: 28,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#334155',
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  copyButton: {
    padding: 8,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    maxHeight: '90%',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    gap: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
  },
  working: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    backgroundColor: '#1e293b',
    borderRadius: 12,
  },
  workingText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  calendarBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  calendarCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    gap: 16,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  calendarTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0f172a',
  },
  calendarClose: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDaySelected: {
  backgroundColor: COLORS.primary,
  borderColor: COLORS.primary,
},

calendarTodayText: {
  color: COLORS.primary,
  fontWeight: '800',
},
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
monthButton: {
  width: 38,
  height: 38,
  borderRadius: 10,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#EFF6FF',
},
  monthTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarCell: {
    width: `${100 / 7}%`,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
  },
  calendarDay: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  calendarDayToday: {
    borderColor: '#60a5fa',
    backgroundColor: '#eff6ff',
  },
  calendarDayText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  calendarDayTextSelected: {
    color: '#ffffff',
    fontWeight: '800',
  },
  calendarFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  todayButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#dbeafe',
  },
  todayButtonText: {
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '800',
  },
  cancelCalendarButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
  },
  cancelCalendarText: {
    color: '#1d4ed8',
    fontSize: 13,
    fontWeight: '700',
  },
});
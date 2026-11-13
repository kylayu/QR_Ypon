import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import {
  closeEvent,
  createEvent,
  getAllEvents,
  updateEvent,
  type CloudEvent,
  type EventStatus,
} from '@/lib/events';
import { getProfile, type Role } from '@/lib/profiles';
import { buildQRPayload } from '@/lib/qr';

import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import QRCode from 'react-native-qrcode-svg';

const STATUS_OPTIONS: EventStatus[] = ['Upcoming', 'Ongoing'];

function statusColor(status: EventStatus): string {
  if (status === 'Closed') return COLORS.danger;
  if (status === 'Ongoing') return COLORS.success;
  return COLORS.primary;
}

function statusBackground(status: EventStatus): string {
  if (status === 'Closed') return '#FCE8E6';
  if (status === 'Ongoing') return '#E4F5EC';
  return '#E5F0FF';
}

function datePart(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not specified';
  return date.toLocaleDateString('en-CA');
}

function timePart(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not specified';

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function combineDateAndTime(date: Date, time: Date): string {
  const result = new Date(date);
  result.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return result.toISOString();
}

function formatDateForInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTimeForInput(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function handleWebDateChange(
  value: string,
  setDate: React.Dispatch<React.SetStateAction<Date>>,
) {
  if (!value) return;

  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return;

  setDate((previous) => {
    const updated = new Date(previous);
    updated.setFullYear(year, month - 1, day);
    return updated;
  });
}

function handleWebTimeChange(
  value: string,
  setTime: React.Dispatch<React.SetStateAction<Date>>,
) {
  if (!value) return;

  const [hours, minutes] = value.split(':').map(Number);

  if (
    hours === undefined ||
    minutes === undefined ||
    Number.isNaN(hours) ||
    Number.isNaN(minutes)
  ) {
    return;
  }

  setTime((previous) => {
    const updated = new Date(previous);
    updated.setHours(hours, minutes, 0, 0);
    return updated;
  });
}

export default function TeacherScreen() {
  const { user } = useAuth();
  const scrollViewRef = useRef<ScrollView>(null);

  const [role, setRole] = useState<Role | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  const [events, setEvents] = useState<CloudEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [formVisible, setFormVisible] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CloudEvent | null>(null);
  const [saving, setSaving] = useState(false);

  const [eventCode, setEventCode] = useState('');
  const [title, setTitle] = useState('');
  const [venue, setVenue] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<EventStatus>('Upcoming');

  const [startDate, setStartDate] = useState(() => new Date());
  const [endDate, setEndDate] = useState(() => new Date());

  const [startTime, setStartTime] = useState(() => {
    const date = new Date();
    date.setHours(date.getHours() + 1, 0, 0, 0);
    return date;
  });

  const [endTime, setEndTime] = useState(() => {
    const date = new Date();
    date.setHours(date.getHours() + 2, 0, 0, 0);
    return date;
  });

  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  const [qrPayload, setQrPayload] = useState<string | null>(null);
const [qrEventTitle, setQrEventTitle] = useState('');

const closeQRModal = useCallback(() => {
  setQrPayload(null);
  setQrEventTitle('');
}, []);
  // All events visible to a logged-in teacher can be managed from this screen.
  // Supabase RLS must authorize the corresponding database operations too.
  const canManageEvent = useCallback(
    (event: CloudEvent) =>
      role === 'teacher' && Boolean(user?.id && event.id),
    [role, user?.id],
  );

  // Fetch all events permitted by Supabase RLS.
  // Do not filter by created_by, because Admin-created events and events
  // created by other teachers should also appear here.
  const loadEvents = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);

    try {
      const result = await getAllEvents();


const visibleEvents = [...(result ?? [])].sort(
  (a, b) =>
    new Date(b.created_at ?? 0).getTime() -
    new Date(a.created_at ?? 0).getTime(),
);

setEvents(visibleEvents);

    } catch (error) {
      console.error('Failed to load events in Manage:', error);

      Alert.alert(
        'Unable to load events',
        error instanceof Error
          ? error.message
          : 'Please check your connection and try again.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      async function loadRole() {
        setRoleLoading(true);

        try {
          if (!user?.id) {
            if (active) setRole(null);
            return;
          }

          const profile = await getProfile(user.id);

          if (active) {
            setRole(profile?.role ?? null);
          }
        } catch (error) {
          console.error('Failed to load profile:', error);
          if (active) setRole(null);
        } finally {
          if (active) setRoleLoading(false);
        }
      }

      void loadRole();
      void loadEvents();

      return () => {
        active = false;
      };
    }, [user?.id, loadEvents]),
  );

  useEffect(() => {
    if (formVisible) {
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    }
  }, [formVisible]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadEvents(false);
  }, [loadEvents]);

  function resetForm() {
    const now = new Date();

    const defaultStart = new Date(now);
    defaultStart.setHours(now.getHours() + 1, 0, 0, 0);

    const defaultEnd = new Date(defaultStart);
    defaultEnd.setHours(defaultStart.getHours() + 1);

    setEventCode('');
    setTitle('');
    setVenue('');
    setDescription('');
    setStatus('Upcoming');

    setStartDate(defaultStart);
    setEndDate(defaultStart);
    setStartTime(defaultStart);
    setEndTime(defaultEnd);

    setEditingEvent(null);
    setFormVisible(false);

    setShowStartDatePicker(false);
    setShowEndDatePicker(false);
    setShowStartTimePicker(false);
    setShowEndTimePicker(false);
  }

  function startCreating() {
    if (role !== 'teacher' || !user?.id) {
      Alert.alert(
        'Permission denied',
        'Only logged-in teacher accounts can create events here.',
      );
      return;
    }

    resetForm();
    setFormVisible(true);
  }

  function startEditing(event: CloudEvent) {
    if (!canManageEvent(event)) {
      Alert.alert(
        'Permission denied',
        'Only logged-in teachers can manage events on this screen.',
      );
      return;
    }

    const start = new Date(event.start_time);
    const end = new Date(event.end_time);

    setEditingEvent(event);
    setEventCode(event.event_code ?? '');
    setTitle(event.title ?? '');
    setVenue(event.venue ?? '');
    setDescription(event.description ?? '');
    setStatus(event.status ?? 'Upcoming');

    setStartDate(start);
    setEndDate(end);
    setStartTime(start);
    setEndTime(end);

    setQrPayload(null);
    setFormVisible(true);
  }

function generateQR(event: CloudEvent) {
  if (!canManageEvent(event)) {
    Alert.alert(
      'Permission denied',
      'Only logged-in teachers can generate event QR codes here.',
    );
    return;
  }

  const payload = buildQRPayload({
    eventId: event.event_code,
    title: event.title,
    start: event.start_time,
    end: event.end_time,
  });

  setQrEventTitle(event.title);
  setQrPayload(payload);
}

  function handleStartDateChange(
    _event: DateTimePickerEvent,
    selectedDate?: Date,
  ) {
    setShowStartDatePicker(Platform.OS === 'ios');
    if (selectedDate) setStartDate(selectedDate);
  }

  function handleEndDateChange(
    _event: DateTimePickerEvent,
    selectedDate?: Date,
  ) {
    setShowEndDatePicker(Platform.OS === 'ios');
    if (selectedDate) setEndDate(selectedDate);
  }

  function handleStartTimeChange(
    _event: DateTimePickerEvent,
    selectedTime?: Date,
  ) {
    setShowStartTimePicker(Platform.OS === 'ios');
    if (selectedTime) setStartTime(selectedTime);
  }

  function handleEndTimeChange(
    _event: DateTimePickerEvent,
    selectedTime?: Date,
  ) {
    setShowEndTimePicker(Platform.OS === 'ios');
    if (selectedTime) setEndTime(selectedTime);
  }

  async function handleSave() {
    if (!user?.id || role !== 'teacher') {
      Alert.alert(
        'Permission denied',
        'Only teacher accounts can manage events here.',
      );
      return;
    }

    if (editingEvent && !canManageEvent(editingEvent)) {
      Alert.alert(
        'Permission denied',
        'You do not have permission to edit this event.',
      );
      return;
    }

    const cleanCode = eventCode.trim();
    const cleanTitle = title.trim();

    if (!cleanCode || !cleanTitle) {
      Alert.alert(
        'Missing details',
        'Please enter both the event code and event title.',
      );
      return;
    }

    if (!venue.trim()) {
      Alert.alert('Missing venue', 'Please enter the event venue.');
      return;
    }

    const startDateTime = combineDateAndTime(startDate, startTime);
    const endDateTime = combineDateAndTime(endDate, endTime);

    if (
      new Date(endDateTime).getTime() <=
      new Date(startDateTime).getTime()
    ) {
      Alert.alert(
        'Invalid event time',
        'The end date and time must be after the start date and time.',
      );
      return;
    }

    setSaving(true);

    try {
      if (editingEvent) {
        const result = await updateEvent(editingEvent.id, {
          event_code: cleanCode,
          title: cleanTitle,
          venue: venue.trim(),
          description: description.trim(),
          status,
          start_time: startDateTime,
          end_time: endDateTime,
        });

        if (result.error) {
          Alert.alert(
            'Unable to update event',
            result.error,
          );
          return;
        }

        Alert.alert('Success', 'Event updated successfully.');
      } else {
        const result = await createEvent({
          eventId: cleanCode,
          title: cleanTitle,
          venue: venue.trim(),
          description: description.trim(),
          status,
          start: startDateTime,
          end: endDateTime,
        });

        if (result.error) {
          Alert.alert(
            'Unable to create event',
            result.error,
          );
          return;
        }

        Alert.alert('Success', 'Event created successfully.');
      }

      setQrPayload(null);
      resetForm();
      await loadEvents(false);
    } catch (error) {
      console.error('Failed to save event:', error);

      Alert.alert(
        'Unable to save event',
        error instanceof Error
          ? error.message
          : 'Please verify your event details and try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function performClose(event: CloudEvent) {
    if (!canManageEvent(event)) {
      Alert.alert(
        'Permission denied',
        'Only logged-in teachers can close events here.',
      );
      return;
    }

    try {
      const result = await closeEvent(event.id);

      if (result.error) {
        Alert.alert('Unable to close event', result.error);
        return;
      }

      setEvents((current) =>
        current.map((item) =>
          item.id === event.id
            ? { ...item, status: 'Closed' }
            : item,
        ),
      );

      Alert.alert(
        'Event closed',
        `"${event.title}" has been closed. Attendance history has not been deleted.`,
      );
    } catch (error) {
      Alert.alert(
        'Unable to close event',
        error instanceof Error
          ? error.message
          : 'Please try again.',
      );
    }
  }

  function handleClose(event: CloudEvent) {
    if (!canManageEvent(event)) {
      Alert.alert(
        'Permission denied',
        'Only logged-in teachers can close events here.',
      );
      return;
    }

    if (event.status === 'Closed') {
      Alert.alert('Already closed', 'This event is already closed.');
      return;
    }

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        const confirmed = window.confirm(
          `Are you sure you want to close "${event.title}"?`,
        );

        if (confirmed) void performClose(event);
      }
      return;
    }

    Alert.alert(
      'Close event',
      `Are you sure you want to close "${event.title}"? Attendance history will be preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close Event',
          style: 'destructive',
          onPress: () => void performClose(event),
        },
      ],
    );
  }

  function renderDateTimePicker(
    visible: boolean,
    value: Date,
    mode: 'date' | 'time',
    onChange: (event: DateTimePickerEvent, date?: Date) => void,
  ) {
    if (!visible || Platform.OS === 'web') return null;

    return (
      <DateTimePicker
        value={value}
        mode={mode}
        display={Platform.OS === 'ios' ? 'spinner' : 'default'}
        onChange={onChange}
      />
    );
  }

  function renderWebDateInput(
    label: string,
    value: Date,
    onChange: (value: string) => void,
  ) {
    return (
      <View style={styles.pickerField}>
        <Ionicons
          name="calendar-outline"
          size={19}
          color={COLORS.primary}
        />

        {React.createElement('input', {
          type: 'date',
          value: formatDateForInput(value),
          onChange: (event: { target: { value: string } }) =>
            onChange(event.target.value),
          'aria-label': label,
          style: {
            flex: 1,
            minWidth: 0,
            width: '100%',
            border: 'none',
            outline: 'none',
            backgroundColor: 'transparent',
            color: COLORS.textPrimary,
            fontSize: 14,
            fontFamily: 'inherit',
          },
        })}
      </View>
    );
  }

  function renderWebTimeInput(
    label: string,
    value: Date,
    onChange: (value: string) => void,
  ) {
    return (
      <View style={styles.pickerField}>
        <Ionicons
          name="time-outline"
          size={19}
          color={COLORS.primary}
        />

        {React.createElement('input', {
          type: 'time',
          value: formatTimeForInput(value),
          onChange: (event: { target: { value: string } }) =>
            onChange(event.target.value),
          'aria-label': label,
          style: {
            flex: 1,
            minWidth: 0,
            width: '100%',
            border: 'none',
            outline: 'none',
            backgroundColor: 'transparent',
            color: COLORS.textPrimary,
            fontSize: 14,
            fontFamily: 'inherit',
          },
        })}
      </View>
    );
  }

  function renderDateField(
    label: string,
    value: Date,
    visible: boolean,
    setVisible: (visible: boolean) => void,
    onChange: (event: DateTimePickerEvent, date?: Date) => void,
    setDate: React.Dispatch<React.SetStateAction<Date>>,
  ) {
    return (
      <>
        <Text style={styles.label}>{label}</Text>

        {Platform.OS === 'web' ? (
          renderWebDateInput(label, value, (nextValue) =>
            handleWebDateChange(nextValue, setDate),
          )
        ) : (
          <>
            <Pressable
              onPress={() => setVisible(true)}
              style={styles.pickerField}
            >
              <Ionicons
                name="calendar-outline"
                size={19}
                color={COLORS.primary}
              />
              <Text style={styles.pickerValue}>
                {formatDateForInput(value)}
              </Text>
              <Ionicons
                name="chevron-down"
                size={18}
                color={COLORS.textSecondary}
              />
            </Pressable>

            {renderDateTimePicker(visible, value, 'date', onChange)}
          </>
        )}
      </>
    );
  }

  function renderTimeField(
    label: string,
    value: Date,
    visible: boolean,
    setVisible: (visible: boolean) => void,
    onChange: (event: DateTimePickerEvent, date?: Date) => void,
    setTime: React.Dispatch<React.SetStateAction<Date>>,
  ) {
    return (
      <>
        <Text style={styles.label}>{label}</Text>

        {Platform.OS === 'web' ? (
          renderWebTimeInput(label, value, (nextValue) =>
            handleWebTimeChange(nextValue, setTime),
          )
        ) : (
          <>
            <Pressable
              onPress={() => setVisible(true)}
              style={styles.pickerField}
            >
              <Ionicons
                name="time-outline"
                size={19}
                color={COLORS.primary}
              />
              <Text style={styles.pickerValue}>
                {formatTimeForInput(value)}
              </Text>
              <Ionicons
                name="chevron-down"
                size={18}
                color={COLORS.textSecondary}
              />
            </Pressable>

            {renderDateTimePicker(visible, value, 'time', onChange)}
          </>
        )}
      </>
    );
  }

  function renderEventDetail(label: string, value: string) {
    return (
      <View style={styles.eventDetailRow}>
        <Text style={styles.eventDetailLabel}>{label}</Text>
        <Text style={styles.eventDetailValue}>{value}</Text>
      </View>
    );
  }

  if (roleLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.stateText}>Checking your account...</Text>
      </View>
    );
  }

  if (role !== 'teacher') {
    return (
      <View style={styles.center}>
        <Ionicons
          name="lock-closed-outline"
          size={38}
          color={COLORS.textSecondary}
        />
        <Text style={styles.heading}>Teachers Only</Text>
        <Text style={styles.stateText}>
          Only teacher accounts can access this Manage screen.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scrollViewRef}
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
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.pageHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heading}>Manage</Text>
            <Text style={styles.pageSubtitle}>
              View events created by Admin and teachers. Teachers can edit,
              close, and generate QR codes for all available events.
            </Text>
          </View>
        </View>

        {formVisible && (
          <View style={styles.formCard}>
            <View style={styles.formHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.formTitle}>
                  {editingEvent ? 'Edit Event' : 'Create Event'}
                </Text>
                <Text style={styles.formSubtitle}>
                  Enter the event details below.
                </Text>
              </View>

              <Pressable onPress={resetForm} style={styles.iconButton}>
                <Ionicons
                  name="close"
                  size={22}
                  color={COLORS.textSecondary}
                />
              </Pressable>
            </View>

            <Text style={styles.label}>Event Title *</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter event title"
              placeholderTextColor={COLORS.textSecondary}
              value={title}
              onChangeText={setTitle}
              maxLength={150}
            />


<Text style={styles.label}>Event Code *</Text>
<TextInput
  style={styles.input}
  placeholder="e.g. EVT-2026-0001"
  placeholderTextColor={COLORS.textSecondary}
  value={eventCode}
  onChangeText={(value) =>
    setEventCode(value.toUpperCase().replace(/\s/g, ''))
  }
  autoCapitalize="characters"
  autoCorrect={false}
  maxLength={100}
/>


            <Text style={styles.label}>Venue *</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter event venue"
              placeholderTextColor={COLORS.textSecondary}
              value={venue}
              onChangeText={setVenue}
              maxLength={200}
            />

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="Enter event description (optional)"
              placeholderTextColor={COLORS.textSecondary}
              value={description}
              onChangeText={setDescription}
              multiline
              textAlignVertical="top"
              maxLength={2000}
            />

            {renderDateField(
              'Start Date',
              startDate,
              showStartDatePicker,
              setShowStartDatePicker,
              handleStartDateChange,
              setStartDate,
            )}

            {renderTimeField(
              'Start Time',
              startTime,
              showStartTimePicker,
              setShowStartTimePicker,
              handleStartTimeChange,
              setStartTime,
            )}

            {renderDateField(
              'End Date',
              endDate,
              showEndDatePicker,
              setShowEndDatePicker,
              handleEndDateChange,
              setEndDate,
            )}

            {renderTimeField(
              'End Time',
              endTime,
              showEndTimePicker,
              setShowEndTimePicker,
              handleEndTimeChange,
              setEndTime,
            )}

            <Text style={styles.label}>Event Status</Text>
            <View style={styles.statusRow}>
              {STATUS_OPTIONS.map((option) => {
                const selected = status === option;

                return (
                  <Pressable
                    key={option}
                    onPress={() => setStatus(option)}
                    style={[
                      styles.statusOption,
                      selected && {
                        backgroundColor: statusBackground(option),
                        borderColor: statusColor(option),
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusOptionText,
                        selected && { color: statusColor(option) },
                      ]}
                    >
                      {option}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.formActions}>
              <Pressable
                onPress={resetForm}
                disabled={saving}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>

              <Pressable
                onPress={() => void handleSave()}
                disabled={saving}
                style={[
                  styles.saveButton,
                  saving && styles.disabledButton,
                ]}
              >
                {saving ? (
                  <ActivityIndicator
                    color={COLORS.textOnPrimary}
                    size="small"
                  />
                ) : (
                  <>
                    <Ionicons
                      name="checkmark"
                      size={19}
                      color={COLORS.textOnPrimary}
                    />
                    <Text style={styles.saveButtonText}>
                      {editingEvent ? 'Save Changes' : 'Create Event'}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        )}

        {!formVisible && (
          <>
            <View style={styles.listHeader}>
              <Text style={styles.sectionTitle}>Events</Text>
              <Text style={styles.eventCount}>
                {events.length} {events.length === 1 ? 'event' : 'events'}
              </Text>
            </View>

            {loading ? (
              <View style={styles.stateCard}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={styles.stateText}>Loading events...</Text>
              </View>
            ) : events.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons
                    name="calendar-outline"
                    size={30}
                    color={COLORS.primary}
                  />
                </View>

                <Text style={styles.emptyTitle}>No events found</Text>
                <Text style={styles.emptyText}>
                  No events are available to display. If events created by
                  Admin are missing, check your Supabase events SELECT
                  policy. You can also create an event or pull down to
                  refresh.
                </Text>
              </View>
            ) : (
              events.map((event) => {
                const eventStatus = event.status ?? 'Upcoming';

                return (
                  <View key={event.id} style={styles.eventCard}>
                    <View style={styles.eventCardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.eventTitle}>
                          {event.title}
                        </Text>

                        <Text style={styles.eventCode}>
                          Code: {event.event_code || 'Not available'}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.eventStatusBadge,
                          {
                            backgroundColor:
                              statusBackground(eventStatus),
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.eventStatusText,
                            { color: statusColor(eventStatus) },
                          ]}
                        >
                          {eventStatus}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.eventDivider} />

                    {renderEventDetail(
                      'Date:',
                      datePart(event.start_time),
                    )}

                    {renderEventDetail(
                      'Time:',
                      `${timePart(event.start_time)} – ${timePart(event.end_time)}`,
                    )}

                    {renderEventDetail(
                      'Venue:',
                      event.venue?.trim() || 'Not specified',
                    )}

                    {renderEventDetail(
                      'Description:',
                      event.description?.trim() || 'Not specified',
                    )}

                    <View style={styles.eventDivider} />

                    {canManageEvent(event) ? (
                      <View style={styles.eventActions}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => startEditing(event)}
                          style={styles.actionButton}
                        >
                          <Ionicons
                            name="create-outline"
                            size={18}
                            color={COLORS.primary}
                          />
                          <Text style={styles.actionText}>Edit</Text>
                        </Pressable>

                        <Pressable
                          accessibilityRole="button"
                          onPress={() => generateQR(event)}
                          style={styles.actionButton}
                        >
                          <Ionicons
                            name="qr-code-outline"
                            size={18}
                            color={COLORS.primary}
                          />
                          <Text style={styles.actionText}>QR Code</Text>
                        </Pressable>

                        <Pressable
                          accessibilityRole="button"
                          disabled={eventStatus === 'Closed'}
                          onPress={() => handleClose(event)}
                          style={[
                            styles.actionButton,
                            eventStatus === 'Closed' &&
                              styles.disabledButton,
                          ]}
                        >
                          <Ionicons
                            name="close-circle-outline"
                            size={18}
                            color={COLORS.danger}
                          />
                          <Text style={styles.closeActionText}>
                            {eventStatus === 'Closed' ? 'Event Closed' : 'Close'}
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>

<Modal
  visible={qrPayload !== null}
  transparent
  animationType="fade"
  onRequestClose={closeQRModal}
>
  <View style={styles.qrModalOverlay}>
    <View style={styles.qrModalCard}>
      <Pressable
        style={styles.qrModalClose}
        onPress={closeQRModal}
        accessibilityRole="button"
        accessibilityLabel="Close QR code"
      >
        <Ionicons
          name="close"
          size={24}
          color={COLORS.textSecondary}
        />
      </Pressable>

      <Ionicons
        name="qr-code"
        size={32}
        color={COLORS.primary}
      />

      <Text style={styles.formTitle}>Event QR Code</Text>

      <Text style={styles.formSubtitle}>
        {qrEventTitle}
      </Text>

      {qrPayload !== null && (
        <View style={styles.qrContainer}>
          <QRCode
            value={qrPayload}
            size={220}
          />
        </View>
      )}

      <Text style={styles.qrHint}>
        Students can scan this QR code from the Scan tab.
      </Text>

      <Pressable
        style={styles.qrDoneButton}
        onPress={closeQRModal}
        accessibilityRole="button"
      >
        <Text style={styles.saveButtonText}>Done</Text>
      </Pressable>
    </View>
  </View>
      </Modal>
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
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
    gap: 12,
  },
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 22,
    gap: 12,
  },
  heading: {
    fontSize: 28,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: -0.5,
  },
  pageSubtitle: {
    marginTop: 5,
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  addButton: {
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
  },
  addButtonText: {
    color: COLORS.textOnPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  formCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 17,
    marginBottom: 24,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 10,
  },
  formTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  formSubtitle: {
    marginTop: 5,
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 13,
  },
  input: {
    minHeight: 48,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 12,
    color: COLORS.textPrimary,
    fontSize: 14,
  },
  multiline: {
    minHeight: 95,
    textAlignVertical: 'top',
  },
  helperText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: 6,
  },
  pickerField: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  pickerValue: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 14,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusOption: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  statusOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    marginTop: 24,
  },
  cancelButton: {
    minHeight: 45,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 15,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  cancelText: {
    color: COLORS.textPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  saveButton: {
    minHeight: 45,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 16,
    borderRadius: 11,
    backgroundColor: COLORS.primary,
  },
  saveButtonText: {
    color: COLORS.textOnPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.5,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  eventCount: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  eventCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    marginBottom: 16,
    padding: 17,
  },
  eventCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
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
  eventStatusBadge: {
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  eventDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 15,
  },
  eventDetailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  eventDetailLabel: {
    width: 95,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  eventDetailValue: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textSecondary,
  },
  eventActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    minHeight: 43,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 5,
  },
  actionText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  closeActionText: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  adminEventNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 10,
    width: '100%',
  },
  adminEventNoticeText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    flexShrink: 1,
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
    lineHeight: 21,
    textAlign: 'center',
  },
  emptyCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 25,
    alignItems: 'center',
    justifyContent: 'center',
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
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 18,
  },
  qrContainer: {
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 12,
    marginTop: 15,
    marginBottom: 15,
  },
  qrHint: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  qrModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  qrModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    position: 'relative',
  },
  qrModalClose: {
    alignSelf: 'flex-end',
    padding: 4,
    marginBottom: 8,
  },
  qrDoneButton: {
    width: '100%',
    minHeight: 46,
    backgroundColor: COLORS.primary,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
});
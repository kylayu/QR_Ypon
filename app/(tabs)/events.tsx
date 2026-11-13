import AppButton from '@/components/AppButton';
import { COLORS } from '@/constants/colors';
import {
  closeEvent,
  createEvent,
  deleteEvent,
  getAllEvents,
  updateEvent,
  type CloudEvent,
  type EventStatus,
} from '@/lib/events';
import { getProfile, type Role } from '@/lib/profiles';
import { supabase } from '@/lib/supabase';

import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useFocusEffect } from 'expo-router';
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const STATUS_OPTIONS: EventStatus[] = [
  'Upcoming',
  'Ongoing',
];

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

export default function EventsScreen() {
  const scrollViewRef = useRef<ScrollView>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [events, setEvents] = useState<CloudEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [role, setRole] = useState<Role | null>(null);

  const [formVisible, setFormVisible] = useState(false);
  const [editingEvent, setEditingEvent] =
    useState<CloudEvent | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
const [eventCode, setEventCode] = useState('');
const [venue, setVenue] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<EventStatus>('Upcoming');

  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());

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

  const [showStartDatePicker, setShowStartDatePicker] =
    useState(false);
  const [showEndDatePicker, setShowEndDatePicker] =
    useState(false);
  const [showStartTimePicker, setShowStartTimePicker] =
    useState(false);
  const [showEndTimePicker, setShowEndTimePicker] =
    useState(false);

const canManage = role === 'admin' || role === 'teacher';
  useEffect(() => {
    let mounted = true;

    async function loadCurrentUser() {
      const { data, error } = await supabase.auth.getUser();

      if (error) {
        console.error('Failed to get current user:', error);
        if (mounted) setUserId(null);
        return;
      }

      if (mounted) {
        setUserId(data.user?.id ?? null);
      }
    }

    void loadCurrentUser();

    return () => {
      mounted = false;
    };
  }, []);

  // Scroll to the top when the create/edit form opens.
  useEffect(() => {
    if (formVisible) {
      scrollViewRef.current?.scrollTo({
        y: 0,
        animated: true,
      });
    }
  }, [formVisible]);

  const loadEvents = useCallback(async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);

      const result = await getAllEvents();

// Show the most recently created events first.
const sortedEvents = [...(result ?? [])].sort(
  (a, b) =>
    new Date(b.created_at ?? 0).getTime() -
    new Date(a.created_at ?? 0).getTime(),
);

setEvents(sortedEvents);
    } catch (error) {
      console.error('Failed to load events:', error);
      Alert.alert(
        'Unable to load events',
        'Please check your connection and try again.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadProfile = useCallback(async () => {
    if (!userId) {
      setRole(null);
      return;
    }

    try {
      const profile = await getProfile(userId);
      setRole(profile?.role ?? null);
    } catch (error) {
      console.error('Failed to load profile:', error);
      setRole(null);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void loadEvents();
      void loadProfile();
    }, [loadEvents, loadProfile]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadEvents(false);
  }, [loadEvents]);

  function resetForm() {
    setTitle('');
    setEventCode('');
    setVenue('');
    setDescription('');
    setStatus('Upcoming');

    const now = new Date();
    const defaultStart = new Date(now);
    defaultStart.setHours(now.getHours() + 1, 0, 0, 0);

    const defaultEnd = new Date(defaultStart);
    defaultEnd.setHours(defaultStart.getHours() + 1);

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
    resetForm();

    const now = new Date();
    const defaultStart = new Date(now);
    defaultStart.setHours(now.getHours() + 1, 0, 0, 0);

    const defaultEnd = new Date(defaultStart);
    defaultEnd.setHours(defaultStart.getHours() + 1);

    setStartDate(defaultStart);
    setEndDate(defaultStart);
    setStartTime(defaultStart);
    setEndTime(defaultEnd);

    setFormVisible(true);
  }

  function startEditing(event: CloudEvent) {
    const start = new Date(event.start_time);
    const end = new Date(event.end_time);

    setEditingEvent(event);
    setTitle(event.title ?? '');
    setEventCode(event.event_code ?? '');
    setVenue(event.venue ?? '');
    setDescription(event.description ?? '');
    setStatus(event.status ?? 'Upcoming');

    setStartDate(start);
    setEndDate(end);
    setStartTime(start);
    setEndTime(end);

    setFormVisible(true);
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
    if (!canManage) {
      Alert.alert(
        'Permission denied',
        'You do not have permission to manage events.',
      );
      return;
    }

    const cleanTitle = title.trim();
const cleanEventCode = eventCode.trim().toUpperCase();
const cleanVenue = venue.trim() || 'Not specified';
    const cleanDescription = description.trim() || 'Not specified';

    if (!cleanTitle) {
      Alert.alert('Missing title', 'Please enter an event title.');
      return;
    }
    if (!cleanEventCode) {
  Alert.alert('Missing event code', 'Please enter an event code.');
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

    try {
      setSaving(true);

      const eventData = {
        title: cleanTitle,
        venue: cleanVenue,
        description: cleanDescription,
        status,
        start_time: startDateTime,
        end_time: endDateTime,
      };

 if (editingEvent) {
const result = await updateEvent(editingEvent.id, {
  ...eventData,
  event_code: cleanEventCode,
});

if (result.error) {
  throw new Error(result.error);
}

Alert.alert('Success', 'Event updated successfully.');
} else {
  const result = await createEvent({
    title: eventData.title,
    venue: eventData.venue,
    description: eventData.description,
    status: eventData.status,
    eventId: cleanEventCode,
    start: eventData.start_time,
    end: eventData.end_time,
  });

  if (result.error) {
    throw new Error(result.error);
  }

  Alert.alert('Success', 'Event created successfully.');
}

resetForm();
await loadEvents(false);
    } catch (error) {
      console.error('Failed to save event:', error);
      Alert.alert(
        'Unable to save event',
        'Please verify your event details and try again.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleCloseEvent(event: CloudEvent) {
  try {
    await closeEvent(event.id);
    await loadEvents(false);

    if (Platform.OS === 'web') {
      window.alert('Event closed successfully.');
    } else {
      Alert.alert('Event closed', 'The event has been closed successfully.');
    }
  } catch (error) {
    console.error('Failed to close event:', error);

    const message =
      error instanceof Error ? error.message : 'Please try again.';

    if (Platform.OS === 'web') {
      window.alert(`Unable to close event: ${message}`);
    } else {
      Alert.alert('Unable to close event', message);
    }
  }
}

function handleClose(event: CloudEvent) {
  const message = `Are you sure you want to close "${event.title}"?`;

  if (Platform.OS === 'web') {
    if (window.confirm(message)) {
      void handleCloseEvent(event);
    }
    return;
  }

  Alert.alert('Close event', message, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Close Event',
      style: 'destructive',
      onPress: () => {
        void handleCloseEvent(event);
      },
    },
  ]);
}


async function handleDeleteEvent(event: CloudEvent) {
  if (role !== 'admin') {
    Alert.alert(
      'Permission denied',
      'Only administrators can delete events.',
    );
    return;
  }

  const deleteConfirmed = async () => {
  try {
    setSaving(true);

    const result = await deleteEvent(event.id);

    if (result.error) {
      throw new Error(result.error);
    }

    resetForm();
    await loadEvents(false);

    if (Platform.OS === 'web') {
      window.alert('Event deleted successfully.');
    } else {
      Alert.alert('Success', 'Event deleted successfully.');
    }
  } catch (error) {
    console.error('Failed to delete event:', error);

    const message =
      error instanceof Error
        ? error.message
        : 'Please try again.';

    if (Platform.OS === 'web') {
      window.alert(`Unable to delete event: ${message}`);
    } else {
      Alert.alert('Unable to delete event', message);
    }
  } finally {
    setSaving(false);
  }
};
  const message =
    `Are you sure you want to permanently delete "${event.title}"? ` +
    'This action cannot be undone.';

  if (Platform.OS === 'web') {
    if (window.confirm(message)) {
      void deleteConfirmed();
    }
    return;
  }

  Alert.alert('Delete event', message, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Delete',
      style: 'destructive',
      onPress: () => void deleteConfirmed(),
    },
  ]);
}

  function renderDateTimePicker(
    visible: boolean,
    value: Date,
    mode: 'date' | 'time',
    onChange: (
      event: DateTimePickerEvent,
      date?: Date,
    ) => void,
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

  function renderEventDetail(label: string, value: string) {
    return (
      <View style={styles.eventDetailRow}>
        <Text style={styles.eventDetailLabel}>{label}</Text>
        <Text style={styles.eventDetailValue}>{value}</Text>
      </View>
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
    onChange: (
      event: DateTimePickerEvent,
      date?: Date,
    ) => void,
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
    onChange: (
      event: DateTimePickerEvent,
      date?: Date,
    ) => void,
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
          <View style={styles.pageHeadingContainer}>
            <Text style={styles.heading}>Events</Text>
            <Text style={styles.pageSubtitle}>
              Browse and create an event.
            </Text>
          </View>

          {canManage && !formVisible && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create event"
              onPress={startCreating}
              style={styles.addButton}
            >
              <Ionicons
                name="add"
                size={22}
                color={COLORS.textOnPrimary}
              />
              <Text style={styles.addButtonText}>Create</Text>
            </Pressable>
          )}
        </View>

        {/* The create/edit form is shown by itself. */}
        {formVisible && canManage && (
          <View style={styles.formCard}>
            <View style={styles.formHeader}>
              <View style={styles.formHeadingContainer}>
                <Text style={styles.formTitle}>
                  {editingEvent ? 'Edit Event' : 'Create Event'}
                </Text>
                <Text style={styles.formSubtitle}>
                  Enter the event details below.
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close event form"
                onPress={resetForm}
                style={styles.iconButton}
              >
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
  placeholder="Enter an event code (e.g. EVT-2026-0001)"
  placeholderTextColor={COLORS.textSecondary}
  value={eventCode}
  onChangeText={(value) =>
    setEventCode(value.toUpperCase().replace(/\s/g, ''))
  }
  autoCapitalize="characters"
  maxLength={50}
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
                        selected && {
                          color: statusColor(option),
                        },
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
                onPress={handleSave}
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

        {/* Hide the entire event list while creating or editing. */}
        {!formVisible && (
          <>
            <View style={styles.listHeader}>
              <Text style={styles.sectionTitle}>All Events</Text>
              <Text style={styles.eventCount}>
                {events.length}{' '}
                {events.length === 1 ? 'event' : 'events'}
              </Text>
            </View>

            {loading ? (
              <View style={styles.stateCard}>
                <ActivityIndicator
                  size="large"
                  color={COLORS.primary}
                />
                <Text style={styles.stateText}>
                  Loading events...
                </Text>
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
                <Text style={styles.emptyTitle}>No events yet</Text>
                <Text style={styles.emptyText}>
                  {canManage
                    ? 'Create your first event to get started.'
                    : 'Events will appear here when they become available.'}
                </Text>

                {canManage && (
                  <AppButton
                    title="Create Event"
                    icon="add-circle-outline"
                    onPress={startCreating}
                  />
                )}
              </View>
            ) : (
              events.map((event) => {
                const eventStatus = event.status ?? 'Upcoming';

                return (
                  <View
                    key={event.id}
                    style={styles.eventCard}
                  >
                    <View style={styles.eventCardHeader}>
                      <View style={styles.eventTitleContainer}>
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

                    {role !== 'teacher' && canManage && (
                      <>
                        <View style={styles.eventDivider} />
                        <View style={styles.eventActions}>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Edit ${event.title}`}
                            onPress={() => startEditing(event)}
                            style={styles.editButton}
                          >
                            <Ionicons
                              name="create-outline"
                              size={18}
                              color={COLORS.primary}
                            />
                            <Text style={styles.editButtonText}>
                              Edit
                            </Text>
                          </Pressable>
<Pressable
  accessibilityRole="button"
  accessibilityLabel={`Close ${event.title}`}
  disabled={eventStatus === 'Closed'}
  onPress={() => handleClose(event)}
  style={[
    styles.closeButton,
    eventStatus === 'Closed' && { opacity: 0.45 },
  ]}
>
  <Ionicons
    name="close-circle-outline"
    size={18}
    color={COLORS.danger}
  />
  <Text style={styles.closeButtonText}>
    {eventStatus === 'Closed' ? 'Event Closed' : 'Close Event'}
  </Text>
</Pressable>
{role === 'admin' && (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={`Delete ${event.title}`}
    disabled={saving}
    onPress={() => void handleDeleteEvent(event)}
    style={[
      styles.deleteButton,
      saving && styles.disabledButton,
    ]}
  >
    <Ionicons
      name="trash-outline"
      size={18}
      color={COLORS.danger}
    />
    <Text style={styles.deleteButtonText}>Delete</Text>
  </Pressable>
)}
                        </View>
                      </>
                    )}
                  </View>
                );
              })
            )}
          </>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 22,
    gap: 12,
  },
  pageHeadingContainer: {
    flex: 1,
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
  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    marginTop: 4,
  },
  eventCount: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  formCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 17,
    marginBottom: 24,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 5,
    elevation: 2,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  formHeadingContainer: {
    flex: 1,
    paddingRight: 10,
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
    opacity: 0.65,
  },
  eventCard: {
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
  eventCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  eventTitleContainer: {
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
    gap: 10,
  },
  editButton: {
    flex: 1,
    minHeight: 43,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: '#E5F0FF',
  },
  editButtonText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  deleteButton: {
  flex: 1,
  minHeight: 43,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  borderRadius: 11,
  borderWidth: 1,
  borderColor: '#F0C5C1',
  backgroundColor: '#FCE8E6',
},
deleteButtonText: {
  color: COLORS.danger,
  fontSize: 14,
  fontWeight: '700',
},
  closeButton: {
    flex: 1,
    minHeight: 43,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#F0C5C1',
    backgroundColor: '#FCE8E6',
  },
  closeButtonText: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: '700',
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
  },
  emptyText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 18,
  },
});
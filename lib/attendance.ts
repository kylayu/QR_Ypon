import { getEventByCode } from './events';
import { parseQRPayload } from './qr';
import { supabase } from './supabase';

export type RegisterResult = {
  success: boolean;
  message: string;
  eventTitle?: string;
};


export type AttendanceRecord = {
  id: string;
  eventId: string;
  eventTitle: string;
  scannedAt: string;
  startTime: string | null;
  endTime: string | null;
  venue: string | null;
  description: string | null;
  status: string;
};


export type TeacherEventAttendance = {
  eventId: string;
  eventCode: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  venue: string | null;
  description: string | null;
  eventStatus: string;
  attendeeCount: number;
  attendees: {
    studentId: string;
    fullName: string | null;
    scannedAt: string;
    status: string;
  }[];
};

export async function getTeacherEventAttendance(
  _teacherId: string,
): Promise<TeacherEventAttendance[]> {

const { data: events, error: eventsError } = await supabase
  .from('events')
  .select(
    'id, event_code, title, start_time, end_time, venue, description, status, created_by',
  )
  .order('created_at', { ascending: false });


  if (eventsError) throw eventsError;
  if (!events?.length) return [];

  const eventIds = events.map((event) => event.id);

  const { data: attendanceRows, error: attendanceError } = await supabase
    .from('attendance')
    .select('id, student_id, event_id, scanned_at, status')
    .in('event_id', eventIds)
    .order('scanned_at', { ascending: false });

  if (attendanceError) throw attendanceError;

  const studentIds = [
    ...new Set((attendanceRows ?? []).map((row) => row.student_id)),
  ];

  let profileMap = new Map<string, string>();

  if (studentIds.length > 0) {
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', studentIds);

    if (profilesError) throw profilesError;

    profileMap = new Map(
      (profiles ?? []).map((profile) => [
        profile.id,
        profile.full_name || 'Unnamed Student',
      ]),
    );
  }

  return events.map((event) => {
    const attendees = (attendanceRows ?? [])
      .filter((row) => row.event_id === event.id)
      .map((row) => ({
        studentId: row.student_id,
        fullName: profileMap.get(row.student_id) ?? 'Unnamed Student',
        scannedAt: row.scanned_at,
        status: row.status,
      }));

    return {
      eventId: event.id,
      eventCode: event.event_code,
      title: event.title,
      startTime: event.start_time,
      endTime: event.end_time,
      venue: event.venue,
      description: event.description,
      eventStatus: event.status,
      attendeeCount: attendees.length,
      attendees,
    };
  });
}

export async function registerAttendance(
  rawPayload: string,
  studentId: string
): Promise<RegisterResult> {
  if (!studentId || studentId === 'unknown') {
    return {
      success: false,
      message: 'Please log in before recording attendance.',
    };
  }

  try {
    // 1. Validate the QR code payload.
    const parsed = parseQRPayload(rawPayload);

    if (!parsed.ok) {
      return {
        success: false,
        message: parsed.message,
      };
    }

    // 2. Verify the authenticated user.
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user || user.id !== studentId) {
      return {
        success: false,
        message: 'Your session is invalid. Please log in again.',
      };
    }

    // 3. Only students may register attendance.
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return {
        success: false,
        message: 'Could not verify your account permissions.',
      };
    }

    if (profile.role !== 'student') {
      return {
        success: false,
        message: 'Only student accounts can record attendance.',
      };
    }

    // 4. Find the event using the QR code.
    const event = await getEventByCode(parsed.payload.event);

    if (!event) {
      return {
        success: false,
        message: 'Event not found. Please scan a valid event QR code.',
      };
    }

if (event.status === 'Closed') {
  return {
    success: false,
    message: 'This event is closed. Attendance was not recorded.',
    eventTitle: event.title,
  };
}
    // 5. Verify the event details in the database.
    const { data: eventDetails, error: eventError } = await supabase
      .from('events')
      .select('id, title, start_time, end_time, status')
      .eq('id', event.id)
      .maybeSingle();

    if (eventError || !eventDetails) {
      return {
        success: false,
        message: 'Could not verify the event. Please try again.',
      };
    }

    if (eventDetails.status !== 'Ongoing') {
      return {
        success: false,
        message:
          eventDetails.status === 'Closed'
            ? 'This event is closed. Attendance is no longer allowed.'
            : 'This event is not currently open for attendance.',
        eventTitle: eventDetails.title,
      };
    }

    // 6. Validate the event schedule.
    const now = Date.now();

    const start = eventDetails.start_time
      ? new Date(eventDetails.start_time).getTime()
      : null;

    const end = eventDetails.end_time
      ? new Date(eventDetails.end_time).getTime()
      : null;

    if (
      (start !== null && !Number.isFinite(start)) ||
      (end !== null && !Number.isFinite(end))
    ) {
      return {
        success: false,
        message: 'The event schedule is invalid.',
        eventTitle: eventDetails.title,
      };
    }

    if (start !== null && end !== null && start > end) {
      return {
        success: false,
        message: 'The event schedule is invalid.',
        eventTitle: eventDetails.title,
      };
    }

    if (start !== null && now < start) {
      return {
        success: false,
        message: 'This event has not started yet.',
        eventTitle: eventDetails.title,
      };
    }


    // 7. Determine attendance status.
    const attendanceStatus: 'Present' | 'Late' =
      end !== null && now >= end ? 'Late' : 'Present';

    // 8. Record attendance for the authenticated student.
    const { error: attendanceError } = await supabase
      .from('attendance')
      .insert({
        student_id: user.id,
        event_id: eventDetails.id,
        status: attendanceStatus,
      });

    if (attendanceError) {
      if (attendanceError.code === '23505') {
        return {
          success: false,
          message: 'You are already registered for this event.',
          eventTitle: eventDetails.title,
        };
      }

      console.error(
        'Attendance registration failed:',
        attendanceError.message
      );

      return {
        success: false,
        message: 'Could not record attendance. Please try again.',
        eventTitle: eventDetails.title,
      };
    }

    return {
      success: true,
      message:
        attendanceStatus === 'Late'
          ? 'Attendance recorded successfully as Late.'
          : 'Attendance recorded successfully as Present.',
      eventTitle: eventDetails.title,
    };
  } catch (error) {
    console.error('Attendance error:', error);

    return {
      success: false,
      message: 'An unexpected error occurred. Please try again.',
    };
  }
}

export async function getAttendanceHistory(
  userId: string
): Promise<AttendanceRecord[]> {
  // Get the logged-in user's role.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (profileError) {
    throw profileError;
  }

  if (!profile) {
    throw new Error('User profile not found.');
  }

  // Fetch attendance records and their related events.
  let query = supabase
    .from('attendance')
    .select(`
      id,
      student_id,
      event_id,
      scanned_at,
      status,
      events!inner (
        id,
        event_code,
        title,
        start_time,
        end_time,
        venue,
        description,
        created_by
      )
    `)
    .order('scanned_at', { ascending: false });


if (profile.role === 'teacher') {
  // Show attendance for events the teacher is permitted to view.
  // Supabase Row Level Security still controls which records are visible.
} else if (profile.role === 'student') {
  // Students see only their own attendance records.
  query = query.eq('student_id', userId);
} else {
  return [];
}

  const { data, error } = await query;

  if (error) {
    console.error('Attendance history query failed:', error);
    throw error;
  }

  // Convert database field names to the screen's expected format.
  return (data ?? []).map((record: any) => {
    const event = record.events;

    return {
      id: record.id,
      studentId: record.student_id,
      eventId: event.event_code,
      eventTitle: event.title,
      startTime: event.start_time,
      endTime: event.end_time,
      venue: event.venue,
      description: event.description,
      scannedAt: record.scanned_at,
      status: record.status,
    };
  }) as AttendanceRecord[];
}

// TEACHER EVENT SUMMARY
export type TeacherEventSummary = {
  eventId: string;
  eventCode: string;
  title: string;
  attendeeCount: number;
};

export async function getTeacherEventSummary(
  teacherId: string
): Promise<TeacherEventSummary[]> {
  const { data: events, error: eventError } = await supabase
    .from('events')
    .select('id, event_code, title')
    .order('created_at', { ascending: false });

  if (eventError) {
    console.error(
      'Error fetching teacher events:',
      eventError.message
    );
    throw eventError;
  }

  if (!events || events.length === 0) {
    return [];
  }

  const eventIds = events.map((event) => event.id);

  const { data: attendance, error: attendanceError } =
    await supabase
      .from('attendance')
      .select('event_id')
      .in('event_id', eventIds);

  if (attendanceError) {
    console.error(
      'Error fetching attendance counts:',
      attendanceError.message
    );
    throw attendanceError;
  }

  const counts: Record<string, number> = {};

  (attendance ?? []).forEach((row) => {
    counts[row.event_id] = (counts[row.event_id] ?? 0) + 1;
  });

  return events.map((event) => ({
    eventId: event.id,
    eventCode: event.event_code,
    title: event.title,
    attendeeCount: counts[event.id] ?? 0,
  }));
}

// ADMIN ATTENDANCE RECORDS
export type AdminAttendanceRecord = {
  id: string;
  studentId: string;
  studentName: string;
  eventCode: string;
  eventTitle: string;
  scannedAt: string;
  status: string;
};

export async function getAllAttendanceRecords(): Promise<
  AdminAttendanceRecord[]
> {
  const { data: attendance, error: attendanceError } =
    await supabase
      .from('attendance')
      .select(`
        id,
        student_id,
        event_id,
        scanned_at,
        status,
        events (
          event_code,
          title
        )
      `)
      .order('scanned_at', { ascending: false });

  if (attendanceError) {
    console.error(
      'Error fetching all attendance records:',
      attendanceError.message
    );
    throw attendanceError;
  }

  if (!attendance || attendance.length === 0) {
    return [];
  }

  const studentIds = [
    ...new Set(attendance.map((row) => row.student_id)),
  ];

  const { data: profiles, error: profilesError } =
    await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', studentIds);

  if (profilesError) {
    console.error(
      'Error fetching student profiles:',
      profilesError.message
    );
    throw profilesError;
  }

  return attendance.map((row: any): AdminAttendanceRecord => {
    const profile = (profiles ?? []).find(
      (item) => item.id === row.student_id
    );

    const event = Array.isArray(row.events)
      ? row.events[0]
      : row.events;

    return {
      id: String(row.id),
      studentId: row.student_id,
      studentName: profile?.full_name ?? '',
      eventCode: event?.event_code ?? '',
      eventTitle: event?.title ?? '',
      scannedAt: row.scanned_at,
      status: row.status ?? 'Present',
    };
  });
}
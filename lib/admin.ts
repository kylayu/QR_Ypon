import type { Role } from '@/lib/profiles';
import { supabase } from '@/lib/supabase';

const VALID_ROLES: Role[] = ['student', 'teacher', 'admin'];

export type AdminUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
};

export type AdminEvent = {
  id: string;
  event_code: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  created_by: string | null;
  created_at: string;
};

export type AdminAttendance = {
  id: string;
  student_id: string;
  event_id: string;
  scanned_at: string;
};

async function requireAdmin() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error('Please sign in first.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || profile?.role !== 'admin') {
    throw new Error('Administrator access is required.');
  }

  return user;
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  await requireAdmin();

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .order('full_name');

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => {
    const role: Role = VALID_ROLES.includes(row.role as Role)
      ? (row.role as Role)
      : 'student';

    return {
      id: row.id,
      email: row.email ?? null,
      full_name: row.full_name ?? null,
      role,
    };
  });
}

export async function updateUserRole(
  userId: string,
  role: Role,
): Promise<void> {
  const currentUser = await requireAdmin();

  if (!VALID_ROLES.includes(role)) {
    throw new Error('Invalid user role.');
  }

  if (userId === currentUser.id && role !== 'admin') {
    throw new Error('You cannot remove your own administrator role.');
  }

  // Prevent modifying existing admin accounts through this function.
  const { data: target, error: targetError } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', userId)
    .maybeSingle();

  if (targetError) {
    throw new Error(targetError.message);
  }

  if (!target) {
    throw new Error('User not found.');
  }

  if (target.role === 'admin' && userId !== currentUser.id) {
    throw new Error('Existing Admin accounts cannot be changed here.');
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId)
    .select('id, role')
    .maybeSingle();

  if (error) {
    throw new Error(
      `Could not update user role. Check your Supabase permissions. ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      'The role was not changed. Check your Supabase Row Level Security policies.',
    );
  }
}

export async function getAdminEvents(): Promise<AdminEvent[]> {
  await requireAdmin();

  const { data, error } = await supabase
    .from('events')
    .select(
      'id, event_code, title, start_time, end_time, created_by, created_at',
    )
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function saveAdminEvent(event: {
  id?: string;
  event_code: string;
  title: string;
  start_time?: string | null;
  end_time?: string | null;
}): Promise<void> {
  const user = await requireAdmin();

  const values = {
    event_code: event.event_code.trim(),
    title: event.title.trim(),
    start_time: event.start_time || null,
    end_time: event.end_time || null,
  };

  if (!values.event_code || !values.title) {
    throw new Error('Event code and title are required.');
  }

  const result = event.id
    ? await supabase
        .from('events')
        .update(values)
        .eq('id', event.id)
    : await supabase.from('events').insert({
        ...values,
        created_by: user.id,
      });

  if (result.error) {
    throw new Error(result.error.message);
  }
}

export async function deleteAdminEvent(
  eventId: string,
): Promise<void> {
  await requireAdmin();

  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId);

  if (error) {
    throw new Error(
      `Could not delete event. It may have attendance records linked to it. ${error.message}`,
    );
  }
}

export async function getAdminAttendance(): Promise<AdminAttendance[]> {
  await requireAdmin();

  const { data, error } = await supabase
    .from('attendance')
    .select('id, student_id, event_id, scanned_at')
    .order('scanned_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

export async function correctAttendance(
  attendanceId: string,
  updates: {
    student_id?: string;
    event_id?: string;
    scanned_at?: string;
  },
): Promise<void> {
  await requireAdmin();

  const { error } = await supabase
    .from('attendance')
    .update(updates)
    .eq('id', attendanceId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function deleteAttendance(
  attendanceId: string,
): Promise<void> {
  await requireAdmin();

  const { error } = await supabase
    .from('attendance')
    .delete()
    .eq('id', attendanceId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function getAdminSummary() {
  await requireAdmin();

  const [users, events, attendance] = await Promise.all([
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('events')
      .select('id', { count: 'exact', head: true }),
    supabase
      .from('attendance')
      .select('id', { count: 'exact', head: true }),
  ]);

  const error = users.error ?? events.error ?? attendance.error;

  if (error) {
    throw new Error(error.message);
  }

  return {
    users: users.count ?? 0,
    events: events.count ?? 0,
    attendance: attendance.count ?? 0,
  };
}
import { supabase } from '@/lib/supabase';

export type Role = 'student' | 'teacher' | 'admin';

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: Role;
};

function parseRole(value: unknown): Role | null {
  const role = String(value ?? '').trim().toLowerCase();

  if (role === 'admin') return 'admin';
  if (role === 'teacher') return 'teacher';
  if (role === 'student') return 'student';

  console.error('[PROFILE DEBUG] Invalid role:', value);
  return null;
}

export async function getProfile(
  userId: string
): Promise<Profile | null> {
  console.log('[PROFILE DEBUG] Requested user ID:', userId);

  try {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError) {
      console.error(
        '[PROFILE DEBUG] Session error:',
        sessionError.message
      );
      return null;
    }

    const session = sessionData.session;

    console.log(
      '[PROFILE DEBUG] Session user ID:',
      session?.user?.id
    );

    if (!session) {
      console.error('[PROFILE DEBUG] No active session.');
      return null;
    }

    if (session.user.id !== userId) {
      console.error('[PROFILE DEBUG] User ID mismatch.');
      return null;
    }

    const { data, error, status } = await supabase
      .from('profiles')
      .select('id, email, full_name, role')
      .eq('id', userId)
      .maybeSingle();

    console.log('[PROFILE DEBUG] HTTP status:', status);

    if (error) {
      console.error(
        '[PROFILE DEBUG] Error message:',
        error.message
      );
      console.error(
        '[PROFILE DEBUG] Error code:',
        error.code
      );
      console.error(
        '[PROFILE DEBUG] Error details:',
        error.details
      );
      console.error(
        '[PROFILE DEBUG] Error hint:',
        error.hint
      );

      return null;
    }

    if (!data) {
      console.error(
        '[PROFILE DEBUG] No profile row returned.'
      );
      return null;
    }

    console.log('[PROFILE DEBUG] Profile data:', data);

    const role = parseRole(data.role);

    if (!role) return null;

    return {
      id: data.id,
      email: data.email ?? null,
      full_name: data.full_name ?? null,
      role,
    };
  } catch (error) {
    console.error(
      '[PROFILE DEBUG] Unexpected error:',
      error
    );
    return null;
  }
}

export async function updateProfile(
  userId: string,
  updates: {
    full_name?: string;
    email?: string;
  }
): Promise<{ data: Profile | null; error: string | null }> {
  if (!userId) {
    return {
      data: null,
      error: 'You must be logged in.',
    };
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select('id, email, full_name, role')
    .maybeSingle();

  if (error) {
    console.error(
      '[PROFILE DEBUG] Update error:',
      error.message
    );

    return {
      data: null,
      error: error.message,
    };
  }

  if (!data) {
    return {
      data: null,
      error:
        'Profile not updated. Check your Supabase permissions.',
    };
  }

  const role = parseRole(data.role);

  if (!role) {
    return {
      data: null,
      error: 'Invalid profile role. Contact an administrator.',
    };
  }

  return {
    data: {
      id: data.id,
      email: data.email ?? null,
      full_name: data.full_name ?? null,
      role,
    },
    error: null,
  };
}
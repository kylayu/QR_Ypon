import { supabase } from '@/lib/supabase';

export type EventStatus = 'Upcoming' | 'Ongoing' | 'Closed';

export type CloudEvent = {
  id: string;
  event_code: string;
  title: string;
  start_time: string;
  end_time: string;
  created_by: string | null;
  created_at?: string;
  venue: string | null;
  description: string | null;
  status: EventStatus;
};

export type CreateEventInput = {
  eventId: string;
  title: string;
  start: string;
  end: string;
  venue?: string;
  description?: string;
  status?: EventStatus;
};

export type UpdateEventInput = {
  event_code: string;
  title: string;
  start_time: string;
  end_time: string;
  venue: string;
  description: string;
  status: EventStatus;
};

async function getAuthenticatedUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error('Your login session is missing or expired. Please log in again.');
  }

  return user;
}


export async function getAllEvents(): Promise<CloudEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select(
      'id, event_code, title, start_time, end_time, created_by, created_at, venue, description, status'
    )
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as CloudEvent[];
}

export async function createEvent(input: CreateEventInput) {
  try {
    const user = await getAuthenticatedUser();

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError) {
      return { error: `Could not verify your role: ${profileError.message}` };
    }

    if (!['teacher', 'admin'].includes(profile.role)) {
      return { error: 'Only teachers and administrators can create events.' };
    }

    const eventPayload = {
  event_code: input.eventId.trim(),
  title: input.title.trim(),
  start_time: input.start,
  end_time: input.end,
  created_by: user.id,
  venue: input.venue?.trim() || null,
  description: input.description?.trim() || null,
  status: input.status ?? 'Upcoming',
};


    console.log('3. COMPLETE PAYLOAD:', eventPayload);
    console.log('3a. STATUS SENT TO SUPABASE:', eventPayload.status);

    const { data, error } = await supabase
      .from('events')
      .insert(eventPayload)
      .select('id, event_code, status')
      .single();

    console.log('4. EVENT RETURNED BY SUPABASE:', data);
    console.log('5. INSERT ERROR:', error);

    if (error) {
      return { error: `Could not save event: ${error.message}` };
    }

    return { error: null };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Could not create event.',
    };
  }
}

export async function updateEvent(
  id: string,
  input: UpdateEventInput
) {
  try {
    await getAuthenticatedUser();

    const { data, error } = await supabase
      .from('events')
      .update({
        event_code: input.event_code.trim(),
        title: input.title.trim(),
        start_time: input.start_time,
        end_time: input.end_time,
        venue: input.venue.trim() || null,
        description: input.description.trim() || null,
        status: input.status,
      })
      .eq('id', id)
      .select('id, event_code, status')
      .maybeSingle();

    if (error) {
      return { error: `Could not update event: ${error.message}` };
    }

    if (!data) {
      return {
        error: 'Event was not updated. Check your permissions and event ID.',
      };
    }

    console.log('UPDATED EVENT RETURNED BY SUPABASE:', data);

    return { error: null };
  } catch (error) {
    return {
      error: error instanceof Error
        ? error.message
        : 'Could not update event.',
    };
  }
}

// Close an event without deleting attendance history.

export async function closeEvent(id: string) {
  try {
    await getAuthenticatedUser();

    const { data, error } = await supabase
      .from('events')
      .update({ status: 'Closed' })
      .eq('id', id)
      .select('id, event_code, status')
      .maybeSingle();

    if (error) {
      console.error('CLOSE EVENT SUPABASE ERROR:', error);
      return { error: `Could not close event: ${error.message}` };
    }

    if (!data) {
      console.error('CLOSE EVENT: No event was updated for ID:', id);

      return {
        error:
          'No event was updated. Check your permissions or whether the event exists.',
      };
    }

    console.log('EVENT CLOSED SUCCESSFULLY:', data);

    return { error: null };
  } catch (error) {
    console.error('CLOSE EVENT ERROR:', error);

    return {
      error:
        error instanceof Error
          ? error.message
          : 'Could not close the event.',
    };
  }
}

// Delete an event. Only administrators are allowed.
export async function deleteEvent(id: string) {
  try {
    const user = await getAuthenticatedUser();

    // Verify the current user's role.
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return {
        error: 'Could not verify your administrator permissions.',
      };
    }

    if (profile.role !== 'admin') {
      return {
        error: 'Only administrators can delete events.',
      };
    }

    // Delete the selected event.
    const { data, error } = await supabase
      .from('events')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) {
      return {
        error: `Could not delete event: ${error.message}`,
      };
    }

    if (!data) {
      return {
        error:
          'The event was not deleted. It may not exist or you may not have permission.',
      };
    }

    return { error: null };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Could not delete event.',
    };
  }
}
// Find an existing event using its QR event code.
export async function getEventByCode(
  eventCode: string
): Promise<{
  id: string;
  title: string;
  status: EventStatus;
} | null> {
  const { data, error } = await supabase
    .from('events')
    .select('id, title, status')
    .eq('event_code', eventCode)
    .maybeSingle();

  if (error) {
    throw new Error(`Error fetching event: ${error.message}`);
  }

  return data;
}
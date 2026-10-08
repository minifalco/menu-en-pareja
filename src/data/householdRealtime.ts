import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';

export interface HouseholdChange {
  household_id: string;
  table: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
}

/**
 * Private server-triggered invalidations include deletions without publishing
 * row data/primary keys to non-members. Reload through RLS after each signal.
 * Caller must remove the returned channel when leaving the household.
 */
export function subscribeHouseholdChanges(
  client: SupabaseClient,
  householdId: string,
  onChange: (change: HouseholdChange) => void,
  onStatus?: (status: string) => void,
): RealtimeChannel {
  return client.channel(`household:${householdId}`, { config: { private: true } })
    .on('broadcast', { event: 'change' }, message => {
      const change = message.payload as HouseholdChange;
      if (change.household_id === householdId) onChange(change);
    })
    .subscribe(status => onStatus?.(status));
}

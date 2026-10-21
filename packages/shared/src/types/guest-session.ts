/** Local guest entry record; this is a UI session, never an account credential or server authorization. */
export interface GuestSession { startedAt: number; expiresAt: number }
export interface UserDataEntrySession { guest: GuestSession | null }
export const GUEST_SESSION_DURATION_MS = 60 * 60 * 1000;

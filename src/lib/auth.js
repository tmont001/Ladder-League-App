import { supabase } from './supabase';

export async function requestMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: {
      shouldCreateUser: false,
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) throw error;
}

export async function getOrganizerSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

export async function signOutOrganizer() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

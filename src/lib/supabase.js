// src/lib/supabase.js
// ─────────────────────────────────────────────────────────────
// Supabase client singleton.
//
// SETUP:
//   1. Create a project at supabase.com
//   2. Run supabase/schema.sql in the SQL editor
//   3. Create a .env file in the project root with:
//        REACT_APP_SUPABASE_URL=https://your-project.supabase.co
//        REACT_APP_SUPABASE_ANON_KEY=your-anon-key
//   4. Restart the dev server
// ─────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
      'Copy .env.example to .env and fill in your project credentials. ' +
      'See src/lib/supabase.js for setup instructions.',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'ladder' },
});

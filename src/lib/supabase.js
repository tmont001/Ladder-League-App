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

const supabaseUrl  = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey  = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    '[Supabase] Missing REACT_APP_SUPABASE_URL or REACT_APP_SUPABASE_ANON_KEY.\n' +
    'Create a .env file in the project root. See src/lib/supabase.js for instructions.'
  );
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '');

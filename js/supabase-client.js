// Supabase client — shared across all pages that need it
const SUPABASE_URL = 'https://ppymuuyoveyyoswcimck.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBweW11dXlvdmV5eW9zd2NpbWNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMjYxNDYsImV4cCI6MjA4NzYwMjE0Nn0.rstM8tgn0MfgDtWdbEk0061yxacJtFj5tV7HbmyGcXI';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

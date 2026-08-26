import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = "https://gcoomnnwmbehpkmbgroi.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdjb29tbm53bWJlaHBrbWJncm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjUzNDE5NDEsImV4cCI6MjA0MDkxNzk0MX0.S3Supif3vuWlAIz3JlRTeWDx6vMttsP5ynx_XM9Kvyw";

export const cl = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

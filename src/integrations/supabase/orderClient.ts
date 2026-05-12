import { createClient } from '@supabase/supabase-js';

const ORDER_DB_URL = 'https://pjurpgqgqvabopoxkzja.supabase.co';
const ORDER_DB_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqdXJwZ3FncXZhYm9wb3hremphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU3NzI4NjYsImV4cCI6MjA5MTM0ODg2Nn0.pzVo2I34DIDV8hd4Zwd2D_SmMRiQYns3VRH4O_LMlYM';

export const orderDb = createClient(ORDER_DB_URL, ORDER_DB_ANON_KEY);

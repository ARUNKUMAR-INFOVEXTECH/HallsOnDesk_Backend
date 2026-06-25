const dotenv = require("dotenv");
dotenv.config();
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

const tables = [
  'activity_logs',
  'admin_settings',
  'booking_vendors',
  'bookings',
  'customers',
  'enquiries',
  'enquiry_followups',
  'events',
  'hall_profiles',
  'hall_settings',
  'hall_subscriptions',
  'invoices',
  'marriage_halls',
  'notifications',
  'packages',
  'payments',
  'subscription_payments',
  'super_admins',
  'support_tickets',
  'user_halls',
  'users',
  'vendors'
];

async function run() {
  console.log("Fetching row counts...");
  for (const table of tables) {
    try {
      const { count, error } = await supabaseAdmin
        .from(table)
        .select("*", { count: "exact", head: true });
      if (error) {
        console.log(`Table ${table}: ERROR - ${error.message}`);
      } else {
        console.log(`Table ${table}: ${count} rows`);
      }
    } catch (err) {
      console.log(`Table ${table}: EXCEPTION - ${err.message}`);
    }
  }
}

run();

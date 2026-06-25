const dotenv = require("dotenv");
dotenv.config();
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Starting database cleanup for launch preparation...");

  // 1. Fetch all regular users to delete their Auth accounts
  console.log("Fetching regular users...");
  const { data: users, error: fetchUsersError } = await supabaseAdmin
    .from("users")
    .select("id, name, email, auth_user_id");

  if (fetchUsersError) {
    console.error("Error fetching users:", fetchUsersError.message);
    return;
  }

  console.log(`Found ${users.length} regular users to delete.`);

  // 2. Delete regular users from Supabase Auth
  for (const user of users) {
    if (user.auth_user_id) {
      console.log(`Deleting Auth account for user: ${user.name} (${user.email}) - ID: ${user.auth_user_id}`);
      try {
        const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(user.auth_user_id);
        if (deleteAuthError) {
          console.error(`Failed to delete Auth account for ${user.email}:`, deleteAuthError.message);
        } else {
          console.log(`Successfully deleted Auth account for ${user.email}`);
        }
      } catch (err) {
        console.error(`Exception deleting Auth account for ${user.email}:`, err.message);
      }
    }
  }

  // 3. Clear database tables in dependency order to avoid foreign key violations
  // We use filter neq id '00000000-0000-0000-0000-000000000000' or neq 0 or gt created_at '1970-01-01' to match all rows
  const deleteOrder = [
    // Level 1: Child tables
    { table: "activity_logs", idType: "uuid" },
    { table: "booking_vendors", idType: "uuid" },
    { table: "invoices", idType: "uuid" },
    { table: "payments", idType: "uuid" },
    { table: "subscription_payments", idType: "uuid" },
    { table: "support_tickets", idType: "uuid" }, // support tickets might have messages, wait, do support_tickets have messages?
    { table: "enquiry_followups", idType: "uuid" },
    { table: "notifications", idType: "uuid" },
    { table: "events", idType: "uuid" },
    { table: "user_halls", idType: "int" },

    // Level 2: Intermediate tables
    { table: "bookings", idType: "uuid" },
    { table: "enquiries", idType: "uuid" },
    { table: "vendors", idType: "uuid" },
    { table: "customers", idType: "uuid" },
    { table: "hall_subscriptions", idType: "uuid" },
    { table: "hall_settings", idType: "uuid" },
    { table: "hall_profiles", idType: "uuid" },

    // Level 3: Base tables
    { table: "users", idType: "uuid" },
    { table: "marriage_halls", idType: "uuid" }
  ];

  for (const item of deleteOrder) {
    console.log(`Clearing table: ${item.table}...`);
    try {
      let query = supabaseAdmin.from(item.table).delete();
      if (item.idType === "uuid") {
        query = query.neq("id", "00000000-0000-0000-0000-000000000000");
      } else if (item.idType === "int") {
        query = query.gt("id", -1);
      } else {
        query = query.neq("id", "");
      }

      const { error: deleteError } = await query;
      if (deleteError) {
        console.error(`Error clearing table ${item.table}:`, deleteError.message);
      } else {
        console.log(`Successfully cleared table: ${item.table}`);
      }
    } catch (err) {
      console.error(`Exception clearing table ${item.table}:`, err.message);
    }
  }

  console.log("Cleanup process completed!");
}

run();

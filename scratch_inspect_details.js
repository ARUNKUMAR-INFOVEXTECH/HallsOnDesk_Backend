const dotenv = require("dotenv");
dotenv.config();
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: adminSettings } = await supabaseAdmin.from("admin_settings").select("*");
  console.log("admin_settings:", adminSettings);

  const { data: packages } = await supabaseAdmin.from("packages").select("*");
  console.log("packages:", packages);
}

run();

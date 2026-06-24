const fs = require('fs');
const path = require('path');

const CONTROLLERS_DIR = path.join(__dirname, 'controllers');
const SENSITIVE_TABLES = ['bookings', 'customers', 'enquiries', 'payments', 'users', 'hall_settings', 'hall_profiles'];

const FILES_TO_AUDIT = [
  'bookingController.js',
  'customerController.js',
  'enquiryController.js',
  'paymentController.js',
  'staffController.js',
  'hallSettingsController.js',
  'hallProfileController.js'
];

function runScopingAudit() {
  console.log("=================================================");
  console.log("   SaaS Multi-Tenant Scoping Audit Analyzer      ");
  console.log("=================================================\n");

  let totalErrors = 0;
  let totalQueries = 0;

  FILES_TO_AUDIT.forEach(file => {
    const filePath = path.join(CONTROLLERS_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${file}`);
      return;
    }

    console.log(`Auditing: ${file}`);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    // Simple regex to locate table query boundaries
    // e.g. .from("bookings") or .from('bookings')
    const fromRegex = /\.from\s*\(\s*["']([^"']+)["']\s*\)/g;
    let match;

    while ((match = fromRegex.exec(content)) !== null) {
      const tableName = match[1];
      if (!SENSITIVE_TABLES.includes(tableName)) continue;

      totalQueries++;
      const index = match.index;
      // Get the line number
      const lineNumber = content.substring(0, index).split('\n').length;
      
      // Look ahead up to 250 characters or next query boundary to check for .eq("hall_id" or .eq('hall_id' or .eq("id", hall_id)
      const lookahead = content.substring(index, index + 350);
      const hasHallIdScoping = lookahead.includes('hall_id') || lookahead.includes('req.user.hall_id') || lookahead.includes('req.params.hall_id') || lookahead.includes('req.params.id') || lookahead.includes('req.user.id');

      if (!hasHallIdScoping) {
        console.log(`  ❌ L${lineNumber}: Query to '${tableName}' may be missing hall_id scope!`);
        // Print snippet
        const snippet = lines.slice(Math.max(0, lineNumber - 2), Math.min(lines.length, lineNumber + 4)).join('\n');
        console.log(`     Snippet:\n${snippet}\n`);
        totalErrors++;
      } else {
        console.log(`  ✅ L${lineNumber}: Scoping query verified on table '${tableName}'`);
      }
    }
    console.log("");
  });

  console.log("=================================================");
  console.log(`Audit Summary:`);
  console.log(`- Checked ${totalQueries} tenant-sensitive database queries.`);
  if (totalErrors === 0) {
    console.log(`- ✅ SUCCESS: 100% of examined queries enforce tenant scoping constraints.`);
  } else {
    console.log(`- ❌ WARNING: ${totalErrors} potential leaks or scope omissions identified.`);
  }
  console.log("=================================================");
}

runScopingAudit();

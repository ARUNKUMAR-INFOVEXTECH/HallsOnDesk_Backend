const fs = require('fs');
const file = 'd:/INFOVEX_PRODUCT/HALLFLOW/HALLS_ON_DESK/hallflow_backend/controllers/invoiceController.js';

if (fs.existsSync(file)) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('const createReceipt')) {
      console.log(`${idx + 1}: ${line.trim()}`);
    }
  });
} else {
  console.log("File not found");
}

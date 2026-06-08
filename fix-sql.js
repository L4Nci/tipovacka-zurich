import fs from 'fs';

const file = 'supabase/seed/import_matches.sql';
let s = fs.readFileSync(file, 'utf8');
s = s.replace(/\)\n    \(/g, '),\n    (');
fs.writeFileSync(file, s);

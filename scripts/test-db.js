const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

// Parse the password from the current env file to reuse it
// Original Password: !qG?f9kdAh@DTBFE6caG
const password = '!qG?f9kdAh@DTBFE6caG';
const projectRef = 'icmyshrrfqijuonvyudx';

const regions = [
  'aws-0-us-east-1',
  'aws-0-us-west-1',
  'aws-0-eu-central-1',
  'aws-0-ap-southeast-1'
];

async function checkConnection() {
  console.log('--- Database Connection Diagnostic ---');
  console.log(`Project Ref: ${projectRef}`);

  for (const region of regions) {
    const host = `${region}.pooler.supabase.com`;
    console.log(`\nTesting Region: ${region} (${host})...`);

    const client = new Client({
      host: host,
      port: 6543,
      user: 'postgres', // Try simpler username
      password: password,
      database: 'postgres',
      ssl: { rejectUnauthorized: false } // Supabase requires SSL
    });

    try {
      await client.connect();
      console.log(`✅ SUCCESS! Connected to ${region}`);
      const res = await client.query('SELECT NOW()');
      console.log(`   Time from DB: ${res.rows[0].now}`);
      await client.end();

      // Found the right one, let's output the correct string
      const correctUrl = `postgres://postgres.${projectRef}:${encodeURIComponent(password)}@${host}:6543/postgres`;
      console.log('\n--- CORRECT CONNECTION STRING ---');
      console.log(correctUrl);
      return;
    } catch (err) {
      console.log(`❌ Failed: ${err.message}`);
      await client.end().catch(() => { });
    }
  }

  console.log('\n--- DIAGNOSIS COMPLETE ---');
  console.log('If all failed, please verify your Project Region in the Supabase Dashboard.');
}

checkConnection();

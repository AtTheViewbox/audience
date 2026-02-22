const { createClient } = require('@supabase/supabase-js');
const supabase = createClient("https://gcoomnnwmbehpkmbgroi.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdjb29tbm53bWJlaHBrbWJncm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjUzNDE5NDEsImV4cCI6MjA0MDkxNzk0MX0.S3Supif3vuWlAIz3JlRTeWDx6vMttsP5ynx_XM9Kvyw");

async function check() {
  const { data, error } = await supabase.from('viewbox').select('*').limit(1);
  if (error) {
    console.error("Error:", error);
  } else if (data && data.length > 0) {
    console.log("Columns:", Object.keys(data[0]));
  } else {
    console.log("No data found, trying to insert a dummy to see error or checking using REST", data);
  }
}
check();

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: process.env.MYSQL_PORT || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'order_Tracking',
    multipleStatements: true
  });

  try {
    console.log('Connected to database...');
    
    const migrationPath = path.join(__dirname, 'migrations', 'add_lab_fields_safe.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('Running migration...');
    
    // Split SQL by semicolons and run each statement separately to handle errors
    const statements = sql.split(';').filter(s => s.trim());
    let successCount = 0;
    let skipCount = 0;
    
    for (const statement of statements) {
      try {
        await connection.query(statement);
        successCount++;
      } catch (err) {
        // Ignore 'column already exists' errors
        if (err.code === 'ER_DUP_FIELDNAME' || err.code === 'ER_DUP_KEYNAME') {
          skipCount++;
        } else {
          throw err;
        }
      }
    }
    
    console.log(`Executed ${successCount} statements successfully`);
    if (skipCount > 0) {
      console.log(`Skipped ${skipCount} statements (already exists)`);
    }
    
    console.log('✅ Migration completed successfully!');
    console.log('New fields added to items table:');
    console.log('  - expiryDate');
    console.log('  - openingDate');
    console.log('  - storageTemp');
    console.log('  - chemicalType');
    console.log('  - msdsUrl');
    console.log('  - wasteStatus');
    console.log('\nNew tables created:');
    console.log('  - waste_records');
    console.log('  - counting_schedules');
    console.log('  - counting_records');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();

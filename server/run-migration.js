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
    
    // Get migration file from command line argument or use default
    const migrationFile = process.argv[2] || 'add_lab_fields_safe.sql';
    const migrationPath = path.join(__dirname, 'migrations', migrationFile);
    
    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found: ${migrationPath}`);
    }
    
    console.log(`Running migration: ${migrationFile}...`);
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    // Split SQL by semicolons and run each statement separately to handle errors
    const statements = sql.split(';').filter(s => s.trim());
    let successCount = 0;
    let skipCount = 0;
    
    for (const statement of statements) {
      try {
        await connection.query(statement);
        successCount++;
      } catch (err) {
        // Ignore 'column already exists' and 'duplicate entry' errors
        if (err.code === 'ER_DUP_FIELDNAME' || err.code === 'ER_DUP_KEYNAME' || err.code === 'ER_DUP_ENTRY') {
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
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();

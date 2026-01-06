import dotenv from 'dotenv';
import connectDB from '../config/db.js';
import { autoAllocateForAllPatients } from '../utils/autoAllocate.js';

dotenv.config();

async function run() {
  try {
    await connectDB();
    console.log('Connected to DB, running auto-allocate for all patients...');
    const results = await autoAllocateForAllPatients({ limitPerPatient: 3, dueAt: null, dailyReminder: false });
    console.log('Auto-allocate results:');
    console.dir(results, { depth: 4 });
  } catch (e) {
    console.error('Auto-allocate run failed', e);
  } finally {
    process.exit(0);
  }
}

run();

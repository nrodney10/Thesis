import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import connectDB from '../config/db.js';

dotenv.config();

const EMAIL = 'rn308997@student.polsl.pl';
const PASSWORD = process.env.SEED_PATIENT_PASSWORD || 'ChangeMe123!';

async function run(){
  try {
    await connectDB();
    let user = await User.findOne({ email: EMAIL });
    if (user) {
      console.log(`User already exists: ${EMAIL} (id=${user._id}) role=${user.role}`);
      if (user.role !== 'patient') {
        console.log('Existing user is not a patient; update role to patient.');
        user.role = 'patient';
        await user.save();
      }
    } else {
      const hashed = await bcrypt.hash(PASSWORD, 10);
      user = new User({
        name: 'Fitbit Patient',
        age: 30,
        email: EMAIL,
        password: hashed,
        role: 'patient'
      });
      await user.save();
      console.log(`Created patient user with email ${EMAIL}`);
    }
    console.log('Seed complete. Login credentials:');
    console.log(`Email: ${EMAIL}`);
    console.log(`Password: ${PASSWORD}`);
  } catch (e) {
    console.error('Seed error', e);
  } finally {
    await mongoose.disconnect();
  }
}

run();

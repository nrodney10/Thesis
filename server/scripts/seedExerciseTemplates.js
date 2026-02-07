import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import connectDB from '../config/db.js';
import User from '../models/User.js';
import ExerciseTemplate from '../models/ExerciseTemplate.js';

dotenv.config();

const THERAPIST_EMAIL = process.env.SEED_THERAPIST_EMAIL || 'therapist@example.com';
const THERAPIST_PASS = process.env.SEED_THERAPIST_PASSWORD || 'Therapist123!';

async function run(){
  try {
    await connectDB();
    let therapist = await User.findOne({ email: THERAPIST_EMAIL });
    if (!therapist) {
      const hashed = await bcrypt.hash(THERAPIST_PASS, 10);
      therapist = new User({ name: 'Seed Therapist', age: 35, email: THERAPIST_EMAIL, password: hashed, role: 'therapist' });
      await therapist.save();
      console.log('Created therapist', THERAPIST_EMAIL);
    } else {
      console.log('Found therapist', THERAPIST_EMAIL);
    }

    // T-position template
    const tTitle = 'T Pose Hold (Arms Straight)';
    let ttpl = await ExerciseTemplate.findOne({ title: tTitle, createdBy: therapist._id });
    if (!ttpl) {
      ttpl = new ExerciseTemplate({
        title: tTitle,
        description: 'Hold arms out horizontally (T position). Voice coaching will acknowledge when within allowed rotation.',
        category: 'upper-body',
        createdBy: therapist._id,
        poseConfig: {
          joints: 'shoulder',
          smoothing: 0.2,
          minRepTimeMs: 500,
          targets: {
            type: 'tpose',
            allowedRotation: 12,
            correctMsg: 'Nice and steady - great T pose!',
            incorrectMsg: 'Keep your arms straight out to the sides, please.'
          }
        }
      });
      await ttpl.save();
      console.log('Created template:', tTitle);
    } else {
      console.log('Template already exists:', tTitle);
    }
    const eTitle = 'Elbow 90 deg Hold';
    let etpl = await ExerciseTemplate.findOne({ title: eTitle, createdBy: therapist._id });
    if (!etpl) {
      etpl = new ExerciseTemplate({
        title: eTitle,
        description: 'Hold elbow at ~90 degrees. Voice coaching will prompt corrections when outside +/-5 degrees.',
        category: 'upper-body',
        createdBy: therapist._id,
        poseConfig: {
          joints: 'arm',
          smoothing: 0.18,
          minRepTimeMs: 400,
          targets: {
            type: 'range',
            targetRange: [85, 95],
            correctMsg: 'Good - hold that 90 degrees.',
            incorrectMsg: 'Adjust your elbow to about 90 degrees.'
          }
        }
      });
      await etpl.save();
      console.log('Created template:', eTitle);
    } else {
      console.log('Template already exists:', eTitle);
    }

    const sTitle = 'Bodyweight Squat Hold';
    let stpl = await ExerciseTemplate.findOne({ title: sTitle, createdBy: therapist._id });
    if (!stpl) {
      stpl = new ExerciseTemplate({
        title: sTitle,
        description: 'Hold a squat with knees roughly 80-100 degrees, chest tall, and arms parallel to the floor.',
        category: 'lower-body',
        createdBy: therapist._id,
        poseConfig: {
          joints: 'knee',
          smoothing: 0.22,
          minRepTimeMs: 700,
          targets: {
            type: 'squat',
            kneeRange: [80, 100],
            torsoMaxLean: 25,
            armMaxTilt: 25
          }
        }
      });
      await stpl.save();
      console.log('Created template:', sTitle);
    } else {
      console.log('Template already exists:', sTitle);
    }

    console.log('Seed templates complete.');
  } catch (e) {
    console.error('Seed templates error', e);
  } finally {
    await mongoose.disconnect();
  }
}

run();

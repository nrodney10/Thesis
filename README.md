RodRecover

This is a full-stack app with a React client and a Node/Express server. It helps you manage exercises, patients, messages, and reports.

Overview

The repository has a React frontend in the 'client/' folder and a Node/Express backend in the 'server/' folder. The backend stores data in MongoDB and can connect to Fitbit if you want.

Prerequisites

Node.js and npm. Install from the official site: https://nodejs.org/
MongoDB (local or Atlas)
Fitbit developer credentials for Fitbit integration

If you already have the 'node_modules' folders, you don't need to run 'npm install' unless you want to update the dependencies.

Repository layout

'server/': Node/Express backend with API routes, models, and scripts
'client/': React frontend built with Create React App

Environment variables

Create a ‘.env’ file in the ‘server/’ folder with:

MONGO_URI=
JWT_SECRET=
PORT=5000
FITBIT_CLIENT_ID=
FITBIT_CLIENT_SECRET=
FITBIT_CALLBACK_URL=https://your-app/callback

Quick MongoDB Atlas setup:

1. Create a free Atlas account and a new cluster: https://www.mongodb.com/atlas
2. Create a database user and whitelist your IP (or allow access from anywhere during development).
3. Get the connection string for your cluster, put in your credentials and database name, and use it for 'MONGO_URI'.

Fitbit developer setup:

1. Register a new app at the Fitbit developer portal: https://dev.fitbit.com/apps/new
2. Once you register, you'll get a 'Client ID' and 'Client Secret'.
3. When you register, set the redirect or callback URL to 'http://localhost:5000/api/fitbit/callback' or use your app's URL.
4. Add 'FITBIT_CLIENT_ID', 'FITBIT_CLIENT_SECRET', and 'FITBIT_CALLBACK_URL' to your 'server/.env' file.

Install

To install dependencies for both the server and client, start from the repository root:

cd server
npm install

cd client
npm install

Running the application

Start the backend and frontend in two separate terminal windows.

Backend (nodemon recommended):

cd server
npm run dev

Frontend:

cd client
npm start

By default, the frontend runs at 'http://localhost:3000' and the backend at 'http://localhost:5000'. Change the ports or proxy settings if you need to.
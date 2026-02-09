# RodRecover

A full-stack application (React client + Node/Express server) for managing exercises, patients, messages, and reports.

## Overview

This repository contains a React frontend (in 'client/') and a Node/Express backend (in 'server/'). The backend uses MongoDB for persistence and supports optional Fitbit integration.

## Prerequisites

Node.js and npm. Install from the official site: https://nodejs.org/
MongoDB (local or Atlas)
Fitbit developer credentials for Fitbit integration

Note: If the 'node_modules' directories are already present you do not need to run 'npm install' unless you want to update dependencies.

## Repository layout

'server/' — Node/Express backend, API routes, models, and scripts
'client/' — React frontend (Create React App)

## Environment variables

Create a '.env' file in the 'server/' folder with:

MONGO_URI=<your MongoDB connection string>
JWT_SECRET=<a strong secret>
PORT=5000
FITBIT_CLIENT_ID=<id>
FITBIT_CLIENT_SECRET=<secret>
FITBIT_CALLBACK_URL=<https://your-app/callback>

Quick MongoDB Atlas setup:

1. Create a free Atlas account and a new cluster: https://www.mongodb.com/atlas
2. Create a database user and whitelist your IP (or allow access from anywhere during development).
3. Obtain the connection string for the cluster, replace '<password>' and '<database>' with your credentials/DB name, and set it as 'MONGO_URI'.

Fitbit developer setup:

1. Register a new app at the Fitbit developer portal: https://dev.fitbit.com/apps/new
2. After registering you will receive a 'Client ID' and 'Client Secret'.
3. While registering, set the redirect/callback URL to 'http://localhost:5000/api/fitbit/callback' (or the URL your app will use).
4. Add the 'FITBIT_CLIENT_ID', 'FITBIT_CLIENT_SECRET', and 'FITBIT_CALLBACK_URL' to your 'server/.env'.

## Install

Install dependencies for both server and client from the repository root:

cd server
npm install

cd client
npm install


## Running the application

Start backend and frontend in separate terminals.

Backend (nodemon recommended):

cd server
npm run dev


Frontend:

cd client
npm start


By default the frontend runs at 'http://localhost:3000' and the backend at 'http://localhost:5000' — adjust ports or proxy settings if required.
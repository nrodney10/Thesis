RodRecover

This is a full-stack app with a React client and a Node/Express server. It helps you manage exercises, patients, messages, and reports.



Overview

The repository has a React frontend in the 'client/' folder and a Node/Express backend in the 'server/' folder. The backend stores data in MongoDB and can connect to Fitbit if you want.



Prerequisites

Node.js and npm. Install from the official site: https://nodejs.org/
MongoDB (local or Atlas)
If you already have the 'node_modules' folders, you don't need to run 'npm install' unless you want to update the dependencies.


Repository layout

'server/': Node/Express backend with API routes, models, and scripts
'client/': React frontend built with Create React App

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


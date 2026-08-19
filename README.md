# RKVeda SEO API

First milestone backend for the RKVeda SEO platform.

## Stack
Node.js + Express + MySQL

## Run
npm install
Copy `.env.example` to `.env` and add your MySQL credentials.
Create the database using `database/schema.sql`.
Then run:

npm start

Test:
GET /health

Never commit `.env` or real database passwords to GitHub.
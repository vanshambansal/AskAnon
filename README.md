# AskAnon 🎭

> Ask freely, learn fearlessly.

A real-time anonymous classroom Q&A platform built for Chitkara University.

## Tech Stack

**Frontend:** React.js, Socket.io-client, Clerk Auth, Tailwind  
**Backend:** Node.js, Express.js, Socket.io, PostgreSQL, Redis, Clerk

## Features

- 🎭 Anonymous questions — names never shown
- ⚡ Real-time delivery via WebSockets
- 🗳️ Upvote system — most wanted questions bubble up
- 🚦 Rate limiting — 1 question per 30 seconds
- 🔒 Restricted to @chitkara.edu.in emails
- 📄 Export session summary as PDF

## Project Structure
```
askanon/
├── backend/          # Node.js + Express API
│   ├── src/
│   │   ├── config/   # DB + Redis connections
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   └── socket/
└── frontend/         # React.js app
    └── src/
        ├── pages/
        └── utils/
```

## Setup

### Backend
```bash
cd backend
npm install
# Add .env file with your keys
npm run dev
```

### Frontend
```bash
cd frontend
npm install
# Add .env file with your keys
npm run dev
```

## Environment Variables

### Backend `.env`
```
PORT=5000
DATABASE_URL=your_postgresql_url
REDIS_URL=your_redis_url
CLERK_SECRET_KEY=your_clerk_secret
CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
```

### Frontend `.env`
```
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
VITE_API_URL=http://localhost:5000
```
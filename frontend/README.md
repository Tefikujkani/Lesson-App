# Study Hub — AI study assistant for students

React + Express + MongoDB + Google Gemini.

## Setup

1. Install dependencies:

```bash
cd frontend
npm install
```

2. Create your env file:

```bash
copy .env.example .env
```

3. Fill in `frontend/.env`:

| Variable | Purpose |
|----------|---------|
| `GROQ_API_KEY` | Free Groq key for chat, quiz, and file analysis |
| `MONGODB_URI` | Atlas or local MongoDB connection string |
| `JWT_SECRET` | Long random string used to sign login tokens |

Get a Groq key at: https://console.groq.com

4. Run the app:

```bash
npm run dev
```

Open http://localhost:3000

## API overview

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create student account |
| POST | `/api/auth/login` | Sign in |
| POST | `/api/auth/guest` | Demo guest account |
| GET | `/api/curriculum` | Load subjects/lectures from MongoDB |
| PUT | `/api/curriculum` | Save subjects/lectures |
| POST | `/api/chat` | AI tutor (Gemini) |
| POST | `/api/quiz` | Generate lecture quiz |
| POST | `/api/analyze-file` | Analyze uploaded notes/images |

## MongoDB collections

- `users` — accounts
- `subjects` — curriculum (subjects + embedded lectures) per user
- `chathistories` — tutor chat threads per lecture

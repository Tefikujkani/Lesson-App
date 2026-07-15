# NoteLab — AI study assistant for students

React + Express + MongoDB + Google Gemini.

## Setup

1. Install dependencies:

```bash
cd project
npm install
```

2. Create your env file:

```bash
copy .env.example .env
```

3. Fill in `project/.env`:

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

## Group Study Room

From the sidebar, open **Group Study Room** to create or join a lobby (max 10 students).

| Feature | How it works |
|---------|----------------|
| Invite link | Share `/#/room/CODE` (or the copy button in-room) |
| Voice | “Join voice” — mesh WebRTC between everyone in the room |
| Chat | Real-time text via Socket.IO |
| Whiteboard | Shared canvas; touch/stylus pressure supported |
| AI Buddy | Tag `@AI` in chat for short funny analogies; `@AI hint` for a 1-sentence clue |

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/rooms` | Create a room (auth) |
| GET | `/api/rooms/:code` | Look up a room (auth) |
| POST | `/api/rooms/ai` | Ask the room AI buddy (auth) |
| WS | `/socket.io` | Presence, chat, whiteboard, WebRTC signaling |

## MongoDB collections

- `users` — accounts
- `subjects` — curriculum (subjects + embedded lectures) per user
- `chathistories` — tutor chat threads per lecture
- `studyrooms` — group study room metadata (invite codes)

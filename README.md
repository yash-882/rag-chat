# Retrieval-Augmented Generation System

A production-ready RAG backend that lets users upload PDF documents and ask questions about them. The system extracts text, generates vector embeddings, performs semantic similarity search, and streams answers from an LLM — all tied to a full auth system with conversations and message history.

---

## Features

- **PDF Upload & Processing** — text extraction, cleaning, and overlapping chunking
- **Vector Embeddings** — generated via Google Gemini (`gemini-embedding-001`, 768 dimensions)
- **Semantic Search** — cosine similarity search using `pgvector` in PostgreSQL
- **LLM Answers** — powered by Groq's `llama-3.1-8b-instant` via OpenAI-compatible SDK
- **SSE Streaming** — real-time token-by-token answer streaming over Server-Sent Events
- **Redis Caching** — cache-aside strategy for answers and PDF lists; graceful degradation if Redis is down
- **Duplicate Detection** — SHA-256 file hashing prevents re-uploading the same PDF
- **Conversations & Message History** — full conversation threading with cursor-based pagination
- **Auth System** — OTP-verified sign-up, JWT access/refresh tokens via HTTP-only cookies, forgot password flow, Google OAuth login/sign-up
- **Upload Limits** — configurable max PDF count per user

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (ESM) |
| Framework | Express 5 |
| Database | PostgreSQL + pgvector |
| ORM | Prisma 7 (with `@prisma/adapter-pg`) |
| Cache | Redis 5 |
| Embeddings | Google Gemini (`@google/genai`) |
| LLM | Groq via OpenAI SDK (`llama-3.1-8b-instant`) |
| PDF Parsing | `unpdf` |
| Auth | JWT (`jsonwebtoken`), bcrypt, Passport.js (Google OAuth) |
| Email | Mailjet (`node-mailjet`) |
| File Upload | Multer |

---

## Project Structure

```
loadEnvVars.js                   # Environment variables loader
src/
├── app.js                        # Express app setup, middleware, routes
├── server.js                     # Server bootstrap, DB/Redis connection
├── configs/
│   ├── prisma.config.js
│   ├── redis.config.js
│   ├── googleGenAi.config.js
│   └── openAi.config.js          # Groq client (OpenAI-compatible)
├── controllers/
│   ├── auth.controller.js
│   ├── content.controller.js     # Upload, Q&A, streaming
│   ├── conversation.controller.js
│   └── user.controller.js
├── middlewares/
│   ├── auth.middleware.js
│   ├── content.middleware.js     # Duplicate + upload limit check
│   ├── globalErr.middleware.js
│   ├── pagination.middleware.js
│   └── serviceCheck.middleware.js
├── routes/
│   ├── auth.route.js
│   ├── content.route.js
│   ├── conversation.route.js
│   └── user.route.js
├── utils/
│   ├── classes/
│   │   └── opError.class.js      # Operational error class
│   └── services/
│       ├── ai.service.js         # Embeddings + LLM (streaming & non-streaming)
│       ├── auth.service.js
│       ├── cache.service.js
│       ├── conversation.service.js
│       ├── email.service.js
│       ├── multer.service.js
│       ├── pdf.service.js        # Chunking, hashing, source extraction
│       ├── token.service.js
│       ├── user.service.js
│       └── classes/
│           └── redis.service.js  # Redis abstraction (OTP, cache)
auth-strategies/
├── googleOAuth2.js               # Google OAuth2 strategy with Passport.js
prisma/
├── schema.prisma
└── migrations/
```

---

## Database Schema

```prisma
model user {
  id            String         @id @default(uuid())
  email         String         @unique
  password      String
  name          String
  auths         String[]       // Auth methods: ['LOCAL', 'GOOGLE']
  created_at    DateTime       @default(now())
  pdfs          pdf[]
  conversations conversation[]
}

model pdf {
  id         String      @id @default(uuid())
  file_name  String
  file_hash  String      @unique   // SHA-256, for duplicate detection
  user_id    String
  created_at DateTime    @default(now())
  pdf_chunks pdf_chunk[]
  @@index([user_id])
}

model pdf_chunk {
  id         String                @id @default(uuid())
  pdf_id     String
  chunk_text String
  embedding  Unsupported("vector")
  @@index([pdf_id])
}

model conversation {
  id         String    @id @default(uuid())
  user_id    String
  created_at DateTime  @default(now())
  messages   message[]
  @@index([user_id, created_at(sort: Desc)])
}

model message {
  id              String      @id @default(uuid())
  conversation_id String
  content         String
  role            Role        // USER | ASSISTANT
  type            MessageType // SUCCESS | NO_RESULT
  created_at      DateTime    @default(now())
  seq             Int         @default(autoincrement())
  @@index([conversation_id, created_at(sort: Desc), seq(sort: Desc)])
}
```

---

## API Endpoints

### Auth — `/api/auth`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/google` | — | Initiate Google OAuth login/sign-up |
| GET | `/google/callback` | — | Handle Google OAuth callback |
| POST | `/sign-up/init` | — | Send OTP to email to begin registration |
| POST | `/sign-up/complete` | — | Verify OTP and create account |
| POST | `/login` | — | Login and receive JWT cookies |
| POST | `/logout` | ✓ | Clear auth cookies |
| POST | `/refresh` | — | Get a new access token via refresh token |
| POST | `/change-password` | ✓ | Change password using current password |
| POST | `/forgot-password/init` | — | Send OTP to email for password reset |
| POST | `/forgot-password/complete` | — | Verify OTP and set new password |

### Content — `/api/content`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/upload-file` | ✓ | Upload a PDF (multipart `file` field) |
| POST | `/get-answers` | ✓ | Ask a question, get a full JSON response |
| POST | `/get-answers-stream` | ✓ | Ask a question, get a streamed SSE response |
| GET | `/list` | ✓ | List all uploaded PDFs for the user |
| DELETE | `/delete/:fileId` | ✓ | Delete a PDF and its chunks |

### Conversations — `/api/conversation`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/list` | ✓ | Get paginated list of conversations |
| GET | `/:conversationId/messages` | ✓ | Get messages with cursor-based pagination |
| DELETE | `/delete/:conversationId` | ✓ | Delete a conversation |

### User — `/api/user`

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/me` | ✓ | Get current user's profile |
| PATCH | `/update-me` | ✓ | Update profile (name only) |
| DELETE | `/delete-me` | ✓ | Delete account (requires password confirmation) |

### Health Check

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health-check` | Returns server status |

---

## How the RAG Pipeline Works

```
1. User uploads a PDF
      ↓
2. Text is extracted (unpdf) and cleaned
      ↓
3. Text is split into overlapping chunks (800 chars, 20-word overlap)
      ↓
4. Gemini generates a 768-dim embedding for each chunk
      ↓
5. PDF row + all chunks inserted atomically via Prisma transaction
      ↓
6. User asks a question
      ↓
7. Question is embedded using Gemini
      ↓
8. pgvector cosine similarity search returns top 5 matching chunks
      ↓
9. If similarity < 0.5 → return "no relevant information found"
      ↓
10. Cache checked using key: `question:sortedPdfIds:userId`
      ↓
11. Cache hit → serve from Redis (simulates streaming word-by-word for SSE)
    Cache miss → send context + question to Groq LLM, stream response
      ↓
12. Answer + sources saved to cache (TTL: 600s)
13. Both user and assistant messages saved to conversation history
```

---

## Cursor-Based Pagination (Messages)

Messages use a composite `(created_at, seq)` cursor to handle exact-timestamp ties:

```
GET /api/conversation/:id/messages?last_msg_time=<ISO>&last_msg_seq=<number>
```

The `seq` column is an auto-incrementing integer that acts as a tiebreaker when two messages share the same `created_at` timestamp. On the first load, omit both query params to get the latest messages.

---

## Environment Variables

Create a `.env` file in the project root:

```env
# Server
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# PostgreSQL
DATABASE_URL=postgresql://user:password@localhost:5432/rag_db

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# JWT
JWT_ACCESS_SECRET=your_access_secret
JWT_REFRESH_SECRET=your_refresh_secret

# Google Gemini (embeddings)
GEMINI_API_KEY=your_gemini_api_key

# Groq (LLM via OpenAI SDK)
GROQ_API_KEY=your_groq_api_key

# Mailjet (email / OTP)
MAILJET_API_KEY=your_mailjet_api_key
MAILJET_SECRET_KEY=your_mailjet_secret_key
SENDER_EMAIL=your_sender_email

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_OAUTH_CALLBACK_URL=http://localhost:3000/api/auth/google/callback

# Upload limits
FILE_SIZE_LIMIT_MB=10
MAX_PDF_UPLOADS=10
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL with the `pgvector` extension enabled
- Redis

### Installation

```bash
# Clone the repo
git clone <repo-url>
cd rag-chat

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Fill in your values

# For Google OAuth, create credentials at https://console.developers.google.com/
# Set authorized redirect URI to: http://localhost:3000/api/auth/google/callback (or your domain)

# Enable pgvector extension in PostgreSQL
# Run in psql: CREATE EXTENSION IF NOT EXISTS vector;

# Run database migrations
npx prisma migrate deploy

# Start development server
npm run dev
```

### Production

```bash
npm start
```

---

## SSE Streaming — Client Example

```javascript
const response = await fetch('/api/content/get-answers-stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ question: 'What is this document about?', conversationId: null })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const lines = decoder.decode(value).split('\n\n').filter(Boolean);
  for (const line of lines) {
    const data = JSON.parse(line.replace('data: ', ''));

    if (data.type === 'chunk') {
      process.stdout.write(data.token); // stream token to UI
    }

    if (data.type === 'done') {
      console.log('Sources:', data.sources);
      console.log('Conversation ID:', data.conversationId);
    }

    if (data.type === 'error') {
      console.error('Error:', data.message);
    }
  }
}
```

---

## Redis Key Design

| Purpose | Pattern | TTL |
|---|---|---|
| Answer cache | `sha256(cached:<question:pdfIds:userId>)[:16]` | 600s |
| PDF list cache | `sha256(cached:user-pdfs:<userId>)[:16]` | 600s |
| Message page cache | `sha256(cached:messages:<userId>:<convId>:...)[:16]` | 600s |
| Sign-up OTP | `sha256(sign-up-otp:<email>)[:16]` | 600s |
| Forgot password OTP | `sha256(forgot-password-otp:<email>)[:16]` | 600s |
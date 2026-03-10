# PC Builder Backend

A Node.js/Express API for calculating PC component bottlenecks, managing builds, and handling user authentication — powered by Supabase (PostgreSQL).

## Features

- **Bottleneck Calculator** — Compares CPU, GPU, and RAM performance scores to detect imbalances
- **Compatibility Filtering** — Ensures CPU socket matches motherboard and RAM memory type is compatible
- **Build Management** — Save, list, and delete PC builds (authenticated)
- **Auth** — Signup, login, token refresh, and logout via Supabase Auth
- **Calculation History** — Track past bottleneck calculations

## Tech Stack

- **Runtime:** Node.js + Express
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth (JWT)
- **Security:** Helmet, CORS, express-rate-limit
- **Logging:** Winston

## Setup

1. Clone the repo
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and fill in your Supabase credentials:
   ```bash
   cp .env.example .env
   ```
4. Run the SQL in `supabase/full_setup.sql` in your Supabase SQL Editor to create tables and RPC functions
5. Start the server:
   ```bash
   npm run dev
   ```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/calculate` | Calculate bottleneck (by IDs or raw scores) |
| GET | `/api/v1/history` | Recent calculation history |
| GET | `/api/components` | All components grouped by type |
| GET | `/api/components/compatible?cpuId=X` | Compatible motherboards & RAM for a CPU |
| GET | `/api/components/compatible/motherboards?socket=X` | Motherboards by socket |
| GET | `/api/components/compatible/ram?memoryType=X` | RAM by memory type |
| POST | `/api/auth/signup` | Register |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/refresh` | Refresh token |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Current user profile |
| GET | `/api/builds` | List user's builds |
| POST | `/api/builds` | Save a build |
| DELETE | `/api/builds/:id` | Delete a build |
| GET | `/api/health` | Health check |

## License

ISC


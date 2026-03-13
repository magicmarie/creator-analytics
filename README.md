# CreatorScope

Multi-platform creator analytics system

## Tech Stack

- **Backend**: Node.js + TypeScript + Express
- **Frontend**: React + TypeScript + Vite
- **Database**: PostgreSQL
- **Cache**: Redis

## Getting Started

```bash
# Start infrastructure
docker-compose up -d postgres redis

# Setup backend
cd backend
npm install
cp .env.example .env
npm run migrate
npm run dev
```

## Development

Documentation and features will be added as the project progresses.

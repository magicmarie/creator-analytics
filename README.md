# CreatorScope

**Multi-platform creator analytics and campaign ROI tracking system**.

CreatorScope helps brands measure the performance of influencer marketing campaigns by automatically ingesting creator metrics from YouTube and GitHub, then connecting them to campaign budgets and conversions to calculate ROI.

> **Platform Extensibility:** While this demo focuses on YouTube and GitHub, the architecture is designed to support additional platforms (Instagram, TikTok, Twitter/X, Twitch, etc.) by adding new ingestion modules to `backend/src/ingestion/` and updating the platform type definitions.

## Tech Stack

**Frontend**
- React 19 with TypeScript
- Vite 8 for build tooling
- TailwindCSS for styling
- Recharts for data visualization
- Axios for API requests
- React Query for data fetching

**Backend**
- Node.js 20 with TypeScript
- Express for REST API
- PostgreSQL 16 for relational data
- Redis 7 for caching and job queue
- BullMQ for background job processing
- Pino for structured logging

**Infrastructure**
- Docker Compose for orchestration
- Multi-stage Docker builds
- Nginx for frontend serving

**External APIs**
- YouTube Data API v3
- GitHub REST API v3

**Patterns & Libraries**
- Circuit breaker (opossum) for API resilience
- Connection pooling (pg)
- Rate limiting (express-rate-limit)
- CORS middleware

## Quick Start (Docker)

The entire stack runs with Docker Compose. No local dependencies needed besides Docker.

```bash
# 1. Clone the repository
git clone https://github.com/magicmarie/creator-analytics.git
cd creator-analytics

# 2. Set environment variables
cp .env.example .env
# Edit .env and add your YOUTUBE_API_KEY and GITHUB_TOKEN
# Note: GitHub API works without auth (lower rate limits), YouTube requires API key

# 3. Start all services
docker-compose up --build

# 4. Run database migrations
docker-compose exec backend npm run migrate

# 5. Seed tracked creators
docker-compose exec backend npm run seed:tracked

# 6. Trigger initial data ingestion (fetches real data and seeds campaigns)
curl -X POST http://localhost:4000/api/v1/admin/ingest/trigger
# Wait ~10 seconds for ingestion to complete, then check worker logs:
# docker-compose logs worker --tail 30
```

**Access the application:**
- Frontend: http://localhost:5173
- Backend API: http://localhost:4000
- Health check: http://localhost:4000/health

## What's Running

| Service | Description | Port |
|---------|-------------|------|
| **frontend** | React dashboard with charts and analytics | 5173 |
| **backend** | Express API server | 4000 |
| **worker** | Background job processor for data ingestion | - |
| **postgres** | PostgreSQL 16 database | 5432 |
| **redis** | Redis cache and BullMQ queue | 6379 |

## Architecture

### Backend Services

**API Server** (`backend/src/index.ts`)
- RESTful API with versioned routes (`/api/v1`)
- Rate limiting (1000 req/15min)
- Structured logging with Pino
- Graceful shutdown handling
- Automated ingestion scheduler (runs every 12 hours)

**Worker** (`backend/src/worker.ts`)
- BullMQ job processor
- Handles YouTube and GitHub data ingestion
- Circuit breaker pattern for API resilience
- Retry logic with exponential backoff

**Data Flow:**
```
Tracked Creators → Job Queue → Worker → External APIs → Database → Cache → Frontend
                      ↓
                 Scheduled (12h)
```

### Data Ingestion Process

**Initial State (after migrations and seeding):**
- Database contains 10 tracked creators (handles/IDs only)
- No actual creator profiles or metrics yet
- Frontend will show empty state

**After triggering ingestion:**
1. Worker fetches creator profiles from YouTube and GitHub APIs
2. Fetches latest content (videos for YouTube, repos for GitHub)
3. Calculates engagement rates from likes, comments, views
4. Stores time-series snapshots for historical tracking
5. Caches results in Redis for fast API responses
6. Auto-seeds sample campaigns (first run only) with ROI data linked to creators

**Manual trigger:**
```bash
curl -X POST http://localhost:4000/api/v1/admin/ingest/trigger
```

**Automatic ingestion:**
- Scheduler runs every 12 hours to keep data fresh
- Configure schedule via `INGESTION_SCHEDULE` environment variable

### Database Schema

**Core Tables:**
- `creators` - Creator profiles (platform, handle, name, etc.)
- `creator_snapshots` - Time-series metrics (followers, engagement)
- `content` - Creator posts/repos with performance data
- `campaigns` - Brand campaigns with budgets and dates
- `campaign_creators` - Junction table linking campaigns to creators with spend/conversions
- `tracked_creators` - Database-driven creator management (no code changes needed to add creators)

**Key Design Decisions:**
- Append-only snapshots for historical analysis
- Platform validation via CHECK constraints
- Composite unique indexes for deduplication
- Cascading deletes for data integrity

### Frontend

Built with React + TypeScript + Vite + TailwindCSS

**Features:**
- **Dashboard Overview:** Total creators, followers, content, engagement
- **Platform Distribution:** Pie chart showing YouTube vs GitHub split
- **Growth Trends:** Line chart tracking follower growth over time
- **Campaign ROI:** Expandable cards showing cost per conversion and cost per follower
- **Creator Table:** Searchable, filterable table with latest metrics

## Adding New Platforms

The architecture is designed for easy platform extension. Here's how to add a new platform (e.g., Instagram):

**1. Update Platform Types**
```typescript
// backend/src/types/platforms.ts
export type Platform = 'youtube' | 'github' | 'instagram';  // Add new platform
```

**2. Create Ingestion Module**
```typescript
// backend/src/ingestion/instagram.ts
export async function ingestInstagramCreators() {
  // Fetch from Instagram API
  // Transform to common creator schema
  // Store in database
}
```

**3. Add to Ingestion Runner**
```typescript
// backend/src/ingestion/run.ts
import { ingestInstagramCreators } from './instagram';

// Add to ingestion flow
await ingestInstagramCreators();
```

**4. Update Seed Data** (optional)
```typescript
// backend/src/db/seed-tracked-creators.ts
// Add Instagram creator handles
```

**5. Run Migration** (if schema changes needed)
```typescript
// backend/src/db/migrations.ts
// Add new migration for Instagram-specific fields
```

**Implementation Checklist:**
- [ ] Add platform to type definitions
- [ ] Create API client for platform
- [ ] Implement data transformation logic
- [ ] Add error handling and retry logic
- [ ] Update seed data
- [ ] Test ingestion flow
- [ ] Update frontend platform filter

The modular design means most changes are isolated to the ingestion layer—no changes needed to database schema, API routes, or frontend components (except adding the platform to filters).

## API Endpoints

### Creators
- `GET /api/v1/creators` - List all creators with latest snapshot
- `GET /api/v1/creators/:id` - Get creator details
- `GET /api/v1/creators/:id/snapshots` - Get historical metrics

### Campaigns
- `GET /api/v1/campaigns` - List all campaigns
- `GET /api/v1/campaigns/:id` - Get campaign details
- `GET /api/v1/campaigns/:id/performance` - Get campaign ROI metrics
- `POST /api/v1/campaigns` - Create campaign

### Analytics
- `GET /api/v1/analytics/platform-stats` - Aggregate stats by platform
- `GET /api/v1/analytics/growth-trends` - Historical growth data
- `GET /api/v1/analytics/engagement-alerts` - Creators with engagement drops
- `GET /api/v1/analytics/overview` - Dashboard summary stats

### Content
- `GET /api/v1/content` - List all content with filters
- `GET /api/v1/content/top` - Top performing content

### Admin
- `POST /api/v1/admin/tracked-creators` - Add creator to tracking list
- `POST /api/v1/admin/ingest/trigger` - Trigger manual ingestion
- `GET /api/v1/admin/ingest/status` - Get ingestion status

## Technology Choices & Tradeoffs

### PostgreSQL
**Benefits:**
- Strong relational data model supports complex relationships (creators → snapshots → campaigns)
- Native support for time-series queries needed for growth trends
- ACID guarantees ensure data integrity for campaign budgets and financial metrics

**Tradeoffs:**
- TimescaleDB would provide better time-series performance at scale
- Horizontal scaling requires read replicas and connection pooling

### Redis + BullMQ
**Benefits:**
- Persistent job queue with automatic retry logic and failure handling
- Caching layer reduces database load for expensive analytics queries
- Distributed rate limiting across multiple API server instances

**Tradeoffs:**
- Adds infrastructure complexity with another service to manage
- pg-boss (PostgreSQL-based queue) would simplify deployments for smaller scale

### Docker Compose
**Benefits:**
- Consistent environments across development and production
- New developers can run the full stack with one command
- Built-in service orchestration with health checks and dependency management

**Tradeoffs:**
- Not suitable for production at scale; would use Kubernetes or AWS ECS
- Limited auto-scaling and self-healing capabilities

### Circuit Breaker Pattern
**Benefits:**
- Prevents cascading failures when external APIs (YouTube/GitHub) are down
- Automatic recovery once external services are healthy again
- Protects quota limits by failing fast instead of retrying

**Tradeoffs:**
- First request after circuit opens incurs latency for health check
- Requires tuning threshold parameters based on API characteristics

## Key Features Demonstrated

**1. Real Data Ingestion**
- Automated fetching from YouTube Data API v3 and GitHub API
- Incremental updates every 12 hours via scheduler
- Deduplication and error handling

**2. Campaign ROI Tracking**
- Cost Per Conversion = Campaign Spend ÷ Total Conversions
- Cost Per Follower = Campaign Spend ÷ Total Followers Reached
- Connects manual business metrics with automated creator data

**3. Production-Ready Patterns**
- Versioned migrations with rollback support
- Structured logging (JSON format for aggregation)
- Rate limiting and CORS
- Graceful shutdown handling
- Health checks for orchestration
- Circuit breakers for external APIs

**4. Developer Experience**
- TypeScript strict mode
- Database-driven configuration (add creators without redeploying)
- Docker multi-stage builds (optimized image size)
- Hot reload in development mode

## Next Steps

### Immediate Priorities
1. **Authentication & Authorization** - JWT-based auth, role-based access control
2. **Input Validation & Schema Validation** - Zod schemas for API request validation and external API response validation (YouTube/GitHub). Prevents bad data from users and catches breaking changes in external APIs before they corrupt the database.
3. **Webhook Ingestion** - Real-time updates from platforms instead of polling
4. **Advanced Analytics** - Cohort analysis, predictive modeling, anomaly detection
5. **Export Functionality** - CSV/PDF reports for stakeholders

### Scalability Improvements
5. **Horizontal Scaling** - Stateless API servers behind load balancer
6. **Read Replicas** - Separate read/write database instances
7. **CDN** - CloudFront for frontend assets
8. **Monitoring** - Prometheus + Grafana for metrics, Sentry for error tracking

### Product Features
9. **Additional Platforms** - Extend beyond YouTube/GitHub to Instagram, TikTok, Twitter/X, Twitch, LinkedIn. The modular ingestion architecture makes adding new platforms straightforward: create a new ingestion module in `backend/src/ingestion/`, update platform types, and deploy.
10. **Multi-Tenant Support** - White-label solution for multiple brands
11. **Content Analysis** - NLP for sentiment analysis on creator posts
12. **Competitor Tracking** - Benchmark against industry averages
13. **Budget Optimization** - ML-powered recommendations for creator selection

### Infrastructure
14. **CI/CD Pipeline** - GitHub Actions for automated testing and deployment
15. **E2E Tests** - Playwright tests for critical user flows
16. **Database Backups** - Automated daily backups to S3
17. **Secrets Management** - HashiCorp Vault or AWS Secrets Manager


## Troubleshooting & Maintenance

```bash
# View logs
docker-compose logs -f backend
docker-compose logs -f worker

# Run migrations
docker-compose exec backend npm run migrate

# Access database
docker-compose exec postgres psql -U postgres -d creator_analytics

# Access Redis
docker-compose exec redis redis-cli

# Rebuild specific service
docker-compose up --build backend

# Stop all services
docker-compose down

# Stop and remove volumes (fresh start)
docker-compose down -v
```

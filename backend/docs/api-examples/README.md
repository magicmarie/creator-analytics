# API Response Examples

Example payloads from external APIs used in CreatorScope ingestion.

## YouTube Data API v3

### 1. Channel Data (`youtube-channel.json`)
**Endpoint:** `GET https://www.googleapis.com/youtube/v3/channels`

**Used in:** `src/ingestion/youtube.ts` - `fetchChannelsBreaker`

**Fields we use:**
- `items[].id` - Channel ID
- `items[].snippet.title` - Channel name
- `items[].snippet.description` - Channel bio
- `items[].snippet.thumbnails.high.url` - Avatar
- `items[].statistics.subscriberCount` - Follower count
- `items[].statistics.videoCount` - Total videos
- `items[].statistics.viewCount` - Total views

---

### 2. Video Search (`youtube-search.json`)
**Endpoint:** `GET https://www.googleapis.com/youtube/v3/search`

**Used in:** `src/ingestion/youtube.ts` - `fetchRecentVideos`

**Purpose:** Get list of recent video IDs for a channel

**Fields we use:**
- `items[].id.videoId` - Video IDs to fetch details for

---

### 3. Video Details (`youtube-videos.json`)
**Endpoint:** `GET https://www.googleapis.com/youtube/v3/videos`

**Used in:** `src/ingestion/youtube.ts` - `fetchRecentVideos`

**Purpose:** Get statistics for engagement calculation

**Fields we use:**
- `items[].statistics.viewCount` - Views
- `items[].statistics.likeCount` - Likes
- `items[].statistics.commentCount` - Comments

**Engagement formula:** `(likes + comments) / views`

---

## GitHub REST API

### 4. User Profile (`github-user.json`)
**Endpoint:** `GET https://api.github.com/users/{username}`

**Used in:** `src/ingestion/github.ts` - `fetchUserBreaker`

**Fields we use:**
- `login` - Username/handle
- `name` - Display name
- `bio` - Profile description
- `avatar_url` - Profile picture
- `html_url` - Profile link
- `followers` - Follower count
- `following` - Following count
- `public_repos` - Repository count

---

### 5. User Repositories (`github-repos.json`)
**Endpoint:** `GET https://api.github.com/users/{username}/repos`

**Used in:** `src/ingestion/github.ts` - `fetchRecentRepos`

**Purpose:** Calculate engagement from recent repository activity

**Fields we use:**
- `stargazers_count` - Stars (used as "likes")
- `forks_count` - Forks (used as "comments")
- `watchers_count` - Watchers (used as "views")

**Engagement formula:** `(stars + forks) / watchers`

---

## Notes

- All examples are real API response structures
- YouTube API requires `YOUTUBE_API_KEY` environment variable
- GitHub API works without auth but has lower rate limits. Use `GITHUB_TOKEN` for authenticated requests
- Rate limits:
  - YouTube: 10,000 quota units/day (channel fetch = 1 unit, video search = 100 units)
  - GitHub: 60 req/hour unauthenticated, 5,000 req/hour authenticated

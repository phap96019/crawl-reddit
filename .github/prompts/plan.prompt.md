---
name: plan
description: Planning and architecture guidance for the Reddit Comment Crawler project
---

# Reddit Comment Crawler - Project Planning Guide

## Project Overview
A full-stack web application that crawls Reddit posts and their comments, allowing users to export data in CSV or JSON formats with customizable field selection.

## Tech Stack
- **Frontend**: React 18 + Vite (client/)
- **Backend**: Express.js + Node.js (server/)
- **Data Fetching**: node-fetch for Reddit JSON API
- **Build**: Custom build.js for production bundling

## Project Structure
```
crawl-reddit/
├── client/              # React frontend
│   ├── src/
│   │   ├── App.jsx      # Main component with UI logic
│   │   ├── App.css      # Styles
│   │   └── main.jsx     # Entry point
│   └── vite.config.js   # Vite configuration
├── server/              # Express backend
│   ├── index.js         # API routes & server setup
│   ├── redditCrawler.js # Reddit scraping logic
│   └── public/          # Built client assets
├── build.js             # Production build script
└── package.json         # Root scripts & monorepo config
```

## Key Features
1. **Multi-URL Support**: Crawl multiple Reddit posts in one request
2. **Deep Comment Fetching**: Recursively fetches nested comments & "more comments"
3. **Field Selection**: Users choose which post/comment fields to export
4. **Export Formats**: CSV and JSON download options
5. **Caching**: Temporary in-memory cache for download sessions

## API Endpoints
- `POST /api/crawl` - Crawl Reddit URL(s) and return data
- `POST /api/download/csv` - Download cached data as CSV
- `POST /api/download/json` - Download cached data as JSON

## Development Commands
```bash
npm run install:all  # Install all dependencies
npm run dev          # Run client + server concurrently
npm run build        # Build for production
npm start            # Start production server
```

## Planning Considerations

### When Adding Features
1. Determine if it's frontend-only, backend-only, or full-stack
2. For API changes, update both server/index.js and client fetch calls
3. Add new fields to POST_FIELDS or COMMENT_FIELDS arrays in App.jsx
4. Consider rate limiting and Reddit API constraints

### Performance Notes
- Reddit rate limits: 1.5s delay between requests (DELAY_MS)
- "More comments" fetching can be slow for large threads
- Cache cleanup after 10 entries to prevent memory issues

### Error Handling
- Validate Reddit URL format (extract postId, subreddit)
- Handle HTTP errors from Reddit API
- Report per-URL errors in multi-URL crawls

## Common Tasks

### Add a New Export Field
1. Add field definition to POST_FIELDS or COMMENT_FIELDS in App.jsx
2. Ensure the field is extracted in redditCrawler.js extractComments()
3. Update generateCSV() if special formatting is needed

### Modify Crawling Behavior
- Edit redditCrawler.js
- Key functions: extractComments(), findMoreComments(), crawlRedditComments()

### Update UI Components
- Main logic in client/src/App.jsx
- Styles in client/src/App.css
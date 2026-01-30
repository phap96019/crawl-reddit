import express from 'express';
import cors from 'cors';
import { crawlRedditComments, generateCSV } from './redditCrawler.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// Store crawled data temporarily (in production, use Redis or similar)
const crawlCache = new Map();

// Crawl endpoint
app.post('/api/crawl', async (req, res) => {
  const { url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'Reddit URL is required' });
  }
  
  try {
    console.log(`🚀 Starting crawl for: ${url}`);
    
    const result = await crawlRedditComments(url, (progress) => {
      console.log(`📊 ${progress.message}`);
    });
    
    // Cache the result for download
    const cacheId = Date.now().toString();
    crawlCache.set(cacheId, result);
    
    // Clean up old cache entries (keep last 10)
    if (crawlCache.size > 10) {
      const firstKey = crawlCache.keys().next().value;
      crawlCache.delete(firstKey);
    }
    
    console.log(`✅ Crawl complete: ${result.comments.length} comments`);
    
    res.json({
      success: true,
      cacheId,
      post: result.post,
      commentCount: result.comments.length,
      crawled_at: result.crawled_at,
    });
    
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Download JSON endpoint
app.post('/api/download/json', (req, res) => {
  const { cacheId } = req.body;
  
  const data = crawlCache.get(cacheId);
  if (!data) {
    return res.status(404).json({ error: 'Data not found. Please crawl again.' });
  }
  
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="reddit_comments_${cacheId}.json"`);
  res.send(JSON.stringify(data, null, 2));
});

// Download CSV endpoint
app.post('/api/download/csv', (req, res) => {
  const { cacheId, postFields, commentFields } = req.body;
  
  const data = crawlCache.get(cacheId);
  if (!data) {
    return res.status(404).json({ error: 'Data not found. Please crawl again.' });
  }
  
  const csv = generateCSV(data, postFields || [], commentFields || []);
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="reddit_comments_${cacheId}.csv"`);
  res.send(csv);
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

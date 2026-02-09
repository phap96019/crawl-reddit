import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { crawlRedditComments, generateCSV } from './redditCrawler.js';
import { crawlFacebookComments, generateFacebookCSV } from './facebookCrawler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve static files from public folder (built client)
app.use(express.static(join(__dirname, 'public')));

// Store crawled data temporarily (in production, use Redis or similar)
const crawlCache = new Map();
const facebookCache = new Map();

// Crawl endpoint - supports multiple URLs
app.post('/api/crawl', async (req, res) => {
  let { urls, url } = req.body;
  
  // Support both single url and multiple urls
  if (!urls && url) {
    urls = [url];
  }
  
  if (!urls || urls.length === 0) {
    return res.status(400).json({ error: 'At least one Reddit URL is required' });
  }
  
  try {
    console.log(`🚀 Starting crawl for ${urls.length} URL(s)...`);
    
    const allResults = [];
    const errors = [];
    
    for (let i = 0; i < urls.length; i++) {
      const currentUrl = urls[i].trim();
      if (!currentUrl) continue;
      
      console.log(`\n📍 [${i + 1}/${urls.length}] Crawling: ${currentUrl}`);
      
      try {
        const result = await crawlRedditComments(currentUrl, (progress) => {
          console.log(`   📊 ${progress.message}`);
        });
        allResults.push(result);
        console.log(`   ✅ Got ${result.comments.length} comments`);
      } catch (err) {
        console.error(`   ❌ Error: ${err.message}`);
        errors.push({ url: currentUrl, error: err.message });
      }
    }
    
    if (allResults.length === 0) {
      return res.status(500).json({ 
        error: 'Failed to crawl all URLs', 
        details: errors 
      });
    }
    
    // Combine all results
    const combinedResult = {
      posts: allResults.map(r => r.post),
      comments: allResults.flatMap(r => r.comments),
      crawled_at: new Date().toISOString(),
      postCount: allResults.length,
      errors: errors.length > 0 ? errors : undefined,
    };
    
    // Cache the result for download
    const cacheId = Date.now().toString();
    crawlCache.set(cacheId, combinedResult);
    
    // Clean up old cache entries (keep last 10)
    if (crawlCache.size > 10) {
      const firstKey = crawlCache.keys().next().value;
      crawlCache.delete(firstKey);
    }
    
    const totalComments = combinedResult.comments.length;
    console.log(`\n✅ Crawl complete: ${allResults.length} posts, ${totalComments} total comments`);
    
    res.json({
      success: true,
      cacheId,
      posts: allResults.map(r => ({
        title: r.post.title,
        author: r.post.author,
        subreddit: r.post.subreddit,
        score: r.post.score,
        commentCount: r.comments.length,
      })),
      postCount: allResults.length,
      totalComments,
      crawled_at: combinedResult.crawled_at,
      errors: errors.length > 0 ? errors : undefined,
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

// ============== FACEBOOK ENDPOINTS ==============

// Facebook crawl endpoint
app.post('/api/crawl/facebook', async (req, res) => {
  const { url, credentials } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'Facebook URL is required' });
  }
  
  // Validate URL is a Facebook URL
  if (!url.includes('facebook.com')) {
    return res.status(400).json({ error: 'Invalid Facebook URL' });
  }
  
  try {
    console.log(`\n🚀 Starting Facebook crawl for 2: ${url}`);
    
    const result = await crawlFacebookComments(url, {
      credentials: credentials?.email && credentials?.password ? credentials : null,
      headless: true, // Run headless in production
      onProgress: (progress) => {
        console.log(`   📊 [${progress.stage}] ${progress.message}`);
      },
    });
    
    // Cache the result for download
    const cacheId = `fb_${Date.now()}`;
    facebookCache.set(cacheId, result);
    
    // Clean up old cache entries (keep last 10)
    if (facebookCache.size > 10) {
      const firstKey = facebookCache.keys().next().value;
      facebookCache.delete(firstKey);
    }
    
    console.log(`\n✅ Facebook crawl complete: ${result.comments.length} comments`);
    
    res.json({
      success: true,
      cacheId,
      post: {
        url: result.post.url,
        author_name: result.post.author_name,
        content: result.post.content?.substring(0, 200) + (result.post.content?.length > 200 ? '...' : ''),
      },
      totalComments: result.comments.length,
      crawled_at: result.crawled_at,
    });
    
  } catch (error) {
    console.error(`❌ Facebook Error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Facebook download JSON endpoint
app.post('/api/download/facebook/json', (req, res) => {
  const { cacheId } = req.body;
  
  const data = facebookCache.get(cacheId);
  if (!data) {
    return res.status(404).json({ error: 'Data not found. Please crawl again.' });
  }
  
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="facebook_comments_${cacheId}.json"`);
  res.send(JSON.stringify(data, null, 2));
});

// Facebook download CSV endpoint
app.post('/api/download/facebook/csv', (req, res) => {
  const { cacheId, commentFields } = req.body;
  
  const data = facebookCache.get(cacheId);
  if (!data) {
    return res.status(404).json({ error: 'Data not found. Please crawl again.' });
  }
  
  const csv = generateFacebookCSV(data.post, data.comments, commentFields);
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="facebook_comments_${cacheId}.csv"`);
  res.send(csv);
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

// Serve React app for all other routes (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

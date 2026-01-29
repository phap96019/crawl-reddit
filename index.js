import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';

// Config
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DELAY_MS = 1500; // Delay between requests to avoid rate limiting
// const OUTPUT_FORMAT = 'csv'; // 'csv' or 'json'
const OUTPUT_FORMAT = 'json'; // 'csv' or 'json'

/**
 * Sleep for a specified duration
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Extract post ID from Reddit URL
 */
function extractPostId(url) {
  // Handle various Reddit URL formats
  // https://www.reddit.com/r/subreddit/comments/postid/title/
  // https://reddit.com/r/subreddit/comments/postid/
  // https://old.reddit.com/r/subreddit/comments/postid/title/
  const match = url.match(/\/comments\/([a-z0-9]+)/i);
  if (!match) {
    throw new Error('Invalid Reddit URL. Could not extract post ID.');
  }
  return match[1];
}

/**
 * Extract subreddit from Reddit URL
 */
function extractSubreddit(url) {
  const match = url.match(/\/r\/([^\/]+)/i);
  if (!match) {
    throw new Error('Invalid Reddit URL. Could not extract subreddit.');
  }
  return match[1];
}

/**
 * Fetch JSON from Reddit API
 */
async function fetchRedditJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Extract comments from Reddit API response
 */
function extractComments(children, allComments = []) {
  for (const child of children) {
    if (child.kind === 't1') {
      // t1 = comment
      const data = child.data;
      const comment = {
        id: data.id,
        author: data.author,
        body: data.body,
        score: data.score,
        created_utc: data.created_utc,
        created_date: new Date(data.created_utc * 1000).toISOString(),
        permalink: `https://reddit.com${data.permalink}`,
        depth: data.depth || 0,
        parent_id: data.parent_id,
        is_submitter: data.is_submitter || false,
      };
      
      allComments.push(comment);

      // Process replies recursively
      if (data.replies && data.replies.data && data.replies.data.children) {
        extractComments(data.replies.data.children, allComments);
      }
    } else if (child.kind === 'more') {
      // Store "more" references for later fetching
      // We'll handle these separately
    }
  }

  return allComments;
}

/**
 * Find all "more" comment references in the response
 */
function findMoreComments(children, moreRefs = []) {
  for (const child of children) {
    if (child.kind === 'more' && child.data.children && child.data.children.length > 0) {
      moreRefs.push({
        id: child.data.id,
        parent_id: child.data.parent_id,
        children: child.data.children,
        count: child.data.count,
      });
    } else if (child.kind === 't1' && child.data.replies) {
      if (child.data.replies.data && child.data.replies.data.children) {
        findMoreComments(child.data.replies.data.children, moreRefs);
      }
    }
  }
  return moreRefs;
}

/**
 * Fetch "more" comments using Reddit API
 */
async function fetchMoreComments(postId, moreRef, subreddit) {
  // Reddit API endpoint for fetching more comments
  // We'll fetch in batches of 100 (Reddit's limit)
  const childrenIds = moreRef.children.slice(0, 100);
  
  const url = `https://www.reddit.com/api/morechildren.json?api_type=json&link_id=t3_${postId}&children=${childrenIds.join(',')}&limit_children=false`;
  
  try {
    const data = await fetchRedditJson(url);
    
    if (data.json && data.json.data && data.json.data.things) {
      return data.json.data.things;
    }
    
    return [];
  } catch (error) {
    console.error(`⚠️ Error fetching more comments: ${error.message}`);
    return [];
  }
}

/**
 * Main function to crawl all comments from a Reddit post
 */
async function crawlRedditComments(postUrl, options = {}) {
  const { maxDepth = Infinity, fetchAllMore = true } = options;
  
  console.log('🚀 Starting Reddit comment crawler...');
  console.log(`📎 URL: ${postUrl}`);
  
  // Extract info from URL
  const postId = extractPostId(postUrl);
  const subreddit = extractSubreddit(postUrl);
  
  console.log(`📝 Post ID: ${postId}`);
  console.log(`📁 Subreddit: r/${subreddit}`);
  
  // Fetch initial post data with comments
  // limit=500 gets more comments initially
  const jsonUrl = `https://www.reddit.com/r/${subreddit}/comments/${postId}.json?limit=500&depth=100&sort=confidence`;
  
  console.log('\n📥 Fetching initial comments...');
  const data = await fetchRedditJson(jsonUrl);
  
  if (!Array.isArray(data) || data.length < 2) {
    throw new Error('Invalid response from Reddit API');
  }
  
  // data[0] contains post info, data[1] contains comments
  const postData = data[0].data.children[0].data;
  const commentsData = data[1].data.children;
  
  // Extract post info
  const postInfo = {
    id: postData.id,
    title: postData.title,
    author: postData.author,
    subreddit: postData.subreddit,
    url: `https://reddit.com${postData.permalink}`,
    score: postData.score,
    num_comments: postData.num_comments,
    created_utc: postData.created_utc,
    created_date: new Date(postData.created_utc * 1000).toISOString(),
    selftext: postData.selftext || '',
  };
  
  console.log(`\n📰 Post: "${postInfo.title}"`);
  console.log(`👤 Author: u/${postInfo.author}`);
  console.log(`⬆️ Votes: ${postInfo.score}`);
  console.log(`💬 Total comments reported: ${postInfo.num_comments}`);
  
  // Extract initial comments
  let allComments = extractComments(commentsData);
  console.log(`\n✅ Extracted ${allComments.length} comments from initial fetch`);
  
  // Find and fetch "more" comments if enabled
  if (fetchAllMore) {
    let moreRefs = findMoreComments(commentsData);
    let iteration = 0;
    const maxIterations = 50; // Safety limit
    
    while (moreRefs.length > 0 && iteration < maxIterations) {
      iteration++;
      console.log(`\n🔄 Iteration ${iteration}: Found ${moreRefs.length} "more comments" references`);
      
      let newComments = [];
      let allNewChildren = [];
      
      for (let i = 0; i < moreRefs.length; i++) {
        const moreRef = moreRefs[i];
        
        if (moreRef.children.length === 0) continue;
        
        console.log(`   📥 Fetching batch ${i + 1}/${moreRefs.length} (${moreRef.children.length} comments)...`);
        
        const moreData = await fetchMoreComments(postId, moreRef, subreddit);
        
        // Extract comments from the response
        for (const thing of moreData) {
          if (thing.kind === 't1') {
            const d = thing.data;
            const comment = {
              id: d.id,
              author: d.author,
              body: d.body,
              score: d.score,
              created_utc: d.created_utc,
              created_date: new Date(d.created_utc * 1000).toISOString(),
              permalink: `https://reddit.com${d.permalink}`,
              depth: d.depth || 0,
              parent_id: d.parent_id,
              is_submitter: d.is_submitter || false,
            };
            newComments.push(comment);
          } else if (thing.kind === 'more' && thing.data.children) {
            // Collect new "more" references
            allNewChildren.push(...thing.data.children);
          }
        }
        
        // Rate limiting
        await sleep(DELAY_MS);
      }
      
      if (newComments.length > 0) {
        allComments = [...allComments, ...newComments];
        console.log(`   ✅ Added ${newComments.length} new comments (Total: ${allComments.length})`);
      }
      
      // Prepare for next iteration
      if (allNewChildren.length > 0) {
        moreRefs = [{
          id: 'collected',
          parent_id: null,
          children: allNewChildren,
          count: allNewChildren.length,
        }];
      } else {
        moreRefs = [];
      }
    }
  }
  
  // Remove duplicates
  const uniqueComments = Array.from(
    new Map(allComments.map(c => [c.id, c])).values()
  );
  
  console.log(`\n🎯 Final count: ${uniqueComments.length} unique comments`);
  
  return {
    post: postInfo,
    comments: uniqueComments,
    crawled_at: new Date().toISOString(),
  };
}

/**
 * Escape CSV field value
 */
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // If contains comma, newline, or quote, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Save results to CSV file
 */
async function saveToCSV(data, filename) {
  const headers = [
    'post_title', 'post_author', 'subreddit', 'post_url', 'post_score', 'num_comments', 'selftext',
    'comment_author', 'comment_body', 'comment_permalink'
  ];
  
  const rows = data.comments.map(comment => [
    escapeCSV(data.post.title),
    escapeCSV(data.post.author),
    escapeCSV(data.post.subreddit),
    escapeCSV(data.post.url),
    escapeCSV(data.post.score),
    escapeCSV(data.post.num_comments),
    escapeCSV(data.post.selftext),
    escapeCSV(comment.author),
    escapeCSV(comment.body),
    escapeCSV(comment.permalink)
  ].join(','));
  
  const csvContent = [headers.join(','), ...rows].join('\n');
  await fs.writeFile(filename, csvContent, 'utf-8');
  console.log(`\n💾 Saved to: ${filename}`);
}

/**
 * Save results to JSON file
 */
async function saveToJson(data, filename) {
  const jsonContent = JSON.stringify(data, null, 2);
  await fs.writeFile(filename, jsonContent, 'utf-8');
  console.log(`\n💾 Saved to: ${filename}`);
}

/**
 * Main entry point
 */
async function main() {
  // Get URL from command line arguments
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node index.js <reddit_post_url> [output_file]');
    console.log('');
    console.log('Examples:');
    console.log('  node index.js https://www.reddit.com/r/AskReddit/comments/abc123/some_title/');
    console.log('  node index.js https://reddit.com/r/programming/comments/xyz789/ comments.json');
    console.log('');
    process.exit(1);
  }
  
  const postUrl = args[0];
  const fileExtension = OUTPUT_FORMAT === 'json' ? 'json' : 'csv';
  const outputFile = args[1] || `reddit_comments_${Date.now()}.${fileExtension}`;
  
  try {
    const result = await crawlRedditComments(postUrl);
    
    if (OUTPUT_FORMAT === 'json') {
      await saveToJson(result, outputFile);
    } else {
      await saveToCSV(result, outputFile);
    }
    
    console.log('\n📊 Summary:');
    console.log(`   - Post: "${result.post.title}"`);
    console.log(`   - Comments crawled: ${result.comments.length}`);
    console.log(`   - Output file: ${outputFile}`);
    console.log('\n✨ Done!');
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Run
main();

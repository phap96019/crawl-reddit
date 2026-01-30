import fetch from 'node-fetch';

// Config
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DELAY_MS = 1500;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function extractPostId(url) {
  const match = url.match(/\/comments\/([a-z0-9]+)/i);
  if (!match) {
    throw new Error('Invalid Reddit URL. Could not extract post ID.');
  }
  return match[1];
}

function extractSubreddit(url) {
  const match = url.match(/\/r\/([^\/]+)/i);
  if (!match) {
    throw new Error('Invalid Reddit URL. Could not extract subreddit.');
  }
  return match[1];
}

async function fetchRedditJson(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

function extractComments(children, allComments = []) {
  for (const child of children) {
    if (child.kind === 't1') {
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

      if (data.replies && data.replies.data && data.replies.data.children) {
        extractComments(data.replies.data.children, allComments);
      }
    }
  }

  return allComments;
}

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

async function fetchMoreComments(postId, moreRef) {
  const childrenIds = moreRef.children.slice(0, 100);
  const url = `https://www.reddit.com/api/morechildren.json?api_type=json&link_id=t3_${postId}&children=${childrenIds.join(',')}&limit_children=false`;
  
  try {
    const data = await fetchRedditJson(url);
    if (data.json && data.json.data && data.json.data.things) {
      return data.json.data.things;
    }
    return [];
  } catch (error) {
    console.error(`Error fetching more comments: ${error.message}`);
    return [];
  }
}

export async function crawlRedditComments(postUrl, onProgress = null) {
  const postId = extractPostId(postUrl);
  const subreddit = extractSubreddit(postUrl);
  
  if (onProgress) onProgress({ status: 'fetching', message: 'Fetching initial comments...' });
  
  const jsonUrl = `https://www.reddit.com/r/${subreddit}/comments/${postId}.json?limit=500&depth=100&sort=confidence`;
  const data = await fetchRedditJson(jsonUrl);
  
  if (!Array.isArray(data) || data.length < 2) {
    throw new Error('Invalid response from Reddit API');
  }
  
  const postData = data[0].data.children[0].data;
  const commentsData = data[1].data.children;
  
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
  
  let allComments = extractComments(commentsData);
  
  if (onProgress) onProgress({ 
    status: 'progress', 
    message: `Extracted ${allComments.length} comments from initial fetch`,
    count: allComments.length 
  });
  
  // Fetch "more" comments
  let moreRefs = findMoreComments(commentsData);
  let iteration = 0;
  const maxIterations = 50;
  
  while (moreRefs.length > 0 && iteration < maxIterations) {
    iteration++;
    
    if (onProgress) onProgress({ 
      status: 'progress', 
      message: `Iteration ${iteration}: Fetching ${moreRefs.length} more comment batches...`,
      count: allComments.length 
    });
    
    let newComments = [];
    let allNewChildren = [];
    
    for (let i = 0; i < moreRefs.length; i++) {
      const moreRef = moreRefs[i];
      if (moreRef.children.length === 0) continue;
      
      const moreData = await fetchMoreComments(postId, moreRef);
      
      for (const thing of moreData) {
        if (thing.kind === 't1') {
          const d = thing.data;
          newComments.push({
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
          });
        } else if (thing.kind === 'more' && thing.data.children) {
          allNewChildren.push(...thing.data.children);
        }
      }
      
      await sleep(DELAY_MS);
    }
    
    if (newComments.length > 0) {
      allComments = [...allComments, ...newComments];
    }
    
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
  
  // Remove duplicates
  const uniqueComments = Array.from(
    new Map(allComments.map(c => [c.id, c])).values()
  );
  
  if (onProgress) onProgress({ 
    status: 'done', 
    message: `Completed! ${uniqueComments.length} unique comments`,
    count: uniqueComments.length 
  });
  
  return {
    post: postInfo,
    comments: uniqueComments,
    crawled_at: new Date().toISOString(),
  };
}

export function generateCSV(data, postFields, commentFields) {
  const escapeCSV = (value) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('\n') || str.includes('\r') || str.includes('"')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headers = [
    ...postFields.map(f => `post_${f}`),
    ...commentFields.map(f => `comment_${f}`)
  ];
  
  // Support both single post and multiple posts format
  const posts = data.posts || [data.post];
  const comments = data.comments;
  
  // Create a map of post by id for quick lookup
  const postMap = new Map();
  posts.forEach(post => postMap.set(post.id, post));
  
  const rows = comments.map(comment => {
    // Find the post this comment belongs to (by matching parent_id prefix)
    const postId = comment.parent_id?.startsWith('t3_') 
      ? comment.parent_id.slice(3) 
      : (comment.permalink?.match(/\/comments\/([a-z0-9]+)/i)?.[1] || posts[0]?.id);
    
    const post = postMap.get(postId) || posts[0];
    
    const postValues = postFields.map(f => escapeCSV(post?.[f]));
    const commentValues = commentFields.map(f => escapeCSV(comment[f]));
    return [...postValues, ...commentValues].join(',');
  });
  
  return [headers.join(','), ...rows].join('\n');
}

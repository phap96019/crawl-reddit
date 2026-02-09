import { chromium } from 'playwright';

// Config
const DEFAULT_TIMEOUT = 60000;
const DELAY_BETWEEN_ACTIONS = 1500;
const MAX_SCROLL_ATTEMPTS = 30;
const MAX_EXPAND_CLICKS = 100;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms + Math.random() * 500));

/**
 * Launch browser with stealth settings
 */
async function launchBrowser(headless = false) {
  const browser = await chromium.launch({
    headless,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
  });

  // Stealth mode
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  });

  return { browser, context };
}

/**
 * Login to Facebook
 */
async function loginToFacebook(page, credentials, onProgress) {
  onProgress?.({ stage: 'login', message: 'Navigating to Facebook...' });
  
  await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: DEFAULT_TIMEOUT });
  await sleep(2000);

  // Accept cookies if banner appears
  try {
    const cookieSelectors = [
      'button[data-cookiebanner="accept_button"]',
      'button[data-testid="cookie-policy-manage-dialog-accept-button"]',
      '[aria-label="Allow all cookies"]',
      'button:has-text("Accept All")',
      'button:has-text("Cho phép")',
    ];
    for (const sel of cookieSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await btn.click();
        await sleep(1000);
        break;
      }
    }
  } catch (e) {}

  onProgress?.({ stage: 'login', message: 'Entering credentials...' });
  
  // Fill login form
  await page.fill('input[name="email"], input#email', credentials.email);
  await sleep(300);
  await page.fill('input[name="pass"], input#pass', credentials.password);
  await sleep(300);
  
  // Click login button
  const loginBtnSelectors = ['button[name="login"]', 'button[type="submit"]', 'input[type="submit"]'];
  for (const sel of loginBtnSelectors) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await btn.click();
      break;
    }
  }
  
  // Wait for login to complete
  await sleep(5000);
  
  // Check if logged in
  const currentUrl = page.url();
  if (currentUrl.includes('/login') || currentUrl.includes('checkpoint')) {
    throw new Error('Login failed. Please check your credentials or complete verification.');
  }
  
  onProgress?.({ stage: 'login', message: 'Login successful!' });
  await sleep(2000);
  return true;
}

/**
 * Navigate to post and wait for content to load
 */
async function navigateToPost(page, url, onProgress) {
  onProgress?.({ stage: 'navigate', message: 'Navigating to post...' });
  
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: DEFAULT_TIMEOUT });
  await sleep(3000);
  
  // Check if we're on a login page
  const currentUrl = page.url();
  if (currentUrl.includes('/login') || currentUrl === 'https://www.facebook.com/') {
    throw new Error('Login required to view this post. Please provide Facebook credentials.');
  }
  
  // Close any popups
  const closeSelectors = ['[aria-label="Close"]', '[aria-label="Đóng"]', 'div[aria-label="Close"]'];
  for (const sel of closeSelectors) {
    try {
      const closeBtn = page.locator(sel).first();
      if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await closeBtn.click();
        await sleep(500);
      }
    } catch (e) {}
  }
  
  // Scroll to trigger comment loading
  await page.evaluate(() => window.scrollBy(0, 500));
  await sleep(2000);
  
  onProgress?.({ stage: 'navigate', message: 'Post loaded' });
}

/**
 * Expand all comments by scrolling the comment container (not body)
 */
async function expandAllComments(page, onProgress) {
  onProgress?.({ stage: 'expand', message: 'Loading all comments...' });
  
  let totalClicks = 0;
  let lastCommentCount = 0;
  let noChangeCount = 0;
  
  // Find the scrollable comment container - Facebook uses a specific container for comments
  // This is typically a div with role="dialog" or the comment section container
  const findScrollContainer = async () => {
    return await page.evaluate(() => {
      // Try to find the scrollable container for comments
      // Option 1: Modal/dialog container (when post opens in overlay)
      const dialog = document.querySelector('div[role="dialog"] div[style*="overflow"]');
      if (dialog) return 'dialog';
      
      // Option 2: Comment section container with scrollable area
      const commentSection = document.querySelector('div[aria-label*="Comment"], div[aria-label*="Bình luận"]')?.closest('div[style*="overflow"]');
      if (commentSection) return 'comment-section';
      
      // Option 3: Main scrollable area (for posts that open in a scrollable overlay)
      const scrollableOverlay = document.querySelector('div[role="dialog"]');
      if (scrollableOverlay) return 'overlay';
      
      return 'body';
    });
  };
  
  const scrollContainer = await findScrollContainer();
  onProgress?.({ stage: 'expand', message: `Scroll mode: ${scrollContainer}` });
  
  for (let i = 0; i < MAX_SCROLL_ATTEMPTS; i++) {
    // Scroll the appropriate container
    await page.evaluate((containerType) => {
      if (containerType === 'dialog') {
        // Scroll inside dialog
        const container = document.querySelector('div[role="dialog"] div[style*="overflow"]') ||
                         document.querySelector('div[role="dialog"]');
        if (container) container.scrollTop += 800;
      } else if (containerType === 'comment-section') {
        // Scroll comment section
        const container = document.querySelector('div[aria-label*="Comment"], div[aria-label*="Bình luận"]')?.closest('div[style*="overflow"]');
        if (container) container.scrollTop += 800;
      } else if (containerType === 'overlay') {
        // Scroll overlay
        const container = document.querySelector('div[role="dialog"]');
        if (container) container.scrollTop += 800;
        else window.scrollBy(0, 800);
      } else {
        // Fallback: scroll body
        window.scrollBy(0, 800);
      }
    }, scrollContainer);
    await sleep(1000);
    
    // Also try scrolling any visible scrollable element that contains comments
    await page.evaluate(() => {
      // Find all scrollable containers and scroll them
      const scrollables = document.querySelectorAll('div[style*="overflow: auto"], div[style*="overflow-y: auto"], div[style*="overflow:auto"], div[style*="overflow-y:auto"]');
      scrollables.forEach(el => {
        // Check if it contains comments
        if (el.querySelector('div[aria-label*="Comment"], div[aria-label*="Bình luận"], a[role="link"]')) {
          el.scrollTop += 500;
        }
      });
      
      // Also try scrolling elements with specific class patterns Facebook uses
      const fbScrollables = document.querySelectorAll('[class*="x1n2onr6"], [class*="x1ja2u2z"]');
      fbScrollables.forEach(el => {
        if (el.scrollHeight > el.clientHeight) {
          el.scrollTop += 500;
        }
      });
    });
    await sleep(1000);
    
    // Click "View replies" / "Xem phản hồi" buttons for nested comments (these still need clicks)
    const replyPatterns = [
      /\d+\s*(phản hồi|repl)/i,
      /xem.*phản hồi/i,
      /view.*repl/i,
    ];
    
    for (const pattern of replyPatterns) {
      const buttons = page.locator('div[role="button"], span[role="button"]').filter({ hasText: pattern });
      const count = await buttons.count().catch(() => 0);
      
      for (let j = 0; j < Math.min(count, 5); j++) {
        try {
          const btn = buttons.nth(j);
          if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
            await btn.click();
            totalClicks++;
            await sleep(DELAY_BETWEEN_ACTIONS);
          }
        } catch (e) {}
      }
    }
    
    // Click "See more" / "Xem thêm" on truncated comments to expand full text
    try {
      const seeMoreButtons = page.locator('div[role="button"]').filter({ hasText: /^(see more|xem thêm)$/i });
      const seeMoreCount = await seeMoreButtons.count().catch(() => 0);
      for (let j = 0; j < Math.min(seeMoreCount, 10); j++) {
        try {
          const btn = seeMoreButtons.nth(j);
          if (await btn.isVisible({ timeout: 300 }).catch(() => false)) {
            await btn.click();
            await sleep(200);
          }
        } catch (e) {}
      }
    } catch (e) {}
    
    // Count current comments - try multiple selectors
    const currentCount = await page.evaluate(() => {
      // Count by aria-label
      let count = document.querySelectorAll('div[aria-label*="Comment"], div[aria-label*="Bình luận"]').length;
      
      // If no aria-label comments found, count by structure (author links in comment-like containers)
      if (count === 0) {
        // Look for spans/divs that contain author names followed by comment text
        const potentialComments = document.querySelectorAll('ul > li, div[data-testid*="UFI"]');
        count = potentialComments.length;
      }
      
      return count;
    }).catch(() => 0);
    
    if (currentCount === lastCommentCount) {
      noChangeCount++;
      if (noChangeCount >= 5) {
        break; // No new comments loaded after 5 attempts
      }
    } else {
      noChangeCount = 0;
      lastCommentCount = currentCount;
    }
    
    onProgress?.({ stage: 'expand', message: 'Loading comments... (' + lastCommentCount + ' found, ' + totalClicks + ' expansions)' });
  }
  
  onProgress?.({ stage: 'expand', message: 'Finished loading. ' + totalClicks + ' expansions made.' });
}

/**
 * Extract post information
 */
async function extractPostInfo(page, url) {
  return await page.evaluate((postUrl) => {
    // Try to find post content
    let content = '';
    const contentSelectors = [
      '[data-ad-preview="message"]',
      'div[data-ad-comet-preview="message"]',
      'div[dir="auto"][style*="text-align"]',
    ];
    
    for (const sel of contentSelectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText) {
        content = el.innerText;
        break;
      }
    }
    
    // If no specific selector found, try to find the main post text
    if (!content) {
      const mainPost = document.querySelector('div[role="main"] div[dir="auto"]');
      content = mainPost?.innerText?.substring(0, 1000) || '';
    }
    
    // Find author
    let authorName = '';
    let authorUrl = '';
    const authorSelectors = [
      'h2 a[role="link"]',
      'strong a[role="link"]',
      'span a[role="link"][href*="/"]',
    ];
    
    for (const sel of authorSelectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText) {
        authorName = el.innerText;
        authorUrl = el.href || '';
        break;
      }
    }
    
    return {
      url: postUrl,
      content: content,
      author_name: authorName || 'Unknown',
      author_url: authorUrl,
      crawled_at: new Date().toISOString(),
    };
  }, url);
}

/**
 * Parse a single comment element (same logic as getCommentFBTemplate.js)
 */
function parseCommentScript() {
  return `
    function parseComment(commentEl) {
      // 1. Tên + link user
      const userLink = commentEl.querySelector(
        'a[role="link"][href*="facebook.com"]:not([aria-hidden="true"])'
      );

      const userName = userLink?.innerText.trim() || null;
      const userLinkFb = userLink?.href || null;

      // 2. Nội dung comment
      const contentEl = commentEl.querySelector(
        'div[dir="auto"]'
      );

      const content = contentEl?.innerText.trim() || null;

      // 3. Thời gian (ví dụ: 25 phút)
      const timeLink = [...commentEl.querySelectorAll('a')]
        .find(a => a.innerText.match(/phút|giờ|ngày|tuần|tháng|năm/));

      const time = timeLink?.innerText.trim() || null;

      return {
        userName,
        userLink: userLinkFb,
        content,
        time
      };
    }

    function getAllComments() {
      const comments = [];

      document.querySelectorAll('div[role="article"]').forEach(el => {
        const parsed = parseComment(el);

        // tránh lấy nhầm post chính
        if (parsed.userName && parsed.content) {
          comments.push(parsed);
        }
      });

      return comments;
    }

    return getAllComments();
  `;
}

/**
 * Extract all comments from the page using same logic as getCommentFBTemplate.js
 */
async function extractComments(page, onProgress) {
  onProgress?.({ stage: 'extract', message: 'Extracting comments...' });

  // Wait a bit for content to fully render
  await page.waitForTimeout(2000);

  const comments = await page.evaluate(() => {
    function parseComment(commentEl) {
      // 1. Tên + link user
      const userLink = commentEl.querySelector(
        'a[role="link"][href*="facebook.com"]:not([aria-hidden="true"])'
      );

      const userName = userLink?.innerText.trim() || null;
      const userLinkFb = userLink?.href || null;

      // 2. Nội dung comment
      const contentEl = commentEl.querySelector(
        'div[dir="auto"]'
      );

      const content = contentEl?.innerText.trim() || null;

      // 3. Thời gian (ví dụ: 25 phút)
      const timeLink = [...commentEl.querySelectorAll('a')]
        .find(a => a.innerText.match(/phút|giờ|ngày|tuần|tháng|năm/));

      const time = timeLink?.innerText.trim() || null;

      return {
        userName,
        userLink: userLinkFb,
        content,
        time
      };
    }

    function getAllComments() {
      const comments = [];

      document.querySelectorAll('div[role="article"]').forEach(el => {
        const parsed = parseComment(el);

        // tránh lấy nhầm post chính
        if (parsed.userName && parsed.content) {
          comments.push(parsed);
        }
      });

      return comments;
    }

    return getAllComments();
  });

  // Add id and map to expected format
  const formattedComments = comments.map((comment, idx) => ({
    id: 'fb_comment_' + (idx + 1),
    user_name: comment.userName,
    user_link: comment.userLink,
    comment_text: comment.content,
    time: comment.time,
  }));

  onProgress?.({ stage: 'extract', message: 'Extracted ' + formattedComments.length + ' comments' });
  return formattedComments;
}

/**
 * Generate CSV from Facebook comments
 */
export function generateFacebookCSV(post, comments, selectedFields) {
  const defaultFields = ['user_name', 'comment_text', 'time', 'user_link'];
  const fields = selectedFields && selectedFields.length > 0 ? selectedFields : defaultFields;

  const escapeCSV = (value) => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  const rows = [fields.join(',')];
  
  comments.forEach((comment) => {
    const row = fields.map((field) => escapeCSV(comment[field]));
    rows.push(row.join(','));
  });

  return rows.join('\n');
}

/**
 * Main crawl function
 * @param {string} url - Facebook post URL
 * @param {object} options - Options including credentials (required), headless mode, and progress callback
 */
export async function crawlFacebookComments(url, options = {}) {
  const { credentials, headless = false, onProgress = () => {} } = options;
  
  credentials.email = 'ducphapdh@gmail.com';
  credentials.password = 'phap96019';
  
  // Skip login for now - credentials are optional
  // if (!credentials?.email || !credentials?.password) {
  //   throw new Error('Facebook credentials (email and password) are required to crawl comments.');
  // }
  
  let browser, context;
  
  try {
    onProgress({ stage: 'init', message: '2Launching browser...' });
    ({ browser, context } = await launchBrowser(headless));
    
    const page = await context.newPage();
    page.setDefaultTimeout(DEFAULT_TIMEOUT);

    if (credentials?.email && credentials?.password) {
      await loginToFacebook(page, credentials, onProgress);
    }

    // Navigate to the post
    await navigateToPost(page, url, onProgress);

    // Expand all comments
    await expandAllComments(page, onProgress);

    // Extract post info
    const post = await extractPostInfo(page, url);
    onProgress({ stage: 'extract', message: 'Extracted post information' });

    // Extract comments
    const comments = await extractComments(page, onProgress);

    onProgress({ stage: 'complete', message: 'Crawl complete! Found ' + comments.length + ' comments' });

    return {
      post,
      comments,
      crawled_at: new Date().toISOString(),
      url,
    };
  } catch (error) {
    onProgress({ stage: 'error', message: 'Error: ' + error.message });
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export default {
  crawlFacebookComments,
  generateFacebookCSV,
};

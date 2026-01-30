import { useState } from 'react';
import './App.css';

// Available fields
const POST_FIELDS = [
  { key: 'title', label: 'Title' },
  { key: 'author', label: 'Author' },
  { key: 'subreddit', label: 'Subreddit' },
  { key: 'url', label: 'URL' },
  { key: 'score', label: 'Score (Votes)' },
  { key: 'num_comments', label: 'Comment Count' },
  { key: 'selftext', label: 'Post Content' },
  { key: 'created_date', label: 'Created Date' },
];

const COMMENT_FIELDS = [
  { key: 'author', label: 'Author' },
  { key: 'body', label: 'Body' },
  { key: 'score', label: 'Score' },
  { key: 'permalink', label: 'Permalink' },
  { key: 'depth', label: 'Depth' },
  { key: 'created_date', label: 'Created Date' },
  { key: 'is_submitter', label: 'Is OP' },
];

function App() {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState('csv');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  
  // Default selected fields
  const [postFields, setPostFields] = useState(['title', 'author', 'subreddit', 'url', 'score', 'num_comments']);
  const [commentFields, setCommentFields] = useState(['author', 'body', 'permalink']);
  const [showDonate, setShowDonate] = useState(false);

  const togglePostField = (key) => {
    setPostFields(prev => 
      prev.includes(key) ? prev.filter(f => f !== key) : [...prev, key]
    );
  };

  const toggleCommentField = (key) => {
    setCommentFields(prev => 
      prev.includes(key) ? prev.filter(f => f !== key) : [...prev, key]
    );
  };

  const handleCrawl = async () => {
    if (!url.trim()) {
      setError('Please enter a Reddit URL');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to crawl');
      }

      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!result) return;

    const endpoint = format === 'json' ? '/api/download/json' : '/api/download/csv';
    
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cacheId: result.cacheId,
          postFields,
          commentFields,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }

      // Download file
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `reddit_comments_${result.cacheId}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="app">
      <header className="header">
        <h1>🤖 Reddit Comment Crawler</h1>
        <p>Extract all comments from any Reddit post</p>
      </header>

      {/* URL Input */}
      <div className="card">
        <h2>📎 Reddit Post URL</h2>
        <div className="url-input-group">
          <input
            type="text"
            className="url-input"
            placeholder="https://www.reddit.com/r/subreddit/comments/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCrawl()}
          />
          <button 
            className="crawl-btn" 
            onClick={handleCrawl}
            disabled={loading}
          >
            {loading ? '⏳' : '🔍'} Crawl
          </button>
        </div>
      </div>

      {/* Format Selector */}
      <div className="card">
        <h2>📄 Output Format</h2>
        <div className="format-options">
          <div className="format-option">
            <input
              type="radio"
              id="format-csv"
              name="format"
              checked={format === 'csv'}
              onChange={() => setFormat('csv')}
            />
            <label htmlFor="format-csv">
              <div className="format-name">CSV</div>
              <div className="format-desc">Spreadsheet compatible</div>
            </label>
          </div>
          <div className="format-option">
            <input
              type="radio"
              id="format-json"
              name="format"
              checked={format === 'json'}
              onChange={() => setFormat('json')}
            />
            <label htmlFor="format-json">
              <div className="format-name">JSON</div>
              <div className="format-desc">Full data structure</div>
            </label>
          </div>
        </div>
      </div>

      {/* Field Selector (only for CSV) */}
      {format === 'csv' && (
        <div className="card">
          <h2>✅ Select Fields for CSV</h2>
          <div className="field-sections">
            <div className="field-section">
              <h3>Post Fields</h3>
              <div className="field-list">
                {POST_FIELDS.map(field => (
                  <label key={field.key} className="field-checkbox">
                    <input
                      type="checkbox"
                      checked={postFields.includes(field.key)}
                      onChange={() => togglePostField(field.key)}
                    />
                    <span>{field.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="field-section">
              <h3>Comment Fields</h3>
              <div className="field-list">
                {COMMENT_FIELDS.map(field => (
                  <label key={field.key} className="field-checkbox">
                    <input
                      type="checkbox"
                      checked={commentFields.includes(field.key)}
                      onChange={() => toggleCommentField(field.key)}
                    />
                    <span>{field.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="error">
          ❌ {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="card">
          <div className="loading">
            <div className="spinner"></div>
            <div className="loading-text">Crawling comments... This may take a while for posts with many comments.</div>
          </div>
        </div>
      )}

      {/* Result */}
      {result && !loading && (
        <div className="card result-card">
          <h2>✅ Crawl Complete</h2>
          <div className="result-info">
            <div className="result-title">{result.post.title}</div>
            <div className="result-meta">
              <span>👤 u/{result.post.author}</span>
              <span>📁 r/{result.post.subreddit}</span>
              <span>⬆️ {result.post.score} votes</span>
              <span>💬 {result.commentCount} comments</span>
            </div>
          </div>
          <button className="download-btn" onClick={handleDownload}>
            ⬇️ Download {format.toUpperCase()}
          </button>
        </div>
      )}

      {/* Donate Button */}
      <button className="donate-btn" onClick={() => setShowDonate(true)}>
        ☕ Buy me a coffee
      </button>

      {/* Donate Modal */}
      {showDonate && (
        <div className="modal-overlay" onClick={() => setShowDonate(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowDonate(false)}>✕</button>
            <h3>☕ Buy me a coffee</h3>
            <p>Scan QR code to donate</p>
            <div className="qr-container">
              <img src="/qr-donate.png" alt="QR Code" className="qr-image" />
            </div>
            <p className="donate-thanks">Thank you for your support! 💖</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

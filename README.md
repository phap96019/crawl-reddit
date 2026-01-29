# Reddit Comment Crawler

Công cụ Node.js để crawl tất cả comment từ một bài viết Reddit và lưu ra file JSON.

## Cài đặt

```bash
npm install
```

## Sử dụng

### Cú pháp cơ bản

```bash
node index.js <reddit_url> [output_file]
```

### Ví dụ

```bash
# Crawl comment và lưu với tên file mặc định
node index.js https://www.reddit.com/r/AskReddit/comments/abc123/some_title/

# Crawl comment và lưu với tên file tùy chọn
node index.js https://www.reddit.com/r/programming/comments/xyz789/ my_comments.json
```

## Output Format

File JSON sẽ có cấu trúc như sau:

```json
{
  "post": {
    "id": "abc123",
    "title": "Post title",
    "author": "username",
    "subreddit": "AskReddit",
    "url": "https://reddit.com/r/...",
    "score": 1234,
    "num_comments": 500,
    "created_utc": 1706500000,
    "created_date": "2024-01-29T00:00:00.000Z",
    "selftext": "Post content..."
  },
  "comments": [
    {
      "id": "comment_id",
      "author": "commenter",
      "body": "Comment text...",
      "score": 42,
      "created_utc": 1706500100,
      "created_date": "2024-01-29T00:01:40.000Z",
      "permalink": "https://reddit.com/r/.../comment_id/",
      "depth": 0,
      "parent_id": "t3_abc123",
      "is_submitter": false
    }
  ],
  "crawled_at": "2024-01-29T12:00:00.000Z"
}
```

## Tính năng

- ✅ Crawl tất cả comment (bao gồm cả "View more comments")
- ✅ Giữ nguyên cấu trúc nested comments (qua `parent_id` và `depth`)
- ✅ Rate limiting tự động (1.5s giữa các request)
- ✅ Hỗ trợ nhiều format URL Reddit
- ✅ Loại bỏ duplicate comments
- ✅ Lưu thông tin chi tiết về post và comments

## Lưu ý

- Script sử dụng Reddit JSON API công khai, không cần authentication
- Có rate limiting để tránh bị block (1.5s giữa các request)
- Với bài viết có nhiều comment (>1000), quá trình crawl có thể mất vài phút
- Reddit có thể giới hạn số lượng "more comments" có thể fetch

## Chỉ lấy text comment

Nếu bạn chỉ muốn lấy danh sách text comment đơn giản (như đoạn code browser ban đầu), bạn có thể xử lý file JSON:

```javascript
import fs from 'fs/promises';

const data = JSON.parse(await fs.readFile('reddit_comments.json', 'utf-8'));
const textOnly = data.comments.map(c => c.body);
console.log(textOnly);
```

Hoặc dùng `jq` trong terminal:

```bash
jq '.comments[].body' reddit_comments.json
```

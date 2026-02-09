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

const results = getAllComments();
console.log(results);
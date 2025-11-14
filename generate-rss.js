const fs = require('fs');
const crypto = require('crypto');
const { chromium } = require('playwright'); // npm i playwright

const apiURLs = [
  "https://bonikbarta.com/api/post-filters/73?root_path=00000000010000000001",
  "https://bonikbarta.com/api/post-lists/35?root_path=00000000010000000001",
  "https://bonikbarta.com/api/post-lists/36?root_path=00000000010000000001",
  "https://bonikbarta.com/api/post-lists/33?root_path=00000000010000000001",
  "https://bonikbarta.com/api/post-lists/34?root_path=00000000010000000001"
];

const baseURL = "https://bonikbarta.com";
const siteURL = baseURL;
const feedURL = `${baseURL}/feed.xml`;

// Generate GUID
function generateGUID(item) {
  const str = (item.title || '') + (item.summary || '') + (item.first_published_at || '');
  return crypto.createHash('md5').update(str).digest('hex');
}

// Convert API post to RSS item
function postToRSSItem(post) {
  const title = post.title || "No title";
  const link = baseURL + (post.url_path || "/");
  const description = post.summary || post.sub_title || "No description";
  const pubDate = post.first_published_at
    ? new Date(post.first_published_at).toUTCString()
    : new Date().toUTCString();
  const guid = generateGUID(post);

  return { title, link, description, pubDate, guid };
}

// Generate RSS XML
function generateRSS(items) {
  const nowUTC = new Date().toUTCString();

  let rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Bonikbarta Combined Feed</title>
    <link>${siteURL}</link>
    <atom:link href="${feedURL}" rel="self" type="application/rss+xml"/>
    <description>Latest articles from Bonikbarta</description>
    <language>bn</language>
    <lastBuildDate>${nowUTC}</lastBuildDate>
    <generator>GitHub Actions RSS Generator</generator>
`;

  items.forEach(item => {
    rss += `    <item>
      <title><![CDATA[${item.title}]]></title>
      <link>${item.link}</link>
      <description><![CDATA[${item.description}]]></description>
      <pubDate>${item.pubDate}</pubDate>
      <guid isPermaLink="false">${item.guid}</guid>
    </item>
`;
  });

  rss += '  </channel>\n</rss>';
  return rss;
}

// Fetch JSON via Playwright
async function fetchJSONWithPlaywright(page, url) {
  try {
    const response = await page.evaluate(async (u) => {
      const res = await fetch(u, { headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' } });
      return await res.text();
    }, url);

    if (!response.trim().startsWith('{')) {
      console.error("⚠️ Non-JSON response from", url);
      return null;
    }

    return JSON.parse(response);
  } catch (err) {
    console.error("❌ Failed to fetch:", url, err);
    return null;
  }
}

// Main
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/127 Safari/537.36"
  });
  const page = await context.newPage();

  const collected = [];
  const seenLinks = new Set();

  for (const url of apiURLs) {
    console.log("Fetching:", url);
    const data = await fetchJSONWithPlaywright(page, url);
    if (!data || !Array.isArray(data.posts)) continue;

    for (const post of data.posts) {
      const rssItem = postToRSSItem(post);
      if (!seenLinks.has(rssItem.link)) {
        seenLinks.add(rssItem.link);
        collected.push(rssItem);
      }
    }
  }

  await browser.close();

  collected.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  const rssXML = generateRSS(collected.slice(0, 50)); // latest 50
  fs.writeFileSync("feed.xml", rssXML, "utf8");

  console.log(`✅ RSS feed updated with ${collected.length} unique items.`);
})();
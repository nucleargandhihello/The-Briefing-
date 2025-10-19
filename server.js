// server.js - Node.js Express server for The Briefing
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory storage for articles (will reset on server restart)
let cachedArticles = [];

// Serve the HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// RSS Feed endpoint
app.get('/rss', (req, res) => {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    const rssItems = cachedArticles.slice(0, 20).map(article => `
    <item>
      <title><![CDATA[${article.headline}]]></title>
      <description><![CDATA[${article.summary}]]></description>
      <author>${article.author}</author>
      <category>${article.category}</category>
      <pubDate>${new Date(article.date).toUTCString()}</pubDate>
      <guid isPermaLink="false">${baseUrl}/#article-${article.id}</guid>
    </item>`).join('\n');

    const rssFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>The Briefing - India's Finest Satirical News</title>
    <link>${baseUrl}</link>
    <description>Absurd, satirical news about India that will make you laugh and question reality</description>
    <language>en-in</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${baseUrl}/rss" rel="self" type="application/rss+xml"/>
    ${rssItems}
  </channel>
</rss>`;

    res.set('Content-Type', 'application/rss+xml');
    res.send(rssFeed);
});

// Get articles endpoint (for RSS feed population)
app.get('/api/articles', (req, res) => {
    res.json(cachedArticles);
});

// Update articles cache
app.post('/api/update-cache', (req, res) => {
    const { articles } = req.body;
    cachedArticles = articles || [];
    res.json({ success: true, count: cachedArticles.length });
});

// Generate news endpoint
app.post('/api/generate-news', async (req, res) => {
    if (!GEMINI_API_KEY) {
        return res.status(503).json({ 
            error: 'Gemini API key not configured' 
        });
    }

    const { category, count = 3 } = req.body;
    
    const categories = ['politics', 'technology', 'lifestyle', 'business', 'cricket'];
    const selectedCategory = category === 'random' 
        ? categories[Math.floor(Math.random() * categories.length)]
        : category;

    // List of available Gemini models to try
    const models = [
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-flash-latest',
        'gemini-pro-latest',
        'gemini-2.5-pro',
        'gemini-pro'
    ];

    const prompt = `Generate ${count} satirical news headlines in The Onion style, focused on India. 
Category: ${selectedCategory}

Each article should be absurd, funny, and exaggerated but grounded in Indian context (cities, culture, work life, etc.).

Return ONLY a JSON array with this exact structure:
[
  {
    "category": "${selectedCategory}",
    "headline": "Funny satirical headline",
    "summary": "One sentence summary of the absurd story",
    "author": "Indian name",
    "date": "Oct 19, 2025"
  }
]

Make sure headlines are witty and reference Indian culture, cities, daily life, or current trends. Be creative and absurd!`;

    // Try each model until one works
    for (const model of models) {
        try {
            console.log(`Trying model: ${model}`);
            
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        contents: [{
                            parts: [{
                                text: prompt
                            }]
                        }],
                        generationConfig: {
                            temperature: 1.0,
                            maxOutputTokens: 2048,
                        }
                    })
                }
            );

            const data = await response.json();
            
            if (!response.ok) {
                console.log(`Model ${model} failed: ${data.error?.message}`);
                continue; // Try next model
            }

            console.log(`Success with model: ${model}`);
            
            const generatedText = data.candidates[0].content.parts[0].text;
            
            // Extract JSON from markdown code blocks if present
            let jsonText = generatedText;
            const jsonMatch = generatedText.match(/```json\n([\s\S]*?)\n```/) || 
                             generatedText.match(/```\n([\s\S]*?)\n```/);
            if (jsonMatch) {
                jsonText = jsonMatch[1];
            }
            
            const articles = JSON.parse(jsonText);
            
            // Add IDs to articles
            const articlesWithIds = articles.map((article, index) => ({
                id: Date.now() + index,
                ...article
            }));

            return res.json(articlesWithIds);
            
        } catch (error) {
            console.log(`Model ${model} error: ${error.message}`);
            continue; // Try next model
        }
    }
    
    // If all models failed
    res.status(500).json({ 
        error: 'Failed to generate news with any available model',
        details: 'All Gemini models failed. Please check your API key and quota.'
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Gemini API key ${GEMINI_API_KEY ? 'configured ✓' : 'missing ✗'}`);
});

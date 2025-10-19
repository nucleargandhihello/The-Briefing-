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

// Serve the HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
        'gemini-1.5-flash',
        'gemini-1.5-flash-latest',
        'gemini-1.5-pro',
        'gemini-1.5-pro-latest',
        'gemini-pro',
        'gemini-1.0-pro'
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

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Create images directory if it doesn't exist
if (!fs.existsSync('./images')) {
    fs.mkdirSync('./images', { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        cb(null, 'images/');
    },
    filename: function(req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB max file size
    },
    fileFilter: function(req, file, cb) {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// Serve static files from the current directory
app.use(express.static(path.join(__dirname)));

// Test route to verify server is running
app.get('/test', (req, res) => {
    res.send('Server is working!');
});

// Handle tutorial generation
app.post('/generate-tutorial', upload.array('scratchImages', 5), async (req, res) => {
    try {
        console.log(`Received ${req.files ? req.files.length : 0} files`);
        
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No images uploaded' });
        }

        // Process the first image
        const firstImagePath = req.files[0].path;
        const firstImageType = req.files[0].mimetype; // Get the actual mimetype
        console.log('Processing first image:', firstImagePath, 'type:', firstImageType);
        const firstImageBuffer = fs.readFileSync(firstImagePath);
        const firstBase64Image = firstImageBuffer.toString('base64');
        
        // Process additional images if any
        const additionalImages = [];
        const additionalImageTypes = [];
        
        for (let i = 1; i < req.files.length; i++) {
            const imagePath = req.files[i].path;
            const imageType = req.files[i].mimetype; // Get the actual mimetype
            console.log(`Processing additional image ${i}:`, imagePath, 'type:', imageType);
            const imageBuffer = fs.readFileSync(imagePath);
            const base64Image = imageBuffer.toString('base64');
            additionalImages.push(base64Image);
            additionalImageTypes.push(imageType);
        }
        
        // Generate the tutorial using Claude API
        const tutorial = await generateTutorial(
            firstBase64Image, 
            additionalImages, 
            firstImageType, 
            additionalImageTypes
        );
        
        // Return the generated tutorial
        res.json({ tutorial });
        
    } catch (error) {
        console.error('Error:', error);
        console.error('Error response data:', error.response?.data);
        res.status(500).json({ 
            error: 'An error occurred while generating the tutorial',
            details: error.message
        });
    }
});

// Function to generate tutorial using Claude API
async function generateTutorial(base64Image, additionalImages = [], imageType, additionalImageTypes = []) {
    try {
        const apiKey = process.env.CLAUDE_API_KEY;
        
        if (!apiKey) {
            throw new Error('Claude API key not found in environment variables');
        }

        // Create message content
        const content = [
            {
                type: 'text',
                text: additionalImages.length > 0 
                    ? `These are ${additionalImages.length + 1} screenshots of a Scratch project. Please analyze these images and create a clear, step-by-step tutorial explaining what the program does and how to recreate it. Focus on identifying the sprites, blocks, and logic flow. Make the tutorial appropriate for beginners with clear explanations of each step. Structure it with sections for: 1) Project Overview, 2) Components Used, 3) Step-by-Step Instructions, and 4) Tips for Modifications.`
                    : 'This is a screenshot of a Scratch project. Please analyze this image and create a clear, step-by-step tutorial explaining what the program does and how to recreate it. Focus on identifying the sprites, blocks, and logic flow. Make the tutorial appropriate for beginners with clear explanations of each step. Structure it with sections for: 1) Project Overview, 2) Components Used, 3) Step-by-Step Instructions, and 4) Tips for Modifications.'
            },
            {
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: imageType, // Use the actual mimetype
                    data: base64Image
                }
            }
        ];

        // Add additional images if any, with their correct mimetypes
        additionalImages.forEach((img, index) => {
            content.push({
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: additionalImageTypes[index], // Use the actual mimetype for each image
                    data: img
                }
            });
        });

        console.log(`Calling Claude API with ${additionalImages.length + 1} images`);
        
        const response = await axios.post(
            'https://api.anthropic.com/v1/messages',
            {
                model: 'claude-3-7-sonnet-20250219',
                max_tokens: 4000,
                messages: [
                    {
                        role: 'user',
                        content: content
                    }
                ]
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                }
            }
        );

        return response.data.content[0].text;
        
    } catch (error) {
        console.error('Error calling Claude API:', error.response?.data || error.message);
        throw new Error('Failed to generate tutorial with Claude API: ' + (error.response?.data?.error?.message || error.message));
    }
}

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
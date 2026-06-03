// SynapseSwarm Express Backend Server
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, 'db.json');

app.use(cors());
app.use(bodyParser.json());

// Helper to hash password
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Database initial configuration
function initDatabase() {
    if (!fs.existsSync(DB_FILE)) {
        const initialSchema = {
            users: [],
            pipelines: []
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialSchema, null, 2));
    }
}

function readDatabase() {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return { users: [], pipelines: [] };
    }
}

function writeDatabase(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Initialize database
initDatabase();

// --- AUTHENTICATION ROUTES ---

// Registration Route
app.post('/api/register', (e, res) => {
    const { username, password } = e.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    const db = readDatabase();
    const existingUser = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (existingUser) {
        return res.status(400).json({ error: 'Username already exists.' });
    }

    const passwordHash = hashPassword(password);
    const newUser = {
        id: 'user_' + Date.now(),
        username,
        passwordHash
    };

    db.users.push(newUser);
    writeDatabase(db);

    res.status(201).json({ message: 'Registration successful.', userId: newUser.id, username: newUser.username });
});

// Login Route
app.post('/api/login', (e, res) => {
    const { username, password } = e.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required.' });
    }

    const db = readDatabase();
    const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
    if (!user || user.passwordHash !== hashPassword(password)) {
        return res.status(401).json({ error: 'Invalid username or password.' });
    }

    res.json({ message: 'Login successful.', userId: user.id, username: user.username });
});

// --- PIPELINE MANAGEMENT ROUTES ---

// Save Pipeline
app.post('/api/pipelines/save', (e, res) => {
    const { userId, name, nodes } = e.body;
    if (!userId || !name || !nodes) {
        return res.status(400).json({ error: 'Missing pipeline parameters.' });
    }

    const db = readDatabase();
    // Check if pipeline with same name exists for this user to update, else insert new
    const existingIndex = db.pipelines.findIndex(p => p.userId === userId && p.name.toLowerCase() === name.toLowerCase());

    const pipelineData = {
        id: existingIndex >= 0 ? db.pipelines[existingIndex].id : 'pipe_' + Date.now(),
        userId,
        name,
        nodes,
        updatedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
        db.pipelines[existingIndex] = pipelineData;
    } else {
        db.pipelines.push(pipelineData);
    }

    writeDatabase(db);
    res.json({ message: 'Pipeline saved successfully.', pipelineId: pipelineData.id });
});

// Load All Pipelines for User
app.get('/api/pipelines/:userId', (e, res) => {
    const { userId } = e.params;
    if (!userId) {
        return res.status(400).json({ error: 'User ID is required.' });
    }

    const db = readDatabase();
    const userPipelines = db.pipelines.filter(p => p.userId === userId);
    res.json(userPipelines);
});

// Load Specific Pipeline
app.get('/api/pipelines/load/:pipelineId', (e, res) => {
    const { pipelineId } = e.params;
    const db = readDatabase();
    const pipeline = db.pipelines.find(p => p.id === pipelineId);
    if (!pipeline) {
        return res.status(404).json({ error: 'Pipeline not found.' });
    }
    res.json(pipeline);
});

// Delete Pipeline
app.delete('/api/pipelines/:pipelineId', (e, res) => {
    const { pipelineId } = e.params;
    const db = readDatabase();
    const initialLength = db.pipelines.length;
    db.pipelines = db.pipelines.filter(p => p.id !== pipelineId);
    
    if (db.pipelines.length === initialLength) {
        return res.status(404).json({ error: 'Pipeline not found.' });
    }

    writeDatabase(db);
    res.json({ message: 'Pipeline deleted successfully.' });
});

app.listen(PORT, () => {
    console.log(`SynapseSwarm Backend Server running on http://localhost:${PORT}`);
});

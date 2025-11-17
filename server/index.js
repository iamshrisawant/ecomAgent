// server/index.js

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const url = require('url');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { handleConnection } = require('./controllers/chatController');
const { checkNeo4jConnection } = require('./config/db');

// Check Neo4j connection on startup
checkNeo4jConnection();

const app = express();
// Middleware to parse incoming JSON in request bodies
app.use(express.json());

// API Route for handling logins
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// This now acts as a security gate for all incoming chat connections
wss.on('connection', (ws, req) => {
    try {
        // Find the token in the connection URL (e.g., ws://.../?token=xyz)
        const token = url.parse(req.url, true).query.token;

        if (!token) {
            // Close the connection if no token is provided
            return ws.close(1008, 'Authentication token not provided.');
        }

        // --- START FIX ---
        // Verify the token's authenticity using the environment variable
        // OLD: const decoded = jwt.verify(token, 'yourSecretKey');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // --- END FIX ---

        const customerId = decoded.user.id;
        
        console.log(`WebSocket connection authenticated for customer: ${customerId}`);
        
        // If the token is valid, pass the connection and the customerId to the controller
        handleConnection(ws, customerId);

    } catch (err) {
        // Close the connection if the token is invalid or expired
        console.error("WebSocket authentication error:", err.message);
        return ws.close(1008, 'Invalid authentication token.');
    }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
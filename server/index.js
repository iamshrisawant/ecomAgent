// server/index.js

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
require('dotenv').config();

// Import the controller
const { handleConnection } = require('./controllers/chatController');
const { checkNeo4jConnection } = require('./config/db');

// Check Neo4j connection
checkNeo4jConnection();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// When a client connects, hand the connection (ws) over to the controller
wss.on('connection', handleConnection);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
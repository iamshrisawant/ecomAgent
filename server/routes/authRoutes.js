// server/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { login, signup } = require('../controllers/authController');

// Existing Login Route
router.post('/login', login);

// New Signup Route
router.post('/signup', signup);

module.exports = router;
// server/routes/dashboardRoutes.js
const express = require('express');
const router = express.Router();

// --- UPDATED (PRIORITY 4 - Proactive Loop) ---
const { 
    getTickets, 
    getEscalations, 
    getSuggestions,
    createIntent,
    resolveTicketAndLearn // <-- Fix: Removed proposeIntent, added resolveTicketAndLearn
} = require('../controllers/dashboardController');
const { auth, checkRole } = require('../middlewares/authMiddleware'); 
// --- END UPDATED ---

// @route   GET /api/dashboard/tickets
// @desc    Get all support tickets
router.get('/tickets', [auth, checkRole('AGENT')], getTickets);

// @route   GET /api/dashboard/escalations
// @desc    Get all escalation tickets
router.get('/escalations', [auth, checkRole('AGENT')], getEscalations);

// @route   GET /api/dashboard/suggestions
// @desc    Get all AI suggestions
router.get('/suggestions', [auth, checkRole('AGENT')], getSuggestions);


// --- ADDED (Grounded Learning Loop) ---
// @route   POST /api/dashboard/tickets/resolve
// @desc    Resolve a ticket and trigger AI learning
router.post('/tickets/resolve', [auth, checkRole('AGENT')], resolveTicketAndLearn);
// --- END ADDED ---

// @route   POST /api/dashboard/intents
// @desc    Create a new AI intent (now with its rules)
router.post('/intents', [auth, checkRole('AGENT')], createIntent);

module.exports = router;
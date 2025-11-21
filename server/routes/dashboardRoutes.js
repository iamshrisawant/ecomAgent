// server/routes/dashboardRoutes.js
const express = require('express');
const router = express.Router();

const { 
    getTickets, 
    getEscalations, 
    getSuggestions,
    resolveTicketAndLearn,
    updateSuggestion,
    approveSuggestion,
    rejectSuggestion,
    getActiveIntents,
    deleteIntent,
    updateIntent // [NEW]
} = require('../controllers/dashboardController');

const { auth, checkRole } = require('../middlewares/authMiddleware'); 

// READ
router.get('/tickets', [auth, checkRole('AGENT')], getTickets);
router.get('/escalations', [auth, checkRole('AGENT')], getEscalations);
router.get('/suggestions', [auth, checkRole('AGENT')], getSuggestions);
router.get('/intents/active', [auth, checkRole('AGENT')], getActiveIntents);

// ACTIONS
router.post('/tickets/resolve', [auth, checkRole('AGENT')], resolveTicketAndLearn);

// Suggestion Actions
router.post('/suggestions/update', [auth, checkRole('AGENT')], updateSuggestion);
router.post('/suggestions/approve', [auth, checkRole('AGENT')], approveSuggestion);
router.post('/suggestions/reject', [auth, checkRole('AGENT')], rejectSuggestion);

// Live Intent Actions
router.post('/intents/update', [auth, checkRole('AGENT')], updateIntent); // [NEW]
router.post('/intents/delete', [auth, checkRole('AGENT')], deleteIntent);

module.exports = router;
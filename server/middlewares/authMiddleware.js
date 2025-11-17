// server/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

// This middleware just checks for a valid token
exports.auth = (req, res, next) => {
    // Get token from header (e.g., in `src/components/dashboard/TicketsTab.jsx` axios call)
    const token = req.header('x-auth-token'); 

    if (!token) {
        return res.status(401).json({ message: 'No token, authorization denied' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded.user;
        next();
    } catch (err) {
        res.status(401).json({ message: 'Token is not valid' });
    }
};

// This middleware checks for a specific role
exports.checkRole = (role) => (req, res, next) => {
    if (req.user && req.user.role === role) {
        next();
    } else {
        res.status(403).json({ message: 'Access denied: Insufficient role' });
    }
};
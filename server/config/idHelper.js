// server/utils/idHelper.js
const crypto = require('crypto');

// Configuration: Map Node Labels to ID Prefixes
const ID_PREFIXES = {
    'Ticket': 'TKT',
    'Escalation': 'ESC',
    'Order': 'ORD',
    'Product': 'PROD',
    'Shipment': 'SHP',
    'Return': 'RET',
    'Customer': 'CUST',
    'Review': 'REV',
    'Warranty': 'WAR',
    // Add new schema types here without changing logic
};

/**
 * Generates a schema-aware ID.
 * @param {string} label - The Node Label (e.g., "Ticket")
 */
const generateID = (label) => {
    // 1. Determine Prefix (Default to first 3 letters if unknown)
    const prefix = ID_PREFIXES[label] || label.substring(0, 3).toUpperCase();
    
    // 2. Generate Random Suffix (3 bytes = 6 hex chars)
    const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    
    return `${prefix}-${suffix}`;
};

module.exports = { generateID };
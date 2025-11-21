// server/controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { driver } = require('../config/db');
const { createUser, findUserByEmail } = require('../models/User'); // Import helper functions

// --- EXISTING LOGIN FUNCTION ---
exports.login = async (req, res) => {
    /* ... (Keep your existing login code exactly as is) ... */
    const { email, password } = req.body;
    const session = driver.session({ database: 'neo4j' });
    try {
        const result = await session.run(
            'MATCH (u:User {email: $email})-[:HAS_PROFILE]->(c:Customer) RETURN u, c.customerID AS customerId',
            { email }
        );
        if (result.records.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        const user = result.records[0].get('u').properties;
        const customerId = result.records[0].get('customerId');
        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
       
        const payload = { user: { id: customerId, role: user.role } };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
        
        res.json({ token, customerId, role: user.role });
        
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    } finally {
        await session.close();
    }
};

// --- NEW SIGNUP FUNCTION ---
exports.signup = async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ message: 'Please fill in all fields' });
    }

    try {
        // 1. Check if user already exists
        const existingUser = await findUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // 2. Create the new user (User.js handles hashing & Neo4j creation)
        const customerProfile = await createUser({ email, password, name });

        // 3. Auto-login: Generate Token immediately
        const payload = { 
            user: { 
                id: customerProfile.customerID, 
                role: 'CUSTOMER' // Default role
            } 
        };
        
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

        // 4. Return token & data
        res.status(201).json({ 
            token, 
            customerId: customerProfile.customerID, 
            role: 'CUSTOMER' 
        });

    } catch (err) {
        console.error("Signup Error:", err.message);
        res.status(500).send('Server Error');
    }
};
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { driver } = require('../config/db');

exports.login = async (req, res) => {
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
        const isMatch = (password === user.password); 
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
       
        const payload = { user: { id: customerId } };
        const token = jwt.sign(payload, 'yourSecretKey', { expiresIn: '1h' });
        res.json({ token, customerId });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    } finally {
        await session.close();
    }
};
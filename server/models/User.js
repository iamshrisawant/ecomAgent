// server/models/User.js
const { driver } = require('../config/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

/**
 * Helper to generate readable IDs (e.g., CUST-A1B2C3)
 * This replaces the need for database-specific UUID functions.
 */
const generateCustomerID = () => {
    return `CUST-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
};

/**
 * Creates a new User and a new Customer profile, and links them.
 * securely hashes the password.
 */
const createUser = async ({ email, password, name }) => {
    const session = driver.session({ database: 'neo4j' });
    try {
        // 1. Security: Hash the password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // 2. Identity: Generate a readable ID in Node.js
        // This fixes the "Unknown function apoc.create.uuid" error
        const newCustomerId = generateCustomerID();

        // 3. Database: Create the nodes using the generated ID
        const result = await session.run(`
            CREATE (u:User {
                email: $email, 
                passwordHash: $passwordHash,
                role: 'CUSTOMER', 
                dateCreated: timestamp()
            })
            CREATE (c:Customer {
                customerID: $newCustomerId,  // <--- Use the variable passed from Node
                name: $name
            })
            CREATE (u)-[:HAS_PROFILE]->(c)
            RETURN u, c
        `, { 
            email, 
            passwordHash, 
            name, 
            newCustomerId // <--- Pass it here as a parameter
        });

        return result.records[0].get('c').properties;
    } catch (error) {
        console.error("Error creating user:", error);
        throw error;
    } finally {
        await session.close();
    }
};

/**
 * Finds a user by their email.
 */
const findUserByEmail = async (email) => {
    const session = driver.session({ database: 'neo4j' });
    try {
        const result = await session.run('MATCH (u:User {email: $email}) RETURN u', { email });
        if (result.records.length === 0) return null;
        return result.records[0].get('u').properties;
    } catch (error) {
        console.error("Error finding user:", error);
        throw error;
    } finally {
        await session.close();
    }
};

module.exports = { createUser, findUserByEmail };
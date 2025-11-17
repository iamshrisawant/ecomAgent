// server/models/User.js
const { driver } = require('../config/db');
const bcrypt = require('bcryptjs');

/**
 * Creates a new User and a new Customer profile, and links them.
 * This function securely hashes the password.
 */
const createUser = async ({ email, password, name }) => {
    const session = driver.session({ database: 'neo4j' });
    try {
        // --- START FIX ---
        // 1. Generate a salt
        const salt = await bcrypt.genSalt(10);
        // 2. Hash the password
        const passwordHash = await bcrypt.hash(password, salt);
        // --- END FIX ---

        // This query creates both the login User and their Customer profile in one go
        // It now saves the 'passwordHash' instead of the plain password
        const result = await session.run(`
            CREATE (u:User {
                email: $email, 
                passwordHash: $passwordHash, // <-- Use the hash
                role: 'CUSTOMER', 
                dateCreated: timestamp()
            })
            CREATE (c:Customer {
                customerID: apoc.create.uuid(), 
                name: $name
            })
            CREATE (u)-[:HAS_PROFILE]->(c)
            RETURN u, c
        `, { email, passwordHash, name }); // <-- Pass the hash

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
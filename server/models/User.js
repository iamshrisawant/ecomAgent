// server/models/User.js
const { driver } = require('../config/db');
const bcrypt = require('bcryptjs');

const createUser = async ({ email, password, name }) => {
    const session = driver.session({ database: 'neo4j' });
    try {
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // This query creates both the login User and their Customer profile in one go
        const result = await session.run(`
            CREATE (u:User {email: $email, passwordHash: $passwordHash, role: 'CUSTOMER', dateCreated: timestamp()})
            CREATE (c:Customer {customerID: apoc.create.uuid(), name: $name})
            CREATE (u)-[:HAS_PROFILE]->(c)
            RETURN u, c
        `, { email, passwordHash, name });

        return result.records[0].get('c').properties;
    } catch (error) {
        console.error("Error creating user:", error);
        throw error;
    } finally {
        await session.close();
    }
};

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
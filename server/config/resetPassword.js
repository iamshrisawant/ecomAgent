// server/scripts/resetPassword.js
require('dotenv').config(); // Load .env variables
const neo4j = require('neo4j-driver');
const bcrypt = require('bcryptjs');

// --- CONFIGURATION (HARDCODED INPUTS) ---
const TARGET_EMAIL = "customer101@example.com"; // <--- Change this to the user you want to fix
const NEW_PASSWORD = "password123";             // <--- The new password you want to use
// ----------------------------------------

const resetPassword = async () => {
    // 1. Connect to Database
    const driver = neo4j.driver(
        process.env.NEO4J_URI,
        neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
    );
    const session = driver.session({ database: 'neo4j' });

    try {
        console.log(`🔄 Generating hash for: "${NEW_PASSWORD}"...`);
        
        // 2. Hash the Password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(NEW_PASSWORD, salt);
        
        console.log(`✅ Hash generated. Updating user: ${TARGET_EMAIL}...`);

        // 3. Update the User in Neo4j
        const result = await session.run(
            `MATCH (u:User {email: $email})
             SET u.passwordHash = $passwordHash
             RETURN u.email, u.role`,
            { email: TARGET_EMAIL, passwordHash }
        );

        if (result.records.length === 0) {
            console.error(`❌ Error: User with email "${TARGET_EMAIL}" was NOT found in the database.`);
        } else {
            const user = result.records[0].toObject();
            console.log(`🎉 Success! Password for ${user['u.email']} (Role: ${user['u.role']}) has been reset.`);
            console.log(`👉 You can now login with: ${NEW_PASSWORD}`);
        }

    } catch (error) {
        console.error("❌ System Error:", error);
    } finally {
        await session.close();
        await driver.close();
    }
};

resetPassword();
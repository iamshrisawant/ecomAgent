// server/config/db.js

const neo4j = require('neo4j-driver');
require('dotenv').config();


// Create the driver instance
const driver = neo4j.driver(
    process.env.NEO4J_URI,
    neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD)
);

// Function to verify that the connection is working
const checkNeo4jConnection = async () => {
    try {
        await driver.verifyConnectivity();
        console.log('Neo4j Connection Established...');
    } catch (error) {
        console.error('Neo4j Connection Error:', error);
        process.exit(1); // Exit the application if the DB connection fails
    }
};

// Export the driver and the check function
module.exports = { driver, checkNeo4jConnection };
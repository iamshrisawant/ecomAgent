// server/scripts/seedDatabase.js
require('dotenv').config(); // Load environment variables
const { driver } = require('../config/db');
const { createGraphNode } = require('../models/Database'); // Use your Universal Creator
const { createUser } = require('../models/User');

const seed = async () => {
    const session = driver.session({ database: 'neo4j' });
    
    try {
        console.log("🔴 Wiping Database...");
        await session.run('MATCH (n) DETACH DELETE n');
        console.log("✅ Database Cleaned.\n");

        console.log("🟢 Seeding Users...");
        // 1. Recreate the Valid User (Shri)
        // We use createUser because it handles Password Hashing + CUST-ID generation automatically
        const customer = await createUser({
            name: "Shri Sawant",
            email: "shri@example.com",
            password: "password123" // Resetting password for the seed
        });
        console.log(`   -> Created Customer: ${customer.name} (${customer.customerID})`);

        console.log("\n🟢 Seeding Inventory (Products)...");
        // 2. Refactor Products to use Standard IDs (PROD-XXXX)
        // We use createGraphNode which automatically assigns 'PROD-...' based on the label 'Product'
        const kb = await createGraphNode(session, 'Product', {
            name: "Wireless Keyboard",
            category: "Electronics",
            price: 79.99,
            stock: 50,
            description: "Ergonomic mechanical keyboard with bluetooth."
        });
        console.log(`   -> Created Product: ${kb.name} (${kb.productId})`);

        const mouse = await createGraphNode(session, 'Product', {
            name: "USB Mouse",
            category: "Electronics",
            price: 24.99,
            stock: 100,
            description: "High-precision optical mouse."
        });
        console.log(`   -> Created Product: ${mouse.name} (${mouse.productId})`);

        console.log("\n🟢 Seeding Policies...");
        // 3. Create Policies (Linked to Products)
        const returnPolicy = await createGraphNode(session, 'Policy', {
            type: "RETURN",
            durationDays: 30,
            description: "30-Day No Questions Asked Return"
        });
        
        // Link Policy to Products (Manually for seeding)
        await session.run(`
            MATCH (p:Product), (pol:Policy {policyId: $polId})
            CREATE (p)-[:HAS_POLICY]->(pol)
        `, { polId: returnPolicy.policyId });
        console.log(`   -> Linked '30-Day Return' policy to all products.`);

        console.log("\n🟢 Seeding Active Data (Orders & Tickets)...");
        // 4. Create a Sample Order
        const order = await createGraphNode(session, 'Order', {
            status: 'Shipped',
            datePlaced: new Date().toISOString()
        }, [
            { targetId: customer.customerID, type: 'PLACED', direction: 'IN' }, // User Placed Order
            { targetId: kb.productId, type: 'CONTAINS', direction: 'OUT' }      // Order Contains Keyboard
        ]);
        console.log(`   -> Created Order: ${order.orderId} for ${customer.name}`);

        // 5. Migrate the Escalation (Refactored to new Schema)
        // The JSON had a raw description. We keep that but give it a proper ESC-ID.
        const escalation = await createGraphNode(session, 'Ticket', {
            type: 'ESCALATION',
            description: "I want to check the status of my active orders but the system is confusing.",
            status: 'Open',
            aiAnalysis: JSON.stringify({
                suspectedIntent: "CHECK_ORDER_STATUS",
                reasoning: "User explicitly mentioned checking active orders.",
                likelyEntities: ["orderId"]
            })
        }, [
            { targetId: customer.customerID, type: 'OPENED', direction: 'IN' }
        ]);
        console.log(`   -> Created Escalation: ${escalation.ticketId}`);

        console.log("\n✨ SEEDING COMPLETE! You are ready to demo.");

    } catch (error) {
        console.error("❌ Seeding Failed:", error);
    } finally {
        await session.close();
        driver.close(); // Close connection
    }
};

seed();
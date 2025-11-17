// server/models/Database.js
const { driver } = require('../config/db');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Placeholder for a function that would dynamically load the schema on startup
async function getDynamicGraphSchema() {
    return `
      This is the schema for an e-commerce post-purchase support graph database.
      ## Node Labels & properties: Customer(customerID, name), Order(orderId, datePlaced, status), Product(productID, name), Shipment(shipmentID, status), Ticket(ticketId, type, status), Return(returnId, reason, status).
      ## Relationships: (Customer)-[:PLACED]->(Order), (Order)-[:CONTAINS]->(Product), (Order)-[:FULFILLED_BY]->(Shipment), (Customer)-[:OPENED]->(Ticket), (Ticket)-[:REGARDING_ORDER]->(Order), (Order)-[:HAS_RETURN]->(Return).
    `;
}

// Private, secure function for creating a ticket (example of a safe write)
async function _createTicketInDb(session, entities, customerId) {
    if (!customerId) throw new Error("Authorization failed: No customerId provided.");
    if (!entities.orderId || !entities.type) throw new Error("Cannot create a ticket without orderId and type.");

    const params = { ...entities, customerId };
    
    const result = await session.run(`
        MATCH (c:Customer {customerID: $customerId})-[:PLACED]->(o:Order {orderId: $orderId})
        CREATE (t:Ticket {ticketId: randomUUID(), type: $type, description: $description, status: 'Open', createdAt: timestamp()})
        CREATE (c)-[:OPENED]->(t)
        CREATE (t)-[:REGARDING_ORDER]->(o)
        RETURN t.ticketId AS ticketId
    `, params);

    if (result.records.length === 0) {
        // Fallback for when order is not found or orderId is 'Unknown'
        console.warn(`Could not link ticket to order ${entities.orderId}. Creating unlinked ticket.`);
        const fallbackResult = await session.run(`
            MATCH (c:Customer {customerID: $customerId})
            CREATE (t:Ticket {ticketId: randomUUID(), type: $type, description: $description, status: 'Open', createdAt: timestamp()})
            CREATE (c)-[:OPENED]->(t)
            RETURN t.ticketId AS ticketId
        `, params);
        
        if (fallbackResult.records.length === 0) {
             throw new Error(`Authorization failed: Customer ${customerId} not found.`);
        }
        return fallbackResult.records[0].get('ticketId');
    }
    return result.records[0].get('ticketId');
}

// Private, secure function for processing a return
async function _processReturnInDb(session, entities, customerId) {
    if (!customerId) throw new Error("Authorization failed: No customerId provided.");
    if (!entities.orderId || !entities.reason) {
        throw new Error("Cannot process return without orderId and reason.");
    }

    const params = { ...entities, customerId };

    const result = await session.run(`
        MATCH (c:Customer {customerID: $customerId})-[:PLACED]->(o:Order {orderId: $orderId})
        CREATE (r:Return {
            returnId: randomUUID(),
            reason: $reason,
            status: 'Processing',
            createdAt: timestamp()
        })
        CREATE (o)-[:HAS_RETURN]->(r)
        RETURN r.returnId AS returnId, r.status AS status
    `, params);

    if (result.records.length === 0) {
        throw new Error(`Authorization failed or Order not found for customer ${customerId}.`);
    }
    return result.records[0].toObject();
}

const planAndExecuteQuery = async (planObject, context) => {
    const graphSchema = await getDynamicGraphSchema();

    // --- STAGE 1: PLANNING (The AI "Brain") ---
    console.log("DATABASE: Planning query based on intent:", planObject.intent);

    // --- UPDATED (Grounded Learning Loop) ---
    // If the intent is our internal 'CREATE_ESCALATION', we skip the LLM planner
    if (planObject.intent === "CREATE_ESCALATION") {
        console.log("DATABASE: Internal call to create escalation ticket...");
        const execSession = driver.session({ database: 'neo4j' });
        try {
            // We use _createTicketInDb for this, which already has the fallback logic
            const ticketId = await _createTicketInDb(execSession, planObject.entities, context.customerId);
            return { data: { success: true, ticketId } };
        } catch (error) {
            console.error("Error creating escalation ticket:", error);
            return { error: "Failed to create escalation ticket." };
        } finally {
            await execSession.close();
        }
    }
    // --- END UPDATED ---

    // 2. Check if we have all required entities
    const session = driver.session({ database: 'neo4j' });
    let requiredEntities = [];
    try {
        const result = await session.run(
            `MATCH (i:Intent {name: $intent})-[:REQUIRES_ENTITY]->(e:Entity)
             RETURN e.name AS entity`,
            { intent: planObject.intent }
        );
        requiredEntities = result.records.map(record => record.get('entity'));
    } catch (error) {
        console.error("Error fetching required entities:", error);
        await session.close(); // Close session on error
        return { error: "Failed to fetch AI rules from database." };
    } 
    // NOTE: Session is NOT closed here on purpose. We re-use it.

    // 3. Check if we have all required entities
    const providedEntities = Object.keys(planObject.entities);
    const missingEntities = requiredEntities.filter(e => !providedEntities.includes(e));

    if (missingEntities.length > 0) {
        await session.close(); // Close session
        const needed = missingEntities[0];
        console.log(`DATABASE: Missing required entity: ${needed}`);
        return {
            error: "Missing required entity",
            needed: needed,
            reason: `To help with your request, I need to know the ${needed}.`
        };
    }
    
    // 4. Dynamically build the planner prompt
    const plannerPrompt = `
        You are an expert Neo4j developer and a logical strategist.
        Your task is to generate a JSON response to fulfill a user's intent, given you have all necessary information.

        Schema: ${graphSchema}
        --- CONTEXT ---
        User Intent: "${planObject.intent}"
        Entities Provided: ${JSON.stringify(planObject.entities)}
        All required entities (${requiredEntities.join(', ')}) are present.
        ---
        --- RULES & EXAMPLES ---
        1.  **For a WRITE action**, respond with an "action" key.
            - Context: { "intent": "REPORT_DAMAGED_ITEM", ... }
            - CORRECT Response: {"action": "CREATE_TICKET", "entities": ${JSON.stringify(planObject.entities)}}

            - Context: { "intent": "PROCESS_RETURN", ... }
            - CORRECT Response: {"action": "PROCESS_RETURN", "entities": ${JSON.stringify(planObject.entities)}}

        2.  **For a READ query**, respond with a "query" key.
            - Context: { "intent": "TRACK_SHIPMENT_DETAILS", ... }
            - Response: {"query": "MATCH (o:Order {orderId: $orderId})-[:FULFILLED_BY]->(s:Shipment) RETURN s.status, s.shipmentID"}

        3.  **SECURITY: Your generated 'query' MUST be read-only.** It MUST NOT contain the keywords \`DELETE\`, \`DETACH\`, \`REMOVE\`, \`SET\`, \`CREATE\`, or \`MERGE\`. All queries must start with \`MATCH\`.

        4.  **ADDITIONAL EXAMPLES:**
            - Context: { "intent": "CHECK_PARTIAL_SHIPMENT", ... }
            - Response: {"query": "MATCH (o:Order {orderId: $orderId})-[:FULFILLED_BY]->(s:Shipment)-[:INCLUDES]->(p:Product) RETURN s.shipmentID, s.status, count(p) AS itemsInShipment"}
    `;

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    let plannerResult;
    try {
        const result = await model.generateContent(plannerPrompt);
        const rawText = result.response.text();
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error("Planner LLM did not return a valid JSON object.");
        }
        plannerResult = JSON.parse(jsonMatch[0]);
    } catch (err) {
        console.error("Error calling Planner LLM:", err);
        await session.close(); // Close session on error
        return { error: "AI Planner failed to generate a valid plan." };
    }
    
    console.log("DATABASE: Planner Result:", plannerResult);

    if (plannerResult.error) {
        await session.close(); // Close session
        return plannerResult;
    }

    // --- STAGE 2: EXECUTION (The Secure "Hands") ---
    // We re-use the session from above
    try {
        if (plannerResult.query) {
            
            const queryUpper = plannerResult.query.toUpperCase();
            if (queryUpper.includes('DELETE') || queryUpper.includes('SET') || queryUpper.includes('CREATE') || queryUpper.includes('MERGE') || queryUpper.includes('REMOVE') || queryUpper.includes('DETACH')) {
                console.error("SECURITY VIOLATION: AI attempted a write query:", plannerResult.query);
                return { error: "The planned query was rejected for security reasons." };
            }

            const dbResult = await session.run(plannerResult.query, planObject.entities);
            if (dbResult.records.length === 0) return { error: `No results found.` };
            return { data: dbResult.records.map(record => record.toObject()) };

        } else if (plannerResult.action) {
            
            switch (plannerResult.action) {
                case 'CREATE_TICKET':
                    // --- START FIX ---
                    // The AI planner is forgetting to add the 'type' to the entities.
                    // We know the original intent, so we can add it manually
                    // to prevent the _createTicketInDb function from crashing.
                    if (!plannerResult.entities.type) {
                        // e.g., "REPORT_DAMAGED_ITEM" becomes "DAMAGED_ITEM"
                        const ticketType = planObject.intent.replace('REPORT_', '');
                        plannerResult.entities.type = ticketType;
                        console.log(`DATABASE: Auto-inferred ticket type: ${ticketType}`);
                    }
                    // --- END FIX ---
                
                    const ticketId = await _createTicketInDb(session, plannerResult.entities, context.customerId);
                    return { data: { success: true, ticketId } };
                
                case 'PROCESS_RETURN':
                    const returnData = await _processReturnInDb(session, plannerResult.entities, context.customerId);
                    return { data: { success: true, ...returnData } };
                
                default:
                    return { error: "The planned action is not supported." };
            }
        }
    } finally {
        await session.close(); // Finally, close the session
    }
};

module.exports = { planAndExecuteQuery };
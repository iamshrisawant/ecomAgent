// server/models/Database.js
const { driver } = require('../config/db');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Placeholder for a function that would dynamically load the schema on startup
async function getDynamicGraphSchema() {
    return `
      This is the schema for an e-commerce post-purchase support graph database.
      ## Node Labels & properties: Customer(customerID, name), Order(orderId, datePlaced, status), Product(productID, name), Shipment(shipmentID, status), Ticket(ticketId, type, status).
      ## Relationships: (Customer)-[:PLACED]->(Order), (Order)-[:CONTAINS]->(Product), (Order)-[:FULFILLED_BY]->(Shipment), (Customer)-[:OPENED_TICKET]->(Ticket), (Ticket)-[:REGARDING_ORDER]->(Order).
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
        throw new Error(`Authorization failed or Order not found for customer ${customerId}.`);
    }
    return result.records[0].get('ticketId');
}

const planAndExecuteQuery = async (planObject, context) => {
    const graphSchema = await getDynamicGraphSchema();

    // --- STAGE 1: PLANNING (The AI "Brain") ---
    console.log("DATABASE: Planning query based on intent:", planObject.intent);
    const plannerPrompt = `
        You are an expert Neo4j developer and a logical strategist. Your primary responsibility is to determine if you have enough information to fulfill the user's intent.

        Schema: ${graphSchema}
        --- CONTEXT ---
        User Intent: "${planObject.intent}"
        Entities Provided: ${JSON.stringify(planObject.entities)}
        ---
        --- RULES & EXAMPLES ---
        1.  **For WRITE actions like 'REPORT_DAMAGED_ITEM', you MUST have all required entities ('orderId', 'description') before planning the 'CREATE_TICKET' action.** If you are missing any, you MUST ask for the next one.
            - Context: { "intent": "REPORT_DAMAGED_ITEM", "entities": {} }
            - CORRECT Response: {"error": "Missing required entity", "needed": "orderId", "reason": "We need the order ID to process your request."}
            - Context: { "intent": "REPORT_DAMAGED_ITEM", "entities": {"orderId": "123"} }
            - CORRECT Response: {"error": "Missing required entity", "needed": "description", "reason": "We need a description of the issue to proceed."}
            - Context: { "intent": "REPORT_DAMAGED_ITEM", "entities": {"orderId": "123", "description":"it's broken"} }
            - CORRECT Response: {"action": "CREATE_TICKET", "entities": {"orderId": "123", "type": "DAMAGED_ITEM", "description": "it's broken"}}

        2.  For READ queries, if you have all required entities, generate the query.
            - Context: { "intent": "TRACK_SHIPMENT_DETAILS", "entities": { "orderId": "123" } }
            - Response: {"query": "MATCH (o:Order {orderId: $orderId})-[:FULFILLED_BY]->(s:Shipment) RETURN s.status"}
    `;

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(plannerPrompt);
    const rawText = result.response.text();
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Planner LLM did not return a valid JSON object.");
    const plannerResult = JSON.parse(jsonMatch[0]);
    console.log("DATABASE: Planner Result:", plannerResult);

    if (plannerResult.error) {
        return plannerResult;
    }

    // --- STAGE 2: EXECUTION (The Secure "Hands") ---
    const session = driver.session({ database: 'neo4j' });
    try {
        if (plannerResult.query) {
            // ... (read query logic is unchanged)
            const dbResult = await session.run(plannerResult.query, planObject.entities);
            if (dbResult.records.length === 0) return { error: `No results found.` };
            return { data: dbResult.records.map(record => record.toObject()) };
        } else if (plannerResult.action) {
            // ... (secure action handler is unchanged)
            switch (plannerResult.action) {
                case 'CREATE_TICKET':
                    const ticketId = await _createTicketInDb(session, plannerResult.entities, context.customerId);
                    return { data: { success: true, ticketId } };
                default:
                    return { error: "The planned action is not supported." };
            }
        }
    } finally {
        await session.close();
    }
};

module.exports = { planAndExecuteQuery };
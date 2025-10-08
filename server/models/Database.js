// server/models/Database.js
const { driver } = require('../config/db');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// The detailed "Blueprint" of your database for the Planner LLM.
const graphSchema = `
  This is the schema for an e-commerce post-purchase support graph database.

  ## Node Labels and their properties:
  - Customer (customerID: string, name: string, email: string)
  - Order (orderId: string, datePlaced: datetime, status: string, totalAmount: float)
  - Product (productID: string, name: string, category: string, price: float)
  - Shipment (shipmentID: string, status: string, carrier: string, trackingNumber: string, estimatedDelivery: datetime)
  - Payment (paymentId: string, type: string<'SALE'|'REFUND'>, status: string, amount: float)
  - Return (returnId: string, status: string<'PENDING'|'RECEIVED'|'PROCESSED'>, dateInitiated: datetime)
  - Ticket (ticketId: string, type: string<'DAMAGED'|'MISSING'|'WRONG_ITEM'>, description: string, status: string)
  - Policy (policyID: string, type: string<'RETURN'|'WARRANTY'>, durationDays: integer)

  ## Relationships between nodes:
  - (Customer)-[:PLACED]->(Order)
  - (Customer)-[:OPENED_TICKET]->(Ticket)
  - (Order)-[:CONTAINS]->(Product)
  - (Order)-[:FULFILLED_BY]->(Shipment)
  - (Order)-[:PAID_WITH]->(Payment)
  - (Order)-[:HAS_RETURN]->(Return)
  - (Order)-[:ASSOCIATED_WITH_TICKET]->(Ticket)
  - (Return)-[:INCLUDES_PRODUCT]->(Product)
  - (Return)-[:GENERATED_REFUND]->(Payment)
  - (Product)-[:HAS_POLICY]->(Policy)
`;

/**
 * The combined "Planner" and "Executor".
 * It reasons about the query, then executes it if possible.
 */
const planAndExecuteQuery = async (planObject) => {
    // --- STAGE 1: PLANNING (The "Executive Chef" Brain) ---
    console.log("DATABASE: Planning query based on intent:", planObject.intent);
    const plannerPrompt = `
        You are an expert Neo4j developer acting as a query planner. Based on the user's intent, entities, and the provided schema, create a database plan.

        Schema: ${graphSchema}

        --- CONTEXT ---
        User Intent: "${planObject.intent}"
        Entities Provided: ${JSON.stringify(planObject.entities)}
        ---

        Your Response MUST be a single, minified JSON object in one of three formats:
        1. For READ-ONLY queries (e.g., TRACK_SHIPMENT_DETAILS): {"query": "MATCH (n) RETURN n"}
        2. For WRITE/MODIFY actions (e.g., REPORT_DAMAGED_ITEM): {"action": "ACTION_NAME", "entities": {...}}
        3. If you are MISSING information: {"error": "Missing required entity", "needed": "entityName"}

        Example 1 (Read):
        Context: { "intent": "CHECK_PARTIAL_SHIPMENT", "entities": { "orderId": "123" } }
        Response: {"query": "MATCH (o:Order {orderId: $orderId})-[:FULFILLED_BY]->(s:Shipment) RETURN s.shipmentID AS shipmentId, s.status AS status"}

        Example 2 (Write Action):
        Context: { "intent": "REPORT_DAMAGED_ITEM", "entities": { "orderId": "123", "productId": "abc" } }
        Response: {"action": "CREATE_TICKET", "entities": {"orderId": "123", "productId": "abc", "type": "DAMAGED_ITEM"}}

        Example 3 (Missing Data):
        Context: { "intent": "TRACK_SHIPMENT_DETAILS", "entities": {} }
        Response: {"error": "Missing required entity", "needed": "orderId"}
    `;

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }); // Corrected model name
    const result = await model.generateContent(plannerPrompt);
    const rawText = result.response.text();
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Planner LLM did not return a valid JSON object.");
    const plannerResult = JSON.parse(jsonMatch[0]);
    console.log("DATABASE: Planner Result:", plannerResult);

    if (plannerResult.error) {
        console.log("DATABASE: Planner needs more data:", plannerResult.needed);
        return plannerResult;
    }

    // --- STAGE 2: EXECUTION (The "Line Cook" Hands with a safety gate) ---
    if (plannerResult.query) {
        // SAFETY GATE: Ensure the AI did not generate a write query.
        const query = plannerResult.query.toUpperCase();
        if (query.includes('SET') || query.includes('CREATE') || query.includes('DELETE') || query.includes('MERGE')) {
            console.error("CRITICAL: AI attempted to generate a write query:", plannerResult.query);
            return { error: "The AI generated an unsafe query. Action denied." };
        }

        console.log("DATABASE: Executing READ query:", plannerResult.query);
        const session = driver.session({ database: 'maindb' });
        try {
            const dbResult = await session.run(plannerResult.query, planObject.entities);
            if (dbResult.records.length === 0) return { error: `No results found.` };
            return { data: dbResult.records.map(record => record.toObject()) };
        } finally {
            await session.close();
        }
    } else if (plannerResult.action) {
        // This is where you would build out your secure, hardcoded write operations.
        console.log("DATABASE: AI planned a WRITE action:", plannerResult.action);
        // For now, we'll simulate a successful action.
        return { data: { success: true, action_planned: plannerResult.action, message: "The action has been processed." } };
    } else {
        return { info: "No database action was planned." };
    }
};

module.exports = { planAndExecuteQuery };
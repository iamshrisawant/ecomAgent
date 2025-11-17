// server/controllers/dashboardController.js
const { driver } = require('../config/db');
const { loadIntents } = require('../controllers/chatController');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Fetches all tickets from the database
exports.getTickets = async (req, res) => {
    const session = driver.session({ database: 'neo4j' });
    try {
        const result = await session.run(`
            MATCH (c:Customer)-[:OPENED]->(t:Ticket)
            RETURN t.ticketId AS ticketId, t.type AS type, t.description AS description, 
                   t.status AS status, t.createdAt AS createdAt, c.name AS customerName
            ORDER BY t.createdAt DESC
        `);
        const tickets = result.records.map(record => record.toObject());
        res.json(tickets);
    } catch (error) {
        console.error("Error fetching tickets:", error);
        res.status(500).send('Server Error');
    } finally {
        await session.close();
    }
};

// Fetches only tickets marked as 'ESCALATION'
exports.getEscalations = async (req, res) => {
    const session = driver.session({ database: 'neo4j' });
    try {
        const result = await session.run(`
            MATCH (c:Customer)-[:OPENED]->(t:Ticket)
            WHERE t.type = 'ESCALATION'
            RETURN t.ticketId AS ticketId, t.type AS type, t.description AS description, 
                   t.status AS status, t.createdAt AS createdAt, c.name AS customerName
            ORDER BY t.createdAt DESC
        `);
        const tickets = result.records.map(record => record.toObject());
        res.json(tickets);
    } catch (error) {
        console.error("Error fetching escalation tickets:", error);
        res.status(500).send('Server Error');
    } finally {
        await session.close();
    }
};

// Fetches all logged AI suggestions
exports.getSuggestions = async (req, res) => {
    const session = driver.session({ database: 'neo4j' });
    try {
        // --- UPDATED (Final Polish) ---
        // This query now ONLY finds suggestions that have been pre-analyzed
        // and are ready for agent approval.
        const result = await session.run(`
            MATCH (s:Suggestion {status: 'Pre-Analyzed'})
            OPTIONAL MATCH (c:Customer {customerID: s.customerId})
            RETURN s.query AS query, s.plan AS plan, s.status AS status, 
                   s.createdAt AS createdAt, c.name AS customerName,
                   s.proposedIntent AS proposedIntent, 
                   s.proposedEntities AS proposedEntities
            ORDER BY s.createdAt DESC
        `);
        // --- END UPDATED ---
        
        const suggestions = result.records.map(record => record.toObject());
        res.json(suggestions);
    } catch (error) {
        console.error("Error fetching suggestions:", error);
        res.status(500).send('Server Error');
    } finally {
        await session.close();
    }
};

// --- This is the "Approve" function from our previous step ---
exports.createIntent = async (req, res) => {
    const { intentName, description, requiredEntities } = req.body; // <-- 'requiredEntities' is new

    if (!intentName) {
        return res.status(400).json({ message: 'Intent name is required' });
    }

    const session = driver.session({ database: 'neo4j' });
    try {
        // 1. Create the Intent
        await session.run(
            `MERGE (i:Intent {name: $intentName})
             ON CREATE SET i.description = $description, i.createdAt = timestamp()`,
            { intentName, description }
        );
        
        // 2. Link the required entities (if any)
        if (requiredEntities && requiredEntities.length > 0) {
            // This Cypher query unrolls the list and merges/links each entity
            await session.run(
                `MATCH (i:Intent {name: $intentName})
                 UNWIND $requiredEntities AS entityName
                 MERGE (e:Entity {name: entityName})
                 MERGE (i)-[:REQUIRES_ENTITY]->(e)`,
                { intentName, requiredEntities }
            );
        }

        await loadIntents(); // Refresh the AI's in-memory list
        res.status(201).json({ success: true, intentName, requiredEntities });

    } catch (error) {
        console.error("Error creating intent:", error);
        if (error.code === 'Neo.ClientError.Schema.ConstraintValidationFailed') {
            return res.status(400).json({ message: 'An intent with this name already exists.' });
        }
        res.status(500).send('Server Error');
    } finally {
        await session.close();
    }
};


// --- ADDED (Grounded Learning Loop) ---
// This function resolves a ticket AND triggers the AI learning
exports.resolveTicketAndLearn = async (req, res) => {
    const { ticketId, resolutionNote } = req.body;
    const session = driver.session({ database: 'neo4j' });

    try {
        // 1. Resolve the ticket in the database
        const result = await session.run(
            `MATCH (t:Ticket {ticketId: $ticketId})
             SET t.status = 'Resolved', t.resolutionNote = $resolutionNote
             RETURN t.description AS originalQuery`,
            { ticketId, resolutionNote }
        );

        if (result.records.length === 0) {
            return res.status(404).json({ message: 'Ticket not found' });
        }

        const originalQuery = result.records[0].get('originalQuery');
        
        // 2. Asynchronously (don't make agent wait) trigger AI analysis
        analyzeResolution(originalQuery, resolutionNote, req.user.id); // Assuming req.user is from auth middleware

        res.status(200).json({ success: true, message: 'Ticket resolved and sent for AI analysis.' });

    } catch (error) {
        console.error("Error resolving ticket:", error);
        res.status(500).send('Server Error');
    } finally {
        await session.close();
    }
};

// This is the "Grounded Analyst" AI
async function analyzeResolution(originalQuery, resolutionNote, agentId) {
    console.log("AI is analyzing human resolution...");

    const analysisPrompt = `
        You are an AI System Architect. You are observing a human support agent's successful resolution of a customer query that the chatbot could not handle.
        Your job is to analyze this "Query/Resolution" pair and propose a new, fully-formed Intent that would have solved the query.

        You MUST respond in a minified JSON object with two keys:
        1. "intentName": A short, uppercase, snake_cased name for the new intent (e.g., "CHECK_WARRANTY_STATUS").
        2. "requiredEntities": A string array of entities (like "orderId", "reason") that the agent's resolution implies are necessary.

        Database Entities: "orderId", "description", "reason", "productID"

        --- EXAMPLE 1 ---
        Customer Query: "User query: \"my package is broken order 456\""
        Agent Resolution: "Confirmed item was damaged. Processed a return for order 456 due to 'shipping damage'."
        AI Proposal: {"intentName":"PROCESS_RETURN","requiredEntities":["orderId","reason"]}

        --- EXAMPLE 2 ---
        Customer Query: "User query: \"whats the warranty on my thing?\""
        Agent Resolution: "Customer provided orderId 789. Looked up order, found warrantyExpires: '2025-11-17'. Informed customer."
        AI Proposal: {"intentName":"CHECK_WARRANTY_STATUS","requiredEntities":["orderId"]}
        
        --- YOUR TASK ---
        Customer Query: "${originalQuery}"
        Agent Resolution: "${resolutionNote}"
        AI Proposal:
    `;

    try {
        // --- MODEL UPDATED ---
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const result = await model.generateContent(analysisPrompt);
        const rawText = result.response.text();
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("Grounded Analyst AI did not return valid JSON.");
        
        const proposal = JSON.parse(jsonMatch[0]);

        // 3. Create a new "Grounded" Suggestion
        // This is different from the raw "logSuggestion"
        const session = driver.session({ database: 'neo4j' });
        try {
            await session.run(
                `CREATE (s:Suggestion {
                    query: $originalQuery,
                    plan: $plan,
                    status: 'Pre-Analyzed', // A new status
                    agentId: $agentId,
                    createdAt: timestamp(),
                    // Store the AI's proposal directly on the suggestion
                    proposedIntent: $intentName, 
                    proposedEntities: $requiredEntities
                })`,
                { 
                    originalQuery, 
                    plan: `Human resolution: "${resolutionNote}"`,
                    agentId: agentId || 'unknown',
                    intentName: proposal.intentName,
                    requiredEntities: proposal.requiredEntities
                }
            );
            console.log("Grounded suggestion created:", proposal.intentName);
        } finally {
            await session.close();
        }

    } catch(error) {
        console.error("Error analyzing resolution:", error);
    }
}
// --- END ADDED ---
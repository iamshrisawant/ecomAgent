// server/controllers/chatController.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const { planAndExecuteQuery } = require("../models/Database");
const { driver } = require("../config/db");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- UPDATED (Smart Classifier) ---
// This will store our rich intent data, e.g.,
// "TRACK_SHIPMENT_DETAILS (requires: orderId)"
let ALLOWED_INTENTS_WITH_RULES = "No intents loaded.";
// --- END UPDATED ---

// Function to load intents AND THEIR RULES from Neo4j
const loadIntents = async function() {
    console.log("Loading AI intents and rules from database...");
    const session = driver.session({ database: 'neo4j' });
    try {
        // This query fetches each intent and a list of its required entities
        const result = await session.run(`
            MATCH (i:Intent)
            OPTIONAL MATCH (i)-[:REQUIRES_ENTITY]->(e:Entity)
            RETURN i.name AS intent, collect(e.name) AS requiredEntities
        `);
        
        const intents = result.records.map(record => {
            const intent = record.get('intent');
            const entities = record.get('requiredEntities').filter(e => e); // Filter out nulls
            
            if (entities.length > 0) {
                return `${intent} (requires: ${entities.join(', ')})`;
            }
            return intent;
        });

        // This string will be injected directly into the prompt
        ALLOWED_INTENTS_WITH_RULES = intents.join(", ");
        console.log("Intents and rules loaded:", ALLOWED_INTENTS_WITH_RULES);

    } catch (error) {
        console.error("Failed to load intents from database:", error);
        ALLOWED_INTENTS_WITH_RULES = "GREETING, GRATITUDE, UNKNOWN";
    } finally {
        await session.close();
    }
}
// Load intents on server startup
loadIntents();


const analysisPrompt = (userQuery, ongoingContext = null) => {
    // Shared rules for both prompt types to ensure consistency
    const baseRules = `
    The JSON object you return MUST have five keys: "intent", "entities", "sentiment", "plan", and "isTaskOriented".

    --- RULES ---
    1. The "intent" value MUST be one of the following strings. 
       **You MUST use the entity requirements to make a more accurate choice.**
       [${ALLOWED_INTENTS_WITH_RULES}]
    2. If a user's query provides entities (like a 'ticketId') that DO NOT match any of the listed intent requirements (e.g., 'TRACK_SHIPMENT_DETAILS' requires 'orderId'), you MUST classify the intent as "UNKNOWN".
    3. For an "UNKNOWN" intent, the "plan" MUST be "I will escalate this to a human agent who can better assist with this request."
    4. "isTaskOriented" MUST be 'false' for GREETING, GRATITUDE, and UNKNOWN.
    ---
    `;

    if (ongoingContext) {
        // --- PROMPT FOR AN ONGOING CONVERSATION (THE "FULFILLER") ---
        return `
        You are a highly-tuned NLU API in the middle of a task. Your FIRST PRIORITY is to determine if the user's new reply answers the agent's last question.

        --- CONTEXT ---
        Original Intent: "${ongoingContext.intent}"
        Entities already collected: ${JSON.stringify(ongoingContext.entities)}
        Agent's Last Question: The agent asked for the missing information: "${ongoingContext.neededEntity}".
        User's Reply: "${userQuery}"
        ---

        --- YOUR TASK ---
        Analyze the user's reply. Your response MUST be a single minified JSON object.
        1. If the reply provides the missing information, extract the new entity and MERGE it with the 'Entities already collected'. You MUST keep the original intent.
        2. If the reply is a new, unrelated query, IGNORE the old context and analyze it from scratch.
        
        ${baseRules}

        Example (Merging Data):
        Context: { Original Intent: "REPORT_DAMAGED_ITEM", Entities already collected: {"orderId": "ORD-101"}, Agent asked for: "description", User's Reply: "The screen is cracked." }
        Response: {"intent":"REPORT_DAMAGED_ITEM","entities":{"orderId":"ORD-101", "description":"The screen is cracked"},"sentiment":"negative","plan":"Continue with the damaged item report.","isTaskOriented":true}
        ---
        Analyze the user's reply now.
        Response:
        `;
    } else {
        // --- PROMPT FOR A NEW CONVERSATION (THE "CLASSIFIER") ---
        return `
        You are a highly-tuned NLU API. Your purpose is to classify a user's new query and extract data into a specific JSON format.
        YOU MUST RESPOND WITH ONLY a valid, minified JSON object.
        
        ${baseRules}

        Example (Good Match):
        Query: "I'm missing an item from order 555! This is so annoying."
        Response: {"intent":"CHECK_PARTIAL_SHIPMENT","entities":{"orderId":"555"},"sentiment":"frustrated","plan":"Acknowledge the user's frustration, check for multiple shipments, and explain the status of each.","isTaskOriented":true}

        Example (Good Match with Multiple Entities):
        Query: "My order ORD-101 arrived damaged, the screen is cracked."
        Response: {"intent":"REPORT_DAMAGED_ITEM","entities":{"orderId":"ORD-101", "description":"the screen is cracked"},"sentiment":"negative","plan":"Create a ticket for the damaged item.","isTaskOriented":true}

        Example (Bad Match / UNKNOWN):
        Query: "Can you track the status of my ticket 12345?"
        Response: {"intent":"UNKNOWN","entities":{"ticketId":"12345"},"sentiment":"neutral","plan":"I will escalate this to a human agent who can better assist with this request.","isTaskOriented":false}
        
        ---
        Query: "${userQuery}"
        Response:
        `;
    }
};

async function generateResponseFromContext(masterContext) {
    const prompt = `
        You are an empathetic, concise e-commerce support agent. Your task is to write a personalized, final response based on the JSON context. Follow the "plan" to shape the tone.

        --- RESPONSE RULES ---
        1. When asking for a missing entity (indicated by the 'needed' field), you MUST explain WHY you need it using the 'reason' field. Frame it naturally.
        2. When providing a successful answer from the database ('databaseResult.data'), briefly mention the source of your information.
        3. Do not use technical jargon like 'entity' or 'database' in your response to the user.
        ---

        --- JSON CONTEXT ---
        ${JSON.stringify(masterContext, null, 2)}
        ---

        Write the final, user-facing response:
    `;
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(prompt);
    return result.response.text();
}

const handleConnection = (ws, customerId) => {
    ws.context = { customerId };

    ws.on('message', async (message) => {
        try {
            const userQuery = message.toString();
            console.log(`--- New Query: "${userQuery}" ---`);
            let planObject;

            // --- STAGE 1: CONTEXT-AWARE ANALYSIS ---
            const ongoingContext = ws.context.incompletePlan || null;
            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
            const result = await model.generateContent(analysisPrompt(userQuery, ongoingContext));
            const rawText = result.response.text();
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error("Analysis LLM did not return valid JSON.");
            planObject = JSON.parse(jsonMatch[0]);
            planObject.originalQuery = userQuery;
            console.log("Stage 1 Complete. Plan Object:", planObject);

            // --- UPDATED (Grounded Learning Loop) ---
            if (planObject.intent === 'UNKNOWN' && planObject.originalQuery.length > 10) {
                // Create an ESCALATION ticket immediately
                const escalationPlan = {
                    intent: "CREATE_ESCALATION", // Internal intent for Database.js
                    entities: {
                        orderId: planObject.entities.orderId || 'Unknown', // Try to get orderId
                        type: "ESCALATION",
                        description: `User query: "${planObject.originalQuery}"`
                    }
                };
                // We re-use the planner to create the ticket
                await planAndExecuteQuery(escalationPlan, ws.context);
            }
            // --- END UPDATED ---

            // --- STAGE 2: CONDITIONAL PROCESSING ---
            if (planObject.isTaskOriented) {
                const dbResult = await planAndExecuteQuery(planObject, ws.context);
                console.log("Stage 2 Complete. DB Result:", dbResult);
                planObject.databaseResult = dbResult;
            } else {
                console.log("Stage 2 Skipped.");
                planObject.databaseResult = { info: "Conversational turn." };
            }
            
            // --- STAGE 3: GENERATION & STATE MANAGEMENT ---
            if (planObject.databaseResult && planObject.databaseResult.error && planObject.databaseResult.needed) {
                planObject.neededEntity = planObject.databaseResult.needed;
                ws.context.incompletePlan = planObject; // Save state
            } else {
                // --- FIX: This was ws.content, now ws.context ---
                ws.context.incompletePlan = null; // Clear state
            }
            
            console.log("Stage 3: Generating final response...");
            const agentResponseText = await generateResponseFromContext(planObject);
            console.log("Final Response:", agentResponseText);
            
            const botReply = { id: Date.now(), text: agentResponseText, sender: 'bot' };
            ws.send(JSON.stringify(botReply));
        } catch (error) {
            console.error("Error in workflow:", error);
            ws.context = {};
            const errorReply = { id: Date.now(), text: "I'm sorry, an unexpected error occurred. Let's start over.", sender: 'bot' };
            ws.send(JSON.stringify(errorReply));
        }
    });
    ws.on('close', () => { console.log("Connection handled by controller is now closed."); });
};

// Export both functions correctly
module.exports = {
    loadIntents,
    handleConnection
};
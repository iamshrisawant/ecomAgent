// server/controllers/chatController.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const { planAndExecuteQuery } = require("../models/Database");
const { driver } = require("../config/db");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- INTENT LOADING ---
let ALLOWED_INTENTS_WITH_RULES = "No intents loaded.";

const loadIntents = async function() {
    const session = driver.session({ database: 'neo4j' });
    try {
        const result = await session.run(`
            MATCH (i:Intent)
            OPTIONAL MATCH (i)-[:REQUIRES_ENTITY]->(e:Entity)
            RETURN i.name AS intent, collect(e.name) AS requiredEntities
        `);
        
        const intents = result.records.map(record => {
            const intent = record.get('intent');
            const entities = record.get('requiredEntities').filter(e => e);
            if (entities.length > 0) return `${intent} (requires: ${entities.join(', ')})`;
            return intent;
        });

        ALLOWED_INTENTS_WITH_RULES = intents.join(", ");
        console.log("Intents loaded:", ALLOWED_INTENTS_WITH_RULES);
    } catch (error) {
        console.error("Failed to load intents:", error);
        ALLOWED_INTENTS_WITH_RULES = "GREETING, GRATITUDE, UNKNOWN";
    } finally {
        await session.close();
    }
}
loadIntents();

// --- ANALYSIS PROMPT ---
const analysisPrompt = (userQuery, ongoingContext = null, history = []) => {
    const conversationLog = history.length > 0 
        ? history.map(h => `${h.role.toUpperCase()}: "${h.text}"`).join("\n")
        : "No previous history.";

    const ongoingBlock = ongoingContext
        ? `There is an ongoing, incomplete plan from the previous turn. You MUST treat this message as a continuation of that plan unless the user clearly changes topics.\nPrevious plan JSON: ${JSON.stringify(ongoingContext, null, 2)}`
        : "There is no ongoing plan; treat this as a fresh request.";

    // Define strict "Non-Tasks" to help the AI distinguish
    const nonTasks = ["GREETING", "GRATITUDE", "UNKNOWN"];

    return `
    You are a context-aware NLU API.
    
    --- HISTORY (most recent turns first) ---
    ${conversationLog}
    ---

    --- ONGOING CONTEXT ---
    ${ongoingBlock}
    ---
    
    --- CURRENT QUERY ---
    "${userQuery}"
    
    --- RULES ---
    1. Intent MUST be one of: [${ALLOWED_INTENTS_WITH_RULES}]
    2. **ESCALATION KEYWORDS:** If query implies "Escalate", "Human", "Manager", or "Supervisor" -> Classify as **UNKNOWN** (to trigger triage).
    3. **TASK ORIENTATION:** - IF intent is in [${nonTasks.join(', ')}] -> isTaskOriented: false
       - ALL OTHER intents (e.g. REQUEST_ASSISTANCE) -> isTaskOriented: true
    4. If there is an ongoing plan and the user is providing a missing entity (like an orderId, email, etc.), REUSE the previous intent and MERGE the new entities into the prior entities instead of inventing a new plan.
    
    Output JSON: {"intent": "string", "entities": {}, "sentiment": "string", "plan": "string", "isTaskOriented": boolean}
    `;
};

// --- RESPONSE PROMPT ---
async function generateResponseFromContext(masterContext) {
    const prompt = `
        You are an empathetic e-commerce support agent.
        
        --- PRIORITY RULES ---
        1. **MISSING INFO:** If 'neededEntity' is present, ASK FOR IT. (e.g. "I can help. What is the [neededEntity]?")
        2. **ESCALATION:** If 'databaseResult' has 'ticketId' AND intent was UNKNOWN/ESCALATION, say: "I have escalated this to a human agent (Escalation #[ID])."
        3. **TICKET:** If 'databaseResult' has 'ticketId' AND intent was Standard, say: "I have filed ticket #[ID]."
        4. **ERROR:** If 'databaseResult' has 'error', say: "System error: [Error]. Please try again."
        5. **FALLBACK:** Otherwise, ask for clarification.

        NOTE: Respond in text not markdown.
        
        --- CONTEXT ---
        ${JSON.stringify(masterContext, null, 2)}
        ---
        Response:
    `;

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(prompt);

    let raw = result.response.text(); // may contain **bold**
    console.log("raw response:", raw);

    // Convert **bold** → <b>bold</b>
    let htmlBold = raw.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");

    return htmlBold;
}

// --- CONNECTION HANDLER ---
const handleConnection = (ws, customerId) => {
    ws.context = { customerId, history: [] };

    ws.on('message', async (message) => {
        try {
            const userQuery = message.toString();
            console.log(`--- New Query: "${userQuery}" ---`);

            // --- FIX 1: LEGACY ID GUARD ---
            // If the user has an old "101" or UUID style ID, force them to update.
            // New IDs start with "CUST-".
            if (!customerId.toString().startsWith('CUST-')) {
                const warning = "⚠️ Account Update Required: You are logged in with an old account version. Please 'Logout' and 'Sign Up' again to enable the new features.";
                ws.send(JSON.stringify({ id: Date.now(), text: warning, sender: 'bot' }));
                return;
            }

            ws.context.history.push({ role: 'user', text: userQuery });
            if (ws.context.history.length > 10) ws.context.history.shift();

            // 1. Analysis
            const ongoingContext = ws.context.incompletePlan || null;
            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
            const result = await model.generateContent(analysisPrompt(userQuery, ongoingContext, ws.context.history));
            
            // Safe JSON Parsing
            const jsonMatch = result.response.text().match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error("AI Analysis failed.");
            let planObject = JSON.parse(jsonMatch[0]);
            planObject.originalQuery = userQuery;

            // --- FIX 2: FORCE TASK ORIENTATION ---
            // If the AI picked a real intent (like REQUEST_ASSISTANCE), force it to be a task.
            const nonTasks = ["GREETING", "GRATITUDE", "UNKNOWN"];
            if (!nonTasks.includes(planObject.intent)) {
                planObject.isTaskOriented = true;
            }

            console.log(`Stage 1 Intent: ${planObject.intent} (Task: ${planObject.isTaskOriented})`);

            // 2. SMART ESCALATION (Unknown Intent)
            if (planObject.intent === 'UNKNOWN' && planObject.originalQuery.length > 2) {
                console.log("Escalating...");
                
                const triagePrompt = `Analyze: "${planObject.originalQuery}". JSON: {"suspectedIntent": "string", "reasoning": "string", "sentiment": "string"}`;
                const hypResult = await model.generateContent(triagePrompt);
                const hypMatch = hypResult.response.text().match(/\{[\s\S]*\}/);
                const aiAnalysis = hypMatch ? JSON.parse(hypMatch[0]) : null;

                const escalationPlan = {
                    intent: "CREATE_ESCALATION", 
                    entities: {
                        description: planObject.originalQuery,
                        aiAnalysis: aiAnalysis,
                        type: 'ESCALATION',
                        orderId: null
                    }
                };
                
                const escResult = await planAndExecuteQuery(escalationPlan, ws.context);
                
                planObject.databaseResult = escResult.data 
                    ? { info: "Escalated", ticketId: escResult.data.ticketId } 
                    : { error: escResult.error || "Escalation creation failed." };
                
                planObject.isTaskOriented = false; // Handled, no further DB calls needed
            }

            // 3. Standard Task Execution
            else if (planObject.isTaskOriented) {
                const dbResult = await planAndExecuteQuery(planObject, ws.context);
                planObject.databaseResult = dbResult;
            } else {
                planObject.databaseResult = { info: "Conversational turn." };
            }
            
            // --- CRITICAL ERROR TRAP (Double Check) ---
            if (planObject.databaseResult?.error && planObject.databaseResult.error.includes("Customer not found")) {
                 const warning = "⚠️ Session Error: Your account was not found in the database. Please Logout and Sign Up again.";
                 ws.send(JSON.stringify({ id: Date.now(), text: warning, sender: 'bot' }));
                 return;
            }

            // 4. State Management (Missing Info)
            if (planObject.databaseResult?.error && planObject.databaseResult?.needed) {
                planObject.neededEntity = planObject.databaseResult.needed;
                ws.context.incompletePlan = planObject; // Sticky!
            } else {
                ws.context.incompletePlan = null;
            }
            
            // 5. Response
            const agentResponseText = await generateResponseFromContext(planObject);
            console.log("Final Response:", agentResponseText);
            
            ws.context.history.push({ role: 'agent', text: agentResponseText });
            ws.send(JSON.stringify({ id: Date.now(), text: agentResponseText, sender: 'bot' }));

        } catch (error) {
            console.error("Error:", error);
            ws.send(JSON.stringify({ id: Date.now(), text: "I'm sorry, an internal error occurred.", sender: 'bot' }));
        }
    });
    
    ws.on('close', () => { console.log("Connection closed."); });
};

module.exports = { loadIntents, handleConnection };
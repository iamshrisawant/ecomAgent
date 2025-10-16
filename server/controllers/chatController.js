// server/controllers/chatController.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const { planAndExecuteQuery } = require("../models/Database");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// The "White List" of explicitly approved, safe intents.
const ALLOWED_INTENTS = [
    'TRACK_SHIPMENT_DETAILS', 'TRACK_RETURN_PROGRESS', 'TRACK_REFUND_STATUS',
    'CHECK_PARTIAL_SHIPMENT', 'REPORT_DAMAGED_ITEM', 'REPORT_MISSING_ITEM',
    'REPORT_WRONG_ITEM_RECEIVED', 'VIEW_TICKET_STATUS', 'CHECK_RETURN_ELIGIBILITY',
    'CHECK_WARRANTY_STATUS', 'GREETING', 'GRATITUDE', 'UNKNOWN'
];

const analysisPrompt = (userQuery, ongoingContext = null) => {
    // Shared rules for both prompt types to ensure consistency
    const baseRules = `
    The JSON object you return MUST have five keys: "intent", "entities", "sentiment", "plan", and "isTaskOriented".

    --- RULES ---
    1. The "intent" value MUST be one of the following strings: [${ALLOWED_INTENTS.join(", ")}].
    2. If a user's query does not match an allowed intent, you MUST classify the intent as "UNKNOWN".
    3. For an "UNKNOWN" intent, the "plan" MUST be to "Politely inform the user this request is not supported and list 2-3 examples of supported tasks."
    4. The "entities" value MUST be a simple key-value object (e.g., {"orderId": "123"}). It MUST NOT be an array.
    5. "isTaskOriented" MUST be 'false' for intents like GREETING, GRATITUDE, and UNKNOWN.
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

        Example (Task):
        Query: "I'm missing an item from order 555! This is so annoying."
        Response: {"intent":"CHECK_PARTIAL_SHIPMENT","entities":{"orderId":"555"},"sentiment":"frustrated","plan":"Acknowledge the user's frustration, check for multiple shipments, and explain the status of each.","isTaskOriented":true}

        Example (Invalid Intent):
        Query: "Can you change the price of a product for me?"
        Response: {"intent":"UNKNOWN","entities":{},"sentiment":"neutral","plan":"Politely inform the user this request is not supported and list 2-3 examples of supported tasks.","isTaskOriented":false}
        
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

            if (planObject.intent === 'UNKNOWN' && planObject.originalQuery.length > 10) { // Only log substantive queries
                await logSuggestion(planObject.originalQuery, planObject.plan, customerId);
            }

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

module.exports = { handleConnection };
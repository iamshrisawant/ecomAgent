// server/controllers/chatController.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const { planAndExecuteQuery } = require("../models/Database");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const ALLOWED_INTENTS = [
    'TRACK_SHIPMENT_DETAILS', 'TRACK_RETURN_PROGRESS', 'TRACK_REFUND_STATUS',
    'CHECK_PARTIAL_SHIPMENT', 'REPORT_DAMAGED_ITEM', 'REPORT_MISSING_ITEM',
    'REPORT_WRONG_ITEM_RECEIVED', 'VIEW_TICKET_STATUS', 'CHECK_RETURN_ELIGIBILITY',
    'CHECK_WARRANTY_STATUS', 'GREETING', 'GRATITUDE', 'UNKNOWN'
];

const analysisPrompt = (userQuery, ongoingContext = null) => {
    let contextInstructions = ongoingContext
        ? `
        --- ONGOING CONVERSATION CONTEXT ---
        The agent is in the middle of a task with the original intent: "${ongoingContext.intent}".
        The agent previously asked the user for the following missing information: "${ongoingContext.neededEntity}".
        The user has now replied with: "${userQuery}".

        YOUR FIRST PRIORITY: Analyze the user's reply.
        1. If the reply provides the missing information, extract it into the 'entities' object and YOU MUST KEEP the original intent ("${ongoingContext.intent}").
        2. If the reply is a new, unrelated question, and only in that case, IGNORE the old context and analyze the query from scratch.
        `
        : `YOUR TASK: Analyze the user's new query from scratch.`;

    return `
    You are a highly-tuned NLU API. Your purpose is to classify a user's query and extract data into a specific JSON format.
    YOU MUST RESPOND WITH ONLY a valid, minified JSON object.

    ${contextInstructions}

    The JSON object must have five keys: "intent", "entities", "sentiment", "plan", and "isTaskOriented".

    --- RULES ---
    1. The "intent" value MUST be one of the following: [${ALLOWED_INTENTS.join(", ")}].
    2. If the user's query is about a task not on the allowed list, you MUST classify the intent as "UNKNOWN".
    3. For an "UNKNOWN" intent, the "plan" MUST be to "Politely inform the user this request is not supported and list 2-3 examples of supported tasks."
    4. "isTaskOriented" MUST be 'false' for GREETING, GRATITUDE, and UNKNOWN.
    5. The "entities" value MUST be a simple key-value object (e.g., {"orderId": "123"}).
    ---

    Query: "${userQuery}"
    Response:
    `;
};

async function generateResponseFromContext(masterContext) {
    const prompt = `
        You are an empathetic, concise e-commerce support agent. Write a personalized, final response based on the JSON context. Follow the "plan" to shape the tone.
        If the 'databaseResult' indicates a missing entity ('needed' field), rephrase it as a natural question (e.g., if 'needed' is 'orderId', ask "What is the order number?"). Do not use technical words like 'entity'.
        --- JSON CONTEXT ---
        ${JSON.stringify(masterContext, null, 2)}
        ---
        Write the final, user-facing response:
    `;
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(prompt);
    return result.response.text();
}

const handleConnection = (ws) => {
    ws.context = {};

    ws.on('message', async (message) => {
        try {
            const userQuery = message.toString();
            console.log(`--- New Query: "${userQuery}" ---`);
            let planObject;

            // STAGE 1: CONTEXT-AWARE ANALYSIS
            const ongoingContext = ws.context.incompletePlan || null;
            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
            const result = await model.generateContent(analysisPrompt(userQuery, ongoingContext));
            const rawText = result.response.text();
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error("Analysis LLM did not return valid JSON.");
            planObject = JSON.parse(jsonMatch[0]);
            planObject.originalQuery = userQuery;
            console.log("Stage 1 Complete. Plan Object:", planObject);

            // STAGE 2: CONDITIONAL PROCESSING
            if (planObject.isTaskOriented) {
                const dbResult = await planAndExecuteQuery(planObject);
                console.log("Stage 2 Complete. DB Result:", dbResult);
                planObject.databaseResult = dbResult;
            } else {
                console.log("Stage 2 Skipped: Conversational or unapproved query.");
                planObject.databaseResult = { info: "Conversational turn, no DB action." };
            }
            
            // STAGE 3: GENERATION & STATE MANAGEMENT
            if (planObject.databaseResult && planObject.databaseResult.error && planObject.databaseResult.needed) {
                planObject.neededEntity = planObject.databaseResult.needed;
                ws.context.incompletePlan = planObject;
            } else {
                ws.context = {};
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
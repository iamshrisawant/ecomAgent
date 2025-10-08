// server/controllers/chatController.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
const { getOrderStatus, checkPartialShipment, processReturn } = require("../models/Order");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// REVISED LOGIC: The "recipe book" now includes all needed entities for each intent.
const intentPlans = {
    'TRACK_ORDER': { tool: getOrderStatus, requiredEntities: ['orderId'] },
    'CHECK_PARTIAL_SHIPMENT': { tool: checkPartialShipment, requiredEntities: ['orderId'] },
    'RETURN_ITEM': { tool: processReturn, requiredEntities: ['orderId', 'reason'] },
};

const analysisPrompt = (userQuery) => `
    You are a highly-tuned NLU API. Your sole purpose is to analyze user text and return a single, minified JSON object.
    YOU MUST RESPOND WITH ONLY the JSON object. Do not add explanations.

    The JSON object must have four keys: "intent", "entities", "sentiment", and "plan".
    - "intent": Can be TRACK_ORDER, RETURN_ITEM, CHECK_PARTIAL_SHIPMENT, UNKNOWN.
    - "entities": An object containing extracted data like orderId or reason.
    - "sentiment": Can be "frustrated", "neutral", "positive", or "curious".
    - "plan": A concise, natural language instruction for a support agent on how to frame the final response.

    Example 1:
    Query: "Where is my order #123?"
    Response: {"intent":"TRACK_ORDER","entities":{"orderId":"123"},"sentiment":"curious","plan":"Provide the user with the current status of their order."}

    Example 2:
    Query: "I'm missing an item from order 555! This is so annoying."
    Response: {"intent":"CHECK_PARTIAL_SHIPMENT","entities":{"orderId":"555"},"sentiment":"frustrated","plan":"Acknowledge the user's frustration, check for multiple shipments, and explain the status of each."}

    ---
    Query: "${userQuery}"
    Response:
`;

async function generateResponseFromContext(masterContext) {
    const prompt = `
        You are an empathetic and helpful e-commerce support agent.
        Your task is to write a personalized, final response to the user based on the JSON context provided below.
        Follow the "plan" instruction to shape the tone and content of your reply.
        If the databaseResult contains an error that indicates missing information, use the 'neededEntities' array to ask the user for the next piece of information naturally.

        --- JSON CONTEXT ---
        ${JSON.stringify(masterContext, null, 2)}
        ---

        Write the final response to the user:
    `;
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(prompt);
    return result.response.text();
}

const handleConnection = (ws) => {
    ws.context = {}; // Each connection gets its own memory

    ws.on('message', async (message) => {
        try {
            const userQuery = message.toString();
            console.log(`--- New Query: "${userQuery}" ---`);
            let masterContext;

            // --- FULFILLER: Check for an ongoing conversation ---
            if (ws.context.incompletePlan) {
                console.log("Fulfilling existing plan...");
                masterContext = ws.context.incompletePlan;
                
                // REVISED LOGIC: Fulfill the next needed entity deterministically.
                const nextNeeded = masterContext.neededEntities[0];
                masterContext.entities[nextNeeded] = userQuery;
                masterContext.neededEntities.shift(); // Remove the entity from the needed list
            } 
            // --- PLANNER: If no conversation is active, start a new one ---
            else {
                const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
                const result = await model.generateContent(analysisPrompt(userQuery));
                const cleanedJsonString = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
                
                masterContext = JSON.parse(cleanedJsonString);
                masterContext.originalQuery = userQuery;

                // REVISED LOGIC: Create the list of needed entities right after analysis.
                const planDetails = intentPlans[masterContext.intent];
                if (planDetails) {
                    masterContext.neededEntities = planDetails.requiredEntities.filter(
                        (entity) => !masterContext.entities[entity]
                    );
                } else {
                    masterContext.neededEntities = [];
                }
                console.log("Analysis complete. Needs:", masterContext.neededEntities);
            }

            // --- EXECUTOR & RESPONDER ---
            let agentResponseText;

            // If there are still entities needed, save the plan and ask the user.
            if (masterContext.neededEntities && masterContext.neededEntities.length > 0) {
                console.log("Information still missing, saving plan to context.");
                ws.context.incompletePlan = masterContext;
                // Generate a response that asks for the next item.
                // We pass a placeholder DB result to guide the NLG.
                masterContext.databaseResult = { error: `Missing ${masterContext.neededEntities[0]}` };
                agentResponseText = await generateResponseFromContext(masterContext);
            } 
            // If all entities are collected, run the tool.
            else {
                console.log("Plan is complete. Executing tool...");
                const toolToExecute = intentPlans[masterContext.intent].tool;
                const dbResult = await toolToExecute(masterContext.entities);
                masterContext.databaseResult = dbResult;
                
                console.log("Database call complete.", dbResult);
                
                // Generate the final response and clear the memory.
                agentResponseText = await generateResponseFromContext(masterContext);
                ws.context = {};
            }

            console.log("Final response generated.");
            const botReply = { id: Date.now(), text: agentResponseText, sender: 'bot' };
            ws.send(JSON.stringify(botReply));

        } catch (error) {
            console.error("Error in workflow:", error);
            ws.context = {};
            const errorReply = { id: Date.now(), text: "I'm sorry, I encountered a system error. Could you please try again?", sender: 'bot' };
            ws.send(JSON.stringify(errorReply));
        }
    });

    ws.on('close', () => {
        console.log("Connection handled by controller is now closed.");
    });
};

module.exports = { handleConnection };
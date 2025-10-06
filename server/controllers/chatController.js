// server/controllers/chatController.js

const { GoogleGenerativeAI } = require("@google/generative-ai");
// Make sure you import both tools from your models file
const { getOrderStatus, checkPartialShipment} = require("../models/Order");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// The "recipe book" for what each intent needs
const intentPlans = {
    'TRACK_ORDER': { neededEntities: ['orderId'], tool: getOrderStatus },
    'CHECK_PARTIAL_SHIPMENT': { neededEntities: ['orderId'], tool: checkPartialShipment },
};

const handleConnection = (ws) => {
    ws.context = {}; // Initialize context for this connection
    console.log("Chat controller is handling a new connection.");

    ws.on('message', async (message) => {
        try {
            const userQuery = message.toString();
            let agentResponseText;

            // --- FULFILLER: Check if we are in the middle of a plan ---
            if (ws.context.plan && ws.context.plan.neededEntities.length > 0) { // CORRECTED: neededEntities
                console.log("Fulfilling existing plan...");
                const needed = ws.context.plan.neededEntities[0]; // CORRECTED: neededEntities
                ws.context.plan.collectedEntities[needed] = userQuery;
                ws.context.plan.neededEntities.shift(); // CORRECTED: neededEntities
            }
            // --- PLANNER: If no plan, start a new one with NLU ---
            else {
                console.log("No existing plan, processing new query...");
                const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
                // V-- THIS IS THE UPDATED PROMPT --V
                const prompt = `
                    You are a highly-tuned NLU API. Your sole purpose is to analyze user text and return a single, minified JSON object.
                    YOU MUST RESPOND WITH ONLY the JSON object and nothing else. Do not add explanations, greetings, or markdown formatting.

                    The JSON object must have two keys: "intent" and "entities".
                    - "intent" can be one of: TRACK_ORDER, CHECK_PARTIAL_SHIPMENT, RETURN_ITEM, CHECK_REFUND_STATUS, GENERAL_INQUIRY, UNKNOWN.
                    - "entities" is an object that can contain: orderId, reason.

                    Example 1:
                    Query: "Where is my order?"
                    Response: {"intent":"TRACK_ORDER","entities":{}}

                    Example 2:
                    Query: "I want to return my order 12345 because it was the wrong size"
                    Response: {"intent":"RETURN_ITEM","entities":{"orderId":"12345","reason":"wrong size"}}

                    ---
                    Query: "${userQuery}"
                    Response:
                `;
                // ^-- END OF UPDATED PROMPT --^

                const result = await model.generateContent(prompt);
                const cleanedJsonString = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
                const nluResult = JSON.parse(cleanedJsonString);
                
                const { intent, entities } = nluResult;
                console.log(`Identified Intent: ${intent}`, `| Entities:`, entities);

                if (intentPlans[intent]) {
                    ws.context.plan = {
                        intent: intent,
                        collectedEntities: entities,
                        neededEntities: intentPlans[intent].neededEntities, // CORRECTED: neededEntities
                    };
                    // Filter out entities we already have
                    ws.context.plan.neededEntities = ws.context.plan.neededEntities.filter( // CORRECTED: neededEntities
                        (entity) => !ws.context.plan.collectedEntities[entity]
                    );
                } else {
                    agentResponseText = "I'm sorry, I don't understand that request.";
                }
            }

            // --- EXECUTOR: Check if the current plan is complete and can be executed ---
            if (ws.context.plan && ws.context.plan.neededEntities.length === 0) { // CORRECTED: neededEntities
                console.log("Plan complete, executing tool...");
                const plan = ws.context.plan;
                const toolToExecute = intentPlans[plan.intent].tool;
                agentResponseText = await toolToExecute(plan.collectedEntities);
                ws.context = {}; // Clear context after execution
            } else if (ws.context.plan) {
                // If the plan is not yet complete, ask for the next piece of info
                const nextNeededEntity = ws.context.plan.neededEntities[0]; // CORRECTED: neededEntities
                agentResponseText = `I can help with that. What is the ${nextNeededEntity}?`;
            }

            // --- Send the final response ---
            const botReply = {
                id: Date.now(),
                text: agentResponseText,
                sender: 'bot'
            };
            ws.send(JSON.stringify(botReply));

        } catch (error) {
            console.error("Error processing message:", error);
            ws.context = {}; // Clear context on error
            const errorReply = {
                id: Date.now(),
                text: "Sorry, I encountered an error. Please try again.",
                sender: 'bot'
            };
            ws.send(JSON.stringify(errorReply));
        }
    });

    ws.on('close', () => {
        console.log("Connection handled by controller is now closed.");
    });
};

module.exports = { handleConnection };
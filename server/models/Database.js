// server/models/Database.js
const { driver } = require('../config/db');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const { generateID } = require('../config/idHelper');

// --- 1. LIVE SCHEMA (Unchanged) ---
async function getLiveGraphSchema() {
    const session = driver.session({ database: 'neo4j' });
    try {
        const labelRes = await session.run(`CALL db.labels() YIELD label RETURN collect(label) as labels`);
        const labels = labelRes.records[0].get('labels').join(', ');
        const relRes = await session.run(`CALL db.relationshipTypes() YIELD relationshipType RETURN collect(relationshipType) as rels`);
        const rels = relRes.records[0].get('rels').join(', ');
        const schemaRes = await session.run(`
            CALL db.schema.visualization() YIELD nodes, relationships
            RETURN 
                reduce(s = "", n IN nodes | s + labels(n)[0] + ", ") as nodeTypes,
                reduce(s = "", r IN relationships | s + "(" + labels(startNode(r))[0] + ")-[:" + type(r) + "]->(" + labels(endNode(r))[0] + "), ") as patterns
        `);
        const patterns = schemaRes.records[0].get('patterns');
        return `NODE LABELS: [${labels}]\nRELATIONSHIPS: [${rels}]\nPATTERNS: ${patterns}`;
    } catch (err) { return `Nodes: Ticket, Order, Product...`; } finally { await session.close(); }
}

// --- 2. THE UNIVERSAL CREATOR (Unchanged) ---
async function createGraphNode(session, label, properties, relationships = []) {
    const nodeId = generateID(label);
    
    const finalProps = { 
        ...properties, 
        [`${label.toLowerCase()}Id`]: nodeId, 
        createdAt: new Date().toISOString() 
    };
    if (finalProps.aiAnalysis) finalProps.aiAnalysis = JSON.stringify(finalProps.aiAnalysis);

    let query = `CREATE (n:${label} $props) `;
    
    relationships.forEach((rel, index) => {
        const targetVar = `t${index}`;
        query += `
            WITH n
            OPTIONAL MATCH (${targetVar}) 
            WHERE ${targetVar}.id = '${rel.targetId}' 
               OR ${targetVar}.ticketId = '${rel.targetId}'
               OR ${targetVar}.orderId = '${rel.targetId}'
               OR ${targetVar}.customerID = '${rel.targetId}'
               OR ${targetVar}.productID = '${rel.targetId}'
            
            FOREACH (_ IN CASE WHEN ${targetVar} IS NOT NULL THEN [1] ELSE [] END | 
                CREATE (${rel.direction === 'IN' ? targetVar : 'n'})-[:${rel.type}]->(${rel.direction === 'IN' ? 'n' : targetVar})
            )
        `;
    });

    query += ` RETURN n`;
    
    const result = await session.run(query, { props: finalProps });
    if (result.records.length === 0) throw new Error(`Failed to create ${label}.`);
    return { ...result.records[0].get('n').properties, _generatedId: nodeId };
}

// --- 3. HEALING LOOP (Unchanged) ---
async function executeCypherWithRetry(session, query, params, model) {
    const MAX_RETRIES = 2;
    let currentQuery = query;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            if (/DELETE|SET|CREATE|MERGE|DETACH/i.test(currentQuery)) throw new Error("Read-only violation.");
            const result = await session.run(currentQuery, params);
            if (result.records.length === 0) return { error: "No data found." };
            return { data: result.records.map(r => r.toObject()) };
        } catch (error) {
            if (attempt === MAX_RETRIES) return { error: error.message };
            const res = await model.generateContent(`Fix Cypher: "${currentQuery}". Error: "${error.message}". Return ONLY query.`);
            currentQuery = res.response.text().replace(/```cypher|```/g, '').replace(/```/g, '').trim();
        }
    }
}

// --- 4. MAIN EXECUTOR (Fixed Planner Prompt) ---
const planAndExecuteQuery = async (planObject, context) => {
    const graphSchema = await getLiveGraphSchema();
    const session = driver.session({ database: 'neo4j' });

    try {
        // Bypass for Escalations
        if (planObject.intent === 'CREATE_ESCALATION') {
            const checkUser = await session.run(`MATCH (c:Customer {customerID: $cid}) RETURN c`, { cid: context.customerId });
            if (checkUser.records.length === 0) throw new Error(`Customer not found. Please Re-Login.`);

            const links = [{ targetId: context.customerId, type: 'OPENED', direction: 'IN' }];
            if (planObject.entities.orderId) links.push({ targetId: planObject.entities.orderId, type: 'REGARDING_ORDER', direction: 'OUT' });

            const node = await createGraphNode(session, 'Ticket', { 
                type: 'ESCALATION', 
                description: planObject.entities.description, 
                aiAnalysis: planObject.entities.aiAnalysis 
            }, links);

            return { data: { success: true, ticketId: node.ticketId, info: "Escalation created." } };
        }

        // Validation check (Removed try/catch to let external error propagate)
        const res = await session.run(`MATCH (i:Intent {name: $intent})-[:REQUIRES_ENTITY]->(e:Entity) RETURN e.name`, { intent: planObject.intent });
        const required = res.records.map(r => r.get('e.name'));
        const provided = Object.keys(planObject.entities || {});
        const missing = required.filter(e => !provided.includes(e));
        if (missing.length > 0) return { error: "Missing entities", needed: missing[0] };

        // --- SPECIAL-CASE: ORDER STATUS LOOKUPS ---
        // Make "Where is my order?" style queries customer- and context-aware,
        // instead of letting the planner return the entire orders dataset.
        const normalizedIntent = (planObject.intent || '').toUpperCase();
        if (normalizedIntent === 'CHECK_ORDER_STATUS' || normalizedIntent.includes('ORDER_STATUS')) {
            const customerId = context.customerId;
            const orderId = planObject.entities?.orderId || null;

            let query;
            let params;

            if (orderId) {
                // If the user (or previous turn) provided a specific orderId,
                // look up only that order for this customer.
                query = `
                    MATCH (c:Customer {customerID: $customerId})-[:PLACED]->(o:Order {orderId: $orderId})
                    OPTIONAL MATCH (o)-[:FULFILLED_BY]->(s:Shipment)
                    RETURN o AS order, collect(s) AS shipments
                `;
                params = { customerId, orderId };
            } else {
                // No explicit orderId: assume the user is asking about their most
                // recent order only (not the whole history).
                query = `
                    MATCH (c:Customer {customerID: $customerId})-[:PLACED]->(o:Order)
                    OPTIONAL MATCH (o)-[:FULFILLED_BY]->(s:Shipment)
                    WITH o, collect(s) AS shipments
                    ORDER BY o.datePlaced DESC
                    LIMIT 1
                    RETURN o AS order, shipments
                `;
                params = { customerId };
            }

            const result = await session.run(query, params);
            if (result.records.length === 0) {
                return { error: 'No matching order found for this customer.' };
            }

            return { data: result.records.map(r => r.toObject()) };
        }
        
        // --- AI PLANNING ---
        const plannerPrompt = `
            ROLE: Neo4j Architect.
            OUTPUT CONSTRAINT: **Return ONLY ONE JSON object, DO NOT wrap it in a 'plan' or list.**
            
            SCHEMA: ${graphSchema}
            INTENT: "${planObject.intent}"
            DATA: ${JSON.stringify(planObject.entities)}
            CONTEXT_USER: "${context.customerId}" (Use this to link, property is customerID)

            TASK: Generate the JSON Action Object for this single step.

            GLOBAL RULES:
            - You MUST always scope reads and writes to the current customer using CONTEXT_USER.
              Never return orders, tickets, or data for other customers.
            - Prefer narrow, specific queries. Avoid scanning the entire graph when the intent
              is about a single customer's data.
            - If an intent is about a specific resource (order, ticket, etc.) and an ID entity
              is present, filter by that ID. If there is no ID, return only a small, recent subset
              (e.g., the most recent few records) instead of the whole history.
            
            1. **READ (Query):**
               If fetching data, return for example:
               { "query": "MATCH (c:Customer {customerID: '${context.customerId}'})-[:PLACED]->(o:Order)-[:FULFILLED_BY]->(s:Shipment) RETURN o, s ORDER BY o.datePlaced DESC LIMIT 3" }
            
            2. **WRITE (Create):**
               If creating data (Ticket/Return), return { "action": "CREATE_NODE", "label": "Ticket", "data": {...}, "links": [...] }
        `;

        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        let result;
        try {
            const raw = await model.generateContent(plannerPrompt);
            const rawText = raw.response.text();
            
            // Clean and parse the main JSON block
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error("Planner failed to return JSON.");
            result = JSON.parse(jsonMatch[0]);

        } catch (e) { 
            await session.close(); 
            return { error: `Planning failed: Planner did not return valid JSON. Error: ${e.message}` }; 
        }

        // --- EXECUTION ---
        if (result.query) {
            return await executeCypherWithRetry(session, result.query, planObject.entities, model);
        } 
        else if (result.action === 'CREATE_NODE' || result.action === 'CREATE_TICKET') {
            // ... (keep normalization logic for CREATE_TICKET/CREATE_NODE) ...
            
            // Normalization for legacy 'CREATE_TICKET'
            if (result.action === 'CREATE_TICKET') {
                result.label = 'Ticket';
                result.links = [{ targetId: context.customerId, type: 'OPENED', direction: 'IN' }];
                if (!result.data) result.data = { type: planObject.intent, description: "Ticket" };
            }

            const createdNode = await createGraphNode(session, result.label, result.data, result.links);
            const idKey = Object.keys(createdNode).find(k => k.includes('Id') || k.includes('ID'));
            return { data: { success: true, ticketId: createdNode[idKey] || createdNode._generatedId } };
        }

        return { error: `Unsupported Action: ${result.action || 'Unknown'}` };

    } catch (err) {
        return { error: err.message };
    } finally {
        await session.close();
    }
};

module.exports = { planAndExecuteQuery, createGraphNode };
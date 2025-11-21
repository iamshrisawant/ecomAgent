// server/controllers/dashboardController.js
const { driver } = require('../config/db');
const { loadIntents } = require('../controllers/chatController');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// --- FETCHING ---

exports.getTickets = async (req, res) => {
    const session = driver.session({ database: 'neo4j' });
    try {
        const result = await session.run(`
            MATCH (c:Customer)-[:OPENED]->(t:Ticket)
            WHERE t.type <> 'ESCALATION'
            RETURN t.ticketId AS ticketId, t.type AS type, t.description AS description, 
                   t.status AS status, t.createdAt AS createdAt, c.name AS customerName
            ORDER BY t.createdAt DESC
        `);
        res.json(result.records.map(r => r.toObject()));
    } catch (e) { res.status(500).send('Error'); } finally { await session.close(); }
};

exports.getEscalations = async (req, res) => {
    const session = driver.session({ database: 'neo4j' });
    try {
        const result = await session.run(`
            MATCH (c:Customer)-[:OPENED]->(t:Ticket)
            WHERE t.type = 'ESCALATION'
            RETURN t.ticketId AS ticketId, t.type AS type, t.description AS description, 
                   t.status AS status, t.createdAt AS createdAt, c.name AS customerName,
                   t.aiAnalysis AS aiAnalysis
            ORDER BY t.createdAt DESC
        `);
        res.json(result.records.map(r => r.toObject()));
    } catch (e) { res.status(500).send('Error'); } finally { await session.close(); }
};

exports.getSuggestions = async (req, res) => {
    const session = driver.session({ database: 'neo4j' });
    try {
        // UPDATED: Fetch 'failedHypothesis' to show context in UI
        const result = await session.run(`
            MATCH (s:Suggestion {status: 'Pre-Analyzed'})
            OPTIONAL MATCH (c:Customer {customerID: s.customerId})
            RETURN s.suggestionId AS id, s.query AS query, s.plan AS plan, 
                   s.failedHypothesis AS failedHypothesis,
                   s.status AS status, s.createdAt AS createdAt, c.name AS customerName,
                   s.proposedIntent AS proposedIntent, 
                   s.proposedEntities AS proposedEntities,
                   s.proposedDescription AS proposedDescription
            ORDER BY s.createdAt DESC
        `);
        res.json(result.records.map(r => r.toObject()));
    } catch (e) { res.status(500).send('Error'); } finally { await session.close(); }
};

// --- LEARNING LOOP ---

exports.resolveTicketAndLearn = async (req, res) => {
    const { ticketId, resolutionNote } = req.body;
    const session = driver.session({ database: 'neo4j' });
    try {
        const result = await session.run(`
            MATCH (t:Ticket {ticketId: $ticketId})
            SET t.status = 'Resolved', t.resolutionNote = $resolutionNote
            RETURN t.description AS originalQuery, t.aiAnalysis AS aiAnalysis
        `, { ticketId, resolutionNote });

        if (result.records.length === 0) return res.status(404).json({ message: 'Ticket not found' });

        const originalQuery = result.records[0].get('originalQuery');
        // Parse the AI Analysis so we can store it on the Suggestion
        const aiAnalysisStr = result.records[0].get('aiAnalysis'); 
        const aiAnalysis = aiAnalysisStr ? JSON.parse(aiAnalysisStr) : null;
        
        analyzeResolution(originalQuery, resolutionNote, aiAnalysis, req.user.id);
        res.json({ success: true });
    } catch (e) { res.status(500).send('Error'); } finally { await session.close(); }
};

async function analyzeResolution(query, guidance, hypothesis, agentId) {
    console.log(`AI is synthesizing new rule...`);
    const prompt = `
        ROLE: AI Knowledge Architect.
        INPUT: Query: "${query}", Hypothesis: ${JSON.stringify(hypothesis)}, Guidance: "${guidance}".
        TASK: Synthesize into a Rule (Intent).
        OUTPUT JSON: { "intentName": "CAPS_NAME", "description": "Short desc", "requiredEntities": ["e1"] }
    `;
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const res = await model.generateContent(prompt);
        const proposal = JSON.parse(res.response.text().match(/\{[\s\S]*\}/)[0]);

        const session = driver.session({ database: 'neo4j' });
        // UPDATED: Store 'failedHypothesis' (as string) for future context
        await session.run(`
            CREATE (s:Suggestion {
                suggestionId: randomUUID(),
                query: $query, 
                plan: $guidance,
                failedHypothesis: $hypothesisStr,
                status: 'Pre-Analyzed', agentId: $agentId, createdAt: timestamp(),
                proposedIntent: $intent, proposedEntities: $entities, proposedDescription: $desc
            })
        `, { 
            query, guidance, agentId: agentId || 'unknown',
            hypothesisStr: hypothesis ? JSON.stringify(hypothesis) : null,
            intent: proposal.intentName, entities: proposal.requiredEntities, desc: proposal.description
        });
        await session.close();
    } catch (e) { console.error("Synthesis failed", e); }
}

// --- MANAGEMENT (Suggestions) ---

exports.updateSuggestion = async (req, res) => {
    const { id, intentName, description, requiredEntities } = req.body;
    const session = driver.session({ database: 'neo4j' });
    try {
        await session.run(`
            MATCH (s:Suggestion {suggestionId: $id})
            SET s.proposedIntent = $intentName,
                s.proposedDescription = $description,
                s.proposedEntities = $requiredEntities
        `, { id, intentName, description, requiredEntities });
        res.json({ success: true });
    } catch (e) { res.status(500).send(e.message); } finally { await session.close(); }
};

exports.approveSuggestion = async (req, res) => {
    const { id, intentName, description, requiredEntities } = req.body;
    const session = driver.session({ database: 'neo4j' });
    try {
        await session.run(`
            MERGE (i:Intent {name: $intentName})
            ON CREATE SET i.description = $description, i.createdAt = timestamp()
            ON MATCH SET i.description = $description
        `, { intentName, description });
        
        if (requiredEntities && requiredEntities.length > 0) {
            await session.run(`
                MATCH (i:Intent {name: $intentName})
                UNWIND $requiredEntities AS entityName
                MERGE (e:Entity {name: entityName})
                MERGE (i)-[:REQUIRES_ENTITY]->(e)
            `, { intentName, requiredEntities });
        }

        if (id) await session.run(`MATCH (s:Suggestion {suggestionId: $id}) DELETE s`, { id });

        await loadIntents(); 
        res.status(201).json({ success: true });
    } catch (e) { res.status(500).send('Error'); } finally { await session.close(); }
};

exports.rejectSuggestion = async (req, res) => {
    const { id } = req.body;
    const session = driver.session({ database: 'neo4j' });
    try {
        await session.run(`MATCH (s:Suggestion {suggestionId: $id}) DELETE s`, { id });
        res.json({ success: true });
    } catch (e) { res.status(500).send(e.message); } finally { await session.close(); }
};

// --- MANAGEMENT (Live Intents) ---

exports.getActiveIntents = async (req, res) => {
    const session = driver.session({ database: 'neo4j' });
    try {
        const result = await session.run(`
            MATCH (i:Intent) 
            OPTIONAL MATCH (i)-[:REQUIRES_ENTITY]->(e:Entity)
            RETURN i.name as name, i.description as description, collect(e.name) as entities
            ORDER BY i.name ASC
        `);
        res.json(result.records.map(r => r.toObject()));
    } catch (e) { res.status(500).send(e.message); } finally { await session.close(); }
};

exports.updateIntent = async (req, res) => {
    const { intentName, description, requiredEntities } = req.body;
    const session = driver.session({ database: 'neo4j' });
    try {
        await session.run(`
            MATCH (i:Intent {name: $intentName})
            SET i.description = $description
        `, { intentName, description });

        await session.run(`
            MATCH (i:Intent {name: $intentName})-[r:REQUIRES_ENTITY]->()
            DELETE r
        `, { intentName });

        if (requiredEntities && requiredEntities.length > 0) {
            await session.run(`
                MATCH (i:Intent {name: $intentName})
                UNWIND $requiredEntities AS entityName
                MERGE (e:Entity {name: entityName})
                MERGE (i)-[:REQUIRES_ENTITY]->(e)
            `, { intentName, requiredEntities });
        }

        await loadIntents();
        res.json({ success: true });
    } catch (e) { res.status(500).send(e.message); } finally { await session.close(); }
};

exports.deleteIntent = async (req, res) => {
    const { intentName } = req.body;
    const session = driver.session({ database: 'neo4j' });
    try {
        await session.run(`MATCH (i:Intent {name: $intentName}) DETACH DELETE i`, { intentName });
        await loadIntents();
        res.json({ success: true });
    } catch (e) { res.status(500).send(e.message); } finally { await session.close(); }
};
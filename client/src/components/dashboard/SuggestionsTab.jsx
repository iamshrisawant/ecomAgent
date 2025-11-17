// client/src/components/dashboard/SuggestionsTab.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

// This new component fetches the AI suggestions
function SuggestionsTab() {
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchSuggestions = async () => {
        setLoading(true);
        setError(null); // Reset error on fetch
        try {
            const res = await axios.get('/api/dashboard/suggestions');
            setSuggestions(res.data);
        } catch (err) {
            console.error("Failed to fetch suggestions", err);
            setError("Failed to load AI suggestions. Please try again later.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSuggestions();
    }, []);

    // --- UPDATED (Grounded Learning Loop) ---
    // This function is now just a simple "Confirm" button
    const handleApprove = async (suggestion) => {
        try {
            // 1. Show the pre-analyzed plan to the agent for confirmation
            const agentApproval = window.confirm(
                `The AI has analyzed this resolved ticket and proposes a new rule:\n\n` +
                `Original Query: \n${suggestion.query}\n\n` +
                `Proposed Intent: \n${suggestion.proposedIntent}\n\n` +
                `Proposed Entities: \n${suggestion.proposedEntities.join(', ') || 'None'}\n\n` +
                `Do you approve this new rule?`
            );

            if (!agentApproval) {
                return; // Agent clicked "Cancel"
            }

            // 2. Agent approved. Send the full plan to the create endpoint.
            await axios.post('/api/dashboard/intents', { 
                intentName: suggestion.proposedIntent,
                description: `Created from human-resolved query: "${suggestion.query}"`,
                requiredEntities: suggestion.proposedEntities
            });

            alert(`Success! The AI has learned the new intent "${suggestion.proposedIntent}".`);
            // Here, we should also DELETE the suggestion node so it disappears from the list
            fetchSuggestions(); // Refresh the list

        } catch (err) {
            console.error("Failed to approve intent", err);
            alert(`Error: ${err.response?.data?.message || 'Could not complete the approval process.'}`);
        }
    };
    // --- END UPDATED ---

    if (loading) {
        return <div>Loading AI suggestions...</div>;
    }

    if (error) {
        return <div style={{ color: 'red' }}>{error}</div>;
    }

    return (
        <div className="ticket-list">
            <h2>🧠 AI Suggestions</h2>
            <p>AI-analyzed proposals based on human-resolved tickets.</p>
            {suggestions.length === 0 ? (
                <p>No new suggestions found.</p>
            ) : (
                suggestions.map((suggestion, index) => (
                    <div key={index} className="ticket-card">
                        <h3>Query: "{suggestion.query}"</h3>
                        <p><strong>Agent Resolution:</strong> {suggestion.plan || 'N/A'}</p>
                        
                        {/* --- UPDATED (Grounded Learning Loop) --- */}
                        {/* Display the AI's proposal */}
                        <div style={{ background: '#f0f0f0', padding: '10px', borderRadius: '4px', margin: '10px 0' }}>
                            <p style={{ margin: 0, fontWeight: 'bold' }}>AI Proposal:</p>
                            <p style={{ margin: '5px 0' }}><strong>Intent:</strong> {suggestion.proposedIntent || 'N/A'}</p>
                            <p style={{ margin: 0 }}><strong>Entities:</strong> {suggestion.proposedEntities ? suggestion.proposedEntities.join(', ') : 'None'}</p>
                        </div>
                        
                        <button 
                            onClick={() => handleApprove(suggestion)}
                            style={{ 
                                backgroundColor: '#28a745', 
                                color: 'white', 
                                border: 'none', 
                                padding: '8px 12px', 
                                borderRadius: '4px', 
                                cursor: 'pointer', 
                                marginTop: '10px' 
                            }}
                        >
                            Approve This Rule
                        </button>
                        {/* --- END UPDATED --- */}
                    </div>
                ))
            )}
        </div>
    );
}

export default SuggestionsTab;
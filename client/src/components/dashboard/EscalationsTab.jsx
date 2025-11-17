// client/src/components/dashboard/EscalationsTab.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

function EscalationsTab() {
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchEscalations = async () => {
        setLoading(true);
        setError(null);
        try {
            // Fetch from the new endpoint
            const res = await axios.get('/api/dashboard/escalations');
            setTickets(res.data);
        } catch (err) {
            console.error("Failed to fetch escalations", err);
            setError("Failed to load escalations. Please try again later.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEscalations();
    }, []);

    // --- ADDED (Grounded Learning Loop) ---
    const handleResolve = async (ticketId, originalQuery) => {
        const resolutionNote = window.prompt(
            `Resolving Ticket: ${ticketId.substring(0, 8)}\n\n` +
            `Original Query: "${originalQuery}"\n\n` +
            `Please enter your resolution note (this will be used to teach the AI):`
        );

        if (!resolutionNote || resolutionNote.trim() === '') {
            return; // Agent cancelled
        }

        try {
            // This new endpoint will resolve the ticket AND trigger the AI analysis
            await axios.post(`/api/dashboard/tickets/resolve`, {
                ticketId,
                resolutionNote
            });
            alert('Ticket resolved and sent to AI for analysis.');
            fetchEscalations(); // Refresh the list
        } catch (err) {
            console.error("Failed to resolve ticket", err);
            alert('Failed to resolve ticket.');
        }
    };
    // --- END ADDED ---

    if (loading) {
        return <div>Loading escalations...</div>;
    }

    if (error) {
        return <div style={{ color: 'red' }}>{error}</div>;
    }

    return (
        <div className="ticket-list">
            <h2>🚨 Escalated Tickets</h2>
            {tickets.length === 0 ? (
                <p>No escalated tickets found.</p>
            ) : (
                tickets.map((ticket) => (
                    <div key={ticket.ticketId} className="ticket-card">
                        <h3>{ticket.type.replace('_', ' ')} - Ticket #{ticket.ticketId.substring(0, 8)}</h3>
                        <p><strong>Customer:</strong> {ticket.customerName}</p>
                        <p><strong>Description:</strong> {ticket.description || 'No description provided.'}</p>
                        <p><strong>Status:</strong> <span className={`status-${ticket.status.toLowerCase()}`}>{ticket.status}</span></p>
                        <p><strong>Created:</strong> {new Date(ticket.createdAt).toLocaleString()}</p>
                        
                        {/* --- ADDED (Grounded Learning Loop) --- */}
                        {ticket.status === 'Open' && (
                            <button
                                onClick={() => handleResolve(ticket.ticketId, ticket.description)}
                                style={{ 
                                    backgroundColor: '#007bff', 
                                    color: 'white', 
                                    border: 'none', 
                                    padding: '8px 12px', 
                                    borderRadius: '4px', 
                                    cursor: 'pointer', 
                                    marginTop: '10px' 
                                }}
                            >
                                Resolve
                            </button>
                        )}
                        {/* --- END ADDED --- */}
                    </div>
                ))
            )}
        </div>
    );
}

export default EscalationsTab;
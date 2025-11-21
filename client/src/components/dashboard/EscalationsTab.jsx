// client/src/components/dashboard/EscalationsTab.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

function EscalationsTab() {
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // State for the Resolution Modal
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [resolutionNote, setResolutionNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchEscalations = async () => {
        setLoading(true);
        setError(null);
        try {
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

    // Opens the modal
    const openResolveModal = (ticket) => {
        // Parse the analysis if it's a string
        let parsedAnalysis = null;
        try {
            parsedAnalysis = typeof ticket.aiAnalysis === 'string' 
                ? JSON.parse(ticket.aiAnalysis) 
                : ticket.aiAnalysis;
        } catch (e) { 
            // Ignore parsing errors
        }
        
        setSelectedTicket({ ...ticket, parsedAnalysis });
        setResolutionNote(''); // Reset note
    };

    // Closes the modal
    const closeResolveModal = () => {
        setSelectedTicket(null);
        setResolutionNote('');
    };

    // Submits the resolution
    const handleSubmitResolution = async () => {
        if (!resolutionNote.trim()) {
            alert("Please provide guidance on how to resolve this.");
            return;
        }

        setIsSubmitting(true);
        try {
            await axios.post(`/api/dashboard/tickets/resolve`, {
                ticketId: selectedTicket.ticketId,
                resolutionNote
            });
            alert('Success! The AI is now learning from your guidance.');
            closeResolveModal();
            fetchEscalations(); // Refresh the list
        } catch (err) {
            console.error("Failed to resolve ticket", err);
            alert('Failed to submit resolution.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading && !tickets.length) return <div>Loading triage queue...</div>;
    if (error) return <div style={{ color: 'red' }}>{error}</div>;

    return (
        <div className="ticket-list" style={{ position: 'relative' }}>
            <h2>🚨 Active Triage Queue (Escalations)</h2>
            <p>Review the AI's analysis and provide guidance to improve the system.</p>
            
            {tickets.length === 0 ? (
                <div style={{ padding: '20px', background: '#d4edda', color: '#155724', borderRadius: '5px' }}>
                    No active escalations. The AI is handling everything!
                </div>
            ) : (
                tickets.map((ticket) => (
                    <div key={ticket.ticketId} className="ticket-card" style={{ borderLeft: '5px solid #ffc107', marginBottom: '15px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3>Ticket #{ticket.ticketId.substring(0, 8)}</h3>
                                <p style={{ margin: '5px 0' }}><strong>Customer:</strong> {ticket.customerName || 'Unknown'}</p>
                                <p style={{ margin: '5px 0' }}><strong>Created:</strong> {new Date(ticket.createdAt).toLocaleString()}</p>
                            </div>
                            {ticket.status === 'Open' && (
                                <button
                                    onClick={() => openResolveModal(ticket)}
                                    style={{ 
                                        backgroundColor: '#007bff', 
                                        color: 'white', 
                                        border: 'none', 
                                        padding: '10px 20px', 
                                        borderRadius: '4px', 
                                        cursor: 'pointer',
                                        fontWeight: 'bold'
                                    }}
                                >
                                    Resolve & Teach
                                </button>
                            )}
                        </div>
                        <div style={{ marginTop: '10px', color: '#666' }}>
                            <strong>Query Preview:</strong> "{ticket.description.substring(0, 80)}..."
                        </div>
                    </div>
                ))
            )}

            {/* --- RESOLUTION MODAL OVERLAY --- */}
            {selectedTicket && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.6)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 1000
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        padding: '25px',
                        borderRadius: '8px',
                        width: '800px',
                        maxWidth: '95%',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0 }}>Resolve & Teach AI</h2>
                            <button 
                                onClick={closeResolveModal}
                                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}
                            >
                                &times;
                            </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                            {/* LEFT COLUMN: The Problem */}
                            <div>
                                <h4 style={{ color: '#555', borderBottom: '2px solid #eee', paddingBottom: '5px' }}>
                                    👤 User Query
                                </h4>
                                <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '5px', border: '1px solid #ddd' }}>
                                    "{selectedTicket.description}"
                                </div>
                            </div>

                            {/* RIGHT COLUMN: The AI's Attempt */}
                            <div>
                                <h4 style={{ color: '#555', borderBottom: '2px solid #eee', paddingBottom: '5px' }}>
                                    🤖 AI Hypothesis
                                </h4>
                                <div style={{ background: '#e3f2fd', padding: '15px', borderRadius: '5px', border: '1px solid #bbdefb' }}>
                                    {selectedTicket.parsedAnalysis ? (
                                        <>
                                            <p style={{ margin: '0 0 8px' }}>
                                                <strong>Suspected Intent:</strong> <br/>
                                                <span style={{ fontFamily: 'monospace', color: '#0056b3' }}>
                                                    {selectedTicket.parsedAnalysis.suspectedIntent || 'UNKNOWN'}
                                                </span>
                                            </p>
                                            <p style={{ margin: '0 0 8px' }}>
                                                <strong>Reasoning:</strong> <br/>
                                                {selectedTicket.parsedAnalysis.reasoning || 'N/A'}
                                            </p>
                                            <p style={{ margin: 0 }}>
                                                <strong>Likely Entities:</strong> <br/>
                                                {selectedTicket.parsedAnalysis.likelyEntities?.join(', ') || 'None'}
                                            </p>
                                        </>
                                    ) : (
                                        <p style={{ fontStyle: 'italic', color: '#666' }}>
                                            No structured analysis available for this ticket.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* INPUT AREA: The Solution */}
                        <div style={{ marginTop: '20px' }}>
                            <h4 style={{ color: '#555', marginBottom: '10px' }}>👨‍🏫 Your Guidance (The "Correct" Logic)</h4>
                            <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>
                                Explain <em>how</em> you resolved this so the AI can learn the new rule.
                                (e.g., "This is a Warranty Claim because the item was bought 30 days ago.")
                            </p>
                            <textarea
                                style={{ 
                                    width: '100%', 
                                    height: '100px', 
                                    padding: '10px', 
                                    borderRadius: '5px', 
                                    border: '1px solid #ccc',
                                    fontSize: '1rem',
                                    fontFamily: 'inherit'
                                }}
                                placeholder="Type your resolution steps here..."
                                value={resolutionNote}
                                onChange={(e) => setResolutionNote(e.target.value)}
                            />
                        </div>

                        {/* ACTION BUTTONS */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '25px' }}>
                            <button
                                onClick={closeResolveModal}
                                style={{ padding: '10px 20px', border: '1px solid #ccc', background: 'white', borderRadius: '4px', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmitResolution}
                                disabled={isSubmitting}
                                style={{ 
                                    padding: '10px 25px', 
                                    background: isSubmitting ? '#6c757d' : '#28a745', 
                                    color: 'white', 
                                    border: 'none', 
                                    borderRadius: '4px', 
                                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                                    fontWeight: 'bold'
                                }}
                            >
                                {isSubmitting ? 'Teaching AI...' : 'Submit & Teach'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default EscalationsTab;
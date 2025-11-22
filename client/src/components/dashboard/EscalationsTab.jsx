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
            // Safety parsing the stored JSON string
            parsedAnalysis = typeof ticket.aiAnalysis === 'string' 
                ? JSON.parse(ticket.aiAnalysis) 
                : ticket.aiAnalysis;
        } catch (e) { 
            // Ignore parsing errors
        }
        
        setSelectedTicket({ ...ticket, parsedAnalysis });
        // Only allow resolution note input if status is 'Open'
        setResolutionNote(ticket.status === 'Open' ? '' : ticket.resolutionNote || 'N/A'); 
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

    // Determine if the agent can submit guidance
    const isTicketOpen = selectedTicket?.status === 'Open';

    // Styles for Modal (reused from SuggestionsTab for consistency)
    const modalOverlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 };
    const modalStyle = { backgroundColor: 'white', padding: '25px', borderRadius: '8px', width: '800px', maxWidth: '95%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' };
    const inputStyle = { width: '100%', padding: '10px', marginBottom: '10px', border: '1px solid #ccc', borderRadius: '5px', fontSize: '1rem', fontFamily: 'inherit' };
    const labelStyle = { display: 'block', fontWeight: 'bold', marginBottom: '5px', fontSize: '0.9rem', color: '#333' };
    const statusColor = selectedTicket?.status === 'Resolved' ? '#28a745' : '#ffc107';

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
                    <div 
                        key={ticket.ticketId} 
                        className="ticket-card" 
                        style={{ borderLeft: `5px solid ${ticket.status === 'Resolved' ? '#28a745' : '#ffc107'}`, marginBottom: '15px', cursor: 'pointer', transition: 'box-shadow 0.2s' }}
                        onClick={() => openResolveModal(ticket)} // <--- CLICKABLE LISTING
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3>Ticket #{ticket.ticketId.substring(0, 8)} - <span style={{ color: ticket.status === 'Resolved' ? '#28a745' : '#ffc107', fontSize: '1rem' }}></span></h3>
                                <p style={{ margin: '5px 0' }}><strong>Customer:</strong> {ticket.customerName || 'Unknown'}</p>
                                <p style={{ margin: '5px 0' }}><strong>Created:</strong> {new Date(ticket.createdAt).toLocaleString()}</p>
                            </div>
                            {/* Primary Button remains conditional for Open status */}
                            
                        </div>
                        <div style={{ marginTop: '10px', color: '#666' }}>
                            <strong>Query Preview:</strong> "{ticket.description.substring(0, 80)}..."
                        </div>
                    </div>
                ))
            )}

            {/* --- RESOLUTION MODAL OVERLAY --- */}
            {selectedTicket && (
                <div style={modalOverlayStyle}>
                    <div style={modalStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', borderBottom: `2px solid ${statusColor}` }}>
                            <h2 style={{ margin: 0, color: statusColor }}>
                                {isTicketOpen ? 'Resolve & Teach AI' : `Review Ticket #${selectedTicket.ticketId.substring(0, 8)}`}
                            </h2>
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
                                <h4 style={labelStyle}>👤 User Query</h4>
                                <div style={{ background: '#f8f9fa', padding: '15px', borderRadius: '5px', border: '1px solid #ddd', height: '150px', overflowY: 'auto' }}>
                                    "{selectedTicket.description}"
                                </div>
                            </div>

                            {/* RIGHT COLUMN: The AI's Attempt */}
                            <div>
                                <h4 style={labelStyle}>🤖 AI Hypothesis</h4>
                                <div style={{ background: '#e3f2fd', padding: '15px', borderRadius: '5px', border: '1px solid #bbdefb', height: '150px', overflowY: 'auto' }}>
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
                                                <strong>Sentiment:</strong> {selectedTicket.parsedAnalysis.sentiment || 'N/A'}
                                            </p>
                                        </>
                                    ) : (
                                        <p style={{ fontStyle: 'italic', color: '#666' }}>
                                            No structured analysis was generated for this ticket.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* INPUT/RESOLUTION NOTE AREA */}
                        <div style={{ marginTop: '20px' }}>
                            <h4 style={{ color: '#555', marginBottom: '10px' }}>
                                👨‍🏫 {isTicketOpen ? 'Your Guidance (The "Correct" Logic)' : 'Resolution Note / Guidance Provided'}
                            </h4>
                            <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '8px' }}>
                                {isTicketOpen 
                                    ? 'Explain how you resolved this so the AI can learn the new rule.'
                                    : 'This is the note written by the agent who resolved the ticket.'
                                }
                            </p>
                            <textarea
                                style={inputStyle} 
                                value={resolutionNote}
                                onChange={(e) => setResolutionNote(e.target.value)}
                                placeholder={isTicketOpen ? "Type your resolution steps here..." : "No resolution note found."}
                                disabled={!isTicketOpen} // Disable editing if resolved
                            />
                        </div>

                        {/* ACTION BUTTONS */}
                        {isTicketOpen && (
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
                        )}
                        {!isTicketOpen && (
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '25px' }}>
                                <button onClick={closeResolveModal} style={{ padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                                    Close Review
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default EscalationsTab;
// client/src/components/dashboard/TicketsTab.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

function TicketsTab() {
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchTickets = async () => {
            try {
                const res = await axios.get('/api/dashboard/tickets');
                setTickets(res.data);
            } catch (err) {
                console.error("Failed to fetch tickets", err);
            } finally {
                setLoading(false);
            }
        };
        fetchTickets();
    }, []);

    if (loading) {
        return <div>Loading tickets...</div>;
    }

    return (
        <div className="ticket-list">
            <h2>All Support Tickets</h2>
            {tickets.length === 0 ? (
                <p>No tickets found.</p>
            ) : (
                tickets.map((ticket) => (
                    <div key={ticket.ticketId} className="ticket-card">
                        <h3>{ticket.type.replace('_', ' ')} - Ticket #{ticket.ticketId.substring(0, 8)}</h3>
                        <p><strong>Customer:</strong> {ticket.customerName}</p>
                        <p><strong>Description:</strong> {ticket.description || 'No description provided.'}</p>
                        <p><strong>Status:</strong> <span className={`status-${ticket.status.toLowerCase()}`}>{ticket.status}</span></p>
                        <p><strong>Created:</strong> {new Date(ticket.createdAt).toLocaleString()}</p>
                    </div>
                ))
            )}
        </div>
    );
}

export default TicketsTab;
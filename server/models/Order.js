// server/models/Order.js

const { driver } = require("../config/db");
// This is our first "tool"
const getOrderStatus = async ({orderId}) => {
    console.log(`TOOL: Looking up status for order #${orderId}`);
    // In the future, this will query a real database.
    // For now, it returns a hardcoded status.
    return `Your order #${orderId} was shipped and is expected to arrive in 2 days.`;
};

const checkPartialShipment = async ({ orderId }) => {
    if (!orderId) {
        return "Of course. Please provide the order ID you're concerned about.";
    }

    console.log(`TOOL: Querying Neo4j for shipment details of order #${orderId}`);
    const session = driver.session({database:'mainDB'}); // Get a Neo4j session
    
    try {
        const result = await session.run(
            `
            MATCH (o:Order {orderId: $orderId})-[:FULFILLED_BY]->(s:Shipment)
            RETURN s.shipmentID AS shipmentId, s.status AS status
            `,
            { orderId: orderId } // Pass the orderId as a parameter
        );

        if (result.records.length === 0) {
            return `I couldn't find any shipment information for order #${orderId}.`;
        }
        
        if (result.records.length === 1) {
            const record = result.records[0].toObject();
            return `Your order #${orderId} was sent in a single shipment (${record.shipmentId}) with a status of: ${record.status}.`;
        }

        const shipmentDetails = result.records.map(record => record.toObject());
        let response = `Your order #${orderId} has been split into multiple shipments:\n`;
        shipmentDetails.forEach(shipment => {
            response += `  • Shipment ${shipment.shipmentId} status: ${shipment.status}\n`;
        });
        return response;

    } catch (error) {
        console.error("Error querying Neo4j:", error);
        return "Sorry, I'm having trouble accessing shipment details right now.";
    } finally {
        await session.close(); // IMPORTANT: Always close the session
    }
};

// Make sure to export it
module.exports = { getOrderStatus, checkPartialShipment };
// server/models/Order.js
const { driver } = require('../config/db');

/**
 * Creates an order and connects it to the customer and products.
 */
const createOrder = async ({ customerId, productIds }) => {
    const session = driver.session({ database: 'neo4j' });
    try {
        // This single, powerful query does everything at once
        const result = await session.run(`
            MATCH (c:Customer {customerID: $customerId})
            CREATE (o:Order {orderId: apoc.create.uuid(), datePlaced: timestamp(), status: 'Processing'})
            CREATE (c)-[:PLACED]->(o)
            WITH o
            UNWIND $productIds AS pId
            MATCH (p:Product {productID: pId})
            CREATE (o)-[:CONTAINS]->(p)
            RETURN o
        `, { customerId, productIds });

        return result.records[0].get('o').properties;
    } catch (error) {
        console.error("Error creating order:", error);
        throw error;
    } finally {
        await session.close();
    }
};

/**
 * TOOL: Gets the status of an order.
 * This is a placeholder; a real implementation would be more detailed.
 */
const getOrderStatus = async ({ orderId }) => {
    if (!orderId) {
        return { error: "Missing orderId" };
    }
    console.log(`TOOL: Looking up status for order #${orderId}`);
    return {
        orderId: orderId,
        status: 'Shipped',
        details: `Out for delivery, expected today by 5 PM.`
    };
};

/**
 * TOOL: Checks for partial shipments for an order.
 */
const checkPartialShipment = async ({ orderId }) => {
    if (!orderId) {
        return { error: "Missing orderId" };
    }
    console.log(`TOOL: Querying Neo4j for shipment details of order #${orderId}`);
    const session = driver.session({ database: 'neo4j' });
    try {
        const result = await session.run(
            `
            MATCH (o:Order {orderId: $orderId})-[:FULFILLED_BY]->(s:Shipment)
            RETURN s.shipmentID AS shipmentId, s.status AS status
            `,
            { orderId: orderId }
        );
        if (result.records.length === 0) {
            return { error: `No shipment information found for order #${orderId}.` };
        }
        const shipmentDetails = result.records.map(record => record.toObject());
        return { orderId: orderId, shipments: shipmentDetails };
    } catch (error) {
        console.error("Error querying Neo4j:", error);
        return { error: "Neo4j query failed." };
    } finally {
        await session.close();
    }
};

/**
 * TOOL: Placeholder for processing a return.
 */
const processReturn = async ({ orderId, reason }) => {
    if (!orderId || !reason) {
        return { error: "Missing orderId or reason" };
    }
    console.log(`TOOL: Processing return for order #${orderId} due to: "${reason}"`);
    return {
        success: true,
        confirmationMessage: `A return label for order #${orderId} has been sent to your email.`
    };
};

module.exports = {
    createOrder,
    getOrderStatus,
    checkPartialShipment,
    processReturn
};
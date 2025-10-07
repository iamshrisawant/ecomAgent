// server/models/Product.js
const { driver } = require('../config/db');

const createProduct = async ({ productId, name, category, details = {} }) => {
    const session = driver.session({ database: 'neo4j' });
    try {
        await session.run(`
            CREATE (:Product {
                productId: $productId,
                name: $name,
                category: $category,
                details: $details
            })
        `, { productId, name, category, details });
        console.log(`Product ${name} created.`);
    } catch (error) {
        console.error("Error creating product:", error);
        throw error;
    } finally {
        await session.close();
    }
};

module.exports = { createProduct };
# ecomAgent Setup Guide

This guide provides the full step-by-step procedure to install, configure, and run the `ecomAgent` full-stack application.

This project consists of:

  * **Client:** A React frontend (built with Create React App).
  * **Server:** A Node.js, Express, and WebSocket backend.
  * **Database:** A Neo4j graph database for data storage.
  * **AI:** Google's Gemini API for natural language processing.

-----

## Prerequisites

Before you begin, ensure you have the following software and accounts:

1.  **Node.js:** (v18 or newer recommended) and npm. You can download it from [nodejs.org](https://nodejs.org/).
2.  **Neo4j Database:** You need a running Neo4j instance. You can use:
      * **Neo4j AuraDB:** A free, cloud-hosted instance.
      * **Neo4j Desktop:** A local instance for development.
      * You will need the **URI**, **Username**, and **Password** for your database.
3.  **Google Gemini API Key:** You need an API key from [Google AI Studio](https://aistudio.google.com/app/apikey) to power the chat agent.

-----

## Step 1: Clone the Repository

First, clone the project repository to your local machine and navigate into the root directory.

```bash
git clone <your-repository-url>
cd ecomAgent-f4633465617344eea6e2d57a403d5270d08f62ed
```

-----

## Step 2: Install Server Dependencies

Navigate to the `server` directory and install the required npm packages.

```bash
cd server
npm install
```

-----

## Step 3: Configure Server Environment

The server requires environment variables to connect to your database and APIs.

1.  Create a `.env` file in the `server` directory:

    ```bash
    touch .env
    ```

2.  Open the `server/.env` file and add the following variables, replacing the placeholders with your credentials:

    ```ini
    # Neo4j Credentials
    NEO4J_URI=bolt://your-neo4j-uri.com:7687
    NEO4J_USER=neo4j
    NEO4J_PASSWORD=your_neo4j_password

    # JWT Secret for signing tokens (can be any long, random string)
    JWT_SECRET=your_very_secret_jwt_key

    # Google Gemini API Key
    GEMINI_API_KEY=your_google_gemini_api_key

    # Server Port (Optional, defaults to 5000)
    PORT=5000
    ```

-----

## Step 4: Install Client Dependencies

In a new terminal, navigate to the `client` directory from the project root and install its dependencies.

```bash
cd client
npm install
```

-----

## Step 5: Create Users & Populate Database

This application uses `bcrypt` to hash passwords. You must create users with hashed passwords directly in the database to be able to log in.

1.  **Generate Password Hashes:**
    The project includes a helper script to hash passwords. Run the following command from the `server` directory to get a hash for the password `password456` (for the agent) and `password123` (for the customer).

    *First, temporarily edit `server/config/hash.js` to use `password123` and run it:*

    ```bash
    # In the server directory
    node config/hash.js 
    # Output will be something like: $2a$10$... (this is your CUSTOMER_HASH)
    ```

    *Next, edit `server/config/hash.js` to use `password456` and run it again:*

    ```bash
    # In the server directory
    node config/hash.js
    # Output will be something like: $2a$10$... (this is your AGENT_HASH)
    ```

2.  **Populate Neo4j Database:**
    Open your Neo4j instance (AuraDB Query console or Neo4j Desktop Browser).

      * First, run this command to clear any existing data (optional):
        ```cypher
        MATCH (n) DETACH DELETE n;
        ```
      * Next, run the following Cypher script. **Replace `<YOUR_CUSTOMER_HASH>` and `<YOUR_AGENT_HASH>`** with the hashes you generated in the previous step.

    <!-- end list -->

    ```cypher
    // --- Create Users ---

    // Create Customer User
    CREATE (u1:User {email: 'customer@example.com', passwordHash: '<YOUR_CUSTOMER_HASH>', role: 'CUSTOMER', dateCreated: timestamp()})
    CREATE (c1:Customer {customerID: 'cust101', name: 'Test Customer'})
    CREATE (u1)-[:HAS_PROFILE]->(c1);

    // Create Agent User
    CREATE (u2:User {email: 'agent@example.com', passwordHash: '<YOUR_AGENT_HASH>', role: 'AGENT', dateCreated: timestamp()})
    CREATE (c2:Customer {customerID: 'agent007', name: 'Test Agent'})
    CREATE (u2)-[:HAS_PROFILE]->(c2);

    // --- Create Products ---
    CREATE (:Product {productID: 'KB-100', name: 'Wireless Keyboard', category: 'Electronics', price: 79.99});
    CREATE (:Product {productID: 'M-250', name: 'USB Mouse', category: 'Electronics', price: 24.99});
    CREATE (:Product {productID: 'HP-50', name: 'Noise-Cancelling Headphones', category: 'Audio', price: 149.99});

    // --- Create Policies ---
    CREATE (:Policy {policyID: 'RET-30D', type: 'RETURN', durationDays: 30});
    CREATE (:Policy {policyID: 'WAR-1Y', type: 'WARRANTY', durationDays: 365});

    // --- Create a Simple, Completed Order (ORD-101) ---
    MATCH (c:Customer {customerID: 'cust101'}), (p:Product {productID: 'KB-100'})
    CREATE (o:Order {orderId: 'ORD-101', datePlaced: datetime('2025-08-15T10:00:00.000Z'), status: 'Completed'})
    CREATE (s:Shipment {shipmentID: 'SHIP-101', carrier: 'FedEx', trackingNumber: 'FX12345', status: 'Delivered'})
    CREATE (c)-[:PLACED]->(o)
    CREATE (o)-[:CONTAINS]->(p)
    CREATE (o)-[:FULFILLED_BY]->(s);

    // --- Create a Complex, Partial Shipment Order (ORD-500) ---
    MATCH (c:Customer {customerID: 'cust101'})
    MATCH (p1:Product {productID: 'M-250'})
    MATCH (p2:Product {productID: 'HP-50'})
    CREATE (o:Order {orderId: 'ORD-500', datePlaced: datetime('2025-09-28T14:30:00.000Z'), status: 'Partially Shipped'})
    CREATE (s1:Shipment {shipmentID: 'SHIP-500A', carrier: 'UPS', trackingNumber: 'UPS67890', status: 'Delivered'})
    CREATE (s2:Shipment {shipmentID: 'SHIP-500B', carrier: 'UPS', trackingNumber: 'UPS11223', status: 'In Transit'})
    CREATE (c)-[:PLACED]->(o)
    CREATE (o)-[:CONTAINS]->(p1)
    CREATE (o)-[:CONTAINS]->(p2)
    CREATE (o)-[:FULFILLED_BY]->(s1)
    CREATE (o)-[:FULFILLED_BY]->(s2);

    // --- Create a Recent Order for Return/Damage Testing (ORD-1010) ---
    MATCH (c:Customer {customerID: 'cust101'}), (p:Product {productID: 'KB-100'})
    MATCH (policy:Policy {policyID: 'RET-30D'})
    CREATE (o:Order {orderId: 'ORD-1010', datePlaced: datetime(), status: 'Delivered'})
    CREATE (s:Shipment {shipmentID: 'SHIP-1010', carrier: 'FedEx', trackingNumber: 'FX54321', status: 'Delivered'})
    CREATE (c)-[:PLACED]->(o)
    CREATE (o)-[:CONTAINS]->(p)
    CREATE (p)-[:HAS_POLICY]->(policy);
    ```

-----

## Step 6: Run the Application

The application must be run in two separate terminals.

1.  **Terminal 1: Start the Backend Server**

    ```bash
    # From the /server directory
    npm start 
    ```

    *You should see output indicating "Server listening on port 5000" and "Neo4j Connection Established...".*

2.  **Terminal 2: Start the Frontend Client**

    ```bash
    # From the /client directory
    npm start
    ```

    *This will automatically open [http://localhost:3000](https://www.google.com/search?q=http://localhost:3000) in your browser.*

-----

## Step 7: Log In

You can now log in to the application using the accounts you created in Step 5.

  * **Agent Login:**

      * **Email:** `agent@example.com`
      * **Password:** `password456`
      * You will be redirected to the Agent Dashboard.

  * **Customer Login:**

      * **Email:** `customer@example.com`
      * **Password:** `password123`
      * You will be redirected to the customer homepage, where you can use the chat widget.

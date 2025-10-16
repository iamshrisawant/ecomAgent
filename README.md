```
Project
├─ client
│  ├─ package-lock.json
│  ├─ package.json
│  ├─ public
│  │  ├─ favicon.ico
│  │  ├─ index.html
│  │  ├─ logo192.png
│  │  ├─ logo512.png
│  │  ├─ manifest.json
│  │  └─ robots.txt
│  ├─ README.md
│  └─ src
│     ├─ App.css
│     ├─ App.js
│     ├─ App.test.js
│     ├─ components
│     │  ├─ ChatWindow.jsx
│     │  └─ Message.jsx
│     ├─ index.css
│     ├─ index.js
│     ├─ layouts
│     │  └─ CustomerLayout.jsx
│     ├─ logo.svg
│     ├─ pages
│     │  └─ HomePage.jsx
│     ├─ reportWebVitals.js
│     ├─ services
│     │  └─ socketService.js
│     ├─ setupTests.js
│     └─ styles
│        └─ ChatWindow.css
├─ README.md
└─ server
   ├─ config
   │  └─ db.js
   ├─ controllers
   │  └─ chatController.js
   ├─ index.js
   ├─ middlewares
   │  └─ authMiddleware.js
   ├─ models
   │  ├─ Database.js
   │  ├─ Order.js
   │  ├─ Product.js
   │  ├─ Suppport.js
   │  └─ User.js
   ├─ package-lock.json
   ├─ package.json
   └─ routes
      └─ chatRoutes.js

```

// --- 1. Cleanup (Optional: Deletes all existing data) ---
MATCH (n) DETACH DELETE n;

// --- 2. Create Core Entities ---
// Create the User and Customer
CREATE (u:User {email: 'customer101@example.com', password: 'password123', role: 'CUSTOMER'})
CREATE (c:Customer {customerID: '101', name: 'Test User 101'})
CREATE (u)-[:HAS_PROFILE]->(c);

// Create Products
CREATE (:Product {productID: 'KB-100', name: 'Wireless Keyboard', category: 'Electronics', price: 79.99});
CREATE (:Product {productID: 'M-250', name: 'USB Mouse', category: 'Electronics', price: 24.99});
CREATE (:Product {productID: 'HP-50', name: 'Noise-Cancelling Headphones', category: 'Audio', price: 149.99});

// Create Policies
CREATE (:Policy {policyID: 'RET-30D', type: 'RETURN', durationDays: 30});
CREATE (:Policy {policyID: 'WAR-1Y', type: 'WARRANTY', durationDays: 365});

// --- 3. Create a Simple, Completed Order (ORD-101) ---
MATCH (c:Customer {customerID: '101'}), (p:Product {productID: 'KB-100'})
CREATE (o:Order {orderId: 'ORD-101', datePlaced: datetime('2025-08-15T10:00:00.000Z'), status: 'Completed'})
CREATE (s:Shipment {shipmentID: 'SHIP-101', carrier: 'FedEx', trackingNumber: 'FX12345', status: 'Delivered'})
CREATE (c)-[:PLACED]->(o)
CREATE (o)-[:CONTAINS]->(p)
CREATE (o)-[:FULFILLED_BY]->(s);

// --- 4. Create a Complex, Partial Shipment Order (ORD-500) ---
MATCH (c:Customer {customerID: '101'})
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

// --- 5. Create a Recent Order for Return/Damage Testing (ORD-1010) ---
MATCH (c:Customer {customerID: '101'}), (p:Product {productID: 'KB-100'})
MATCH (policy:Policy {policyID: 'RET-30D'})
CREATE (o:Order {orderId: 'ORD-1010', datePlaced: datetime(), status: 'Delivered'})
CREATE (s:Shipment {shipmentID: 'SHIP-1010', carrier: 'FedEx', trackingNumber: 'FX54321', status: 'Delivered'})
CREATE (c)-[:PLACED]->(o)
CREATE (o)-[:CONTAINS]->(p)
CREATE (p)-[:HAS_POLICY]->(policy);
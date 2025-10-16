// server/models/Workflows.js

// This object defines the sequence of steps for each complex process.
const WORKFLOWS = {
    'WARRANTY_CLAIM': {
        name: 'Warranty Claim Process',
        steps: [
            {
                id: 'validate_eligibility',
                tool: 'validateWarrantyStatus', // A new, specific tool we will create
                prompt: "To start a warranty claim, I first need to check if the item is eligible. What is the order number and the product you're having an issue with?"
            },
            {
                id: 'collect_issue_description',
                prompt: "Thank you. The item is eligible. Could you please describe the problem you are having with it?"
            },
            {
                id: 'confirm_shipping_address',
                prompt: "Got it. Your replacement will be sent to [user's address]. Is this correct?"
            },
            {
                id: 'finalize_claim',
                tool: 'createWarrantyClaimTicket', // A new, specific tool
                prompt: "Great! I have submitted your warranty claim. Your claim ID is [claim_id]. We will be in touch shortly."
            }
        ]
    }
    // We can add other workflows here, like a guided 'ITEM_RETURN' process.
};

module.exports = { WORKFLOWS };
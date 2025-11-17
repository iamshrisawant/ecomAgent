// client/src/services/setAuthToken.js
import axios from 'axios';

/**
 * Attaches the JWT to the 'x-auth-token' header for all future
 * axios requests. If the token is null, it deletes the header.
 */
const setAuthToken = (token) => {
    if (token) {
        // Apply authorization token to every request if logged in
        axios.defaults.headers.common['x-auth-token'] = token;
    } else {
        // Delete the auth header
        delete axios.defaults.headers.common['x-auth-token'];
    }
};

export default setAuthToken;
// hash.js
const bcrypt = require('bcryptjs');

async function generateHash() {
  const password = 'password456'; // The password you want to use
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);
  console.log('Your new secure hash is:\n');
  console.log(hash);
}

generateHash();

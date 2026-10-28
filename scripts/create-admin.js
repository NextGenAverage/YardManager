// Create the first admin, or recover access if all admins are locked out.
//
//   npm run create-admin -- <username> "<Full name>"
//
// Prints a temporary password; the admin chooses their own at first login.
// If the username exists, that user is made an active admin with a new
// temporary password.
const auth = require("../auth");

const [username, name] = process.argv.slice(2);
if (!username) {
  console.log('Usage: npm run create-admin -- <username> "<Full name>"');
  process.exit(1);
}

const existing = auth.userByName(username);
let password;
if (existing) {
  auth.updateUser(existing.id, { name: name || existing.name, role: "admin", active: true });
  password = auth.resetPassword(existing.id);
  console.log(`${existing.username} is now an active admin.`);
} else {
  const input = { username, name: name || username, role: "admin" };
  const err = auth.userProblem(input);
  if (err) {
    console.log(err);
    process.exit(1);
  }
  password = auth.createUser(input).password;
  console.log(`Created admin ${username}.`);
}
console.log(`Temporary password: ${password}`);
console.log("Log in at the yard map and choose a new password.");

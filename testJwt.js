// testJwt.js
import jwt from "jsonwebtoken";

const secret = "testsecret";
const payload = { id: 123, name: "Test User" };

// Génération d'un token
const token = jwt.sign(payload, secret, { expiresIn: "1h" });
console.log("Token généré :", token);

// Vérification du token
try {
  const decoded = jwt.verify(token, secret);
  console.log("Token décodé :", decoded);
} catch (err) {
  console.error("Erreur de vérification :", err);
}

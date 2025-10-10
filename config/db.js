import mongoose from "mongoose";

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    console.error("MONGO_URI n'est pas défini dans les variables d'environnement.");
    process.exit(1);
  }

  try {
    // Conseillé pour MongoDB Atlas et Mongoose >= 6 : les options sont par défaut,
    // mais on les précise pour la clarté et l'interop.
    await mongoose.connect(mongoUri, {
      // useNewUrlParser et useUnifiedTopology sont implicites en v6+, laissés pour compat
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
      // connectTimeoutMS pour échouer plus rapidement si IP non autorisée
      connectTimeoutMS: 15000,
      serverSelectionTimeoutMS: 15000,
      // family: 4 peut aider sur certains réseaux IPv6 capricieux
      family: 4,
    });

    console.log("MongoDB connected");
  } catch (error) {
    // Messages d'aide ciblés pour Atlas
    if (error?.name === "MongooseServerSelectionError") {
      console.error("Échec de connexion MongoDB (ServerSelection). Vérifiez :\n- MONGO_URI (format mongodb+srv://)\n- IP autorisée dans Atlas (Network Access)\n- Nom d'utilisateur / mot de passe\n- État du cluster");
    }
    console.error(error);
    process.exit(1);
  }
};

export default connectDB;

import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, "Le prénom est obligatoire"],
      trim: true,
    },
    lastName: {
      type: String,
      required: [true, "Le nom est obligatoire"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "L'email est obligatoire"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/,
        "Merci d'entrer un email valide",
      ],
    },
    password: {
      type: String,
      required: [true, "Le mot de passe est obligatoire"],
      select: true, // permet d'être récupéré pour le hash, mais désactivé à l'envoi en JSON manuellement
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    avatarUrl: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// L'index unique est déjà assuré par `unique: true` sur le champ email.
// Éviter la redondance pour supprimer l'avertissement Mongoose sur l'index dupliqué.

// 🔐 Hook de hash du mot de passe
userSchema.pre("save", async function (next) {
  // Si le mot de passe n'est pas défini, on arrête tout
  if (!this.password) {
    throw new Error("Le mot de passe est requis.");
  }

  // Si le mot de passe n'a pas été modifié, on ne rehash pas
  if (!this.isModified("password")) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// 🔑 Méthode pour comparer les mots de passe
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model("User", userSchema);

export default User;

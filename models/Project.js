import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    maxMembers: { type: Number, default: 10, min: 1 },
    startDate: { type: Date },
    endDate: { type: Date },
  },
  { timestamps: true }
);

const Project = mongoose.model("Project", projectSchema);
export default Project;



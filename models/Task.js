import mongoose from "mongoose";

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: "" },
    completed: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["todo", "in_progress", "done", "validated"],
      default: "todo",
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Désormais multi-collaborateurs. Anciennes données (valeur simple) resteront compatibles via code contrôleur.
    assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project" },
    validatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    participationStatus: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      default: "pending",
    },
    // Pièces jointes liées à la tâche elle-même (brief, spec, etc.)
    attachments: [
      {
        filename: { type: String },
        originalname: { type: String },
        size: { type: Number },
        url: { type: String },
        mimetype: { type: String },
      }
    ],
    progressReports: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        content: { type: String },
        createdAt: { type: Date, default: Date.now },
        status: { type: String, enum: ["submitted", "approved", "rejected"], default: "submitted" },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        reviewedAt: { type: Date },
        reviewComment: { type: String },
        attachments: [
          {
            filename: { type: String },
            originalname: { type: String },
            size: { type: Number },
            url: { type: String },
            mimetype: { type: String },
          }
        ],
      },
    ],
    participationLogs: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        userName: { type: String },
        status: { type: String, enum: ["accepted", "declined"] },
        at: { type: Date, default: Date.now },
      }
    ],
    dueDate: { type: Date },
    progress: { type: Number, min: 0, max: 100, default: 0 },
    priority: { 
      type: String, 
      enum: ["low", "medium", "high"],
      default: "medium"
    },
    visibility: { type: String, enum: ["personal", "shared"], default: "personal" }
  },
  { timestamps: true }
);

const Task = mongoose.model("Task", taskSchema);
export default Task;

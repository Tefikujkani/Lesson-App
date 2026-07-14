import mongoose, { Document, Schema, Types } from "mongoose";

export interface IChatMessage {
  id: string;
  sender: "student" | "tutor";
  text: string;
  timestamp: string;
}

export interface IChatHistory extends Document {
  userId: Types.ObjectId;
  lectureId: string;
  messages: IChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const chatMessageSchema = new Schema<IChatMessage>(
  {
    id: { type: String, required: true },
    sender: { type: String, enum: ["student", "tutor"], required: true },
    text: { type: String, required: true },
    timestamp: { type: String, required: true },
  },
  { _id: false }
);

const chatHistorySchema = new Schema<IChatHistory>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    lectureId: { type: String, required: true, index: true },
    // Cap growth: chats are per lecture; prune oldest if needed in controller
    messages: { type: [chatMessageSchema], default: [] },
  },
  { timestamps: true }
);

chatHistorySchema.index({ userId: 1, lectureId: 1 }, { unique: true });

export const ChatHistory = mongoose.model<IChatHistory>("ChatHistory", chatHistorySchema);

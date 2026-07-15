import mongoose, { Document, Schema } from "mongoose";

export const MAX_ROOM_PARTICIPANTS = 10;

export interface IStudyRoom extends Document {
  code: string;
  name: string;
  topic: string;
  hostId: string;
  hostName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const studyRoomSchema = new Schema<IStudyRoom>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
      minlength: 6,
      maxlength: 8,
    },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    topic: { type: String, default: "", trim: true, maxlength: 200 },
    hostId: { type: String, required: true, index: true },
    hostName: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const StudyRoom = mongoose.model<IStudyRoom>("StudyRoom", studyRoomSchema);

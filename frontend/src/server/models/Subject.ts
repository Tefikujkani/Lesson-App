import mongoose, { Document, Schema, Types } from "mongoose";

export interface ILecture {
  id: string;
  title: string;
  content: string;
  fileName?: string;
  fileType?: "text" | "image" | "pdf";
  fileDataUrl?: string;
  originalText?: string;
}

export interface ISubject extends Document {
  userId: Types.ObjectId;
  id: string;
  name: string;
  icon: string;
  lectures: ILecture[];
  createdAt: Date;
  updatedAt: Date;
}

const lectureSchema = new Schema<ILecture>(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
    fileName: { type: String },
    fileType: { type: String, enum: ["text", "image", "pdf"] },
    // Large base64 payloads can approach the 16MB doc limit — keep modest uploads
    fileDataUrl: { type: String },
    originalText: { type: String },
  },
  { _id: false }
);

const subjectSchema = new Schema<ISubject>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    icon: { type: String, default: "GraduationCap" },
    lectures: { type: [lectureSchema], default: [] },
  },
  { timestamps: true }
);

subjectSchema.index({ userId: 1, id: 1 }, { unique: true });

export const Subject = mongoose.model<ISubject>("Subject", subjectSchema);

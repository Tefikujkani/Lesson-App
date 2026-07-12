import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash?: string;
  googleId?: string;
  avatarUrl?: string;
  major: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    // Optional when the user signs in with Google only
    passwordHash: { type: String, required: false },
    googleId: { type: String, required: false, index: true, sparse: true },
    avatarUrl: { type: String, required: false },
    major: { type: String, default: "Student", trim: true },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>("User", userSchema);

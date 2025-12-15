const mongoose = require("mongoose");
const bcrypt = require("bcryptjs"); // 🟢 REQUIRED for hashing & checking passwords

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },

    role: { type: String, default: "Worker" }, // Just a label (e.g. "Manager")

    // 🟢 The Matrix: Granular Access Control
    permissions: {
      sales: {
        read: { type: Boolean, default: false },
        write: { type: Boolean, default: false },
      },
      inventory: {
        read: { type: Boolean, default: false },
        write: { type: Boolean, default: false },
      },
      production: {
        read: { type: Boolean, default: false },
        write: { type: Boolean, default: false },
      },
      finance: {
        read: { type: Boolean, default: false },
        write: { type: Boolean, default: false },
      },
      settings: {
        read: { type: Boolean, default: false },
        write: { type: Boolean, default: false },
      },
    },
  },
  { timestamps: true }
);

// 🟢 FIX 1: Add method to compare passwords (Crucial for Login)
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// 🟢 FIX 2: Encrypt password automatically before saving
// This prevents "Double Hashing" logic in controllers
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

module.exports = mongoose.model("User", UserSchema);
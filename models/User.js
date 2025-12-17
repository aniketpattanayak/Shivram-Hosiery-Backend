const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    role: { type: String, default: "Worker" },
    
    // Simplified Permissions (Array of Strings)
    permissions: {
      type: [String], 
      default: [] 
    },
  },
  { timestamps: true }
);

// 1. Password Match Method
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// 🟢 FIX: Correct Async Pre-Save Hook (No 'next')
UserSchema.pre("save", async function () {
  // If password is NOT modified, we just return (stops the function)
  if (!this.isModified("password")) {
    return; 
  }

  // Otherwise, hash the password
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

module.exports = mongoose.model("User", UserSchema);
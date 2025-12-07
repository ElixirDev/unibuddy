const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, default: null },
  name: { type: String, required: true, trim: true },
  picture: { type: String, default: null },
  region: { type: String, enum: ['luzon', 'visayas', 'mindanao', null], default: null },
  campus: { type: String, default: null },
  is_anonymous_mode: { type: Boolean, default: false },
  oauth_provider: { type: String, default: null },
  oauth_id: { type: String, default: null }
}, { timestamps: true });

userSchema.pre('save', async function(next) {
  if (this.isModified('password') && this.password) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  obj.user_id = obj._id;
  return obj;
};

module.exports = mongoose.model('User', userSchema);

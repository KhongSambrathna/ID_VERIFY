const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema.Types;

// 💬 Chat between two accounts.
//   Same team → chat right away. Different teams → add friend first
//   (the other person accepts). Admins can chat with anyone.

// A friend request / friendship between two accounts on different teams.
const friendshipSchema = new mongoose.Schema(
  {
    requester: { type: ObjectId, ref: "Admin", required: true },
    recipient: { type: ObjectId, ref: "Admin", required: true },
    key: { type: String, required: true, unique: true }, // the two ids, sorted — one row per pair
    status: { type: String, enum: ["pending", "accepted"], default: "pending" },
    acceptedAt: { type: Date, default: null },
  },
  { timestamps: true }
);
friendshipSchema.index({ recipient: 1, status: 1 });
friendshipSchema.index({ requester: 1, status: 1 });

// One conversation per pair of people.
const conversationSchema = new mongoose.Schema(
  {
    members: [{ type: ObjectId, ref: "Admin" }],
    key: { type: String, required: true, unique: true },
    last: {
      text: { type: String, default: "" },
      sender: { type: ObjectId, ref: "Admin", default: null },
      at: { type: Date, default: null },
    },
    // When each member last read it — anything newer is unread for them.
    reads: [{ user: { type: ObjectId, ref: "Admin" }, at: Date, _id: false }],
    // Members who cleared this chat from their list (comes back on a new message).
    hiddenFor: [{ type: ObjectId, ref: "Admin" }],
  },
  { timestamps: true }
);
conversationSchema.index({ members: 1, "last.at": -1 });

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: ObjectId, ref: "ChatConversation", required: true },
    sender: { type: ObjectId, ref: "Admin", required: true },
    text: { type: String, default: "", maxlength: 2000 },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);
messageSchema.index({ conversation: 1, createdAt: -1 });

const pairKey = (a, b) => [String(a), String(b)].sort().join("_");

module.exports = {
  Friendship: mongoose.model("Friendship", friendshipSchema),
  ChatConversation: mongoose.model("ChatConversation", conversationSchema),
  ChatMessage: mongoose.model("ChatMessage", messageSchema),
  pairKey,
};

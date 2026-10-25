const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Models
const User = mongoose.model("User", new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["user", "admin"], default: "user" }
}, { timestamps: true }));

const Post = mongoose.model("Post", new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  author: { type: String, default: "Admin" }
}, { timestamps: true }));

// Authentication middleware
const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Login required" });

    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

const admin = (req, res, next) => {
  if (req.user.role !== "admin")
    return res.status(403).json({ message: "Admin access required" });
  next();
};

// Register
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password || password.length < 6)
      return res.status(400).json({ message: "Enter name, email and password (min 6 characters)" });

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ message: "Email already registered" });

    const user = await User.create({
      name,
      email,
      password: await bcrypt.hash(password, 10),
      role: "user"
    });

    res.status(201).json({ message: "Registered successfully", user: {
      id: user._id, name: user.name, email: user.email, role: user.role
    }});
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const user = await User.findOne({
      email: req.body.email?.toLowerCase()
    });

    if (!user || !await bcrypt.compare(req.body.password || "", user.password))
      return res.status(401).json({ message: "Invalid email or password" });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: { id: user._id, name: user.name, email: user.email, role: user.role }
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

// Logout: client must discard its token
app.post("/api/auth/logout", auth, (req, res) => {
  res.json({ message: "Logout successful. Clear your token on the client." });
});

// Get logged-in user's profile
app.get("/api/auth/me", auth, async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(user);
});

// USERS CRUD: admin only
app.route("/api/users")
  .get(auth, admin, async (req, res) => {
    res.json(await User.find().select("-password"));
  })
  .post(auth, admin, async (req, res) => {
    try {
      const { name, email, password, role = "user" } = req.body;
      if (!name || !email || !password || password.length < 6)
        return res.status(400).json({ message: "Valid name, email and password required" });
      if (!["user", "admin"].includes(role))
        return res.status(400).json({ message: "Invalid role" });

      const user = await User.create({
        name, email, role,
        password: await bcrypt.hash(password, 10)
      });
      res.status(201).json({ message: "User created", user: {
        id: user._id, name: user.name, email: user.email, role: user.role
      }});
    } catch (e) {
      res.status(e.code === 11000 ? 409 : 500).json({ message: "Could not create user; check email and input" });
    }
  });

app.route("/api/users/:id")
  .put(auth, admin, async (req, res) => {
    try {
      const data = { ...req.body };
      delete data.password;
      if (data.role && !["user", "admin"].includes(data.role))
        return res.status(400).json({ message: "Invalid role" });

      const user = await User.findByIdAndUpdate(
        req.params.id, data, { new: true, runValidators: true }
      ).select("-password");
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(user);
    } catch {
      res.status(400).json({ message: "Invalid user data or ID" });
    }
  })
  .patch(auth, admin, async (req, res) => {
    try {
      const { password, ...data } = req.body;
      if (data.role && !["user", "admin"].includes(data.role))
        return res.status(400).json({ message: "Invalid role" });
      const user = await User.findByIdAndUpdate(
        req.params.id, data, { new: true, runValidators: true }
      ).select("-password");
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json(user);
    } catch {
      res.status(400).json({ message: "Invalid user data or ID" });
    }
  })
  .delete(auth, admin, async (req, res) => {
    if (req.params.id === req.user.id)
      return res.status(400).json({ message: "Cannot delete your own admin account here" });
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ message: "User deleted" });
  });

// POSTS: logged-in users can read; admin can modify
app.route("/api/posts")
  .get(auth, async (req, res) => {
    res.json(await Post.find().sort({ createdAt: -1 }));
  })
  .post(auth, admin, async (req, res) => {
    try {
      const { title, content } = req.body;
      if (!title || !content)
        return res.status(400).json({ message: "Title and content required" });
      res.status(201).json(await Post.create({
        title, content, author: "Admin"
      }));
    } catch (e) {
      res.status(400).json({ message: e.message });
    }
  });

app.get("/api/posts/:id", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: "Post not found" });
    res.json(post);
  } catch {
    res.status(400).json({ message: "Invalid post ID" });
  }
});

app.route("/api/posts/:id")
  .put(auth, admin, async (req, res) => {
    try {
      const post = await Post.findByIdAndUpdate(
        req.params.id, req.body, { new: true, runValidators: true }
      );
      if (!post) return res.status(404).json({ message: "Post not found" });
      res.json(post);
    } catch {
      res.status(400).json({ message: "Invalid post data or ID" });
    }
  })
  .delete(auth, admin, async (req, res) => {
    try {
      const post = await Post.findByIdAndDelete(req.params.id);
      if (!post) return res.status(404).json({ message: "Post not found" });
      res.json({ message: "Post deleted" });
    } catch {
      res.status(400).json({ message: "Invalid post ID" });
    }
  });

app.get("/", (req, res) => res.send("Blog API is running"));

// Create initial admin and start server
async function start() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");

    const email = process.env.ADMIN_EMAIL.toLowerCase();
    if (!await User.findOne({ email })) {
      await User.create({
        name: process.env.ADMIN_NAME,
        email,
        password: await bcrypt.hash(process.env.ADMIN_PASSWORD, 10),
        role: "admin"
      });
      console.log("Initial admin created");
    }

    app.listen(process.env.PORT || 5000, () =>
      console.log(`Server running on port ${process.env.PORT || 5000}`)
    );
  } catch (e) {
    console.error("Startup failed:", e.message);
    process.exit(1);
  }
}

start();